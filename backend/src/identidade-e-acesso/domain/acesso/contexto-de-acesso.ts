import type { DispositivoId } from '../dispositivo/dispositivo-id.js';
import { SemPermissao } from '../erros.js';
import type { UsuarioId } from '../usuario/usuario-id.js';
import type { NomeDePapel, Papel } from './papel.js';
import type { Permissao } from './permissao.js';

export class ContextoDeAcesso {
  constructor(
    readonly usuarioId: UsuarioId,
    readonly dispositivoId: DispositivoId,
    private readonly papeis: readonly Papel[],
  ) {}

  temPermissao(p: Permissao): boolean {
    return this.papeis.some((papel) => papel.concede(p));
  }

  exigir(p: Permissao): void {
    if (!this.temPermissao(p)) throw new SemPermissao(p);
  }

  nomesDosPapeis(): NomeDePapel[] {
    return this.papeis.map((papel) => papel.nome);
  }
}
