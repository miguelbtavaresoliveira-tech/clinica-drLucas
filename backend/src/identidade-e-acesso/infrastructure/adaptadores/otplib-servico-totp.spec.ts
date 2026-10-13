import { describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../../../test/identidade-e-acesso/fakes/index.js';
import { EMISSOR_TOTP, OtplibServicoTotp } from './otplib-servico-totp.js';

const SEGREDO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const em = (segundos: number): OtplibServicoTotp => new OtplibServicoTotp(new RelogioFixo(new Date(segundos * 1000)));

describe('OtplibServicoTotp (vetores RFC 6238)', () => {
  it.each([
    [59, '287082', 1],
    [1_111_111_109, '081804', 37_037_036],
    [1_234_567_890, '005924', 41_152_263],
  ])('em %i s o código %s é válido com passo %i', (segundos, codigo, passo) => {
    expect(em(segundos).verificar(SEGREDO_RFC, codigo, null)).toEqual({ valido: true, passo });
  });

  it('janela ±1: aceita o código do passo anterior (delta −1) e rejeita dois passos depois', () => {
    expect(em(89).verificar(SEGREDO_RFC, '287082', null)).toEqual({ valido: true, passo: 1 });
    expect(em(119).verificar(SEGREDO_RFC, '287082', null)).toEqual({ valido: false, passo: -1 });
  });

  it('passo repetido ou anterior ao último aceito é recusado (RN-10)', () => {
    expect(em(59).verificar(SEGREDO_RFC, '287082', 1)).toEqual({ valido: false, passo: 1 });
    expect(em(59).verificar(SEGREDO_RFC, '287082', 5)).toEqual({ valido: false, passo: 1 });
    expect(em(59).verificar(SEGREDO_RFC, '287082', 0)).toEqual({ valido: true, passo: 1 });
  });

  it.each(['28708', 'abcdef', '2870822', '', '28708 '])('código %j é inválido sem lançar', (codigo) => {
    expect(em(59).verificar(SEGREDO_RFC, codigo, null)).toEqual({ valido: false, passo: -1 });
  });

  it('segredo malformado é inválido sem lançar', () => {
    expect(em(59).verificar('@@@', '287082', null).valido).toBe(false);
  });

  it('novoSegredo tem 32 caracteres base32 e é diferente a cada chamada', () => {
    const totp = em(0);
    const a = totp.novoSegredo();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(totp.novoSegredo()).not.toBe(a);
  });

  it('a URL do autenticador usa o emissor e o segredo', () => {
    const url = em(0).urlDoAutenticador(SEGREDO_RFC, 'lucas@clinica.com');
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain(`secret=${SEGREDO_RFC}`);
    expect(url).toContain(`issuer=${encodeURIComponent(EMISSOR_TOTP)}`);
    expect(url).toContain('lucas%40clinica.com');
  });
});
