import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, criarPoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { AvaliadorDeModoOffline } from './avaliador-de-modo-offline.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const DIA = 86_400_000;
const em = (ms: number): Date => new Date(T0.getTime() + ms);

describe('AvaliadorDeModoOffline', () => {
  const avaliador = new AvaliadorDeModoOffline();

  it('dentro do limite é normal, inclusive no instante exato', () => {
    expect(
      avaliador.avaliar({ agora: em(5 * DIA), ultimoCheckIn: T0, marcaDagua: null, politica: POLITICA_PADRAO }),
    ).toBe('normal');
  });

  it('5 dias + 1ms é somente-leitura', () => {
    expect(
      avaliador.avaliar({ agora: em(5 * DIA + 1), ultimoCheckIn: T0, marcaDagua: null, politica: POLITICA_PADRAO }),
    ).toBe('somente-leitura');
  });

  it('sem leitura após o limite, fica bloqueado', () => {
    const politica = criarPoliticaDeAcesso({ ...POLITICA_PADRAO, leituraPermitidaAposLimite: false });
    expect(avaliador.avaliar({ agora: em(6 * DIA), ultimoCheckIn: T0, marcaDagua: null, politica })).toBe(
      'bloqueado',
    );
  });

  it('relógio retrocedido é somente-leitura mesmo com check-in recente', () => {
    expect(
      avaliador.avaliar({
        agora: em(1000),
        ultimoCheckIn: em(1000),
        marcaDagua: em(2000),
        politica: POLITICA_PADRAO,
      }),
    ).toBe('somente-leitura');
  });

  it('marcaDagua igual a agora é normal', () => {
    expect(
      avaliador.avaliar({
        agora: em(1000),
        ultimoCheckIn: em(1000),
        marcaDagua: em(1000),
        politica: POLITICA_PADRAO,
      }),
    ).toBe('normal');
  });
});
