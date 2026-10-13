import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { BancoDeDados } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';

/**
 * Devolve a URL do banco de testes. Recusa qualquer banco cujo nome não termine com `_teste`
 * para que os testes de integração nunca apaguem o banco de desenvolvimento.
 */
export function urlDoBancoDeTeste(): string {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env['DATABASE_URL_TESTE'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL_TESTE ausente');
  const nomeDoBanco = new URL(url).pathname.replace(/^\//, '');
  if (!nomeDoBanco.endsWith('_teste')) throw new Error('Banco de teste precisa terminar com _teste');
  return url;
}

/** Esvazia todas as tabelas (inclusive a auditoria append-only) e reinicia as sequências. */
export async function limparBanco(db: BancoDeDados): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE identidade.auditoria_de_acesso DISABLE TRIGGER auditoria_sem_truncate`);
    await tx.execute(sql`TRUNCATE
      identidade.auditoria_de_acesso,
      identidade.tokens_de_redefinicao,
      identidade.desafios_de_login,
      identidade.sessoes_de_login,
      identidade.codigos_de_recuperacao,
      identidade.dispositivos,
      identidade.usuarios
      RESTART IDENTITY CASCADE`);
    await tx.execute(sql`ALTER TABLE identidade.auditoria_de_acesso ENABLE TRIGGER auditoria_sem_truncate`);
  });
}
