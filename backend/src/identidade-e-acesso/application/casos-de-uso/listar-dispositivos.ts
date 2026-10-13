import type { ContextoDeAcesso, Plataforma, SituacaoDoDispositivo } from '../../domain/index.js';
import type { UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasListarDispositivos {
  uow: UnidadeDeTrabalho;
}

export interface ItemDeDispositivo {
  id: string;
  apelido: string;
  plataforma: Plataforma;
  registradoEm: Date;
  ultimoCheckIn: Date;
  situacao: SituacaoDoDispositivo;
  revogadoEm: Date | null;
  atual: boolean;
}

export interface EntradaListarDispositivos {
  ctx: ContextoDeAcesso;
}

export class ListarDispositivos {
  constructor(private readonly d: DependenciasListarDispositivos) {}

  async executar(e: EntradaListarDispositivos): Promise<ItemDeDispositivo[]> {
    e.ctx.exigir('identidade:ler');
    const dispositivos = await this.d.uow.executar((r) => r.dispositivos.todosDoUsuario(e.ctx.usuarioId));
    return dispositivos.map((x) => ({
      id: x.id.valor,
      apelido: x.apelido,
      plataforma: x.plataforma,
      registradoEm: x.registradoEm,
      ultimoCheckIn: x.ultimoCheckIn,
      situacao: x.situacao,
      revogadoEm: x.revogadoEm,
      atual: x.id.igual(e.ctx.dispositivoId),
    }));
  }
}
