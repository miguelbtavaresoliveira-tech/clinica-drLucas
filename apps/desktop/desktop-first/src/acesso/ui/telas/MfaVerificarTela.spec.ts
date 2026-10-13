import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarFluxoDeLoginParaTeste, useFluxoDeLogin } from '../../application/fluxo-de-login';
import type { ResumoDoLogin } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { limparToasts } from '../composables/useToast';
import NotificacaoToast from '../componentes/NotificacaoToast.vue';
import { criarRoteador } from '../../../router';
import MfaVerificarTela from './MfaVerificarTela.vue';

const concluirLogin = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  concluirLogin: (...args: unknown[]) => (concluirLogin as (...a: unknown[]) => unknown)(...args),
}));

const resumo = (extras: Partial<ResumoDoLogin> = {}): ResumoDoLogin => ({
  usuario: { id: 'u', nome: 'Lucas Damasceno', email: 'lucas@clinica.com' },
  usouCodigoDeRecuperacao: false,
  codigosRestantes: 10,
  proximoPasso: 'pronto',
  ...extras,
});

async function abrir(opcoes: { desafio?: boolean; aviso?: string } = {}) {
  if (opcoes.desafio !== false) useFluxoDeLogin().iniciar({ desafio: 'desafio-1', mfa: 'verificar', expiraEm: 'x' });
  if (opcoes.aviso) useFluxoDeLogin().aviso.value = opcoes.aviso;
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'mfa-verificar' });
  const utilitarios = render({
    components: { MfaVerificarTela, NotificacaoToast },
    template: '<div><MfaVerificarTela /><NotificacaoToast /></div>',
  }, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

describe('MfaVerificarTela', () => {
  beforeEach(() => {
    reiniciarFluxoDeLoginParaTeste();
    limparToasts();
    concluirLogin.mockReset();
  });

  it('mostra o cabeçalho e foca o campo do código', async () => {
    await abrir();
    expect(screen.getByText('Verificação em duas etapas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Digite o código do autenticador' })).toBeInTheDocument();
    expect(screen.getByText('Abra o aplicativo autenticador e digite o código de 6 dígitos.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Código do autenticador')).toHaveFocus();
    });
  });

  it('6 dígitos disparam concluirLogin automaticamente com { tipo: "totp" }', async () => {
    concluirLogin.mockResolvedValue(resumo());
    const { roteador } = await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await waitFor(() => {
      expect(concluirLogin).toHaveBeenCalledWith('desafio-1', { tipo: 'totp', valor: '123456' });
    });
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('inicio');
    });
    expect(concluirLogin).toHaveBeenCalledTimes(1);
  });

  it('o botão Entrar com código incompleto não chama o Rust', async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe o código de 6 dígitos do aplicativo.')).toBeInTheDocument();
    expect(concluirLogin).not.toHaveBeenCalled();
  });

  it('modo recuperação: alterna com aria-pressed, envia { tipo: "recuperacao" } e recusa formato inválido', async () => {
    concluirLogin.mockResolvedValue(resumo({ usouCodigoDeRecuperacao: true, codigosRestantes: 9 }));
    await abrir();
    const alternar = screen.getByRole('button', { name: 'Usar código de recuperação' });
    expect(alternar).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(alternar);
    expect(screen.getByRole('button', { name: 'Usar código do autenticador' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(screen.getByLabelText(/^Código de recuperação/)).toHaveFocus();
    });
    await userEvent.type(screen.getByLabelText(/^Código de recuperação/), 'ABC');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe um código de recuperação válido (16 caracteres).')).toBeInTheDocument();
    expect(concluirLogin).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/^Código de recuperação/));
    await userEvent.type(screen.getByLabelText(/^Código de recuperação/), 'ABCD-EFGH-JKMN-PQRS');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(concluirLogin).toHaveBeenCalledWith('desafio-1', { tipo: 'recuperacao', valor: 'ABCD-EFGH-JKMN-PQRS' });
    });
  });

  it('mostra o toast com os códigos restantes quando usou um código de recuperação', async () => {
    concluirLogin.mockResolvedValue(resumo({ usouCodigoDeRecuperacao: true, codigosRestantes: 9 }));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Usar código de recuperação' }));
    await userEvent.type(screen.getByLabelText(/^Código de recuperação/), 'ABCD-EFGH-JKMN-PQRS');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Você usou um código de recuperação. Restam 9. Gere novos em Segurança.')).toBeInTheDocument();
  });

  it.each([
    ['configurar_desbloqueio', 'definir-senha-mestre'],
    ['desbloquear', 'desbloqueio'],
    ['pronto', 'inicio'],
  ] as const)('proximoPasso %s navega para %s e limpa o desafio', async (proximoPasso, rota) => {
    concluirLogin.mockResolvedValue(resumo({ proximoPasso }));
    const { roteador } = await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe(rota);
    });
    expect(useFluxoDeLogin().desafio.value).toBeNull();
  });

  it.each([
    'CODIGO_MFA_INVALIDO',
    'DESAFIO_INVALIDO',
    'MFA_OBRIGATORIO',
    'LIMITE_DE_DISPOSITIVOS_ATINGIDO',
  ])('%s volta ao login com aviso e fluxo limpo', async (codigo) => {
    concluirLogin.mockRejectedValue(new ErroDoApp(codigo, 'x'));
    const { roteador } = await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(useFluxoDeLogin().desafio.value).toBeNull();
    expect(useFluxoDeLogin().aviso.value).not.toBeNull();
  });

  it('o aviso do código inválido explica o motivo', async () => {
    concluirLogin.mockRejectedValue(new ErroDoApp('CODIGO_MFA_INVALIDO', 'x'));
    await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await waitFor(() => {
      expect(useFluxoDeLogin().aviso.value).toBe('O código não confere ou já foi usado. Entre novamente.');
    });
  });

  it('DISPOSITIVO_REVOGADO vai para a tela de revogação', async () => {
    concluirLogin.mockRejectedValue(new ErroDoApp('DISPOSITIVO_REVOGADO', 'x'));
    const { roteador } = await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('dispositivo-revogado');
    });
  });

  it('SEM_CONEXAO mostra o banner na tela e mantém o desafio', async () => {
    concluirLogin.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    const { roteador } = await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(roteador.currentRoute.value.name).toBe('mfa-verificar');
    expect(useFluxoDeLogin().desafio.value).toBe('desafio-1');
  });

  it('mostra a dica vinda da configuração uma única vez', async () => {
    await abrir({ aviso: 'Digite o código atual do aplicativo (ele muda a cada 30 segundos).' });
    expect(screen.getByText(/Digite o código atual do aplicativo/)).toBeInTheDocument();
    expect(useFluxoDeLogin().aviso.value).toBeNull();
  });

  it('"Voltar" limpa o fluxo e vai para o login', async () => {
    const { roteador } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(useFluxoDeLogin().desafio.value).toBeNull();
  });

  it('sem desafio em memória redireciona para o login sem chamar o Rust', async () => {
    const { roteador } = await abrir({ desafio: false });
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(concluirLogin).not.toHaveBeenCalled();
  });

  it('durante o envio o botão fica ocupado e não envia duas vezes', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    concluirLogin.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    expect(await screen.findByRole('button', { name: 'Verificando...' })).toBeDisabled();
    expect(concluirLogin).toHaveBeenCalledTimes(1);
    concluir(resumo());
  });
});
