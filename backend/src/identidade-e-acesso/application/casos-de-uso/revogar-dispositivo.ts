import {
  DispositivoId,
  DispositivoNaoEncontrado,
  ErroDeDominio,
  ReautenticacaoNecessaria,
  REGEX_UUID,
  SessaoExpirada,
  type ContextoDeAcesso,
  type Dispositivo,
  type EventoDeDominio,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import type { BarramentoDeEventos, Relogio, RepositoriosDaTransacao, UnidadeDeTrabalho } from '../portas/index.js';

export interface DependenciasRevogarDispositivo {
  uow: UnidadeDeTrabalho;
  verificadorDeMfa: VerificadorDeMfa;
  relogio: Relogio;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaRevogarDispositivo {
  ctx: ContextoDeAcesso;
  dispositivoId: string;
  motivo: string;
  codigoMfa: string;
  ip: string | null;
}

export class RevogarDispositivo {
  constructor(private readonly d: DependenciasRevogarDispositivo) {}

  async executar(e: EntradaRevogarDispositivo): Promise<void> {
    e.ctx.exigir('identidade:administrar');
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar((r) => this.dentroDaTransacao(r, e, agora));
    await this.d.barramento.publicar(resultado.eventos);
    desembrulhar(resultado);
  }

  private async dentroDaTransacao(
    r: RepositoriosDaTransacao,
    e: EntradaRevogarDispositivo,
    agora: Date,
  ): Promise<Resultado<void>> {
    const usuario = await r.usuarios.porId(e.ctx.usuarioId);
    if (usuario === null) return falha(new SessaoExpirada());

    const mfa = await this.d.verificadorDeMfa.verificar(usuario, { tipo: 'totp', valor: e.codigoMfa }, agora);
    if (!mfa.ok) return falha(new ReautenticacaoNecessaria());

    // A partir daqui o passo TOTP foi consumido e precisa ser persistido, mesmo em falha.
    const meta = { ip: e.ip, dispositivoId: e.ctx.dispositivoId };
    const falharSalvandoUsuario = async (erro: Error): Promise<Resultado<void>> => {
      await r.usuarios.salvar(usuario);
      const eventos = usuario.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      return falha(erro, eventos);
    };

    const dispositivo = await this.localizar(r, e);
    if (dispositivo === null) return falharSalvandoUsuario(new DispositivoNaoEncontrado());

    try {
      dispositivo.revogar(e.motivo, agora);
    } catch (erro) {
      if (erro instanceof ErroDeDominio) return falharSalvandoUsuario(erro);
      throw erro;
    }

    const sessao = await r.sessoes.ativaDoDispositivo(dispositivo.id);
    sessao?.revogar('dispositivo-revogado', agora);

    await r.usuarios.salvar(usuario);
    await r.dispositivos.salvar(dispositivo);
    if (sessao !== null) await r.sessoes.salvar(sessao);

    const eventos: EventoDeDominio[] = [
      ...usuario.puxarEventos(),
      ...dispositivo.puxarEventos(),
      ...(sessao?.puxarEventos() ?? []),
    ];
    await this.d.auditor.registrar(r.auditoria, eventos, meta);
    await r.auditoria.registrar(
      this.d.auditor.avulso('reautenticacao-sensivel', {
        ocorridoEm: agora,
        usuarioId: e.ctx.usuarioId,
        dispositivoId: e.ctx.dispositivoId,
        ip: e.ip,
        detalhe: { acao: 'revogar-dispositivo' },
      }),
    );
    return sucesso(undefined, eventos);
  }

  /** Só devolve dispositivos do próprio usuário (proteção contra IDOR). */
  private async localizar(r: RepositoriosDaTransacao, e: EntradaRevogarDispositivo): Promise<Dispositivo | null> {
    if (!REGEX_UUID.test(e.dispositivoId.trim().toLowerCase())) return null;
    const dispositivo = await r.dispositivos.porId(DispositivoId.de(e.dispositivoId));
    return dispositivo !== null && dispositivo.pertenceA(e.ctx.usuarioId) ? dispositivo : null;
  }
}
