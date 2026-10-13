import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../../../src/app.module.js';
import { CONFIGURACAO, CriarPrimeiroProprietario, RELOGIO } from '../../../src/identidade-e-acesso/application/index.js';
import type { Configuracao } from '../../../src/identidade-e-acesso/infrastructure/config/configuracao.js';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { endurecerAplicacao } from '../../../src/identidade-e-acesso/interface/http/endurecer-aplicacao.js';
import { limparBanco, urlDoBancoDeTeste } from '../int/banco-de-teste.js';
import { RelogioFixo } from '../fakes/index.js';

export const CHAVE_PUBLICA = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
export const EMAIL = 'lucas@clinica.com';
export const SENHA = 'senha-de-teste-forte-123';
export const INICIO = new Date('2026-10-13T12:00:00.000Z');

const conexao = criarConexao(urlDoBancoDeTeste());

export async function zerarBanco(): Promise<void> {
  await limparBanco(conexao.db);
}

export async function encerrarAjudantes(): Promise<void> {
  await conexao.encerrar();
}

export interface AppDeTeste {
  app: NestExpressApplication;
  relogio: RelogioFixo;
  http: () => ReturnType<NestExpressApplication['getHttpServer']>;
  fechar: () => Promise<void>;
}

/** Sobe a aplicação inteira com relógio controlável (e opcionalmente outros provedores trocados). */
export async function criarAppDeTeste(
  trocas: { token: symbol | (new (...args: never[]) => unknown); valor: unknown }[] = [],
  relogio: RelogioFixo = new RelogioFixo(INICIO),
): Promise<AppDeTeste> {
  let construtor = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RELOGIO).useValue(relogio);
  for (const troca of trocas) construtor = construtor.overrideProvider(troca.token).useValue(troca.valor);
  const modulo = await construtor.compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  const config = app.get<Configuracao>(CONFIGURACAO);
  endurecerAplicacao(app, { producao: config.ambiente === 'production', confiarNoProxy: config.trustProxy });
  await app.init();
  return { app, relogio, http: () => app.getHttpServer(), fechar: () => app.close() };
}

export function codigoTotp(segredo: string, relogio: RelogioFixo): string {
  return authenticator.clone({ step: 30, digits: 6, window: 1, epoch: relogio.agora().getTime() }).generate(segredo);
}

export function semearProprietario(a: AppDeTeste, email = EMAIL, senha = SENHA): Promise<{ usuarioId: string }> {
  return a.app.get(CriarPrimeiroProprietario).executar({ nome: 'Lucas', email, senha });
}

export const dispositivoInformado = (id: string | null = null) => ({
  id,
  apelido: 'MacBook da clínica',
  plataforma: 'macos',
  chavePublicaAuditoria: CHAVE_PUBLICA,
});

export function corpoDe<T>(r: request.Response): T {
  return r.body as T;
}

export interface SaidaDeLogin {
  accessToken: string;
  accessExpiraEm: string;
  refreshToken: string;
  dispositivoId: string;
  usuario: { id: string; nome: string; email: string; papeis: string[] };
  codigosRestantes: number;
  usouCodigoDeRecuperacao: boolean;
}

/** Primeiro acesso: login (configurar) → segredo → confirmar. Devolve o segredo TOTP e os códigos de recuperação. */
export async function primeiroAcesso(
  a: AppDeTeste,
  email = EMAIL,
  senha = SENHA,
): Promise<{ segredo: string; codigosDeRecuperacao: string[]; desafio: string }> {
  const login = await request(a.http()).post('/auth/login').send({ email, senha }).expect(200);
  const { desafio } = corpoDe<{ desafio: string }>(login);
  const gerado = await request(a.http()).post('/auth/mfa/segredo').send({ desafio }).expect(200);
  const { segredo } = corpoDe<{ segredo: string }>(gerado);
  const confirmado = await request(a.http())
    .post('/auth/mfa/confirmar')
    .send({ desafio, codigo: codigoTotp(segredo, a.relogio) })
    .expect(200);
  return { segredo, codigosDeRecuperacao: corpoDe<{ codigosDeRecuperacao: string[] }>(confirmado).codigosDeRecuperacao, desafio };
}

/** Login completo para um usuário que já tem MFA. Avança o relógio 30 s para o código TOTP ser de um passo novo (RN-10). */
export async function entrar(
  a: AppDeTeste,
  segredo: string,
  opcoes: { email?: string; senha?: string; dispositivoId?: string | null } = {},
): Promise<SaidaDeLogin> {
  const login = await request(a.http())
    .post('/auth/login')
    .send({ email: opcoes.email ?? EMAIL, senha: opcoes.senha ?? SENHA })
    .expect(200);
  a.relogio.avancar(30_000);
  const r = await request(a.http())
    .post('/auth/login/concluir')
    .send({
      desafio: corpoDe<{ desafio: string }>(login).desafio,
      codigo: { tipo: 'totp', valor: codigoTotp(segredo, a.relogio) },
      dispositivo: dispositivoInformado(opcoes.dispositivoId ?? null),
    })
    .expect(200);
  return corpoDe<SaidaDeLogin>(r);
}

/** Semeia o proprietário, configura o MFA e deixa um dispositivo logado. */
export async function usuarioLogado(a: AppDeTeste): Promise<{ segredo: string; login: SaidaDeLogin; codigosDeRecuperacao: string[] }> {
  await semearProprietario(a);
  const { segredo, codigosDeRecuperacao } = await primeiroAcesso(a);
  const login = await entrar(a, segredo);
  return { segredo, login, codigosDeRecuperacao };
}

export const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];
