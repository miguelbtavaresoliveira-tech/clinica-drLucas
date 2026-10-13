import {
  CredenciaisInvalidas,
  SenhaFraca,
  SessaoExpirada,
  type ContextoDeAcesso,
  type EventoDeDominio,
  type PoliticaDeAcesso,
  type PoliticaDeSenha,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type { BarramentoDeEventos, HasherDeSenha, Relogio, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasTrocarSenha {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  politicaDeSenha: PoliticaDeSenha;
  politica: PoliticaDeAcesso;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaTrocarSenha {
  ctx: ContextoDeAcesso;
  senhaAtual: string;
  novaSenha: string;
  ip: string | null;
}

export class TrocarSenha {
  constructor(private readonly d: DependenciasTrocarSenha) {}

  async executar(e: EntradaTrocarSenha): Promise<void> {
    e.ctx.exigir('identidade:escrever');
    const agora = this.d.relogio.agora();
    const meta = { ip: e.ip, dispositivoId: e.ctx.dispositivoId };

    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<void>> => {
      const usuario = await r.usuarios.porId(e.ctx.usuarioId);
      if (usuario === null) return falha(new SessaoExpirada());

      if (!(await this.d.hasher.conferir(e.senhaAtual, usuario.hashDeSenha))) {
        usuario.registrarFalhaDeLogin(agora, this.d.politica, 'senha');
        await r.usuarios.salvar(usuario);
        const eventos = usuario.puxarEventos();
        await this.d.auditor.registrar(r.auditoria, eventos, meta);
        return falha(new CredenciaisInvalidas(), eventos);
      }

      // Nenhum estado persistível mudou até aqui, então lançar é seguro.
      if (e.novaSenha === e.senhaAtual) throw new SenhaFraca(['igual-a-atual']);
      this.d.politicaDeSenha.validar(e.novaSenha, usuario.email, this.d.politica);

      usuario.trocarSenha(await this.d.hasher.gerar(e.novaSenha), agora);
      const outras = (await r.sessoes.ativasDoUsuario(usuario.id)).filter(
        (s) => !s.dispositivoId.igual(e.ctx.dispositivoId),
      );
      for (const sessao of outras) {
        sessao.revogar('senha-alterada', agora);
        await r.sessoes.salvar(sessao);
      }
      await r.usuarios.salvar(usuario);

      const eventos: EventoDeDominio[] = [...usuario.puxarEventos(), ...outras.flatMap((s) => s.puxarEventos())];
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      return sucesso(undefined, eventos);
    });

    await this.d.barramento.publicar(resultado.eventos);
    desembrulhar(resultado);
  }
}
