import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module.js';
import { RedefinirAcessoAdministrativo } from '../../application/index.js';
import { executarRedefinicao } from './executar-redefinicao.js';
import { criarTerminalDoProcesso } from './terminal.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const terminal = criarTerminalDoProcesso();
try {
  process.exitCode = await executarRedefinicao(app.get(RedefinirAcessoAdministrativo), terminal);
} finally {
  terminal.fechar();
  await app.close();
}
