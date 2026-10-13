import { existsSync } from 'node:fs';
import { urlDoBancoDeTeste } from './identidade-e-acesso/int/banco-de-teste.js';

if (existsSync('.env')) process.loadEnvFile('.env');

// Valores FALSOS, só para os testes E2E rodarem sem .env completo (por exemplo, em CI).
const PADROES_DE_TESTE: Record<string, string> = {
  JWT_ACCESS_SEGREDO: 'segredo-de-access-so-para-testes-e2e-32c!',
  JWT_DESAFIO_SEGREDO: 'segredo-de-desafio-so-para-testes-e2e-32!',
  TOTP_CHAVE_CIFRA_B64: Buffer.alloc(32, 7).toString('base64'),
  URL_REDEFINICAO_SENHA: 'http://localhost/redefinir',
};
for (const [nome, valor] of Object.entries(PADROES_DE_TESTE)) {
  process.env[nome] ??= valor;
}

// Os E2E usam sempre o banco de testes (a trava `_teste` está em urlDoBancoDeTeste).
process.env['DATABASE_URL'] = urlDoBancoDeTeste();
// Sem SMTP nos testes: o envio de e-mail fica desabilitado.
delete process.env['SMTP_HOST'];
