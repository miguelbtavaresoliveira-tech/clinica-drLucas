import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO } from '../acesso/politica-de-acesso.js';
import { DadoInvalido, DispositivoRevogado } from '../erros.js';
import { UsuarioId } from '../usuario/usuario-id.js';
import { Dispositivo } from './dispositivo.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const DIA = 86_400_000;
const CHAVE = `${'A'.repeat(43)}=`;
const usuarioId = UsuarioId.novo();

const registrar = (parcial: Partial<{ apelido: string; plataforma: string; chavePublicaAuditoria: string }> = {}): Dispositivo =>
  Dispositivo.registrar({
    usuarioId,
    apelido: 'MacBook da clínica',
    plataforma: 'macos',
    chavePublicaAuditoria: CHAVE,
    agora: T0,
    ...parcial,
  });

describe('Dispositivo — registro', () => {
  it('registra ativo, sem biometria, versão 0, com evento', () => {
    const d = registrar();
    expect(d.situacao).toBe('ativo');
    expect(d.biometriaHabilitada).toBe(false);
    expect(d.versao).toBe(0);
    expect(d.ultimoCheckIn).toBe(T0);
    expect(d.registradoEm).toBe(T0);
    expect(d.pertenceA(usuarioId)).toBe(true);
    expect(d.pertenceA(UsuarioId.novo())).toBe(false);
    expect(d.puxarEventos().map((e) => e.tipo)).toEqual(['DispositivoRegistrado']);
  });

  it.each([
    [{ apelido: '' }],
    [{ apelido: 'a'.repeat(61) }],
    [{ plataforma: 'linux' }],
    [{ chavePublicaAuditoria: 'abc' }],
    [{ chavePublicaAuditoria: 'A'.repeat(44) }],
  ])('rejeita %j', (parcial) => {
    expect(() => registrar(parcial)).toThrow(DadoInvalido);
  });
});

describe('Dispositivo — limite offline (RN-21)', () => {
  it('no instante exato do limite não está fora; +1ms está', () => {
    const d = registrar();
    expect(d.estaForaDoLimiteOffline(new Date(T0.getTime() + 5 * DIA), POLITICA_PADRAO)).toBe(false);
    expect(d.estaForaDoLimiteOffline(new Date(T0.getTime() + 5 * DIA + 1), POLITICA_PADRAO)).toBe(true);
  });
});

describe('Dispositivo — check-in e revogação', () => {
  it('check-in atualiza e nunca retrocede', () => {
    const d = registrar();
    const depois = new Date(T0.getTime() + 1000);
    d.registrarCheckIn(depois);
    expect(d.ultimoCheckIn).toBe(depois);
    d.registrarCheckIn(T0);
    expect(d.ultimoCheckIn).toBe(depois);
  });

  it('check-in em dispositivo revogado lança DispositivoRevogado', () => {
    const d = registrar();
    d.revogar('perdido', T0);
    expect(() => d.registrarCheckIn(new Date(T0.getTime() + 1))).toThrow(DispositivoRevogado);
    expect(() => d.garantirAtivo()).toThrow(DispositivoRevogado);
  });

  it('revogar emite DispositivoRevogado com o motivo; segunda vez não emite', () => {
    const d = registrar();
    d.puxarEventos();
    d.revogar('  notebook perdido  ', T0);
    expect(d.situacao).toBe('revogado');
    expect(d.motivoRevogacao).toBe('notebook perdido');
    expect(d.revogadoEm).toBe(T0);
    expect(d.podeSincronizar()).toBe(false);
    expect(d.estaAtivo()).toBe(false);
    const eventos = d.puxarEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'DispositivoRevogado', motivo: 'notebook perdido' });
    d.revogar('outro motivo', T0);
    expect(d.puxarEventos()).toEqual([]);
  });

  it.each(['ab', 'a'.repeat(201), '   '])('rejeita motivo %j', (motivo) => {
    expect(() => registrar().revogar(motivo, T0)).toThrow(DadoInvalido);
  });

  it('definirVersaoPersistida atualiza a versão', () => {
    const d = registrar();
    d.definirVersaoPersistida(2);
    expect(d.versao).toBe(2);
  });
});
