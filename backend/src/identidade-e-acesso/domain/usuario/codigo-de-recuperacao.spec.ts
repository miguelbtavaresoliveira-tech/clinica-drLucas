import { describe, expect, it } from 'vitest';
import { CodigoMfaInvalido, DadoInvalido } from '../erros.js';
import { CodigoDeRecuperacao } from './codigo-de-recuperacao.js';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const HASH = 'a'.repeat(64);
const AGORA = new Date('2026-01-01T00:00:00Z');

describe('CodigoDeRecuperacao', () => {
  it('novo está disponível', () => {
    const c = CodigoDeRecuperacao.novo(ID, HASH, AGORA);
    expect(c.estaDisponivel()).toBe(true);
    expect(c.usadoEm).toBeNull();
    expect(c.criadoEm).toBe(AGORA);
  });

  it('usar marca a data e um segundo uso lança CodigoMfaInvalido', () => {
    const c = CodigoDeRecuperacao.novo(ID, HASH, AGORA);
    const uso = new Date('2026-01-02T00:00:00Z');
    c.usar(uso);
    expect(c.usadoEm).toBe(uso);
    expect(c.estaDisponivel()).toBe(false);
    expect(() => c.usar(uso)).toThrow(CodigoMfaInvalido);
  });

  it('rejeita hash com 63 caracteres ou maiúsculas e id inválido', () => {
    expect(() => CodigoDeRecuperacao.novo(ID, 'a'.repeat(63), AGORA)).toThrow(DadoInvalido);
    expect(() => CodigoDeRecuperacao.novo(ID, 'A'.repeat(64), AGORA)).toThrow(DadoInvalido);
    expect(() => CodigoDeRecuperacao.novo('x', HASH, AGORA)).toThrow(DadoInvalido);
  });

  it('reconstituir preserva usadoEm', () => {
    const c = CodigoDeRecuperacao.reconstituir({ id: ID, hash: HASH, usadoEm: AGORA, criadoEm: AGORA });
    expect(c.estaDisponivel()).toBe(false);
  });
});
