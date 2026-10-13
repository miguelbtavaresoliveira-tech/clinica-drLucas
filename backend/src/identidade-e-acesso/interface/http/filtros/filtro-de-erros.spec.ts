import { BadRequestException, ForbiddenException, Logger, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuditoriaInvalida,
  CodigoMfaInvalido,
  ContaBloqueada,
  ContaDesativada,
  CredenciaisInvalidas,
  DadoInvalido,
  DesafioInvalido,
  DispositivoNaoEncontrado,
  DispositivoRevogado,
  EmailInvalido,
  EmailJaCadastrado,
  IdentificadorInvalido,
  LimiteDeDispositivosAtingido,
  MfaJaConfigurado,
  MfaObrigatorio,
  ProprietarioJaExiste,
  ReautenticacaoNecessaria,
  RefreshReutilizado,
  SemPermissao,
  SenhaFraca,
  SessaoExpirada,
  TokenDeRedefinicaoInvalido,
  UltimoProprietario,
  UsuarioNaoEncontrado,
} from '../../../domain/index.js';
import { ConflitoDeConcorrencia } from '../../../application/portas/index.js';
import { FiltroDeErros } from './filtro-de-erros.js';
import { traduzirErro } from './tabela-de-erros.js';

const ATE = new Date('2026-10-13T12:30:00.000Z');

const casos: [string, unknown, number, string, Record<string, unknown>?][] = [
  ['CredenciaisInvalidas', new CredenciaisInvalidas(), 401, 'CREDENCIAIS_INVALIDAS'],
  ['ContaDesativada', new ContaDesativada(), 401, 'CREDENCIAIS_INVALIDAS'],
  ['CodigoMfaInvalido', new CodigoMfaInvalido(), 401, 'CODIGO_MFA_INVALIDO'],
  ['SessaoExpirada', new SessaoExpirada(), 401, 'SESSAO_EXPIRADA'],
  ['RefreshReutilizado', new RefreshReutilizado(), 401, 'SESSAO_EXPIRADA'],
  ['DesafioInvalido', new DesafioInvalido(), 401, 'DESAFIO_INVALIDO'],
  ['TokenDeRedefinicaoInvalido', new TokenDeRedefinicaoInvalido(), 401, 'TOKEN_DE_REDEFINICAO_INVALIDO'],
  ['ContaBloqueada', new ContaBloqueada(ATE), 423, 'CONTA_BLOQUEADA', { tentarApos: '2026-10-13T12:30:00.000Z' }],
  ['DispositivoRevogado', new DispositivoRevogado(), 403, 'DISPOSITIVO_REVOGADO'],
  ['SemPermissao', new SemPermissao('financeiro:ler'), 403, 'SEM_PERMISSAO'],
  ['ReautenticacaoNecessaria', new ReautenticacaoNecessaria(), 403, 'REAUTENTICACAO_NECESSARIA'],
  ['LimiteDeDispositivosAtingido', new LimiteDeDispositivosAtingido(3), 409, 'LIMITE_DE_DISPOSITIVOS_ATINGIDO'],
  ['EmailJaCadastrado', new EmailJaCadastrado(), 409, 'EMAIL_JA_CADASTRADO'],
  ['MfaJaConfigurado', new MfaJaConfigurado(), 409, 'MFA_JA_CONFIGURADO'],
  ['ProprietarioJaExiste', new ProprietarioJaExiste(), 409, 'PROPRIETARIO_JA_EXISTE'],
  ['UltimoProprietario', new UltimoProprietario(), 409, 'ULTIMO_PROPRIETARIO'],
  ['ConflitoDeConcorrencia', new ConflitoDeConcorrencia(), 409, 'CONFLITO_DE_CONCORRENCIA'],
  ['SenhaFraca', new SenhaFraca(['curta', 'comum']), 422, 'SENHA_FRACA', { motivos: ['curta', 'comum'] }],
  ['MfaObrigatorio', new MfaObrigatorio(), 422, 'MFA_OBRIGATORIO'],
  ['EmailInvalido', new EmailInvalido(), 422, 'EMAIL_INVALIDO'],
  ['IdentificadorInvalido', new IdentificadorInvalido(), 422, 'IDENTIFICADOR_INVALIDO'],
  ['DadoInvalido', new DadoInvalido('apelido'), 422, 'DADO_INVALIDO', { campos: ['apelido'], mensagem: 'Dado inválido.' }],
  ['AuditoriaInvalida', new AuditoriaInvalida('encadeamento'), 422, 'AUDITORIA_INVALIDA', { motivos: ['encadeamento'] }],
  ['UsuarioNaoEncontrado', new UsuarioNaoEncontrado(), 404, 'USUARIO_NAO_ENCONTRADO'],
  ['DispositivoNaoEncontrado', new DispositivoNaoEncontrado(), 404, 'DISPOSITIVO_NAO_ENCONTRADO'],
  ['ThrottlerException', new ThrottlerException(), 429, 'MUITAS_REQUISICOES', { mensagem: 'Muitas tentativas. Aguarde um minuto.' }],
  ['HttpException genérica', new NotFoundException(), 404, 'ERRO_HTTP', { mensagem: 'Requisição não atendida.' }],
  ['HttpException 403 genérica', new ForbiddenException('segredo'), 403, 'ERRO_HTTP', { mensagem: 'Requisição não atendida.' }],
  ['erro interno', new Error('senha=abc'), 500, 'ERRO_INTERNO', { mensagem: 'Erro interno.' }],
  ['valor não-Error', 'texto solto', 500, 'ERRO_INTERNO'],
];

