import { describe, expect, it } from 'vitest';
import {
  ehCodigoDeRecuperacao,
  ehCodigoTotp,
  ehEmailValido,
  regrasDaSenhaMestre,
  somenteDigitos,
} from './validacoes';

describe('ehEmailValido', () => {
  it.each(['lucas@clinica.com', '  lucas@clinica.com  ', 'a.b+c@x.com.br'])('aceita %j', (v) => {
    expect(ehEmailValido(v)).toBe(true);
  });
  it.each(['', 'semarroba', 'a@b', 'a b@c.com', '@x.com', `${'a'.repeat(250)}@x.com`])('rejeita %j', (v) => {
    expect(ehEmailValido(v)).toBe(false);
  });
});

describe('regrasDaSenhaMestre', () => {
  const ok = (senha: string, conf: string) => Object.fromEntries(regrasDaSenhaMestre(senha, conf).map((r) => [r.chave, r.ok]));

  it('11 caracteres não atinge o mínimo e 12 atinge', () => {
    expect(ok('x'.repeat(11), 'x'.repeat(11))['tamanho-minimo']).toBe(false);
    expect(ok('x'.repeat(12), 'x'.repeat(12))['tamanho-minimo']).toBe(true);
  });

  it('128 caracteres passa e 129 não', () => {
    expect(ok('x'.repeat(128), '')['tamanho-maximo']).toBe(true);
    expect(ok('x'.repeat(129), '')['tamanho-maximo']).toBe(false);
  });

  it('emoji conta como um caractere', () => {
    expect(ok('😀'.repeat(12), '😀'.repeat(12))['tamanho-minimo']).toBe(true);
    expect(ok('😀'.repeat(11), '')['tamanho-minimo']).toBe(false);
  });

  it('confere só quando a senha não é vazia e as duas são iguais', () => {
    expect(ok('', '')['confere']).toBe(false);
    expect(ok('abcdefghijkl', 'abcdefghijkl')['confere']).toBe(true);
    expect(ok('abcdefghijkl', 'abcdefghijkm')['confere']).toBe(false);
  });

  it('os textos são os da tela', () => {
    expect(regrasDaSenhaMestre('', '').map((r) => r.texto)).toEqual([
      'Pelo menos 12 caracteres',
      'No máximo 128 caracteres',
      'As duas senhas conferem',
    ]);
  });
});

describe('somenteDigitos', () => {
  it.each([
    ['12a3-4 56', '123456'],
    ['abc', ''],
    ['1234567890', '123456'],
  ])('%j → %j', (entrada, esperado) => {
    expect(somenteDigitos(entrada)).toBe(esperado);
  });
  it('respeita o máximo informado', () => {
    expect(somenteDigitos('123456', 3)).toBe('123');
  });
});

describe('códigos', () => {
  it('ehCodigoTotp exige exatamente 6 dígitos', () => {
    expect(ehCodigoTotp('123456')).toBe(true);
    for (const v of ['12345', '1234567', 'abcdef', '12345a', ' 123456']) expect(ehCodigoTotp(v)).toBe(false);
  });

  it.each(['test-0000-0000-0001', 'ABCD-EFGH-JKMN-PQRS', 'abcd efgh jkmn pqrs', 'ABCDEFGHJKMNPQRS'])(
    'ehCodigoDeRecuperacao aceita %j',
    (v) => {
      expect(ehCodigoDeRecuperacao(v)).toBe(true);
    },
  );
  it.each(['', 'ABCD-EFGH', 'ABCD-EFGH-JKMN-PQRST', 'ABCD-EFGH-JKMN-PQR!'])('ehCodigoDeRecuperacao rejeita %j', (v) => {
    expect(ehCodigoDeRecuperacao(v)).toBe(false);
  });
});
