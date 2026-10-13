import { describe, expect, it } from 'vitest';
import { ehPermissao } from './permissao.js';

describe('ehPermissao', () => {
  it('aceita permissão válida', () => {
    expect(ehPermissao('clinico:escrever')).toBe(true);
  });

  it.each(['clinico:apagar', 'xyz:ler', 'clinico', '', 'clinico:ler:x'])('rejeita %j', (v) => {
    expect(ehPermissao(v)).toBe(false);
  });
});
