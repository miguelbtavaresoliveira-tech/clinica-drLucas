import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../erros.js';
import { SegredoTotpCifrado } from './segredo-totp-cifrado.js';

describe('SegredoTotpCifrado', () => {
  it('guarda cópia da entrada', () => {
    const entrada = new Uint8Array(30).fill(7);
    const s = SegredoTotpCifrado.de(entrada);
    entrada[0] = 99;
    expect(s.bytes()[0]).toBe(7);
  });

  it('devolve cópia em bytes()', () => {
    const s = SegredoTotpCifrado.de(new Uint8Array(30).fill(7));
    s.bytes()[0] = 99;
    expect(s.bytes()[0]).toBe(7);
  });

  it('rejeita menos de 30 bytes', () => {
    expect(() => SegredoTotpCifrado.de(new Uint8Array(29))).toThrow(DadoInvalido);
  });

  it('não serializa o conteúdo', () => {
    const s = SegredoTotpCifrado.de(new Uint8Array(30));
    expect(JSON.stringify(s)).toBe('"[protegido]"');
    expect(String(s)).toBe('[protegido]');
  });
});
