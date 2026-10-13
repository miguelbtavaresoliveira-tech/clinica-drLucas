import { describe, expect, it } from 'vitest';
import { ehDetalheValido, serializarCanonico } from './serializacao-canonica.js';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const DISPOSITIVO = '22222222-2222-4222-8222-222222222222';

describe('serializarCanonico (vetores D-009)', () => {
  it('R1: primeiro registro, hashAnterior nulo vira string vazia', () => {
    const r1 = serializarCanonico({
      id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01',
      ocorridoEm: new Date('2026-10-13T12:00:00.000Z'),
      tipo: 'desbloqueio-local-ok',
      usuarioId: USUARIO,
      dispositivoId: DISPOSITIVO,
      detalhe: { metodo: 'senha' },
      hashAnterior: null,
    });
    expect(r1).toBe(
      'v1|7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01|2026-10-13T12:00:00.000Z|desbloqueio-local-ok|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|{"metodo":"senha"}|',
    );
  });

  it('R2: chaves do detalhe saem ordenadas e o hash anterior é incluído', () => {
    const r2 = serializarCanonico({
      id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02',
      ocorridoEm: new Date('2026-10-13T12:05:30.250Z'),
      tipo: 'desbloqueio-local-falhou',
      usuarioId: USUARIO,
      dispositivoId: DISPOSITIVO,
      detalhe: { tentativa: 3, metodo: 'senha' },
      hashAnterior: 'b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a',
    });
    expect(r2).toBe(
      'v1|7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02|2026-10-13T12:05:30.250Z|desbloqueio-local-falhou|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|{"metodo":"senha","tentativa":3}|b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a',
    );
  });

  it('ids nulos viram string vazia', () => {
    const s = serializarCanonico({
      id: 'x',
      ocorridoEm: new Date('2026-01-01T00:00:00.000Z'),
      tipo: 'login-ok',
      usuarioId: null,
      dispositivoId: null,
      detalhe: {},
      hashAnterior: null,
    });
    expect(s).toBe('v1|x|2026-01-01T00:00:00.000Z|login-ok|||{}|');
  });
});

describe('ehDetalheValido', () => {
  it.each([{}, { a: 'x', b: 1, c: true, d: null }])('aceita %j', (v) => {
    expect(ehDetalheValido(v)).toBe(true);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['aninhado', { a: {} }],
    ['decimal', { a: 1.5 }],
    ['controle', { a: '\n' }],
    ['chave iniciando em número', { '1a': 1 }],
    ['texto de 201 caracteres', { a: 'x'.repeat(201) }],
    ['inteiro inseguro', { a: Number.MAX_SAFE_INTEGER + 2 }],
    ['undefined', { a: undefined }],
    ['21 chaves', Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${String(i)}`, 1]))],
    ['string', 'texto'],
  ])('rejeita %s', (_nome, v) => {
    expect(ehDetalheValido(v)).toBe(false);
  });

  it('aceita texto de 200 caracteres e 20 chaves', () => {
    expect(ehDetalheValido({ a: 'x'.repeat(200) })).toBe(true);
    expect(ehDetalheValido(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${String(i)}`, 1])))).toBe(true);
  });
});
