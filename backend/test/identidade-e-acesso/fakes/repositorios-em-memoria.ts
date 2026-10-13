import {
  CodigoDeRecuperacao,
  Dispositivo,
  SessaoDeLogin,
  Usuario,
  type DispositivoId,
  type Email,
  type SessaoDeLoginId,
  type UsuarioId,
} from '../../../src/identidade-e-acesso/domain/index.js';
import type { RegistroDeAuditoria } from '../../../src/identidade-e-acesso/application/auditoria/registro-de-auditoria.js';
import {
  ConflitoDeConcorrencia,
  type DesafioDeLogin,
  type DesafioDeLoginRepositorio,
  type DispositivoRepositorio,
  type RepositorioDeAuditoria,
  type SessaoDeLoginRepositorio,
  type TokenDeRedefinicaoRepositorio,
  type UsuarioRepositorio,
} from '../../../src/identidade-e-acesso/application/portas/index.js';

interface TokenDeRedefinicaoGuardado {
  readonly usuarioId: UsuarioId;
  readonly expiraEm: Date;
  readonly usadoEm: Date | null;
}

/**
 * Estado compartilhado. Os valores guardados nunca são mutados in loco (leituras devolvem cópias
 * e escritas substituem a entrada), então um snapshot raso dos mapas basta para o rollback.
 */
export class EstadoEmMemoria {
  usuarios = new Map<string, Usuario>();
  dispositivos = new Map<string, Dispositivo>();
  sessoes = new Map<string, SessaoDeLogin>();
  desafios = new Map<string, DesafioDeLogin>();
  tokensDeRedefinicao = new Map<string, TokenDeRedefinicaoGuardado>();
  auditoria: RegistroDeAuditoria[] = [];

  tirarSnapshot(): EstadoEmMemoria {
    const copia = new EstadoEmMemoria();
    copia.usuarios = new Map(this.usuarios);
    copia.dispositivos = new Map(this.dispositivos);
    copia.sessoes = new Map(this.sessoes);
    copia.desafios = new Map(this.desafios);
    copia.tokensDeRedefinicao = new Map(this.tokensDeRedefinicao);
    copia.auditoria = [...this.auditoria];
    return copia;
  }

  restaurar(snapshot: EstadoEmMemoria): void {
    this.usuarios = snapshot.usuarios;
    this.dispositivos = snapshot.dispositivos;
    this.sessoes = snapshot.sessoes;
    this.desafios = snapshot.desafios;
    this.tokensDeRedefinicao = snapshot.tokensDeRedefinicao;
    this.auditoria = snapshot.auditoria;
  }
}

function copiarUsuario(u: Usuario): Usuario {
  return Usuario.reconstituir({
    id: u.id,
    nome: u.nome,
    email: u.email,
    situacao: u.situacao,
    papeis: u.papeis,
    hashDeSenha: u.hashDeSenha,
    senhaAlteradaEm: u.senhaAlteradaEm,
    mfa: u.mfa,
    mfaPendente: u.mfaPendente,
    codigosDeRecuperacao: u.codigosDeRecuperacao.map((c) =>
      CodigoDeRecuperacao.reconstituir({ id: c.id, hash: c.hash, usadoEm: c.usadoEm, criadoEm: c.criadoEm }),
    ),
    tentativasFalhas: u.tentativasFalhas,
    bloqueadoAte: u.bloqueadoAte,
    criadoEm: u.criadoEm,
    versao: u.versao,
  });
}

function copiarDispositivo(d: Dispositivo): Dispositivo {
  return Dispositivo.reconstituir({
    id: d.id,
    usuarioId: d.usuarioId,
    apelido: d.apelido,
    plataforma: d.plataforma,
    registradoEm: d.registradoEm,
    ultimoCheckIn: d.ultimoCheckIn,
    biometriaHabilitada: d.biometriaHabilitada,
    situacao: d.situacao,
    revogadoEm: d.revogadoEm,
    motivoRevogacao: d.motivoRevogacao,
    chavePublicaAuditoria: d.chavePublicaAuditoria,
    versao: d.versao,
  });
}

function copiarSessao(s: SessaoDeLogin): SessaoDeLogin {
  return SessaoDeLogin.reconstituir({
    id: s.id,
    usuarioId: s.usuarioId,
    dispositivoId: s.dispositivoId,
    refreshAtualHash: s.refreshAtualHash,
    refreshAnteriorHash: s.refreshAnteriorHash,
    criadaEm: s.criadaEm,
    expiraEm: s.expiraEm,
    situacao: s.situacao,
    revogadaEm: s.revogadaEm,
    motivoRevogacao: s.motivoRevogacao,
    versao: s.versao,
  });
}

