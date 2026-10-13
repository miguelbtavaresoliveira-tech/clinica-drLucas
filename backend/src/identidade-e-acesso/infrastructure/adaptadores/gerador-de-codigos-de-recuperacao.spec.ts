import { describe, expect, it } from 'vitest';
import { GeradorDeCodigosCrockford } from './gerador-de-codigos-de-recuperacao.js';

describe('GeradorDeCodigosCrockford', () => {
  const gerador = new GeradorDeCodigosCrockford();

  it('gera 10 códigos distintos no formato XXXX-XXXX-XXXX-XXXX e com o hash correspondente', () => {
    const gerados = gerador.gerar(10);
    expect(gerados).toHaveLength(10);
    expect(new Set(gerados.map((g) => g.codigo)).size).toBe(10);
    for (const g of gerados) {
      expect(g.codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
      expect(g.hash).toBe(gerador.hashDe(g.codigo));
      expect(g.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('vetores de hash com normalização', () => {
    expect(gerador.hashDe('abcd-1234-efgh-5678')).toBe('be105af532593b07b857dbbb0012fc12a939efb515656aa111fc0120993c0609');
    expect(gerador.hashDe('qrst 0vlx-yzoi-2345')).toBe('19948b23e8529cea4336f5ee159cd5d7d41ef1720077d8ad7d3c3128688ac779');
  });

  it('a normalização aceita minúsculas, espaços e confusões O/I/L', () => {
    expect(gerador.hashDe('ABCD-1234-EFGH-5678')).toBe(gerador.hashDe('abcd 1234 efgh 5678'));
    expect(gerador.hashDe('OOOO-IIII-LLLL-0000')).toBe(gerador.hashDe('0000-1111-1111-0000'));
  });

  it('quantidade zero devolve lista vazia', () => {
    expect(gerador.gerar(0)).toEqual([]);
  });

  it('usa os 16 caracteres do alfabeto sem viés evidente (amostra grande)', () => {
    const usados = new Set(gerador.gerar(400).flatMap((g) => g.codigo.replace(/-/g, '').split('')));
    expect(usados.size).toBeGreaterThanOrEqual(30);
  });
});
