import {
  ReautenticacaoNecessaria,
  SegredoTotpCifrado,
  SessaoExpirada,
  type ContextoDeAcesso,
  type PoliticaDeAcesso,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type {
  BarramentoDeEventos,
  CofreDeSegredos,
  HasherDeSenha,
  Relogio,
  ServicoTotp,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasIniciarReconfiguracaoDeMfa {
  uow: UnidadeDeTrabalho;
  hasher: HasherDeSenha;
  totp: ServicoTotp;
  cofre: CofreDeSegredos;
  politica: PoliticaDeAcesso;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaIniciarReconfiguracaoDeMfa {
  ctx: ContextoDeAcesso;
  senhaAtual: string;
  ip: string | null;
}

export interface SaidaIniciarReconfiguracaoDeMfa {
  segredo: string;
  urlOtpauth: string;
}

/** Guarda o novo segredo como pendente: o MFA atual continua valendo até a confirmação (D-010). */
export class IniciarReconfiguracaoDeMfa {
  constructor(private readonly d: DependenciasIniciarReconfiguracaoDeMfa) {}

  async executar(e: EntradaIniciarReconfiguracaoDeMfa): Promise<SaidaIniciarReconfiguracaoDeMfa> {
    e.ctx.exigir('identidade:escrever');
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar(async (r): Promise<Resultado<SaidaIniciarReconfiguracaoDeMfa>> => {
      const usuario = await r.usuarios.porId(e.ctx.usuarioId);
      if (usuario === null) return falha(new SessaoExpirada());

      if (!(await this.d.hasher.conferir(e.senhaAtual, usuario.hashDeSenha))) {
        usuario.registrarFalhaDeLogin(agora, this.d.politica, 'senha');
        await r.usuarios.salvar(usuario);
        const eventos = usuario.puxarEventos();
        await this.d.auditor.registrar(r.auditoria, eventos, { ip: e.ip, dispositivoId: e.ctx.dispositivoId });
        return falha(new ReautenticacaoNecessaria(), eventos);
      }

      const segredo = this.d.totp.novoSegredo();
      usuario.iniciarReconfiguracaoMfa(SegredoTotpCifrado.de(await this.d.cofre.cifrar(segredo)));
      await r.usuarios.salvar(usuario);
      return sucesso({ segredo, urlOtpauth: this.d.totp.urlDoAutenticador(segredo, usuario.email.valor) });
    });
    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }
}
