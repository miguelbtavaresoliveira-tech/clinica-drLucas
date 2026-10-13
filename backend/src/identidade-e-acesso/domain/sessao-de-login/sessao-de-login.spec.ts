import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO } from '../acesso/politica-de-acesso.js';
import { DispositivoId } from '../dispositivo/dispositivo-id.js';
import { DadoInvalido } from '../erros.js';
import { UsuarioId } from '../usuario/usuario-id.js';
import { SessaoDeLogin } from './sessao-de-login.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const DIA = 86_400_000;
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const iniciar = (): SessaoDeLogin =>
  SessaoDeLogin.iniciar({
    usuarioId: UsuarioId.novo(),
    dispositivoId: DispositivoId.novo(),
    refreshHash: A,
    agora: T0,
    politica: POLITICA_PADRAO,
  });

describe('SessaoDeLogin', () => {
  it('inicia ativa, expira em 30 dias, sem eventos', () => {
    const s = iniciar();
    expect(s.situacao).toBe('ativa');
    expect(s.expiraEm.getTime()).toBe(T0.getTime() + 30 * DIA);
    expect(s.refreshAnteriorHash).toBeNull();
    expect(s.versao).toBe(0);
    expect(s.puxarEventos()).toEqual([]);
  });

  it('rejeita hash inválido ao iniciar e ao rotacionar', () => {
    expect(() =>
      SessaoDeLogin.iniciar({
        usuarioId: UsuarioId.novo(),
        dispositivoId: DispositivoId.novo(),
        refreshHash: 'curto',
        agora: T0,
        politica: POLITICA_PADRAO,
      }),
    ).toThrow(DadoInvalido);
    expect(() => iniciar().rotacionar(A, 'XYZ', T0)).toThrow(DadoInvalido);
  });

  it('rotação feliz guarda o anterior e troca o atual', () => {
    const s = iniciar();
    expect(s.rotacionar(A, B, T0)).toBe('rotacionada');
    expect(s.refreshAnteriorHash).toBe(A);
    expect(s.refreshAtualHash).toBe(B);
  });

  it('reutilização revoga a sessão; depois o token atual vira inválido', () => {
    const s = iniciar();
    s.rotacionar(A, B, T0);
    expect(s.rotacionar(A, C, T0)).toBe('reutilizacao-detectada');
    expect(s.situacao).toBe('revogada');
    expect(s.puxarEventos()).toMatchObject([{ tipo: 'SessaoRevogada', motivo: 'reutilizacao-de-refresh' }]);
    expect(s.rotacionar(B, C, T0)).toBe('invalida');
  });

  it('token desconhecido é inválido e não revoga', () => {
    const s = iniciar();
    expect(s.rotacionar('f'.repeat(64), B, T0)).toBe('invalida');
    expect(s.situacao).toBe('ativa');
    expect(s.puxarEventos()).toEqual([]);
  });

  it('sessão expirada (agora === expiraEm) é inválida', () => {
    const s = iniciar();
    expect(s.rotacionar(A, B, s.expiraEm)).toBe('invalida');
    expect(s.estaAtiva(s.expiraEm)).toBe(false);
  });

  it('expiraEm não muda após rotação (sessão absoluta)', () => {
    const s = iniciar();
    const antes = s.expiraEm.getTime();
    s.rotacionar(A, B, new Date(T0.getTime() + DIA));
    expect(s.expiraEm.getTime()).toBe(antes);
  });

  it('revogar duas vezes emite um único evento e desativa a sessão', () => {
    const s = iniciar();
    expect(s.estaAtiva(T0)).toBe(true);
    s.revogar('logout', T0);
    s.revogar('logout', T0);
    expect(s.estaAtiva(T0)).toBe(false);
    expect(s.revogadaEm).toBe(T0);
    expect(s.motivoRevogacao).toBe('logout');
    expect(s.puxarEventos()).toHaveLength(1);
  });

  it('definirVersaoPersistida atualiza a versão', () => {
    const s = iniciar();
    s.definirVersaoPersistida(3);
    expect(s.versao).toBe(3);
  });
});
