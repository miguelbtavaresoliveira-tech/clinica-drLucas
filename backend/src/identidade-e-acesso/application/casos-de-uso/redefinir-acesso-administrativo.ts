import {
  Email,
  UsuarioNaoEncontrado,
  type EventoDeDominio,
  type PoliticaDeAcesso,
  type PoliticaDeSenha,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import type { BarramentoDeEventos, HasherDeSenha, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasRedefinirAcessoAdministrativo {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  politicaDeSenha: PoliticaDeSenha;
  politica: PoliticaDeAcesso;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaRedefinirAcessoAdministrativo {
  email: string;
  novaSenha: string;
}

/** "Último recurso" (RN-36): só deve ser chamado pelo comando administrativo no servidor. */
export class RedefinirAcessoAdministrativo {
  constructor(private readonly d: DependenciasRedefinirAcessoAdministrativo) {}

  async executar(e: EntradaRedefinirAcessoAdministrativo): Promise<void> {
    const agora = this.d.relogio.agora();
    const email = Email.criar(e.email);
    this.d.politicaDeSenha.validar(e.novaSenha, email, this.d.politica);
    const hash = await this.d.hasher.gerar(e.novaSenha);

    const eventos = await this.d.uow.executar(async (r) => {
      const usuario = await r.usuarios.porEmail(email);
      if (usuario === null) throw new UsuarioNaoEncontrado();

      usuario.redefinirAcessoAdministrativamente(hash, agora);
      const sessoes = await r.sessoes.ativasDoUsuario(usuario.id);
      for (const sessao of sessoes) {
        sessao.revogar('acesso-redefinido', agora);
        await r.sessoes.salvar(sessao);
      }
      await r.tokensDeRedefinicao.invalidarDoUsuario(usuario.id, agora);
      await r.usuarios.salvar(usuario);

      const gerados: EventoDeDominio[] = [...usuario.puxarEventos(), ...sessoes.flatMap((s) => s.puxarEventos())];
      await this.d.auditor.registrar(r.auditoria, gerados, { ip: null, dispositivoId: null });
      return gerados;
    });
    await this.d.barramento.publicar(eventos);
  }
}