function verificarVersao(armazenadaVersao: number | undefined, versaoRecebida: number): void {
  if (armazenadaVersao === undefined) {
    if (versaoRecebida !== 0) throw new ConflitoDeConcorrencia();
    return;
  }
  if (versaoRecebida === 0 || versaoRecebida !== armazenadaVersao) throw new ConflitoDeConcorrencia();
}

export class UsuarioRepositorioEmMemoria implements UsuarioRepositorio {
  constructor(private readonly estado: EstadoEmMemoria) {}

  porId(id: UsuarioId): Promise<Usuario | null> {
    const u = this.estado.usuarios.get(id.valor);
    return Promise.resolve(u === undefined ? null : copiarUsuario(u));
  }

  porEmail(email: Email): Promise<Usuario | null> {
    for (const u of this.estado.usuarios.values()) {
      if (u.email.igual(email)) return Promise.resolve(copiarUsuario(u));
    }
    return Promise.resolve(null);
  }

  contarProprietariosAtivos(): Promise<number> {
    let total = 0;
    for (const u of this.estado.usuarios.values()) if (u.ehProprietarioAtivo()) total += 1;
    return Promise.resolve(total);
  }

  async salvar(u: Usuario): Promise<void> {
    verificarVersao(this.estado.usuarios.get(u.id.valor)?.versao, u.versao);
    for (const outro of this.estado.usuarios.values()) {
      if (!outro.id.igual(u.id) && outro.email.igual(u.email)) throw new ConflitoDeConcorrencia();
    }
    const proxima = u.versao + 1;
    u.definirVersaoPersistida(proxima);
    this.estado.usuarios.set(u.id.valor, copiarUsuario(u));
  }
}

export class DispositivoRepositorioEmMemoria implements DispositivoRepositorio {
  constructor(private readonly estado: EstadoEmMemoria) {}

  porId(id: DispositivoId): Promise<Dispositivo | null> {
    const d = this.estado.dispositivos.get(id.valor);
    return Promise.resolve(d === undefined ? null : copiarDispositivo(d));
  }

  ativosDoUsuario(id: UsuarioId): Promise<Dispositivo[]> {
    return this.todosDoUsuario(id).then((lista) => lista.filter((d) => d.estaAtivo()));
  }

  todosDoUsuario(id: UsuarioId): Promise<Dispositivo[]> {
    const lista = [...this.estado.dispositivos.values()]
      .filter((d) => d.usuarioId.igual(id))
      .sort((a, b) => a.registradoEm.getTime() - b.registradoEm.getTime())
      .map(copiarDispositivo);
    return Promise.resolve(lista);
  }

  async salvar(d: Dispositivo): Promise<void> {
    verificarVersao(this.estado.dispositivos.get(d.id.valor)?.versao, d.versao);
    d.definirVersaoPersistida(d.versao + 1);
    this.estado.dispositivos.set(d.id.valor, copiarDispositivo(d));
  }
}

export class SessaoDeLoginRepositorioEmMemoria implements SessaoDeLoginRepositorio {
  constructor(private readonly estado: EstadoEmMemoria) {}

  porId(id: SessaoDeLoginId): Promise<SessaoDeLogin | null> {
    const s = this.estado.sessoes.get(id.valor);
    return Promise.resolve(s === undefined ? null : copiarSessao(s));
  }

  ativaDoDispositivo(id: DispositivoId): Promise<SessaoDeLogin | null> {
    for (const s of this.estado.sessoes.values()) {
      if (s.situacao === 'ativa' && s.dispositivoId.igual(id)) return Promise.resolve(copiarSessao(s));
    }
    return Promise.resolve(null);
  }

  ativasDoUsuario(id: UsuarioId): Promise<SessaoDeLogin[]> {
    return Promise.resolve(
      [...this.estado.sessoes.values()]
        .filter((s) => s.situacao === 'ativa' && s.usuarioId.igual(id))
        .map(copiarSessao),
    );
  }

