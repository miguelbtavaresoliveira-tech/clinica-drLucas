import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { Agregado } from '../comum/agregado.js';
import type { DispositivoId } from '../dispositivo/dispositivo-id.js';
import { DadoInvalido } from '../erros.js';
import { SessaoRevogada, type MotivoRevogacaoDeSessao } from '../eventos.js';
import type { UsuarioId } from '../usuario/usuario-id.js';
import { SessaoDeLoginId } from './sessao-de-login-id.js';

export type SituacaoDaSessao = 'ativa' | 'revogada';
export type ResultadoDaRotacao = 'rotacionada' | 'reutilizacao-detectada' | 'invalida';

export interface PropsSessaoDeLogin {
  id: SessaoDeLoginId;
  usuarioId: UsuarioId;
  dispositivoId: DispositivoId;
  refreshAtualHash: string;
  refreshAnteriorHash: string | null;
  criadaEm: Date;
  expiraEm: Date;
  situacao: SituacaoDaSessao;
  revogadaEm: Date | null;
  motivoRevogacao: MotivoRevogacaoDeSessao | null;
  versao: number;
}

const REGEX_HASH = /^[0-9a-f]{64}$/;
const MS_POR_DIA = 86_400_000;

function validarHash(valor: string, campo: string): void {
  if (!REGEX_HASH.test(valor)) throw new DadoInvalido(campo);
}

export class SessaoDeLogin extends Agregado {
  private constructor(private readonly props: PropsSessaoDeLogin) {
    super();
  }

  static iniciar(d: {
    usuarioId: UsuarioId;
    dispositivoId: DispositivoId;
    refreshHash: string;
    agora: Date;
    politica: PoliticaDeAcesso;
  }): SessaoDeLogin {
    validarHash(d.refreshHash, 'refreshHash');
    return new SessaoDeLogin({
      id: SessaoDeLoginId.novo(),
      usuarioId: d.usuarioId,
      dispositivoId: d.dispositivoId,
      refreshAtualHash: d.refreshHash,
      refreshAnteriorHash: null,
      criadaEm: d.agora,
      expiraEm: new Date(d.agora.getTime() + d.politica.validadeRefreshDias * MS_POR_DIA),
      situacao: 'ativa',
      revogadaEm: null,
      motivoRevogacao: null,
      versao: 0,
    });
  }

  static reconstituir(props: PropsSessaoDeLogin): SessaoDeLogin {
    return new SessaoDeLogin({ ...props });
  }

  get id(): SessaoDeLoginId {
    return this.props.id;
  }
  get usuarioId(): UsuarioId {
    return this.props.usuarioId;
  }
  get dispositivoId(): DispositivoId {
    return this.props.dispositivoId;
  }
  get refreshAtualHash(): string {
    return this.props.refreshAtualHash;
  }
  get refreshAnteriorHash(): string | null {
    return this.props.refreshAnteriorHash;
  }
  get criadaEm(): Date {
    return this.props.criadaEm;
  }
  get expiraEm(): Date {
    return this.props.expiraEm;
  }
  get situacao(): SituacaoDaSessao {
    return this.props.situacao;
  }
  get revogadaEm(): Date | null {
    return this.props.revogadaEm;
  }
  get motivoRevogacao(): MotivoRevogacaoDeSessao | null {
    return this.props.motivoRevogacao;
  }
  get versao(): number {
    return this.props.versao;
  }

  definirVersaoPersistida(versao: number): void {
    this.props.versao = versao;
  }

  rotacionar(apresentadoHash: string, novoHash: string, agora: Date): ResultadoDaRotacao {
    validarHash(novoHash, 'refreshHash');
    if (this.props.situacao !== 'ativa' || agora.getTime() >= this.props.expiraEm.getTime()) return 'invalida';
    if (apresentadoHash === this.props.refreshAnteriorHash) {
      this.revogar('reutilizacao-de-refresh', agora);
      return 'reutilizacao-detectada';
    }
    if (apresentadoHash !== this.props.refreshAtualHash) return 'invalida';
    this.props.refreshAnteriorHash = this.props.refreshAtualHash;
    this.props.refreshAtualHash = novoHash;
    return 'rotacionada';
  }

  revogar(motivo: MotivoRevogacaoDeSessao, agora: Date): void {
    if (this.props.situacao === 'revogada') return;
    this.props.situacao = 'revogada';
    this.props.revogadaEm = agora;
    this.props.motivoRevogacao = motivo;
    this.registrar(
      new SessaoRevogada(this.props.id, this.props.usuarioId, this.props.dispositivoId, motivo, agora),
    );
  }

  estaAtiva(agora: Date): boolean {
    return this.props.situacao === 'ativa' && agora.getTime() < this.props.expiraEm.getTime();
  }
}
