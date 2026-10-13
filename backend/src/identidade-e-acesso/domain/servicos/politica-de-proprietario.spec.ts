import { describe, expect, it } from 'vitest';
import { UltimoProprietario } from '../erros.js';
import { Email } from '../usuario/email.js';
import { HashDeSenha } from '../usuario/hash-de-senha.js';
import { Usuario } from '../usuario/usuario.js';
import { PoliticaDeProprietario } from './politica-de-proprietario.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const novo = (): Usuario =>
  Usuario.criar({
    nome: 'Lucas',
    email: Email.criar('lucas@x.com'),
    hashDeSenha: HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def'),
    papeis: ['proprietario'],
    agora: T0,
  });

describe('PoliticaDeProprietario', () => {
  const politica = new PoliticaDeProprietario();

  it('o último proprietário não pode ser desativado', () => {
    expect(() => politica.garantirQuePodeDesativar(novo(), 1)).toThrow(UltimoProprietario);
  });

  it('com 2 proprietários ativos é permitido', () => {
    expect(() => politica.garantirQuePodeDesativar(novo(), 2)).not.toThrow();
  });

  it('usuário já desativado com contagem 1 é permitido', () => {
    const u = novo();
    u.desativar(T0);
    expect(() => politica.garantirQuePodeDesativar(u, 1)).not.toThrow();
  });
});
