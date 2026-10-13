import { CodigoMfaInvalido, MfaObrigatorio, SessaoExpirada, type ContextoDeAcesso } from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import type {
  BarramentoDeEventos,
  GeradorDeCodigosDeRecuperacao,
  Relogio,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasConfirmarReconfiguracaoDeMfa {
  uow: UnidadeDeTrabalho;
  verificadorDeMfa: VerificadorDeMfa;
  codigos: GeradorDeCodigosDeRecuperacao;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaConfirmarReconfiguracaoDeMfa {
  ctx: ContextoDeAcesso;
  codigo: string;
  ip: string | null;
}

export interface SaidaConfirmarReconfiguracaoDeMfa {
  codigosDeRecuperacao: string[];
}

const QUANTIDADE_DE_CODIGOS = 10;

export class ConfirmarReconfiguracaoDeMfa {
  constructor(private readonly d: DependenciasConfirmarReconfiguracaoDeMfa) {}

  async executar(e: EntradaConfirmarReconfiguracaoDeMfa): Promise<SaidaConfirmarReconfiguracaoDeMfa> {
    e.ctx.exigir('identidade:escrever');
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<SaidaConfirmarReconfiguracaoDeMfa>> => {
      const usuario = await r.usuarios.porId(e.ctx.usuarioId);
      if (usuario === null) return falha(new SessaoExpirada());
      const pendente = usuario.mfaPendente;
      if (pendente === null) throw new MfaObrigatorio();

      const verificado = await this.d.verificadorDeMfa.verificarSegredo(pendente, e.codigo, null);
      if (!verificado.ok) return falha(new CodigoMfaInvalido());

      const gerados = this.d.codigos.gerar(QUANTIDADE_DE_CODIGOS);
      usuario.confirmarReconfiguracaoMfa(
        verificado.passo,
        gerados.map((g) => ({ id: crypto.randomUUID(), hash: g.hash })),
        agora,
      );
      await r.usuarios.salvar(usuario);
      const eventos = usuario.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, eventos, { ip: e.ip, dispositivoId: e.ctx.dispositivoId });
      return sucesso({ codigosDeRecuperacao: gerados.map((g) => g.codigo) }, eventos);
    });
    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }
}
