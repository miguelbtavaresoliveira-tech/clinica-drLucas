import { describe, expect, it } from 'vitest';
import { EmailInvalido } from '../erros.js';
import { Email } from './email.js';

describe('Email', () => {
  it('normaliza com trim e minúsculas', () => {
    expect(Email.criar('  Lucas@Exemplo.COM ').valor).toBe('lucas@exemplo.com');
  });

  it.each(['', 'semarroba', 'a@b', 'a b@c.com'])('rejeita %j', (e) => {
    expect(() => Email.criar(e)).toThrow(EmailInvalido);
  });

  it('rejeita string de 255 caracteres', () => {
    const e = `${'a'.repeat(255 - 6)}@b.com`;
    expect(e.length).toBe(255);
    expect(() => Email.criar(e)).toThrow(EmailInvalido);
  });

  it('parteLocal devolve o texto antes do @', () => {
    expect(Email.criar('lucas@x.com').parteLocal()).toBe('lucas');
  });

  it('igual compara o valor normalizado', () => {
    expect(Email.criar('A@x.com').igual(Email.criar(' a@X.com '))).toBe(true);
    expect(Email.criar('a@x.com').igual(Email.criar('b@x.com'))).toBe(false);
  });
});
