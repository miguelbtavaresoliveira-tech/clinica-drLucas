import { describe, expect, it } from 'vitest';
import { serializarCanonico } from '../../application/auditoria/serializacao-canonica.js';
import { Sha256CalculadoraDeHash } from './sha256-calculadora-de-hash.js';

describe('Sha256CalculadoraDeHash', () => {
  const calculadora = new Sha256CalculadoraDeHash();

  it('vetor de token', () => {
    expect(calculadora.sha256Hex('token-de-teste')).toBe('20fd0ba9f641280a22f72a1145a0892b225fb0b2fdd75a53ba4f83f4596c72ae');
  });

  it('vetor D-009 R1: hash do formato canônico', () => {
    const canonico = serializarCanonico({
      id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01',
      ocorridoEm: new Date('2026-10-13T12:00:00.000Z'),
      tipo: 'desbloqueio-local-ok',
      usuarioId: '11111111-1111-4111-8111-111111111111',
      dispositivoId: '22222222-2222-4222-8222-222222222222',
      detalhe: { metodo: 'senha' },
      hashAnterior: null,
    });
    expect(calculadora.sha256Hex(canonico)).toBe('b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a');
  });

  it('trata o texto como UTF-8', () => {
    expect(calculadora.sha256Hex('ação')).toBe(calculadora.sha256Hex('ação'));
    expect(calculadora.sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
