import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO } from '../acesso/politica-de-acesso.js';
import { LimiteDeDispositivosAtingido } from '../erros.js';
import { PoliticaDeLimiteDeDispositivos } from './politica-de-limite-de-dispositivos.js';

describe('PoliticaDeLimiteDeDispositivos', () => {
  const politica = new PoliticaDeLimiteDeDispositivos();

  it('2 ativos é permitido', () => {
    expect(() => politica.garantirQuePodeRegistrar(2, POLITICA_PADRAO)).not.toThrow();
  });

  it('3 ativos lança com maximo === 3', () => {
    let erro: unknown;
    try {
      politica.garantirQuePodeRegistrar(3, POLITICA_PADRAO);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(LimiteDeDispositivosAtingido);
    expect((erro as LimiteDeDispositivosAtingido).maximo).toBe(3);
  });
});
