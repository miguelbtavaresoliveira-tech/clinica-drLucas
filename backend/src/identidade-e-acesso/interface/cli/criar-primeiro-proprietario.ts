import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module.js';
import { CriarPrimeiroProprietario } from '../../application/index.js';
import { executarCriacao } from './executar-criacao.js';
import { criarTerminalDoProcesso } from './terminal.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const terminal = criarTerminalDoProcesso();
try {
  process.exitCode = await executarCriacao(app.get(CriarPrimeiroProprietario), terminal);
} finally {
  terminal.fechar();
  await app.close();
}
