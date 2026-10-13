import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO } from '../acesso/politica-de-acesso.js';
import { SenhaFraca } from '../erros.js';
import { Email } from '../usuario/email.js';
import { PoliticaDeSenha } from './politica-de-senha.js';

const politicaDeSenha = new PoliticaDeSenha(new Set(['Fisioterapia123']));
const email = Email.criar('lucas@x.com.br');

const motivosDe = (senha: string, e: Email = email, p: PoliticaDeSenha = politicaDeSenha): readonly string[] => {
  try {
    p.validar(senha, e, POLITICA_PADRAO);
  } catch (erro) {
    expect(erro).toBeInstanceOf(SenhaFraca);
    return (erro as SenhaFraca).motivos;
  }
  return [];
};

describe('PoliticaDeSenha', () => {
  it('11 caracteres é curta; 12 passa', () => {
    expect(motivosDe('x7#Kq9!mZp2')).toEqual(['curta']);
    expect(motivosDe('x7#Kq9!mZp2L')).toEqual([]);
  });

  it('129 caracteres é longa', () => {
    expect(motivosDe('a1B#'.repeat(32) + 'z')).toEqual(['longa']);
  });

  it('igual ao e-mail ou à parte local', () => {
    expect(motivosDe('lucas@x.com.br')).toContain('igual-ao-email');
    const longo = Email.criar('fisioterapeuta.lucas@x.com');
    expect(motivosDe('Fisioterapeuta.Lucas', longo)).toContain('igual-ao-email');
  });

  it('senha comum, sem diferenciar maiúsculas', () => {
    expect(motivosDe('fisioterapia123')).toEqual(['comum']);
    expect(motivosDe('FISIOTERAPIA123')).toEqual(['comum']);
  });

  it('acumula curta e comum, nesta ordem', () => {
    const p = new PoliticaDeSenha(new Set(['abc123']));
    expect(motivosDe('abc123', email, p)).toEqual(['curta', 'comum']);
  });

  it('emoji conta como um caractere', () => {
    expect(motivosDe('😀'.repeat(12))).toEqual([]);
  });

  it('a mensagem do erro não contém a senha', () => {
    let mensagem = '';
    try {
      politicaDeSenha.validar('curta1', email, POLITICA_PADRAO);
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).not.toBe('');
    expect(mensagem).not.toContain('curta1');
  });
});
