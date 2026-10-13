import {
  REGEX_UUID,
  UsuarioId,
  UsuarioNaoEncontrado,
  type ContextoDeAcesso,
  type EventoDeDominio,
  type PoliticaDeProprietario,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import type { BarramentoDeEventos, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasDesativarUsuario {
  uow: UnidadeDeTrabalho;
  relogio: Relogio;
  politicaDeProprietario: PoliticaDeProprietario;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaDesativarUsuario {
  ctx: ContextoDeAcesso;
  usuarioId: string;
  ip: string | null;
}

/** Nunca exclui o usuário (RN-04) e protege o último proprietário (RN-03). */
export class DesativarUsuario {
  constructor(private readonly d: DependenciasDesativarUsuario) {}

  async executar(e: EntradaDesativarUsuario): Promise<void> {
    e.ctx.exigir('identidade:administrar');
    if (!REGEX_UUID.test(e.usuarioId.trim().toLowerCase())) throw new UsuarioNaoEncontrado();
    const alvoId = UsuarioId.de(e.usuarioId);
    const agora = this.d.relogio.agora();

    const eventos = await this.d.uow.executar(async (r) => {
      const alvo = await r.usuarios.porId(alvoId);
      if (alvo === null) throw new UsuarioNaoEncontrado();
      this.d.politicaDeProprietario.garantirQuePodeDesativar(alvo, await r.usuarios.contarProprietariosAtivos());

      alvo.desativar(agora);
      const sessoes = await r.sessoes.ativasDoUsuario(alvo.id);
      for (const sessao of sessoes) {
        sessao.revogar('usuario-desativado', agora);
        await r.sessoes.salvar(sessao);
      }
      await r.usuarios.salvar(alvo);

      const gerados: EventoDeDominio[] = [...alvo.puxarEventos(), ...sessoes.flatMap((s) => s.puxarEventos())];
      await this.d.auditor.registrar(r.auditoria, gerados, { ip: e.ip, dispositivoId: e.ctx.dispositivoId });
      return gerados;
    });
    await this.d.barramento.publicar(eventos);
  }
}
