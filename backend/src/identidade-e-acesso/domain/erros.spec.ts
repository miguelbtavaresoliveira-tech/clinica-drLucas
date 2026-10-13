import { describe, expect, it } from 'vitest';
import { ErroDeDominio } from './comum/erro-de-dominio.js';
import * as e from './erros.js';

const casos: [string, new () => ErroDeDominio, string][] = [
  ['CredenciaisInvalidas', e.CredenciaisInvalidas, 'CREDENCIAIS_INVALIDAS'],
  ['ContaDesativada', e.ContaDesativada, 'CONTA_DESATIVADA'],
  ['MfaObrigatorio', e.MfaObrigatorio, 'MFA_OBRIGATORIO'],
  ['CodigoMfaInvalido', e.CodigoMfaInvalido, 'CODIGO_MFA_INVALIDO'],
  ['EmailJaCadastrado', e.EmailJaCadastrado, 'EMAIL_JA_CADASTRADO'],
  ['EmailInvalido', e.EmailInvalido, 'EMAIL_INVALIDO'],
  ['UltimoProprietario', e.UltimoProprietario, 'ULTIMO_PROPRIETARIO'],
  ['DispositivoRevogado', e.DispositivoRevogado, 'DISPOSITIVO_REVOGADO'],
  ['DispositivoNaoEncontrado', e.DispositivoNaoEncontrado, 'DISPOSITIVO_NAO_ENCONTRADO'],
  ['SessaoExpirada', e.SessaoExpirada, 'SESSAO_EXPIRADA'],
  ['RefreshReutilizado', e.RefreshReutilizado, 'REFRESH_REUTILIZADO'],
  ['ReautenticacaoNecessaria', e.ReautenticacaoNecessaria, 'REAUTENTICACAO_NECESSARIA'],
  ['DesafioInvalido', e.DesafioInvalido, 'DESAFIO_INVALIDO'],
  ['TokenDeRedefinicaoInvalido', e.TokenDeRedefinicaoInvalido, 'TOKEN_DE_REDEFINICAO_INVALIDO'],
  ['MfaJaConfigurado', e.MfaJaConfigurado, 'MFA_JA_CONFIGURADO'],
  ['ProprietarioJaExiste', e.ProprietarioJaExiste, 'PROPRIETARIO_JA_EXISTE'],
  ['UsuarioNaoEncontrado', e.UsuarioNaoEncontrado, 'USUARIO_NAO_ENCONTRADO'],
  ['IdentificadorInvalido', e.IdentificadorInvalido, 'IDENTIFICADOR_INVALIDO'],
];

const comCampos: [string, ErroDeDominio, string][] = [
  ['ContaBloqueada', new e.ContaBloqueada(new Date(0)), 'CONTA_BLOQUEADA'],
  ['SenhaFraca', new e.SenhaFraca(['curta']), 'SENHA_FRACA'],
  ['LimiteDeDispositivosAtingido', new e.LimiteDeDispositivosAtingido(3), 'LIMITE_DE_DISPOSITIVOS_ATINGIDO'],
  ['SemPermissao', new e.SemPermissao('x'), 'SEM_PERMISSAO'],
  ['AuditoriaInvalida', new e.AuditoriaInvalida('m'), 'AUDITORIA_INVALIDA'],
  ['DadoInvalido', new e.DadoInvalido('nome'), 'DADO_INVALIDO'],
];

describe('erros de domínio', () => {
  it.each(casos)('%s', (nome, Classe, codigo) => {
    const erro = new Classe();
    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe(nome);
    expect(erro.codigo).toBe(codigo);
  });

  it.each(comCampos)('%s (com campos)', (nome, erro, codigo) => {
    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect(erro.name).toBe(nome);
    expect(erro.codigo).toBe(codigo);
  });

  it('preserva campos extras', () => {
    const ate = new Date(1000);
    expect(new e.ContaBloqueada(ate).ate).toBe(ate);
    expect(new e.SenhaFraca(['curta', 'comum']).motivos).toEqual(['curta', 'comum']);
    expect(new e.LimiteDeDispositivosAtingido(3).maximo).toBe(3);
    expect(new e.SemPermissao('usuario.gerir').permissao).toBe('usuario.gerir');
    expect(new e.DadoInvalido('nome').campo).toBe('nome');
    expect(new e.DadoInvalido('nome').message).toBe('Dado inválido: nome.');
  });
});