describe('traduzirErro', () => {
  it.each(casos)('%s', (_nome, erro, status, codigo, extras) => {
    const traduzido = traduzirErro(erro);
    expect(traduzido.status).toBe(status);
    expect(traduzido.corpo.erro['codigo']).toBe(codigo);
    expect(typeof traduzido.corpo.erro['mensagem']).toBe('string');
    expect(traduzido.corpo.erro).toMatchObject(extras ?? {});
  });

  it('ContaDesativada e CredenciaisInvalidas produzem corpos idênticos (RN-12)', () => {
    expect(traduzirErro(new ContaDesativada())).toEqual(traduzirErro(new CredenciaisInvalidas()));
  });

  it('HttpException com corpo no formato { erro } é repassada', () => {
    const original = new BadRequestException({ erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida.', campos: ['a'] } });
    expect(traduzirErro(original)).toEqual({
      status: 400,
      corpo: { erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida.', campos: ['a'] } },
    });
  });

  it('erro de parsing do body-parser vira 4xx genérico, não 500', () => {
    const erroDeJson = Object.assign(new SyntaxError('Unexpected token s in JSON'), { status: 400, type: 'entity.parse.failed' });
    expect(traduzirErro(erroDeJson)).toEqual({
      status: 400,
      corpo: { erro: { codigo: 'ERRO_HTTP', mensagem: 'Requisição não atendida.' } },
    });
  });

  it('nenhuma resposta vaza mensagem interna, stack ou valores', () => {
    const corpo = JSON.stringify(traduzirErro(new Error('senha=abc token=xyz')).corpo);
    expect(corpo).not.toContain('abc');
    expect(corpo).not.toContain('xyz');
    expect(corpo).not.toContain('at ');
    expect(JSON.stringify(traduzirErro(new SemPermissao('financeiro:administrar')).corpo)).not.toContain('financeiro');
  });
});

describe('FiltroDeErros', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function executar(erro: unknown) {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    new FiltroDeErros().catch(erro, host);
    return { status, json };
  }

  it('responde com o status e o corpo traduzidos', () => {
    const { status, json } = executar(new ContaBloqueada(ATE));
    expect(status).toHaveBeenCalledWith(423);
    expect(json).toHaveBeenCalledWith({
      erro: { codigo: 'CONTA_BLOQUEADA', mensagem: 'Conta temporariamente bloqueada.', tentarApos: '2026-10-13T12:30:00.000Z' },
    });
  });

  it('erro 500 é logado pelo nome da classe com a stack, mas a resposta é genérica', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { status, json } = executar(new TypeError('senha=abc'));
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('abc');
    expect(log).toHaveBeenCalledWith('Erro não tratado: TypeError', expect.any(String));
  });

  it('erros de negócio não geram log de erro', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executar(new CredenciaisInvalidas());
    expect(log).not.toHaveBeenCalled();
  });
});
