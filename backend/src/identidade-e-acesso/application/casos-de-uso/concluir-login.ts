import {
  CodigoMfaInvalido,
  DesafioInvalido,
  Dispositivo,
  DispositivoId,
  DispositivoRevogado,
  ErroDeDominio,
  MfaObrigatorio,
  REGEX_UUID,
  SessaoDeLogin,
  type EventoDeDominio,
  type NomeDePapel,
  type PoliticaDeAcesso,
  type PoliticaDeLimiteDeDispositivos,
  type Usuario,
} from '../../domain/index.js';
import type { Auditor, MetadadosDeAuditoria } from '../auditoria/auditor.js';
import { desembrulhar, falha, sucesso, type Resultado } from '../comum/resultado.js';
import { carregarDesafioValido } from '../comum/validacao-de-desafio.js';
import type { CodigoInformado, VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import type {
  BarramentoDeEventos,
  EmissorDeTokens,
  Relogio,
  RepositoriosDaTransacao,
  UnidadeDeTrabalho,
} from '../portas/index.js';

export interface DependenciasConcluirLogin {
  uow: UnidadeDeTrabalho;
  emissor: EmissorDeTokens;
  verificadorDeMfa: VerificadorDeMfa;
  relogio: Relogio;
  politica: PoliticaDeAcesso;
  limiteDeDispositivos: PoliticaDeLimiteDeDispositivos;
  auditor: Auditor;
  barramento: BarramentoDeEventos;
}

export interface DadosDoDispositivoInformado {
  id: string | null;
  apelido: string;
  plataforma: string;
  chavePublicaAuditoria: string;
}

export interface EntradaConcluirLogin {
  desafio: string;
  codigo: CodigoInformado;
  dispositivo: DadosDoDispositivoInformado;
  ip: string | null;
}

export interface SaidaConcluirLogin {
  accessToken: string;
  accessExpiraEm: Date;
  refreshToken: string;
  dispositivoId: string;
  politica: PoliticaDeAcesso;
  usuario: { id: string; nome: string; email: string; papeis: NomeDePapel[] };
  usouCodigoDeRecuperacao: boolean;
  codigosRestantes: number;
}

export class ConcluirLogin {
  constructor(private readonly d: DependenciasConcluirLogin) {}

  async executar(e: EntradaConcluirLogin): Promise<SaidaConcluirLogin> {
    const agora = this.d.relogio.agora();
    const resultado = await this.d.uow.executar((r) => this.dentroDaTransacao(r, e, agora));
    await this.d.barramento.publicar(resultado.eventos);
    return desembrulhar(resultado);
  }

  private async dentroDaTransacao(
    r: RepositoriosDaTransacao,
    e: EntradaConcluirLogin,
    agora: Date,
  ): Promise<Resultado<SaidaConcluirLogin>> {
    // Lançar aqui é seguro: nada foi alterado ainda.
    const { desafioId, usuario } = await carregarDesafioValido(e.desafio, this.d.emissor, r, agora);

    // A partir daqui há mudança de estado: erros de negócio viram `falha` (sem rollback).
    if (!(await r.desafios.marcarUsado(desafioId, agora))) return falha(new DesafioInvalido());

    try {
      usuario.garantirQuePodeAutenticar(agora);
    } catch (erro) {
      if (erro instanceof ErroDeDominio) return falha(erro);
      throw erro;
    }
    if (usuario.exigeConfigurarMfa()) return falha(new MfaObrigatorio());

    const mfa = await this.d.verificadorDeMfa.verificar(usuario, e.codigo, agora);
    if (!mfa.ok) {
      usuario.registrarFalhaDeLogin(agora, this.d.politica, 'mfa');
      return this.falharPersistindoUsuario(r, usuario, new CodigoMfaInvalido(), e.ip);
    }

    const escolha = await this.escolherDispositivo(r, usuario, e, agora);
    if (escolha.erro !== null) return this.falharPersistindoUsuario(r, usuario, escolha.erro, e.ip);
    const dispositivo = escolha.dispositivo;

    const anterior = await r.sessoes.ativaDoDispositivo(dispositivo.id);
    if (anterior !== null) {
      anterior.revogar('nova-sessao-no-dispositivo', agora);
      await r.sessoes.salvar(anterior);
    }

    const refresh = this.d.emissor.gerarTokenOpaco();
    const sessao = SessaoDeLogin.iniciar({
      usuarioId: usuario.id,
      dispositivoId: dispositivo.id,
      refreshHash: refresh.hash,
      agora,
      politica: this.d.politica,
    });
    usuario.registrarLoginCompleto(agora, dispositivo.id);
    dispositivo.registrarCheckIn(agora);

    await r.usuarios.salvar(usuario);
    await r.dispositivos.salvar(dispositivo);
    await r.sessoes.salvar(sessao);

    const eventos: EventoDeDominio[] = [
      ...usuario.puxarEventos(),
      ...dispositivo.puxarEventos(),
      ...(anterior?.puxarEventos() ?? []),
      ...sessao.puxarEventos(),
    ];
    const meta: MetadadosDeAuditoria = { ip: e.ip, dispositivoId: dispositivo.id };
    await this.d.auditor.registrar(r.auditoria, eventos, meta);

    const accessExpiraEm = new Date(agora.getTime() + this.d.politica.validadeAccessMin * 60_000);
    const accessToken = this.d.emissor.emitirAccess(
      {
        usuarioId: usuario.id.valor,
        dispositivoId: dispositivo.id.valor,
        sessaoId: sessao.id.valor,
        papeis: usuario.papeis,
      },
      accessExpiraEm,
    );

    return sucesso(
      {
        accessToken,
        accessExpiraEm,
        refreshToken: refresh.token,
        dispositivoId: dispositivo.id.valor,
        politica: this.d.politica,
        usuario: { id: usuario.id.valor, nome: usuario.nome, email: usuario.email.valor, papeis: usuario.papeis },
        usouCodigoDeRecuperacao: mfa.usouRecuperacao,
        codigosRestantes: usuario.codigosDisponiveis(),
      },
      eventos,
    );
  }

  /** Salva o estado já alterado do usuário (falha contada, passo TOTP ou código consumido) e devolve a falha. */
  private async falharPersistindoUsuario(
    r: RepositoriosDaTransacao,
    usuario: Usuario,
    erro: Error,
    ip: string | null,
  ): Promise<Resultado<SaidaConcluirLogin>> {
    await r.usuarios.salvar(usuario);
    const eventos = usuario.puxarEventos();
    await this.d.auditor.registrar(r.auditoria, eventos, { ip, dispositivoId: null });
    return falha(erro, eventos);
  }

  private async escolherDispositivo(
    r: RepositoriosDaTransacao,
    usuario: Usuario,
    e: EntradaConcluirLogin,
    agora: Date,
  ): Promise<{ dispositivo: Dispositivo; erro: null } | { dispositivo: null; erro: Error }> {
    const informado = e.dispositivo;
    if (informado.id !== null && REGEX_UUID.test(informado.id.trim().toLowerCase())) {
      const existente = await r.dispositivos.porId(DispositivoId.de(informado.id));
      if (existente !== null && existente.pertenceA(usuario.id)) {
        if (!existente.estaAtivo()) return { dispositivo: null, erro: new DispositivoRevogado() };
        return { dispositivo: existente, erro: null };
      }
    }
    try {
      const ativos = await r.dispositivos.ativosDoUsuario(usuario.id);
      this.d.limiteDeDispositivos.garantirQuePodeRegistrar(ativos.length, this.d.politica);
      const novo = Dispositivo.registrar({
        usuarioId: usuario.id,
        apelido: informado.apelido,
        plataforma: informado.plataforma,
        chavePublicaAuditoria: informado.chavePublicaAuditoria,
        agora,
      });
      return { dispositivo: novo, erro: null };
    } catch (erro) {
      if (erro instanceof ErroDeDominio) return { dispositivo: null, erro };
      throw erro;
    }
  }
}
