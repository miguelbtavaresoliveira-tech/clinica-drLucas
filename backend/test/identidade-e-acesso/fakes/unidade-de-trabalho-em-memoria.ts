import type {
  RepositoriosDaTransacao,
  UnidadeDeTrabalho,
} from '../../../src/identidade-e-acesso/application/portas/index.js';
import {
  DesafioDeLoginRepositorioEmMemoria,
  DispositivoRepositorioEmMemoria,
  EstadoEmMemoria,
  RepositorioDeAuditoriaEmMemoria,
  SessaoDeLoginRepositorioEmMemoria,
  TokenDeRedefinicaoRepositorioEmMemoria,
  UsuarioRepositorioEmMemoria,
} from './repositorios-em-memoria.js';

export interface RepositoriosEmMemoria extends RepositoriosDaTransacao {
  readonly usuarios: UsuarioRepositorioEmMemoria;
  readonly dispositivos: DispositivoRepositorioEmMemoria;
  readonly sessoes: SessaoDeLoginRepositorioEmMemoria;
  readonly desafios: DesafioDeLoginRepositorioEmMemoria;
  readonly tokensDeRedefinicao: TokenDeRedefinicaoRepositorioEmMemoria;
  readonly auditoria: RepositorioDeAuditoriaEmMemoria;
}

export class UnidadeDeTrabalhoEmMemoria implements UnidadeDeTrabalho {
  readonly estado = new EstadoEmMemoria();
  readonly repositorios: RepositoriosEmMemoria = {
    usuarios: new UsuarioRepositorioEmMemoria(this.estado),
    dispositivos: new DispositivoRepositorioEmMemoria(this.estado),
    sessoes: new SessaoDeLoginRepositorioEmMemoria(this.estado),
    desafios: new DesafioDeLoginRepositorioEmMemoria(this.estado),
    tokensDeRedefinicao: new TokenDeRedefinicaoRepositorioEmMemoria(this.estado),
    auditoria: new RepositorioDeAuditoriaEmMemoria(this.estado),
  };

  async executar<T>(trabalho: (r: RepositoriosDaTransacao) => Promise<T>): Promise<T> {
    const snapshot = this.estado.tirarSnapshot();
    try {
      return await trabalho(this.repositorios);
    } catch (erro) {
      this.estado.restaurar(snapshot);
      throw erro;
    }
  }
}
