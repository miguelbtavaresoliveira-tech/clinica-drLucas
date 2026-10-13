import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import DesbloqueioTela from './DesbloqueioTela.vue';

const desbloquearComSenha = vi.fn();
const desbloquearComBiometria = vi.fn();
const previaRedefinicaoLocal = vi.fn();
const redefinirDesbloqueioLocal = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  desbloquearComSenha: (...a: unknown[]) => (desbloquearComSenha as (...x: unknown[]) => unknown)(...a),
  desbloquearComBiometria: (...a: unknown[]) => (desbloquearComBiometria as (...x: unknown[]) => unknown)(...a),
  previaRedefinicaoLocal: (...a: unknown[]) => (previaRedefinicaoLocal as (...x: unknown[]) => unknown)(...a),
  redefinirDesbloqueioLocal: (...a: unknown[]) => (redefinirDesbloqueioLocal as (...x: unknown[]) => unknown)(...a),
}));

const BLOQUEADO: EstadoDoAcesso = {
  situacao: 'bloqueado',
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: false,
  usuario: { id: 'u', nome: 'Lucas Damasceno', email: 'l@c.com' },
  eventosPendentes: 0,
};

async function abrir(estado: Partial<EstadoDoAcesso> = {}) {
  useEstadoDoAcesso().definir({ ...BLOQUEADO, ...estado });
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'desbloqueio' });
  const utilitarios = render(DesbloqueioTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

const campo = () => screen.getByLabelText(/^Senha mestre/);

describe('DesbloqueioTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    desbloquearComSenha.mockReset();
    desbloquearComBiometria.mockReset();
    previaRedefinicaoLocal.mockReset();
    redefinirDesbloqueioLocal.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o cabeçalho e foca o campo da senha ao montar', async () => {
    await abrir();
    expect(screen.getByText('Aplicativo bloqueado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Desbloqueie para continuar' })).toBeInTheDocument();
    await waitFor(() => {
      expect(campo()).toHaveFocus();
    });
  });

  it('senha certa chama desbloquearComSenha e navega para o início', async () => {
    desbloquearComSenha.mockResolvedValue({});
    const { roteador } = await abrir();
    await userEvent.type(campo(), 'minha-senha-mestre');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('inicio');
    });
    expect(desbloquearComSenha).toHaveBeenCalledWith('minha-senha-mestre');
  });

  it('SENHA_MESTRE_INCORRETA mostra a mensagem no campo, limpa a senha e devolve o foco', async () => {
    desbloquearComSenha.mockRejectedValue(new ErroDoApp('SENHA_MESTRE_INCORRETA', 'x'));
    await abrir();
    await userEvent.type(campo(), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByText(/Senha mestre incorreta/)).toBeInTheDocument();
    expect(campo()).toHaveValue('');
    expect(campo()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => {
      expect(campo()).toHaveFocus();
    });
  });

  it('senha vazia não chama o Rust', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(desbloquearComSenha).not.toHaveBeenCalled();
  });

  it('o botão de biometria só aparece quando disponível E habilitada', async () => {
    const { unmount } = await abrir({ biometriaDisponivel: true, biometriaHabilitada: false });
    expect(screen.queryByRole('button', { name: 'Desbloquear com biometria' })).not.toBeInTheDocument();
    unmount();
    const outra = await abrir({ biometriaDisponivel: false, biometriaHabilitada: true });
    expect(screen.queryByRole('button', { name: 'Desbloquear com biometria' })).not.toBeInTheDocument();
    outra.unmount();
    await abrir({ biometriaDisponivel: true, biometriaHabilitada: true });
    expect(screen.getByRole('button', { name: 'Desbloquear com biometria' })).toBeInTheDocument();
  });

  it('biometria que falha devolve o foco à senha; que dá certo navega para o início', async () => {
    desbloquearComBiometria.mockRejectedValueOnce(new ErroDoApp('BIOMETRIA_INDISPONIVEL', 'x'));
    const { roteador } = await abrir({ biometriaDisponivel: true, biometriaHabilitada: true });
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear com biometria' }));
    await waitFor(() => {
      expect(campo()).toHaveFocus();
    });
    expect(roteador.currentRoute.value.name).toBe('desbloqueio');
    desbloquearComBiometria.mockResolvedValueOnce({});
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear com biometria' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('inicio');
    });
  });

  it('AGUARDE_ANTES_DE_TENTAR desabilita o botão e o reabilita após a contagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    desbloquearComSenha.mockRejectedValue(new ErroDoApp('AGUARDE_ANTES_DE_TENTAR', 'x', { segundosRestantes: 5 }));
    await abrir();
    await userEvent.type(campo(), 'errada', { delay: null });
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    const botao = await screen.findByRole('button', { name: 'Tente novamente em 5 s' });
    expect(botao).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await screen.findByRole('button', { name: 'Tente novamente em 3 s' })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await screen.findByRole('button', { name: 'Desbloquear' })).toBeEnabled();
  });

  it('o estado com segundosAteNovaTentativa já abre com a contagem rodando e a limpa ao desmontar', async () => {
    vi.useFakeTimers();
    const { unmount } = await abrir({ segundosAteNovaTentativa: 30 });
    expect(screen.getByRole('button', { name: 'Tente novamente em 30 s' })).toBeDisabled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o leitor de tela é avisado a cada 10 s, não a cada segundo', async () => {
    vi.useFakeTimers();
    await abrir({ segundosAteNovaTentativa: 25 });
    const regiao = () => document.querySelector('p.sr-only[aria-live="polite"]')?.textContent;
    expect(regiao()).toBe('Tente novamente em 25 s');
    await vi.advanceTimersByTimeAsync(3000);
    expect(regiao()).toBe('Tente novamente em 25 s');
    await vi.advanceTimersByTimeAsync(2000);
    expect(regiao()).toBe('Tente novamente em 20 s');
  });

  it('EXIGE_LOGIN_COMPLETO esconde o formulário e oferece o login', async () => {
    desbloquearComSenha.mockRejectedValue(new ErroDoApp('EXIGE_LOGIN_COMPLETO', 'x'));
    const { roteador } = await abrir();
    await userEvent.type(campo(), 'qualquer');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByRole('button', { name: 'Entrar com e-mail e senha' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Senha mestre/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com e-mail e senha' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
  });

  it('estado com exigeLoginCompleto já esconde o formulário', async () => {
    await abrir({ exigeLoginCompleto: true });
    expect(screen.queryByLabelText(/^Senha mestre/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Entre com e-mail e senha');
  });

  it('outro erro mostra o banner', async () => {
    desbloquearComSenha.mockRejectedValue(new ErroDoApp('INTERNO', 'x'));
    await abrir();
    await userEvent.type(campo(), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir');
  });
});

describe('RedefinirDesbloqueioModal (via DesbloqueioTela)', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    previaRedefinicaoLocal.mockReset();
    redefinirDesbloqueioLocal.mockReset();
  });

  it('etapa A (sem sessão online): explica e manda entrar para redefinir', async () => {
    const { roteador } = await abrir({ sessaoOnline: false });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    expect(screen.getByRole('dialog', { name: 'Esqueci a senha mestre' })).toHaveTextContent(
      'A cópia local será descartada e baixada novamente.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Entrar para redefinir' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
  });

  it('etapa B (online): mostra os registros pendentes e só habilita com DESCARTAR exato', async () => {
    previaRedefinicaoLocal.mockResolvedValue({ eventosPendentes: 4 });
    await abrir({ sessaoOnline: true });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    expect(await screen.findByText(/Há 4 registros ainda não enviados ao servidor\. Eles serão perdidos\./)).toBeInTheDocument();
    const descartar = screen.getByRole('button', { name: 'Descartar e redefinir' });
    expect(descartar).toBeDisabled();
    const confirmacao = screen.getByLabelText('Digite DESCARTAR para confirmar');
    await userEvent.type(confirmacao, 'descartar');
    expect(descartar).toBeDisabled();
    await userEvent.clear(confirmacao);
    await userEvent.type(confirmacao, 'DESCARTAR');
    expect(descartar).toBeEnabled();
  });

  it('sem registros pendentes não mostra o alerta, mas continua exigindo a palavra', async () => {
    previaRedefinicaoLocal.mockResolvedValue({ eventosPendentes: 0 });
    await abrir({ sessaoOnline: true });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    await screen.findByLabelText('Digite DESCARTAR para confirmar');
    expect(screen.queryByText(/registros ainda não enviados/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar e redefinir' })).toBeDisabled();
  });

  it('confirmar chama redefinirDesbloqueioLocal("DESCARTAR") e vai para a senha mestre', async () => {
    previaRedefinicaoLocal.mockResolvedValue({ eventosPendentes: 0 });
    redefinirDesbloqueioLocal.mockResolvedValue({});
    const { roteador } = await abrir({ sessaoOnline: true });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    await userEvent.type(await screen.findByLabelText('Digite DESCARTAR para confirmar'), 'DESCARTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar e redefinir' }));
    await waitFor(() => {
      expect(redefinirDesbloqueioLocal).toHaveBeenCalledWith('DESCARTAR');
    });
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('definir-senha-mestre');
    });
  });

  it('falha ao redefinir mostra o erro e mantém o modal aberto', async () => {
    previaRedefinicaoLocal.mockResolvedValue({ eventosPendentes: 0 });
    redefinirDesbloqueioLocal.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir({ sessaoOnline: true });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    await userEvent.type(await screen.findByLabelText('Digite DESCARTAR para confirmar'), 'DESCARTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar e redefinir' }));
    expect(await screen.findByText('Sem conexão com o servidor')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancelar fecha o modal sem chamar o Rust', async () => {
    previaRedefinicaoLocal.mockResolvedValue({ eventosPendentes: 0 });
    await abrir({ sessaoOnline: true });
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha mestre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(redefinirDesbloqueioLocal).not.toHaveBeenCalled();
  });
});
