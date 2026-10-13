import {
  ReautenticacaoNecessaria,
  SessaoExpirada,
  type ContextoDeAcesso,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import type {
  BarramentoDeEventos,
  GeradorDeCodigosDeRecuperacao,
  Relogio,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasRegenerarCodigos {
  uow: UnidadeDeTrabalho;
  verificadorDeMfa: VerificadorDeMfa;
  codigos: GeradorDeCodigosDeRecuperacao;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaRegenerarCodigos {
  ctx: ContextoDeAcesso;
  codigoMfa: string;
  ip: string | null;
}

export interface SaidaRegenerarCodigos {
  codigosDeRecuperacao: string[];
}

const QUANTIDADE_DE_CODIGOS = 10;

export class RegenerarCodigosDeRecuperacao {
  constructor(private readonly d: DependenciasRegenerarCodigos) {}

  async executar(e: EntradaRegenerarCodigos): Promise<SaidaRegenerarCodigos> {
    e.ctx.exigir('identidade:escrever');
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<SaidaRegenerarCodigos>> => {
      const usuario = await r.usuarios.porId(e.ctx.usuarioId);
      if (usuario === null) return falha(new SessaoExpirada());
      const mfa = await this.d.verificadorDeMfa.verificar(usuario, { tipo: 'totp', valor: e.codigoMfa }, agora);
      if (!mfa.ok) return falha(new ReautenticacaoNecessaria());

      const gerados = this.d.codigos.gerar(QUANTIDADE_DE_CODIGOS);
      usuario.substituirCodigosDeRecuperacao(
        gerados.map((g) => ({ id: crypto.randomUUID(), hash: g.hash })),
        agora,
      );
      await r.usuarios.salvar(usuario);
      const eventos = usuario.puxarEventos();
      const meta = { ip: e.ip, dispositivoId: e.ctx.dispositivoId };
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      await r.auditoria.registrar(
        this.d.auditor.avulso('reautenticacao-sensivel', {
          ocorridoEm: agora,
          usuarioId: e.ctx.usuarioId,
          dispositivoId: e.ctx.dispositivoId,
          ip: e.ip,
          detalhe: { acao: 'regenerar-codigos' },
        }),
      );
      return sucesso({ codigosDeRecuperacao: gerados.map((g) => g.codigo) }, eventos);
    });
    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }
}
