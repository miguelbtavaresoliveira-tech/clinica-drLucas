import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDoApp } from '../../infrastructure/erros';
import { limparToasts } from '../composables/useToast';
import { criarRoteador } from '../../../router';
import DefinirSenhaMestreTela from './DefinirSenhaMestreTela.vue';

const configurarDesbloqueio = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  configurarDesbloqueio: (...args: unknown[]) => (configurarDesbloqueio as (...a: unknown[]) => unknown)(...args),
}));

const SENHA = 'senha-mestre-bem-forte';

async function abrir() {
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'definir-senha-mestre' });
  const utilitarios = render(DefinirSenhaMestreTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

const campoSenha = () => screen.getByLabelText(/^Senha mestre/);
const campoConfirmacao = () => screen.getByLabelText(/^Confirme a senha mestre/);
const botao = () => screen.getByRole('button', { name: 'Proteger dados' });

async function preencher(senha = SENHA, confirmacao = senha) {
  await userEvent.type(campoSenha(), senha);
  await userEvent.type(campoConfirmacao(), confirmacao);
}

describe('DefinirSenhaMestreTela', () => {
  beforeEach(() => {
    configurarDesbloqueio.mockReset();
    limparToasts();
  });

  it('mostra o cabeçalho e as orientações', async () => {
    await abrir();
    expect(screen.getByText('Proteção deste computador')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Crie sua senha mestre' })).toBeInTheDocument();
    expect(screen.getByText(/Não é enviada ao servidor e não pode ser recuperada/)).toBeInTheDocument();
    expect(screen.getByText('Use uma senha diferente da senha de login.')).toBeInTheDocument();
  });

  it('o botão começa desabilitado e aponta para as regras via aria-describedby', async () => {
    await abrir();
    expect(botao()).toBeDisabled();
    expect(botao()).toHaveAttribute('aria-describedby', 'regras-senha-mestre');
    expect(document.getElementById('regras-senha-mestre')).not.toBeNull();
  });

  it('fica desabilitado com 11 caracteres', async () => {
    await abrir();
    await preencher('x'.repeat(11));
    expect(botao()).toBeDisabled();
  });

  it('fica desabilitado com senhas diferentes', async () => {
    await abrir();
    await preencher(SENHA, `${SENHA}x`);
    expect(botao()).toBeDisabled();
  });

  it('habilita com 12 ou mais caracteres iguais', async () => {
    await abrir();
    await preencher('x'.repeat(12));
    expect(botao()).toBeEnabled();
  });

  it('emoji conta como um caractere', async () => {
    await abrir();
    await preencher('😀'.repeat(12));
    expect(botao()).toBeEnabled();
  });

  it('as regras mudam de pendente para atendida', async () => {
    await abrir();
    const regra = () => screen.getByText(/Pelo menos 12 caracteres/).closest('li');
    expect(regra()).toHaveTextContent('pendente');
    await userEvent.type(campoSenha(), 'x'.repeat(12));
    expect(regra()).toHaveTextContent('atendida');
    expect(screen.getByText(/As duas senhas conferem/).closest('li')).toHaveTextContent('pendente');
  });

  it('envia a senha ao Rust, mostra o toast, vai para o início e limpa os campos', async () => {
    configurarDesbloqueio.mockResolvedValue({});
    const { roteador } = await abrir();
    await preencher();
    await userEvent.click(botao());
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('inicio');
    });
    expect(configurarDesbloqueio).toHaveBeenCalledWith(SENHA);
    expect(campoSenha()).toHaveValue('');
    expect(campoConfirmacao()).toHaveValue('');
  });

  it('durante o envio mostra a mensagem de proteção e fica ocupado', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    configurarDesbloqueio.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await preencher();
    await userEvent.click(botao());
    const ocupado = await screen.findByRole('button', { name: 'Protegendo seus dados...' });
    expect(ocupado).toBeDisabled();
    expect(ocupado).toHaveAttribute('aria-busy', 'true');
    concluir({});
  });

  it('SENHA_MESTRE_FRACA mostra o erro no campo e limpa os campos', async () => {
    configurarDesbloqueio.mockRejectedValue(new ErroDoApp('SENHA_MESTRE_FRACA', 'x'));
    await abrir();
    await preencher();
    await userEvent.click(botao());
    expect(await screen.findByText(/Senha mestre fraca/)).toBeInTheDocument();
    expect(campoSenha()).toHaveValue('');
    expect(campoSenha()).toHaveAttribute('aria-invalid', 'true');
  });

  it('JA_CONFIGURADO leva ao desbloqueio e EXIGE_LOGIN_COMPLETO leva ao login', async () => {
    configurarDesbloqueio.mockRejectedValueOnce(new ErroDoApp('JA_CONFIGURADO', 'x'));
    const primeira = await abrir();
    await preencher();
    await userEvent.click(botao());
    await waitFor(() => {
      expect(primeira.roteador.currentRoute.value.name).toBe('desbloqueio');
    });
    primeira.unmount();

    configurarDesbloqueio.mockRejectedValueOnce(new ErroDoApp('EXIGE_LOGIN_COMPLETO', 'x'));
    const segunda = await abrir();
    await preencher();
    await userEvent.click(botao());
    await waitFor(() => {
      expect(segunda.roteador.currentRoute.value.name).toBe('login');
    });
  });

  it('outro erro mostra o banner e também limpa os campos', async () => {
    configurarDesbloqueio.mockRejectedValue(new ErroDoApp('INTERNO', 'x'));
    await abrir();
    await preencher();
    await userEvent.click(botao());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir');
    expect(campoSenha()).toHaveValue('');
  });

  it('a senha mestre nunca vai para o armazenamento do navegador', async () => {
    configurarDesbloqueio.mockResolvedValue({});
    await abrir();
    await preencher();
    await userEvent.click(botao());
    await waitFor(() => {
      expect(configurarDesbloqueio).toHaveBeenCalled();
    });
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(SENHA);
  });
});
