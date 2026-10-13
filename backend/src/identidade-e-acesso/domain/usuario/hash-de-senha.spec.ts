import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../erros.js';
import { HashDeSenha } from './hash-de-senha.js';

const VALIDO = '$argon2id$v=19$m=19456,t=2,p=1$abc$def';

describe('HashDeSenha', () => {
  it('aceita hash argon2id e expõe o valor', () => {
    expect(HashDeSenha.de(VALIDO).valor).toBe(VALIDO);
  });

  it.each(['$2b$10$abcdefghijklmnopqrstuv', ''])('rejeita %j', (v) => {
    expect(() => HashDeSenha.de(v)).toThrow(DadoInvalido);
  });

  it('não vaza o conteúdo ao serializar', () => {
    const h = HashDeSenha.de(VALIDO);
    expect(String(h)).not.toContain('argon2id');
    expect(JSON.stringify({ h })).not.toContain('argon2id');
  });
});
