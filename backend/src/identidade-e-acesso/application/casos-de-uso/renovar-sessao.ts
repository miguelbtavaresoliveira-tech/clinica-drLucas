import {
  DispositivoId,
  DispositivoRevogado,
  RefreshReutilizado,
  REGEX_UUID,
  SessaoExpirada,
  type MotivoRevogacaoDeSessao,
  type PoliticaDeAcesso,
  type SessaoDeLogin,
} from '../../domain/index.js';
import type { Auditor } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import type {
  BarramentoDeEventos,
  EmissorDeTokens,
  Relogio,
  RepositoriosDaTransacao,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasRenovarSessao {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  relogio: Relogio;
  politica: PoliticaDeAcesso;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface EntradaRenovarSessao {
  refreshToken: string;
  dispositivoId: string;
  ip: string | null;
}

export interface SaidaRenovarSessao {
  accessToken: string;
  accessExpiraEm: Date;
  refreshToken: string;
  politica: PoliticaDeAcesso;
}

export class RenovarSessao {
  constructor(private readonly d: DependenciasRenovarSessao) {}

  async executar(e: EntradaRenovarSessao): Promise<SaidaRenovarSessao> {
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar((r) => this.dentroDaTransacao(r, e, agora));
    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }

  private async dentroDaTransacao(
    r: RepositoriosDaTransacao,
    e: EntradaRenovarSessao,
    agora: Date,
  ): Promise<Resultado<SaidaRenovarSessao>> {
    const hash = this.d.emissor.hashDe(e.refreshToken);
    const sessao = await r.sessoes.porRefreshHash(hash);
    if (sessao === null) return falha(new SessaoExpirada());
    if (!REGEX_UUID.test(e.dispositivoId.trim().toLowerCase())) return falha(new SessaoExpirada());
    if (!DispositivoId.de(e.dispositivoId).igual(sessao.dispositivoId)) return falha(new SessaoExpirada());

    const dispositivo = await r.dispositivos.porId(sessao.dispositivoId);
    if (dispositivo === null || !dispositivo.estaAtivo()) {
      return this.revogarEFalhar(r, sessao, 'dispositivo-revogado', new DispositivoRevogado(), e.ip, agora);
    }
    const usuario = await r.usuarios.porId(sessao.usuarioId);
    if (usuario === null || usuario.situacao === 'desativado') {
      return this.revogarEFalhar(r, sessao, 'usuario-desativado', new SessaoExpirada(), e.ip, agora);
    }

    const novo = this.d.emissor.gerarTokenOpaco();
    const rotacao = sessao.rotacionar(hash, novo.hash, agora);
    const meta = { ip: e.ip, dispositivoId: sessao.dispositivoId };

    if (rotacao === 'invalida') return falha(new SessaoExpirada());
    if (rotacao === 'reutilizacao-detectada') {
      await r.sessoes.salvar(sessao);
      const eventos = sessao.puxarEventos();
      await this.d.auditor.registrar(r.auditoria, eventos, meta);
      return falha(new RefreshReutilizado(), eventos);
    }

    dispositivo.registrarCheckIn(agora);
    await r.sessoes.salvar(sessao);
    await r.dispositivos.salvar(dispositivo);
    const accessExpiraEm = new Date(agora.getTime() + this.d.politica.validadeAccessMin * 60_000);
    const accessToken = this.d.emissor.emitirAccess(
      {
        usuarioId: usuario.id.valor,
        dispositivoId: sessao.dispositivoId.valor,
        sessaoId: sessao.id.valor,
        papeis: usuario.papeis,
      },
      accessExpiraEm,
    );
    return sucesso({ accessToken, accessExpiraEm, refreshToken: novo.token, politica: this.d.politica });
  }

  private async revogarEFalhar(
    r: RepositoriosDaTransacao,
    sessao: SessaoDeLogin,
    motivo: MotivoRevogacaoDeSessao,
    erro: Error,
    ip: string | null,
    agora: Date,
  ): Promise<Resultado<SaidaRenovarSessao>> {
    sessao.revogar(motivo, agora);
    await r.sessoes.salvar(sessao);
    const eventos = sessao.puxarEventos();
    await this.d.auditor.registrar(r.auditoria, eventos, { ip, dispositivoId: sessao.dispositivoId });
    return falha(erro, eventos);
  }
}
