import type {
  CalculadoraDeHash,
  RepositoriosDaTransacao,
  UnidadeDeTrabalho,
} from '../../application/portas/index.js';
import type { BancoDeDados } from './conexao.js';
import { criarRepositorios } from './fabrica-de-repositorios.js';

/** Uma transação por `executar`: lançar dentro do trabalho faz rollback; retornar confirma (commit). */
export class DrizzleUnidadeDeTrabalho implements UnidadeDeTrabalho {
  constructor(
    private readonly db: BancoDeDados,
    private readonly hash: CalculadoraDeHash,
  ) {}

  executar<T>(trabalho: (r: RepositoriosDaTransacao) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => trabalho(criarRepositorios(tx, this.hash)));
  }
}
