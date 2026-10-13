import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type BancoDeDados = NodePgDatabase<typeof schema>;

export interface ConexaoDoBanco {
  readonly db: BancoDeDados;
  readonly pool: Pool;
  encerrar(): Promise<void>;
}

export function criarConexao(url: string): ConexaoDoBanco {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    encerrar: () => pool.end(),
  };
}
