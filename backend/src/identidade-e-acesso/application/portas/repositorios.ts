import type {
  Dispositivo,
  DispositivoId,
  Email,
  SessaoDeLogin,
  SessaoDeLoginId,
  Usuario,
  UsuarioId,
} from '../../domain/index.js';
import type { RegistroDeAuditoria } from '../auditoria/registro-de-auditoria.js';

export interface UsuarioRepositorio {
  porId(id: UsuarioId): Promise<Usuario | null>;
  porEmail(email: Email): Promise<Usuario | null>;
  contarProprietariosAtivos(): Promise<number>;
  /** versao 0 → INSERT; senão UPDATE otimista; conflito → ConflitoDeConcorrencia */
  salvar(u: Usuario): Promise<void>;
}

export interface DispositivoRepositorio {
  porId(id: DispositivoId): Promise<Dispositivo | null>;
  ativosDoUsuario(id: UsuarioId): Promise<Dispositivo[]>;
  /** ordem: registradoEm ascendente */
  todosDoUsuario(id: UsuarioId): Promise<Dispositivo[]>;
  salvar(d: Dispositivo): Promise<void>;
}

export interface SessaoDeLoginRepositorio {
  porId(id: SessaoDeLoginId): Promise<SessaoDeLogin | null>;
  ativaDoDispositivo(id: DispositivoId): Promise<SessaoDeLogin | null>;
  ativasDoUsuario(id: UsuarioId): Promise<SessaoDeLogin[]>;
  /** casa refresh_atual_hash OU refresh_anterior_hash; havendo mais de uma, a de criadaEm mais recente */
  porRefreshHash(hash: string): Promise<SessaoDeLogin | null>;
  salvar(s: SessaoDeLogin): Promise<void>;
}

export interface DesafioDeLogin {
  readonly id: string;
  readonly usuarioId: UsuarioId;
  readonly expiraEm: Date;
  readonly usadoEm: Date | null;
}

export interface DesafioDeLoginRepositorio {
  criar(d: { id: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void>;
  porId(id: string): Promise<DesafioDeLogin | null>;
  /** true só se usado_em era NULL e agora < expira_em (atômico) */
  marcarUsado(id: string, agora: Date): Promise<boolean>;
}

export interface TokenDeRedefinicaoRepositorio {
  criar(d: { hash: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void>;
  /** só leitura */
  usuarioDoTokenValido(hash: string, agora: Date): Promise<UsuarioId | null>;
  /** atômico, como marcarUsado */
  consumir(hash: string, agora: Date): Promise<boolean>;
  /** marca usado_em em todos os tokens não usados do usuário */
  invalidarDoUsuario(usuarioId: UsuarioId, agora: Date): Promise<void>;
}

export interface RepositorioDeAuditoria {
  registrar(reg: RegistroDeAuditoria): Promise<void>;
  ultimoHashDoApp(dispositivoId: DispositivoId): Promise<string | null>;
  idsExistentes(ids: readonly string[]): Promise<Set<string>>;
}
