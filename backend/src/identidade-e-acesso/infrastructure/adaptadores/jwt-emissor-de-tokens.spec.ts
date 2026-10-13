import { describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../../../test/identidade-e-acesso/fakes/index.js';
import { DesafioInvalido, SessaoExpirada, UsuarioId } from '../../domain/index.js';
import type { DadosDoAccess } from '../../application/portas/index.js';
import { JwtEmissorDeTokens } from './jwt-emissor-de-tokens.js';

const ACCESS = 'segredo-de-access-com-pelo-menos-32-caracteres!';
const DESAFIO = 'segredo-de-desafio-com-pelo-menos-32-caracteres!';
const T0 = new Date('2026-10-13T12:00:00.000Z');

const dados: DadosDoAccess = {
  usuarioId: '11111111-1111-4111-8111-111111111111',
  dispositivoId: '22222222-2222-4222-8222-222222222222',
  sessaoId: '33333333-3333-4333-8333-333333333333',
  papeis: ['proprietario'],
};

function montar() {
  const relogio = new RelogioFixo(T0);
  const emissor = new JwtEmissorDeTokens({ accessSegredo: ACCESS, desafioSegredo: DESAFIO }, relogio);
  const invertido = new JwtEmissorDeTokens({ accessSegredo: DESAFIO, desafioSegredo: ACCESS }, relogio);
  return { relogio, emissor, invertido };
}

const em = (ms: number): Date => new Date(T0.getTime() + ms);
const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('JwtEmissorDeTokens — access', () => {
  it('ida e volta', () => {
    const { emissor } = montar();
    const token = emissor.emitirAccess(dados, em(15 * 60_000));
    expect(emissor.verificarAccess(token)).toEqual(dados);
  });

  it('expirado lança SessaoExpirada', () => {
    const { emissor, relogio } = montar();
    const token = emissor.emitirAccess(dados, em(15 * 60_000));
    relogio.avancar(15 * 60_000);
    expect(() => emissor.verificarAccess(token)).toThrow(SessaoExpirada);
  });

  it('ainda válido um segundo antes de expirar', () => {
    const { emissor, relogio } = montar();
    const token = emissor.emitirAccess(dados, em(15 * 60_000));
    relogio.avancar(15 * 60_000 - 1000);
    expect(() => emissor.verificarAccess(token)).not.toThrow();
  });

  it('access assinado com o segredo do desafio lança SessaoExpirada', () => {
    const { emissor, invertido } = montar();
    expect(() => emissor.verificarAccess(invertido.emitirAccess(dados, em(60_000)))).toThrow(SessaoExpirada);
  });

  it('token com alg none lança SessaoExpirada', () => {
    const { emissor } = montar();
    const cabecalho = b64({ alg: 'none', typ: 'JWT' });
    const carga = b64({
      sub: dados.usuarioId,
      did: dados.dispositivoId,
      sid: dados.sessaoId,
      pap: ['proprietario'],
      typ: 'access',
      iss: 'clinica-api',
      aud: 'clinica-desktop',
      iat: 1_760_000_000,
      exp: 4_000_000_000,
    });
    expect(() => emissor.verificarAccess(`${cabecalho}.${carga}.`)).toThrow(SessaoExpirada);
  });

  it('payload adulterado lança SessaoExpirada', () => {
    const { emissor } = montar();
    const [h, p, s] = emissor.emitirAccess(dados, em(60_000)).split('.') as [string, string, string];
    const adulterado = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), pap: ['proprietario'], sub: '99999999-9999-4999-8999-999999999999' })).toString('base64url');
    expect(() => emissor.verificarAccess(`${h}.${adulterado}.${s}`)).toThrow(SessaoExpirada);
  });

  it('desafio apresentado como access lança SessaoExpirada', () => {
    const { emissor } = montar();
    const { token } = emissor.emitirDesafio(UsuarioId.novo(), em(60_000));
    expect(() => emissor.verificarAccess(token)).toThrow(SessaoExpirada);
  });

  it('lixo lança SessaoExpirada', () => {
    const { emissor } = montar();
    expect(() => emissor.verificarAccess('lixo')).toThrow(SessaoExpirada);
    expect(() => emissor.verificarAccess('')).toThrow(SessaoExpirada);
  });

  it('o access não carrega senha nem dados pessoais além dos ids e papéis', () => {
    const { emissor } = montar();
    const carga = JSON.parse(Buffer.from(emissor.emitirAccess(dados, em(60_000)).split('.')[1] as string, 'base64url').toString()) as Record<string, unknown>;
    expect(Object.keys(carga).sort()).toEqual(['aud', 'did', 'exp', 'iat', 'iss', 'pap', 'sid', 'sub', 'typ']);
  });
});

describe('JwtEmissorDeTokens — desafio', () => {
  it('ida e volta', () => {
    const { emissor } = montar();
    const usuarioId = UsuarioId.novo();
    const { id, token } = emissor.emitirDesafio(usuarioId, em(5 * 60_000));
    expect(emissor.verificarDesafio(token)).toEqual({ id, usuarioId });
  });

  it('access apresentado como desafio lança DesafioInvalido', () => {
    const { emissor } = montar();
    expect(() => emissor.verificarDesafio(emissor.emitirAccess(dados, em(60_000)))).toThrow(DesafioInvalido);
  });

  it('desafio expirado lança DesafioInvalido', () => {
    const { emissor, relogio } = montar();
    const { token } = emissor.emitirDesafio(UsuarioId.novo(), em(5 * 60_000));
    relogio.avancar(5 * 60_000);
    expect(() => emissor.verificarDesafio(token)).toThrow(DesafioInvalido);
  });

  it('segredo errado e lixo lançam DesafioInvalido', () => {
    const { emissor, invertido } = montar();
    expect(() => emissor.verificarDesafio(invertido.emitirDesafio(UsuarioId.novo(), em(60_000)).token)).toThrow(DesafioInvalido);
    expect(() => emissor.verificarDesafio('lixo')).toThrow(DesafioInvalido);
  });
});

describe('JwtEmissorDeTokens — token opaco', () => {
  it('tem 43 caracteres base64url, é único e hashDe confere', () => {
    const { emissor } = montar();
    const a = emissor.gerarTokenOpaco();
    const b = emissor.gerarTokenOpaco();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(emissor.hashDe(a.token)).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
});
