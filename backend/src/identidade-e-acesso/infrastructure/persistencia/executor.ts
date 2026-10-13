import type { BancoDeDados } from './conexao.js';

/** Serve tanto para `db` quanto para a transação `tx`. */
export type ExecutorDrizzle = Pick<BancoDeDados, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;
