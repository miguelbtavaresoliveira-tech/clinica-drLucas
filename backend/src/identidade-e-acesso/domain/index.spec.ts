import { describe, expect, it } from 'vitest';
import { PoliticaDeSenha, Usuario } from './index.js';

describe('barrel do domínio', () => {
  it('expõe agregados e serviços por um único ponto', () => {
    expect(Usuario).toBeDefined();
    expect(PoliticaDeSenha).toBeDefined();
  });
});
