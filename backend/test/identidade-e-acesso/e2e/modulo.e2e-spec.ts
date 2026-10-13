import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { CONFIGURACAO, IniciarLogin, UNIDADE_DE_TRABALHO } from '../../../src/identidade-e-acesso/application/index.js';
import type { Configuracao } from '../../../src/identidade-e-acesso/infrastructure/config/configuracao.js';
import { DrizzleUnidadeDeTrabalho } from '../../../src/identidade-e-acesso/infrastructure/persistencia/drizzle-unidade-de-trabalho.js';
import { endurecerAplicacao } from '../../../src/identidade-e-acesso/interface/http/endurecer-aplicacao.js';

describe('IdentidadeEAcessoModule (E2E)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    const config = app.get<Configuracao>(CONFIGURACAO);
    endurecerAplicacao(app, { producao: config.ambiente === 'production', confiarNoProxy: config.trustProxy });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / continua devolvendo Hello World!', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('envia cabeçalhos de segurança e não expõe X-Powered-By', async () => {
    const r = await request(app.getHttpServer()).get('/');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['strict-transport-security']).toBeUndefined();
  });

  it('não habilita CORS (D-005)', async () => {
    const r = await request(app.getHttpServer()).get('/').set('Origin', 'http://evil.example');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app.getHttpServer())
      .options('/')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('resolve as portas e os casos de uso pelo contêiner', () => {
    expect(app.get(UNIDADE_DE_TRABALHO)).toBeInstanceOf(DrizzleUnidadeDeTrabalho);
    expect(app.get(IniciarLogin)).toBeInstanceOf(IniciarLogin);
  });

  it('rejeita corpo maior que 1 MB com 413 e JSON malformado com 400, ambos no formato de erro', async () => {
    const grande = await request(app.getHttpServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ lixo: 'x'.repeat(1_100_000) }));
    expect(grande.status).toBe(413);
    expect((grande.body as { erro: { codigo: string } }).erro.codigo).toBe('ERRO_HTTP');

    const malformado = await request(app.getHttpServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"senha": segredo-123');
    expect(malformado.status).toBe(400);
    expect(JSON.stringify(malformado.body)).not.toContain('segredo-123');
  });

  it('rota inexistente responde no formato de erro padrão', async () => {
    const r = await request(app.getHttpServer()).get('/nao-existe');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ erro: { codigo: 'ERRO_HTTP', mensagem: 'Requisição não atendida.' } });
  });
});
