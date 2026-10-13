import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDoAcesso } from './tipos';

const remover = vi.fn();
const aoMudarEstado = vi.fn(() => Promise.resolve(remover));
const estadoDoAcesso = vi.fn();

vi.mock('../infrastructure/comandos-tauri', () => ({
  aoMudarEstado: (...args: unknown[]) => (aoMudarEstado as (...a: unknown[]) => unknown)(...args),
  estadoDoAcesso: () => estadoDoAcesso() as unknown,
}));

const { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } = await import('./estado-do-acesso');
const { reiniciarFluxoDeLoginParaTeste, useFluxoDeLogin } = await import('./fluxo-de-login');

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

describe('useEstadoDoAcesso', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    remover.mockClear();
    aoMudarEstado.mockClear();
    estadoDoAcesso.mockReset();
  });

  it('começa vazio e carregar() preenche a partir do Rust', async () => {
    estadoDoAcesso.mockResolvedValue(NORMAL);
    const { estado, carregar } = useEstadoDoAcesso();
    expect(estado.value).toBeNull();
    await expect(carregar()).resolves.toEqual(NORMAL);
    expect(estado.value).toEqual(NORMAL);
  });

  it('definir() atualiza o estado', () => {
    const { estado, definir } = useEstadoDoAcesso();
    definir(NORMAL);
    expect(estado.value?.situacao).toBe('normal');
  });

  it('iniciarEscuta registra o listener uma única vez, mesmo em chamadas simultâneas', async () => {
    const { iniciarEscuta } = useEstadoDoAcesso();
    await Promise.all([iniciarEscuta(), iniciarEscuta()]);
    await iniciarEscuta();
    expect(aoMudarEstado).toHaveBeenCalledTimes(1);
  });

  it('o evento do Rust atualiza o estado', async () => {
    const { estado, iniciarEscuta } = useEstadoDoAcesso();
    await iniciarEscuta();
    const [callback] = aoMudarEstado.mock.calls[0] as unknown as [(e: EstadoDoAcesso) => void];
    callback({ ...NORMAL, situacao: 'bloqueado' });
    expect(estado.value?.situacao).toBe('bloqueado');
  });

  it('pararEscuta remove o listener e permite registrar de novo', async () => {
    const { iniciarEscuta, pararEscuta } = useEstadoDoAcesso();
    await iniciarEscuta();
    pararEscuta();
    expect(remover).toHaveBeenCalledTimes(1);
    pararEscuta();
    expect(remover).toHaveBeenCalledTimes(1);
    await iniciarEscuta();
    expect(aoMudarEstado).toHaveBeenCalledTimes(2);
  });
});

describe('useFluxoDeLogin', () => {
  beforeEach(() => {
    reiniciarFluxoDeLoginParaTeste();
  });

  it('iniciar guarda desafio e etapa de MFA; limpar apaga tudo', () => {
    const f = useFluxoDeLogin();
    f.iniciar({ desafio: 'abc', mfa: 'configurar', expiraEm: '2026-10-13T12:05:00.000Z' });
    expect(f.desafio.value).toBe('abc');
    expect(f.mfa.value).toBe('configurar');
    f.limpar();
    expect(f.desafio.value).toBeNull();
    expect(f.mfa.value).toBeNull();
  });

  it('avancarParaVerificacao mantém o desafio e muda a etapa', () => {
    const f = useFluxoDeLogin();
    f.iniciar({ desafio: 'abc', mfa: 'configurar', expiraEm: 'x' });
    f.avancarParaVerificacao();
    expect(f.mfa.value).toBe('verificar');
    expect(f.desafio.value).toBe('abc');
  });

  it('o aviso é editável e não é apagado por limpar()', () => {
    const f = useFluxoDeLogin();
    f.aviso.value = 'Sessão encerrada.';
    f.limpar();
    expect(f.aviso.value).toBe('Sessão encerrada.');
  });

  it('o desafio nunca vai para localStorage nem sessionStorage', () => {
    const f = useFluxoDeLogin();
    f.iniciar({ desafio: 'segredo-do-desafio', mfa: 'verificar', expiraEm: 'x' });
    expect(JSON.stringify({ ...localStorage })).not.toContain('segredo-do-desafio');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('segredo-do-desafio');
  });
});
