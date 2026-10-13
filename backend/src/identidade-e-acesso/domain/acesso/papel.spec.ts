import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../erros.js';
import { PROPRIETARIO, papelPorNome } from './papel.js';

describe('papel', () => {
  it('papelPorNome devolve o proprietário', () => {
    expect(papelPorNome('proprietario')).toBe(PROPRIETARIO);
  });

  it.each(['admin', '', 'toString', '__proto__'])('rejeita papel desconhecido %j', (n) => {
    expect(() => papelPorNome(n)).toThrow(DadoInvalido);
  });

  it('proprietário concede qualquer permissão', () => {
    expect(PROPRIETARIO.concede('financeiro:administrar')).toBe(true);
  });
});
