import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../erros.js';
import { POLITICA_PADRAO, criarPoliticaDeAcesso, type PoliticaDeAcesso } from './politica-de-acesso.js';

const com = (parcial: Partial<PoliticaDeAcesso>): PoliticaDeAcesso => ({ ...POLITICA_PADRAO, ...parcial });

describe('PoliticaDeAcesso', () => {
  it('o padrão tem os valores da SPEC e está congelado', () => {
    expect(POLITICA_PADRAO).toEqual({
      inatividadeMin: 10,
      limiteDiasOffline: 5,
      leituraPermitidaAposLimite: true,
      maxTentativasLogin: 5,
      bloqueioProgressivoMin: [1, 5, 15, 60],
      maxDispositivosAtivos: 3,
      tamanhoMinimoSenha: 12,
      validadeAccessMin: 15,
      validadeRefreshDias: 30,
      janelaReautenticacaoMin: 5,
      maxFalhasDesbloqueioLocal: 10,
    });
    expect(Object.isFrozen(POLITICA_PADRAO)).toBe(true);
    expect(Object.isFrozen(POLITICA_PADRAO.bloqueioProgressivoMin)).toBe(true);
  });

  it('aceita o padrão e devolve cópia congelada', () => {
    const p = criarPoliticaDeAcesso(POLITICA_PADRAO);
    expect(p).toEqual(POLITICA_PADRAO);
    expect(p).not.toBe(POLITICA_PADRAO);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.bloqueioProgressivoMin)).toBe(true);
  });

  it.each([
    { maxTentativasLogin: 0 },
    { inatividadeMin: 1.5 },
    { tamanhoMinimoSenha: 11 },
    { bloqueioProgressivoMin: [] },
    { bloqueioProgressivoMin: [5, 1] },
    { bloqueioProgressivoMin: [1, 1] },
  ])('rejeita %j', (parcial) => {
    expect(() => criarPoliticaDeAcesso(com(parcial))).toThrow(DadoInvalido);
  });
});
