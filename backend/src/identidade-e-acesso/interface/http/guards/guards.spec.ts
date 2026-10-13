import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { EmissorDeTokensFalso } from '../../../../../test/identidade-e-acesso/fakes/index.js';
import { ContextoDeAcesso, DispositivoId, SemPermissao, SessaoExpirada, UsuarioId } from '../../../domain/index.js';
import { RequerPermissao } from '../decorators/requer-permissao.js';
import type { RequisicaoAutenticada } from '../requisicao-autenticada.js';
import { AutenticacaoGuard } from './autenticacao.guard.js';
import { PermissaoGuard } from './permissao.guard.js';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const DISPOSITIVO = '22222222-2222-4222-8222-222222222222';
const SESSAO = '33333333-3333-4333-8333-333333333333';

class AlvoDeTeste {
  @RequerPermissao('identidade:administrar')
  protegido(): void {}

  livre(): void {}
}

function contextoFalso(req: Partial<RequisicaoAutenticada>, metodo: keyof AlvoDeTeste = 'livre'): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => AlvoDeTeste.prototype[metodo],
    getClass: () => AlvoDeTeste,
  } as unknown as ExecutionContext;
}

const emissor = new EmissorDeTokensFalso();
const guard = new AutenticacaoGuard(emissor);
const tokenValido = (papeis: readonly string[] = ['proprietario']): string =>
  emissor.emitirAccess(
    { usuarioId: USUARIO, dispositivoId: DISPOSITIVO, sessaoId: SESSAO, papeis: papeis as never },
    new Date(),
  );

describe('AutenticacaoGuard', () => {
  it.each([
    ['sem cabeçalho', undefined],
    ['esquema Basic', 'Basic abc'],
    ['Bearer sem token', 'Bearer'],
    ['Bearer com token vazio', 'Bearer   '],
    ['token inválido', 'Bearer lixo'],
  ])('%s lança SessaoExpirada', (_nome, authorization) => {
    const req = { headers: authorization === undefined ? {} : { authorization } } as RequisicaoAutenticada;
    expect(() => guard.canActivate(contextoFalso(req))).toThrow(SessaoExpirada);
    expect(req.contextoDeAcesso).toBeUndefined();
  });

  it('token válido monta o contexto com ids e papéis (esquema Bearer sem diferenciar maiúsculas)', () => {
    for (const esquema of ['Bearer', 'bearer', 'BEARER']) {
      const req = { headers: { authorization: `${esquema} ${tokenValido()}` } } as RequisicaoAutenticada;
      expect(guard.canActivate(contextoFalso(req))).toBe(true);
      expect(req.contextoDeAcesso?.usuarioId.valor).toBe(USUARIO);
      expect(req.contextoDeAcesso?.dispositivoId.valor).toBe(DISPOSITIVO);
      expect(req.contextoDeAcesso?.nomesDosPapeis()).toEqual(['proprietario']);
    }
  });

  it('papel desconhecido no token não concede acesso', () => {
    const req = { headers: { authorization: `Bearer ${tokenValido(['administrador-supremo'])}` } } as RequisicaoAutenticada;
    expect(() => guard.canActivate(contextoFalso(req))).toThrow(SessaoExpirada);
    expect(req.contextoDeAcesso).toBeUndefined();
  });

  it('ids inválidos no token não concedem acesso', () => {
    const token = emissor.emitirAccess(
      { usuarioId: 'nao-uuid', dispositivoId: DISPOSITIVO, sessaoId: SESSAO, papeis: ['proprietario'] },
      new Date(),
    );
    const req = { headers: { authorization: `Bearer ${token}` } } as RequisicaoAutenticada;
    expect(() => guard.canActivate(contextoFalso(req))).toThrow(SessaoExpirada);
  });
});

describe('PermissaoGuard', () => {
  const permissaoGuard = new PermissaoGuard(new Reflector());
  const contextoComPapeis = (papeis: ConstructorParameters<typeof ContextoDeAcesso>[2]): ContextoDeAcesso =>
    new ContextoDeAcesso(UsuarioId.de(USUARIO), DispositivoId.de(DISPOSITIVO), papeis);

  it('rota sem metadado passa, mesmo sem contexto', () => {
    expect(permissaoGuard.canActivate(contextoFalso({}, 'livre'))).toBe(true);
  });

  it('rota com metadado e sem contexto lança SessaoExpirada', () => {
    expect(() => permissaoGuard.canActivate(contextoFalso({}, 'protegido'))).toThrow(SessaoExpirada);
  });

  it('contexto sem a permissão lança SemPermissao com a permissão exigida', () => {
    const req = { contextoDeAcesso: contextoComPapeis([]) };
    let erro: unknown;
    try {
      permissaoGuard.canActivate(contextoFalso(req, 'protegido'));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(SemPermissao);
    expect((erro as SemPermissao).permissao).toBe('identidade:administrar');
  });

  it('proprietário passa', () => {
    const req = { contextoDeAcesso: contextoComPapeis([{ nome: 'proprietario', concede: () => true }]) };
    expect(permissaoGuard.canActivate(contextoFalso(req, 'protegido'))).toBe(true);
  });
});
