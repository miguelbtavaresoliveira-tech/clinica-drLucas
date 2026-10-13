import type {
  DesafioDeLoginRepositorio,
  DispositivoRepositorio,
  RepositorioDeAuditoria,
  SessaoDeLoginRepositorio,
  TokenDeRedefinicaoRepositorio,
  UsuarioRepositorio,
} from './repositorios.js';

export interface RepositoriosDaTransacao {
  readonly usuarios: UsuarioRepositorio;
  readonly dispositivos: DispositivoRepositorio;
  readonly sessoes: SessaoDeLoginRepositorio;
  readonly desafios: DesafioDeLoginRepositorio;
  readonly tokensDeRedefinicao: TokenDeRedefinicaoRepositorio;
  readonly auditoria: RepositorioDeAuditoria;
}

export interface UnidadeDeTrabalho {
  /** Faz rollback se `trabalho` lançar. */
  executar<T>(trabalho: (r: RepositoriosDaTransacao) => Promise<T>): Promise<T>;
}
