import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { reiniciarFluxoDeLoginParaTeste, useFluxoDeLogin } from '../../application/fluxo-de-login';
import type { EstadoDoAcesso } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import LoginTela from './LoginTela.vue';

const iniciarLogin = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  iniciarLogin: (...args: unknown[]) => (iniciarLogin as (...a: unknown[]) => unknown)(...args),
  aoMudarEstado: () => Promise.resolve(() => undefined),
  estadoDoAcesso: () => Promise.reject(new Error('não usado')),
}));

const ESTADO: EstadoDoAcesso = {
  situacao: 'sem_configuracao',
  exigeLoginCompleto: true,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: false,
  usuario: null,
  eventosPendentes: 0,
};

async function abrir(estado: Partial<EstadoDoAcesso> = {}) {
  useEstadoDoAcesso().definir({ ...ESTADO, exigeLoginCompleto: false, ...estado });
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'login' });
  const utilitarios = render(LoginTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

async function preencherEEnviar(email = 'lucas@clinica.com', senha = 'senha-de-teste-forte-123') {
  await userEvent.type(screen.getByLabelText(/^E-mail/), email);
  await userEvent.type(screen.getByLabelText(/^Senha de Acesso/), senha);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar no Sistema' }));
}

describe('LoginTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    reiniciarFluxoDeLoginParaTeste();
    iniciarLogin.mockReset();
  });

  it('começa sem nenhum campo preenchido e sem WhatsApp nem "Manter conectado"', async () => {
    const { container } = await abrir();
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue('');
    expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveValue('');
    expect(container.textContent ?? '').not.toContain('WhatsApp');
    expect(container.textContent ?? '').not.toContain('Manter conectado');
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute('placeholder', 'seu@email.com.br');
    expect(screen.getByRole('heading', { level: 2, name: 'Acesse sua conta' })).toBeInTheDocument();
  });

  it('campos vazios mostram os erros e não chamam o Rust', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar no Sistema' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(iniciarLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^E-mail/)).toHaveFocus();
  });

  it('e-mail inválido não chama o Rust e leva o foco para o e-mail', async () => {
    await abrir();
    await preencherEEnviar('semarroba', 'qualquer');
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(iniciarLogin).not.toHaveBeenCalled();
  });

  it('só a senha vazia leva o foco para a senha', async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText(/^E-mail/), 'lucas@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar no Sistema' }));
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveFocus();
    });
  });

  it('sucesso com mfa=verificar navega para mfa-verificar e guarda o desafio só em memória', async () => {
    iniciarLogin.mockResolvedValue({ desafio: 'desafio-1', mfa: 'verificar', expiraEm: '2026-10-13T12:05:00.000Z' });
    const { roteador } = await abrir();
    await preencherEEnviar('  lucas@clinica.com  ');
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('mfa-verificar');
    });
    expect(iniciarLogin).toHaveBeenCalledWith('lucas@clinica.com', 'senha-de-teste-forte-123');
    expect(useFluxoDeLogin().desafio.value).toBe('desafio-1');
  });

  it('sucesso com mfa=configurar navega para mfa-configurar', async () => {
    iniciarLogin.mockResolvedValue({ desafio: 'desafio-2', mfa: 'configurar', expiraEm: '2026-10-13T12:05:00.000Z' });
    const { roteador } = await abrir();
    await preencherEEnviar();
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('mfa-configurar');
    });
  });

  it('CREDENCIAIS_INVALIDAS mostra o banner, limpa a senha, mantém o e-mail e foca a senha', async () => {
    iniciarLogin.mockRejectedValue(new ErroDoApp('CREDENCIAIS_INVALIDAS', 'x'));
    await abrir();
    await preencherEEnviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais não encontradas');
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue('lucas@clinica.com');
    expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveValue('');
    expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Verifique a senha digitada.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveFocus();
    });
    expect(document.body.textContent ?? '').not.toMatch(/usuário não existe|não cadastrado/i);
  });

  it('CONTA_BLOQUEADA mostra o horário em America/Sao_Paulo (09:30)', async () => {
    iniciarLogin.mockRejectedValue(new ErroDoApp('CONTA_BLOQUEADA', 'x', { tentarApos: '2026-10-13T12:30:00.000Z' }));
    await abrir();
    await preencherEEnviar();
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Conta temporariamente bloqueada');
    expect(alerta).toHaveTextContent('09:30');
  });

  it('MUITAS_REQUISICOES usa o banner de aviso', async () => {
    iniciarLogin.mockRejectedValue(new ErroDoApp('MUITAS_REQUISICOES', 'x'));
    await abrir();
    await preencherEEnviar();
    expect((await screen.findByRole('alert')).className).toContain('bg-amber-50');
  });

  it('o botão fica desabilitado durante a chamada e os campos também', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    iniciarLogin.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await preencherEEnviar();
    const botao = await screen.findByRole('button', { name: 'Autenticando...' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/^E-mail/)).toBeDisabled();
    concluir({ desafio: 'd', mfa: 'verificar', expiraEm: 'x' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Autenticando...' })).not.toBeInTheDocument();
    });
  });

  it('SEM_CONEXAO com computador bloqueado oferece o desbloqueio local', async () => {
    iniciarLogin.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    const { roteador } = await abrir({ situacao: 'bloqueado', exigeLoginCompleto: false, sessaoOnline: true });
    await preencherEEnviar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar desbloqueio local' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('desbloqueio');
    });
  });

  it('SEM_CONEXAO sem estado bloqueado não oferece desbloqueio local', async () => {
    iniciarLogin.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir({ situacao: 'sem_configuracao' });
    await preencherEEnviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(screen.queryByRole('button', { name: 'Usar desbloqueio local' })).not.toBeInTheDocument();
  });

  it('exigeLoginCompleto mostra o aviso informativo', async () => {
    await abrir({ situacao: 'bloqueado', exigeLoginCompleto: true });
    const aviso = screen.getAllByRole('status').find((e) => e.textContent?.includes('Login completo necessário'));
    expect(aviso).toHaveTextContent('Por segurança, entre com e-mail, senha e código');
  });

  it('mostra e limpa o aviso deixado por outra tela', async () => {
    useFluxoDeLogin().aviso.value = 'Sua sessão foi encerrada.';
    await abrir();
    expect(screen.getByRole('alert')).toHaveTextContent('Sua sessão foi encerrada.');
    expect(useFluxoDeLogin().aviso.value).toBeNull();
  });

  it('descarta um desafio antigo ao abrir a tela', async () => {
    useFluxoDeLogin().iniciar({ desafio: 'velho', mfa: 'verificar', expiraEm: 'x' });
    await abrir();
    expect(useFluxoDeLogin().desafio.value).toBeNull();
  });

  it('usa os autocompletes corretos e a ordem de tabulação e-mail → esqueceu → senha → mostrar → entrar', async () => {
    await abrir();
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^Senha de Acesso/)).toHaveAttribute('autocomplete', 'current-password');
    screen.getByLabelText(/^E-mail/).focus();
    for (const nome of ['Esqueceu a senha?', /^Senha de Acesso/, 'Mostrar senha', 'Entrar no Sistema']) {
      await userEvent.tab();
      const esperado = typeof nome === 'string' ? screen.getByRole('button', { name: nome }) : screen.getByLabelText(nome);
      expect(esperado).toHaveFocus();
    }
  });

  it('Enter no campo de senha envia o formulário', async () => {
    iniciarLogin.mockResolvedValue({ desafio: 'd', mfa: 'verificar', expiraEm: 'x' });
    await abrir();
    await userEvent.type(screen.getByLabelText(/^E-mail/), 'lucas@clinica.com');
    await userEvent.type(screen.getByLabelText(/^Senha de Acesso/), 'minha-senha{Enter}');
    await waitFor(() => {
      expect(iniciarLogin).toHaveBeenCalledTimes(1);
    });
  });
});
