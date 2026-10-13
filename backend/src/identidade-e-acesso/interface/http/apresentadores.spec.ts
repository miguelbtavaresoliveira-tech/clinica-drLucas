import { describe, expect, it } from 'vitest';
import type { SaidaConcluirLogin } from '../../application/index.js';
import { POLITICA_PADRAO } from '../../domain/index.js';
import {
  apresentarConcluirLogin,
  apresentarDispositivos,
  apresentarIniciarLogin,
  apresentarPolitica,
  apresentarRenovarSessao,
} from './apresentadores.js';

const T = new Date('2026-10-13T12:00:00.000Z');

describe('apresentadores', () => {
  it('apresentarIniciarLogin converte a data para ISO', () => {
    expect(apresentarIniciarLogin({ desafio: 'd', mfa: 'verificar', expiraEm: T })).toEqual({
      desafio: 'd',
      mfa: 'verificar',
      expiraEm: '2026-10-13T12:00:00.000Z',
    });
  });

  it('apresentarConcluirLogin devolve só os campos do contrato, com datas em ISO', () => {
    const saida = {
      accessToken: 'a',
      accessExpiraEm: T,
      refreshToken: 'r',
      dispositivoId: 'did',
      politica: POLITICA_PADRAO,
      usuario: { id: 'u', nome: 'Lucas', email: 'l@x.com', papeis: ['proprietario'] },
      usouCodigoDeRecuperacao: false,
      codigosRestantes: 10,
      campoExtra: 'não deve sair',
      hashDeSenha: 'não deve sair',
    } as SaidaConcluirLogin;
    const resposta = apresentarConcluirLogin(saida);
    expect(Object.keys(resposta).sort()).toEqual([
      'accessExpiraEm',
      'accessToken',
      'codigosRestantes',
      'dispositivoId',
      'politica',
      'refreshToken',
      'usouCodigoDeRecuperacao',
      'usuario',
    ]);
    expect(resposta.accessExpiraEm).toBe('2026-10-13T12:00:00.000Z');
    expect(Object.keys(resposta.usuario).sort()).toEqual(['email', 'id', 'nome', 'papeis']);
    expect(JSON.stringify(resposta)).not.toContain('não deve sair');
  });

  it('apresentarRenovarSessao devolve tokens, data ISO e política', () => {
    const resposta = apresentarRenovarSessao({ accessToken: 'a', accessExpiraEm: T, refreshToken: 'r', politica: POLITICA_PADRAO });
    expect(Object.keys(resposta).sort()).toEqual(['accessExpiraEm', 'accessToken', 'politica', 'refreshToken']);
    expect(resposta.accessExpiraEm).toBe('2026-10-13T12:00:00.000Z');
  });

  it('apresentarPolitica copia os 11 campos e o array', () => {
    const politica = apresentarPolitica(POLITICA_PADRAO);
    expect(Object.keys(politica)).toHaveLength(11);
    expect(politica.bloqueioProgressivoMin).toEqual([1, 5, 15, 60]);
    expect(Object.isFrozen(politica.bloqueioProgressivoMin)).toBe(false);
  });

  it('apresentarDispositivos formata datas e preserva nulos', () => {
    const { dispositivos } = apresentarDispositivos([
      { id: 'a', apelido: 'Mac', plataforma: 'macos', registradoEm: T, ultimoCheckIn: T, situacao: 'ativo', revogadoEm: null, atual: true },
      { id: 'b', apelido: 'Win', plataforma: 'windows', registradoEm: T, ultimoCheckIn: T, situacao: 'revogado', revogadoEm: T, atual: false },
    ]);
    expect(dispositivos[0]).toMatchObject({ revogadoEm: null, registradoEm: '2026-10-13T12:00:00.000Z', atual: true });
    expect(dispositivos[1]).toMatchObject({ revogadoEm: '2026-10-13T12:00:00.000Z', situacao: 'revogado' });
  });
});
