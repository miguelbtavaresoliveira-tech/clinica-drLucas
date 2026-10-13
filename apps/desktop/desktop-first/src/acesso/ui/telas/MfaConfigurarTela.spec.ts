import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarFluxoDeLoginParaTeste, useFluxoDeLogin } from '../../application/fluxo-de-login';
import { ErroDoApp } from '../../infrastructure/erros';
import { limparToasts } from '../composables/useToast';
import { criarRoteador } from '../../../router';
import MfaConfigurarTela from './MfaConfigurarTela.vue';

const gerarSegredoMfa = vi.fn();
const confirmarMfa = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  gerarSegredoMfa: (...args: unknown[]) => (gerarSegredoMfa as (...a: unknown[]) => unknown)(...args),
  confirmarMfa: (...args: unknown[]) => (confirmarMfa as (...a: unknown[]) => unknown)(...args),
}));

const SEGREDO = { segredo: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', urlOtpauth: 'otpauth://totp/EVO:lucas?secret=GEZDGNBVGY3TQOJQ' };
const CODIGOS = Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-${String(1000 + i)}`);
const escrever = vi.fn().mockResolvedValue(undefined);

async function abrir(comDesafio = true) {
  if (comDesafio) useFluxoDeLogin().iniciar({ desafio: 'desafio-1', mfa: 'configurar', expiraEm: 'x' });
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'mfa-configurar' });
  const utilitarios = render(MfaConfigurarTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

describe('MfaConfigurarTela', () => {
  beforeEach(() => {
    reiniciarFluxoDeLoginParaTeste();
    limparToasts();
    gerarSegredoMfa.mockReset().mockResolvedValue(SEGREDO);
    confirmarMfa.mockReset();
    escrever.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
  });

  it('chama gerarSegredoMfa com o desafio e mostra o QR code local da etapa 1', async () => {
    await abrir();
    const qr = await screen.findByRole('img', { name: /QR code/ });
    expect(gerarSegredoMfa).toHaveBeenCalledWith('desafio-1');
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Configure o aplicativo autenticador' })).toBeInTheDocument();
    expect(screen.getByText(/Google Authenticator, Microsoft Authenticator ou 1Password/)).toBeInTheDocument();
  });

  it('nenhum src aponta para http e o segredo não vai a serviço externo', async () => {
    const { container } = await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    for (const el of container.querySelectorAll('[src]')) expect(el.getAttribute('src')).not.toMatch(/^https?:/);
  });

  it('código correto mostra a etapa 2 com 10 códigos', async () => {
    confirmarMfa.mockResolvedValue({ codigosDeRecuperacao: CODIGOS });
    await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Etapa 2 de 2')).toBeInTheDocument();
    expect(confirmarMfa).toHaveBeenCalledWith('desafio-1', '123456');
    expect(screen.getAllByRole('listitem').filter((li) => (li.textContent ?? '').trim().startsWith('ABCD-'))).toHaveLength(10);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Guarde seus códigos de recuperação' })).toHaveFocus();
    });
  });

  it('"Continuar" fica desabilitado até marcar a caixa e então vai para mfa-verificar sem os códigos no DOM', async () => {
    confirmarMfa.mockResolvedValue({ codigosDeRecuperacao: CODIGOS });
    const { roteador } = await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const continuar = await screen.findByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Guardei os códigos em local seguro'));
    expect(continuar).toBeEnabled();
    await userEvent.click(continuar);
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('mfa-verificar');
    });
    expect(useFluxoDeLogin().mfa.value).toBe('verificar');
    expect(useFluxoDeLogin().desafio.value).toBe('desafio-1');
    expect(useFluxoDeLogin().aviso.value).toContain('código atual');
    expect(document.body.textContent ?? '').not.toContain('ABCD-EFGH-JKMN-1000');
  });

  it('"Copiar todos" grava os 10 códigos, um por linha', async () => {
    confirmarMfa.mockResolvedValue({ codigosDeRecuperacao: CODIGOS });
    await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar todos' }));
    const [[copiado]] = escrever.mock.calls as [[string]];
    expect(copiado.split('\n')).toEqual(CODIGOS);
  });

  it('código inválido mostra o erro no campo, limpa o campo e permite tentar de novo (desafio preservado)', async () => {
    confirmarMfa.mockRejectedValueOnce(new ErroDoApp('CODIGO_MFA_INVALIDO', 'x'));
    await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Código inválido\. Digite o código atual/)).toBeInTheDocument();
    expect(screen.getByLabelText('Código do aplicativo')).toHaveValue('');
    expect(useFluxoDeLogin().desafio.value).toBe('desafio-1');
    confirmarMfa.mockResolvedValueOnce({ codigosDeRecuperacao: CODIGOS });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Etapa 2 de 2')).toBeInTheDocument();
  });

  it('código incompleto não chama o Rust', async () => {
    await abrir();
    await screen.findByRole('img', { name: /QR code/ });
    await userEvent.type(screen.getByLabelText('Código do aplicativo'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByText('Informe o código de 6 dígitos do aplicativo.')).toBeInTheDocument();
    expect(confirmarMfa).not.toHaveBeenCalled();
  });

  it('DESAFIO_INVALIDO ao gerar o segredo volta ao login com aviso e limpa o fluxo', async () => {
    gerarSegredoMfa.mockRejectedValue(new ErroDoApp('DESAFIO_INVALIDO', 'x'));
    const { roteador } = await abrir();
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(useFluxoDeLogin().desafio.value).toBeNull();
    expect(useFluxoDeLogin().aviso.value).toContain('Entre novamente');
  });

  it('outro erro ao gerar o segredo mostra banner com "Tentar novamente"', async () => {
    gerarSegredoMfa.mockRejectedValueOnce(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    gerarSegredoMfa.mockResolvedValueOnce(SEGREDO);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
  });

  it('sem desafio em memória não chama o Rust e redireciona para o login', async () => {
    const { roteador } = await abrir(false);
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(gerarSegredoMfa).not.toHaveBeenCalled();
  });
});