  porRefreshHash(hash: string): Promise<SessaoDeLogin | null> {
    const candidatas = [...this.estado.sessoes.values()]
      .filter((s) => s.refreshAtualHash === hash || s.refreshAnteriorHash === hash)
      .sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime());
    const primeira = candidatas[0];
    return Promise.resolve(primeira === undefined ? null : copiarSessao(primeira));
  }

  async salvar(s: SessaoDeLogin): Promise<void> {
    verificarVersao(this.estado.sessoes.get(s.id.valor)?.versao, s.versao);
    if (s.situacao === 'ativa') {
      for (const outra of this.estado.sessoes.values()) {
        if (outra.situacao === 'ativa' && !outra.id.igual(s.id) && outra.dispositivoId.igual(s.dispositivoId)) {
          throw new ConflitoDeConcorrencia();
        }
      }
    }
    s.definirVersaoPersistida(s.versao + 1);
    this.estado.sessoes.set(s.id.valor, copiarSessao(s));
  }
}

export class DesafioDeLoginRepositorioEmMemoria implements DesafioDeLoginRepositorio {
  constructor(private readonly estado: EstadoEmMemoria) {}

  criar(d: { id: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void> {
    this.estado.desafios.set(d.id, { id: d.id, usuarioId: d.usuarioId, expiraEm: d.expiraEm, usadoEm: null });
    return Promise.resolve();
  }

  porId(id: string): Promise<DesafioDeLogin | null> {
    return Promise.resolve(this.estado.desafios.get(id) ?? null);
  }

  marcarUsado(id: string, agora: Date): Promise<boolean> {
    const d = this.estado.desafios.get(id);
    if (d === undefined || d.usadoEm !== null || agora.getTime() >= d.expiraEm.getTime()) return Promise.resolve(false);
    this.estado.desafios.set(id, { ...d, usadoEm: agora });
    return Promise.resolve(true);
  }
}

export class TokenDeRedefinicaoRepositorioEmMemoria implements TokenDeRedefinicaoRepositorio {
  constructor(private readonly estado: EstadoEmMemoria) {}

  criar(d: { hash: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void> {
    this.estado.tokensDeRedefinicao.set(d.hash, { usuarioId: d.usuarioId, expiraEm: d.expiraEm, usadoEm: null });
    return Promise.resolve();
  }

  usuarioDoTokenValido(hash: string, agora: Date): Promise<UsuarioId | null> {
    const t = this.estado.tokensDeRedefinicao.get(hash);
    if (t === undefined || t.usadoEm !== null || agora.getTime() >= t.expiraEm.getTime()) return Promise.resolve(null);
    return Promise.resolve(t.usuarioId);
  }

  consumir(hash: string, agora: Date): Promise<boolean> {
    const t = this.estado.tokensDeRedefinicao.get(hash);
    if (t === undefined || t.usadoEm !== null || agora.getTime() >= t.expiraEm.getTime()) return Promise.resolve(false);
    this.estado.tokensDeRedefinicao.set(hash, { ...t, usadoEm: agora });
    return Promise.resolve(true);
  }

  invalidarDoUsuario(usuarioId: UsuarioId, agora: Date): Promise<void> {
    for (const [hash, t] of this.estado.tokensDeRedefinicao) {
      if (t.usuarioId.igual(usuarioId) && t.usadoEm === null) {
        this.estado.tokensDeRedefinicao.set(hash, { ...t, usadoEm: agora });
      }
    }
    return Promise.resolve();
  }
}

export class RepositorioDeAuditoriaEmMemoria implements RepositorioDeAuditoria {
  constructor(private readonly estado: EstadoEmMemoria) {}

  get registros(): readonly RegistroDeAuditoria[] {
    return this.estado.auditoria;
  }

  registrar(reg: RegistroDeAuditoria): Promise<void> {
    this.estado.auditoria = [...this.estado.auditoria, reg];
    return Promise.resolve();
  }

  ultimoHashDoApp(dispositivoId: DispositivoId): Promise<string | null> {
    for (let i = this.estado.auditoria.length - 1; i >= 0; i--) {
      const r = this.estado.auditoria[i];
      if (r?.origem === 'app' && r.dispositivoId === dispositivoId.valor) return Promise.resolve(r.hash);
    }
    return Promise.resolve(null);
  }

  idsExistentes(ids: readonly string[]): Promise<Set<string>> {
    const existentes = new Set(this.estado.auditoria.map((r) => r.id));
    return Promise.resolve(new Set(ids.filter((id) => existentes.has(id))));
  }
}
