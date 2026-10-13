import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { CONFIGURACAO } from './identidade-e-acesso/application/index.js';
import type { Configuracao } from './identidade-e-acesso/infrastructure/config/configuracao.js';
import { endurecerAplicacao } from './identidade-e-acesso/interface/http/endurecer-aplicacao.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<Configuracao>(CONFIGURACAO);
  endurecerAplicacao(app, { producao: config.ambiente === 'production', confiarNoProxy: config.trustProxy });
  await app.listen(config.porta);
}

void bootstrap();
