import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { Agregado } from '../comum/agregado.js';
import { DadoInvalido, DispositivoRevogado } from '../erros.js';
import { DispositivoFoiRevogado, DispositivoRegistrado } from '../eventos.js';
import type { UsuarioId } from '../usuario/usuario-id.js';
import { DispositivoId } from './dispositivo-id.js';
import { PLATAFORMAS, type Plataforma } from './plataforma.js';

export type SituacaoDoDispositivo = 'ativo' | 'revogado';

export interface PropsDispositivo {
  id: DispositivoId;
  usuarioId: UsuarioId;
  apelido: string;
  plataforma: Plataforma;
  registradoEm: Date;
  ultimoCheckIn: Date;
  biometriaHabilitada: boolean;
  situacao: SituacaoDoDispositivo;
  revogadoEm: Date | null;
  motivoRevogacao: string | null;
  chavePublicaAuditoria: string;
  versao: number;
}

const REGEX_CHAVE_PUBLICA = /^[A-Za-z0-9+/]{43}=$/;
const MS_POR_DIA = 86_400_000;

export class Dispositivo extends Agregado {
  private constructor(private readonly props: PropsDispositivo) {
    super();
  }

  static registrar(d: {
    usuarioId: UsuarioId;
    apelido: string;
    plataforma: string;
    chavePublicaAuditoria: string;
    agora: Date;
  }): Dispositivo {
    const apelido = d.apelido.trim();
    if (apelido.length < 1 || apelido.length > 60) throw new DadoInvalido('apelido');
    if (!(PLATAFORMAS as readonly string[]).includes(d.plataforma)) throw new DadoInvalido('plataforma');
    if (!REGEX_CHAVE_PUBLICA.test(d.chavePublicaAuditoria)) throw new DadoInvalido('chavePublicaAuditoria');
    const dispositivo = new Dispositivo({
      id: DispositivoId.novo(),
      usuarioId: d.usuarioId,
      apelido,
      plataforma: d.plataforma as Plataforma,
      registradoEm: d.agora,
      ultimoCheckIn: d.agora,
      biometriaHabilitada: false,
      situacao: 'ativo',
      revogadoEm: null,
      motivoRevogacao: null,
      chavePublicaAuditoria: d.chavePublicaAuditoria,
      versao: 0,
    });
    dispositivo.registrar(
      new DispositivoRegistrado(dispositivo.props.id, d.usuarioId, dispositivo.props.plataforma, d.agora),
    );
    return dispositivo;
  }

  static reconstituir(props: PropsDispositivo): Dispositivo {
    return new Dispositivo({ ...props });
  }

  get id(): DispositivoId {
    return this.props.id;
  }
  get usuarioId(): UsuarioId {
    return this.props.usuarioId;
  }
  get apelido(): string {
    return this.props.apelido;
  }
  get plataforma(): Plataforma {
    return this.props.plataforma;
  }
  get registradoEm(): Date {
    return this.props.registradoEm;
  }
  get ultimoCheckIn(): Date {
    return this.props.ultimoCheckIn;
  }
  get biometriaHabilitada(): boolean {
    return this.props.biometriaHabilitada;
  }
  get situacao(): SituacaoDoDispositivo {
    return this.props.situacao;
  }
  get revogadoEm(): Date | null {
    return this.props.revogadoEm;
  }
  get motivoRevogacao(): string | null {
    return this.props.motivoRevogacao;
  }
  get chavePublicaAuditoria(): string {
    return this.props.chavePublicaAuditoria;
  }
  get versao(): number {
    return this.props.versao;
  }

  definirVersaoPersistida(versao: number): void {
    this.props.versao = versao;
  }

  registrarCheckIn(agora: Date): void {
    this.garantirAtivo();
    if (agora.getTime() > this.props.ultimoCheckIn.getTime()) this.props.ultimoCheckIn = agora;
  }

  revogar(motivo: string, agora: Date): void {
    const limpo = motivo.trim();
    if (limpo.length < 3 || limpo.length > 200) throw new DadoInvalido('motivo');
    if (this.props.situacao === 'revogado') return;
    this.props.situacao = 'revogado';
    this.props.revogadoEm = agora;
    this.props.motivoRevogacao = limpo;
    this.registrar(new DispositivoFoiRevogado(this.props.id, this.props.usuarioId, limpo, agora));
  }

  estaForaDoLimiteOffline(agora: Date, politica: PoliticaDeAcesso): boolean {
    return agora.getTime() - this.props.ultimoCheckIn.getTime() > politica.limiteDiasOffline * MS_POR_DIA;
  }

  estaAtivo(): boolean {
    return this.props.situacao === 'ativo';
  }

  podeSincronizar(): boolean {
    return this.props.situacao === 'ativo';
  }

  pertenceA(usuarioId: UsuarioId): boolean {
    return this.props.usuarioId.igual(usuarioId);
  }

  garantirAtivo(): void {
    if (this.props.situacao === 'revogado') throw new DispositivoRevogado();
  }
}
