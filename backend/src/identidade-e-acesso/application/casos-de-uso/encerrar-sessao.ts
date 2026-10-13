import type { ContextoDeAcesso } from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import type { BarramentoDeEventos, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasEncerrarSessao {
  uow: UnidadeDeTrabalho;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaEncerrarSessao {
  ctx: ContextoDeAcesso;
  ip: string | null;
}

/** Idempotente: sem sessão ativa no dispositivo, não faz nada. */
export class EncerrarSessao {
  constructor(private readonly d: DependenciasEncerrarSessao) {}

  async executar(e: EntradaEncerrarSessao): Promise<void> {
    const agora = this.d.relogio.agora();
    const eventos = await this.d.uow.executar(async (r) => {
      const sessao = await r.sessoes.ativaDoDispositivo(e.ctx.dispositivoId);
      if (sessao === null || !sessao.usuarioId.igual(e.ctx.usuarioId)) return [];
      sessao.revogar('logout', agora);
      await r.sessoes.salvar(sessao);
      const gerados = sessao.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, gerados, { ip: e.ip, dispositivoId: e.ctx.dispositivoId });
      return gerados;
    });
    await this.d.barramento.publicar(eventos);
  }
}
