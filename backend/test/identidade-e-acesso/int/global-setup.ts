import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { urlDoBancoDeTeste } from './banco-de-teste.js';

/** `export default` é exigido pelo Vitest para globalSetup. Recria o schema do zero a cada execução. */
export default async function setup(): Promise<void> {
  const conexao = criarConexao(urlDoBancoDeTeste());
  try {
    await conexao.db.execute(sql`select 1`);
    await conexao.db.execute(sql`DROP SCHEMA IF EXISTS identidade CASCADE`);
    await conexao.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await migrate(conexao.db, { migrationsFolder: './drizzle' });
  } finally {
    await conexao.encerrar();
  }
}
