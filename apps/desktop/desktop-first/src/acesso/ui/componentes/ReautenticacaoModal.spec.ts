import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { reiniciarReautenticacaoParaTeste, useReautenticacao } from '../composables/useReautenticacao';
import ReautenticacaoModal from './ReautenticacaoModal.vue';

const reautenticar = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  reautenticar: (...a: unknown[]) => (reautenticar as (...x: unknown[]) => unknown)(...a),
}));

const NORMAL: EstadoDoAcesso = {
  situacao: 'normal',
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: null,
  eventosPendentes: 0,
};

const localErro = (codigo: string, extras = {}) => new ErroDoApp(codigo, 'x', extras);
const erroDoServidor = () => new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x', { status: 403 });

describe('useReautenticacao.comReautenticacao', () => {
  beforeEach(() => {
    reiniciarReautenticacaoParaTeste();
    reiniciarEstadoDoAcessoParaTeste();
    useEstadoDoAcesso().definir(NORMAL);
    reautenticar.mockReset();
  });

  it('não abre o modal quando a ação já funciona', async () => {
    render(ReautenticacaoModal);
    const acao = vi.fn().mockResolvedValue('ok');
    await expect(useReautenticacao().comReautenticacao(acao)).resolves.toBe('ok');
    expect(acao).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro diferente de REAUTENTICACAO_NECESSARIA é propagado sem abrir o modal', async () => {
    render(ReautenticacaoModal);
    const erro = localErro('SEM_CONEXAO');
    await expect(useReautenticacao().comReautenticacao(() => Promise.reject(erro))).rejects.toBe(erro);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('REAUTENTICACAO_NECESSARIA do servidor (com status) NÃO abre o modal local', async () => {
    render(ReautenticacaoModal);
    const erro = erroDoServidor();
    await expect(useReautenticacao().comReautenticacao(() => Promise.reject(erro))).rejects.toBe(erro);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre o modal, reautentica com a senha mestre e repete a ação UMA vez', async () => {
    reautenticar.mockResolvedValue(null);
    render(ReautenticacaoModal);
    const acao = vi.fn().mockRejectedValueOnce(localErro('REAUTENTICACAO_NECESSARIA')).mockResolvedValueOnce('feito');
    const resultado = useReautenticacao().comReautenticacao(acao);
    expect(await screen.findByRole('dialog', { name: 'Confirme sua identidade' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Senha mestre/), 'minha-senha-mestre');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await expect(resultado).resolves.toBe('feito');
    expect(reautenticar).toHaveBeenCalledWith('senha', 'minha-senha-mestre');
    expect(acao).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('se a segunda tentativa também pedir reautenticação, não entra em laço', async () => {
    reautenticar.mockResolvedValue(null);
    render(ReautenticacaoModal);
    const erro = localErro('REAUTENTICACAO_NECESSARIA');
    const acao = vi.fn().mockRejectedValue(erro);
    const resultado = useReautenticacao().comReautenticacao(acao);
    void resultado.catch(() => undefined); // a rejeição é verificada abaixo; evita aviso de rejeição não tratada
    await userEvent.type(await screen.findByLabelText(/^Senha mestre/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await expect(resultado).rejects.toBe(erro);
    expect(acao).toHaveBeenCalledTimes(2);
  });

  it('cancelar não repete a ação e lança o erro original', async () => {
    render(ReautenticacaoModal);
    const erro = localErro('REAUTENTICACAO_NECESSARIA');
    const acao = vi.fn().mockRejectedValue(erro);
    const resultado = useReautenticacao().comReautenticacao(acao);
    void resultado.catch(() => undefined);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await expect(resultado).rejects.toBe(erro);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('Esc também cancela', async () => {
    render(ReautenticacaoModal);
    const erro = localErro('REAUTENTICACAO_NECESSARIA');
    const resultado = useReautenticacao().comReautenticacao(() => Promise.reject(erro));
    void resultado.catch(() => undefined);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await expect(resultado).rejects.toBe(erro);
  });

  it('exigir() devolve true ao reautenticar e false ao cancelar; chamadas simultâneas compartilham o modal', async () => {
    reautenticar.mockResolvedValue(null);
    render(ReautenticacaoModal);
    const a = useReautenticacao().exigir();
    const b = useReautenticacao().exigir();
    expect(await screen.findAllByRole('dialog')).toHaveLength(1);
    await userEvent.type(screen.getByLabelText(/^Senha mestre/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    const c = useReautenticacao().exigir();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await expect(c).resolves.toBe(false);
  });
});

describe('ReautenticacaoModal', () => {
  beforeEach(() => {
    reiniciarReautenticacaoParaTeste();
    reiniciarEstadoDoAcessoParaTeste();
    useEstadoDoAcesso().definir(NORMAL);
    reautenticar.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o texto, foca a senha e não oferece biometria por padrão', async () => {
    render(ReautenticacaoModal);
    void useReautenticacao().exigir();
    const dialogo = await screen.findByRole('dialog', { name: 'Confirme sua identidade' });
    expect(dialogo).toHaveAccessibleDescription('Por segurança, digite a senha mestre deste computador.');
    await waitFor(() => {
      expect(screen.getByLabelText(/^Senha mestre/)).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: 'Usar biometria' })).not.toBeInTheDocument();
  });

  it('oferece biometria quando habilitada e reautentica com ela', async () => {
    useEstadoDoAcesso().definir({ ...NORMAL, biometriaDisponivel: true, biometriaHabilitada: true });
    reautenticar.mockResolvedValue(null);
    render(ReautenticacaoModal);
    const resultado = useReautenticacao().exigir();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar biometria' }));
    await expect(resultado).resolves.toBe(true);
    expect(reautenticar).toHaveBeenCalledWith('biometria', null);
  });

  it('SENHA_MESTRE_INCORRETA mostra a mensagem, limpa a senha e mantém o modal aberto', async () => {
    reautenticar.mockRejectedValue(localErro('SENHA_MESTRE_INCORRETA'));
    render(ReautenticacaoModal);
    void useReautenticacao().exigir();
    await userEvent.type(await screen.findByLabelText(/^Senha mestre/), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Senha mestre incorreta/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Senha mestre/)).toHaveValue('');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AGUARDE_ANTES_DE_TENTAR desabilita o botão com contagem e o libera depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    reautenticar.mockRejectedValue(localErro('AGUARDE_ANTES_DE_TENTAR', { segundosRestantes: 3 }));
    render(ReautenticacaoModal);
    void useReautenticacao().exigir();
    await userEvent.type(await screen.findByLabelText(/^Senha mestre/), 'x', { delay: null });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('button', { name: 'Aguarde 3 s' })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await screen.findByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('EXIGE_LOGIN_COMPLETO fecha o modal com false', async () => {
    reautenticar.mockRejectedValue(localErro('EXIGE_LOGIN_COMPLETO'));
    render(ReautenticacaoModal);
    const resultado = useReautenticacao().exigir();
    await userEvent.type(await screen.findByLabelText(/^Senha mestre/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await expect(resultado).resolves.toBe(false);
  });

  it('a senha é descartada ao fechar e o modal reabre vazio', async () => {
    render(ReautenticacaoModal);
    void useReautenticacao().exigir();
    await userEvent.type(await screen.findByLabelText(/^Senha mestre/), 'segredo-que-sera-descartado');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    void useReautenticacao().exigir();
    expect(await screen.findByLabelText(/^Senha mestre/)).toHaveValue('');
    expect(document.body.textContent ?? '').not.toContain('segredo-que-sera-descartado');
  });

  it('senha vazia não chama o Rust', async () => {
    render(ReautenticacaoModal);
    void useReautenticacao().exigir();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(reautenticar).not.toHaveBeenCalled();
  });
});
