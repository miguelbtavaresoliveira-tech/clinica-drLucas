import type { NomeDePapel } from '../acesso/papel.js';
import type { PoliticaDeAcesso } from '../acesso/politica-de-acesso.js';
import { Agregado } from '../comum/agregado.js';
import type { DispositivoId } from '../dispositivo/dispositivo-id.js';
import {
  CodigoMfaInvalido,
  ContaBloqueada,
  ContaDesativada,
  DadoInvalido,
  MfaJaConfigurado,
  MfaObrigatorio,
} from '../erros.js';
import {
  AcessoRedefinidoAdministrativamente,
  CodigoDeRecuperacaoUsado,
  CodigosDeRecuperacaoRegenerados,
  LoginFalhou,
  LoginRealizado,
  MfaConfigurado,
  SenhaAlterada,
  UsuarioBloqueado,
  UsuarioCriado,
  UsuarioDesativado,
} from '../eventos.js';
import { CodigoDeRecuperacao } from './codigo-de-recuperacao.js';
import type { Email } from './email.js';
import type { HashDeSenha } from './hash-de-senha.js';
import type { SegredoTotpCifrado } from './segredo-totp-cifrado.js';
import { UsuarioId } from './usuario-id.js';

export type SituacaoDoUsuario = 'ativo' | 'desativado';

export interface ConfiguracaoMfa {
  readonly segredo: SegredoTotpCifrado;
  readonly confirmadoEm: Date | null;
  readonly ultimoPasso: number | null;
}

export interface NovoCodigo {
  readonly id: string;
  readonly hash: string;
}

export interface PropsUsuario {
  id: UsuarioId;
  nome: string;
  email: Email;
  situacao: SituacaoDoUsuario;
  papeis: NomeDePapel[];
  hashDeSenha: HashDeSenha;
  senhaAlteradaEm: Date;
  mfa: ConfiguracaoMfa | null;
  mfaPendente: SegredoTotpCifrado | null;
  codigosDeRecuperacao: CodigoDeRecuperacao[];
  tentativasFalhas: number;
  bloqueadoAte: Date | null;
  criadoEm: Date;
  versao: number;
}

export const QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO = 10;

const MS_POR_MINUTO = 60_000;

export class Usuario extends Agregado {
  private constructor(private readonly props: PropsUsuario) {
    super();
  }

  static criar(d: {
    nome: string;
    email: Email;
    hashDeSenha: HashDeSenha;
    papeis: NomeDePapel[];
    agora: Date;
  }): Usuario {
    const nome = d.nome.trim();
    if (nome.length < 1 || nome.length > 120) throw new DadoInvalido('nome');
    if (d.papeis.length === 0) throw new DadoInvalido('papeis');
    const usuario = new Usuario({
      id: UsuarioId.novo(),
      nome,
      email: d.email,
      situacao: 'ativo',
      papeis: [...d.papeis],
      hashDeSenha: d.hashDeSenha,
      senhaAlteradaEm: d.agora,
      mfa: null,
      mfaPendente: null,
      codigosDeRecuperacao: [],
      tentativasFalhas: 0,
      bloqueadoAte: null,
      criadoEm: d.agora,
      versao: 0,
    });
    usuario.registrar(new UsuarioCriado(usuario.props.id, d.agora));
    return usuario;
  }

  static reconstituir(props: PropsUsuario): Usuario {
    return new Usuario({
      ...props,
      papeis: [...props.papeis],
      codigosDeRecuperacao: [...props.codigosDeRecuperacao],
    });
  }

  get id(): UsuarioId {
    return this.props.id;
  }
  get nome(): string {
    return this.props.nome;
  }
  get email(): Email {
    return this.props.email;
  }
  get situacao(): SituacaoDoUsuario {
    return this.props.situacao;
  }
  get papeis(): NomeDePapel[] {
    return [...this.props.papeis];
  }
  get hashDeSenha(): HashDeSenha {
    return this.props.hashDeSenha;
  }
  get senhaAlteradaEm(): Date {
    return this.props.senhaAlteradaEm;
  }
  get mfa(): ConfiguracaoMfa | null {
    return this.props.mfa;
  }
  get mfaPendente(): SegredoTotpCifrado | null {
    return this.props.mfaPendente;
  }
  get codigosDeRecuperacao(): readonly CodigoDeRecuperacao[] {
    return [...this.props.codigosDeRecuperacao];
  }
  get tentativasFalhas(): number {
    return this.props.tentativasFalhas;
  }
  get bloqueadoAte(): Date | null {
    return this.props.bloqueadoAte;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get versao(): number {
    return this.props.versao;
  }

  definirVersaoPersistida(versao: number): void {
    this.props.versao = versao;
  }

  garantirQuePodeAutenticar(agora: Date): void {
    if (this.props.situacao === 'desativado') throw new ContaDesativada();
    const ate = this.props.bloqueadoAte;
    if (ate !== null && agora.getTime() < ate.getTime()) throw new ContaBloqueada(ate);
  }

  registrarFalhaDeLogin(agora: Date, politica: PoliticaDeAcesso, motivo: 'senha' | 'mfa'): void {
    this.props.tentativasFalhas += 1;
    if (this.props.tentativasFalhas >= politica.maxTentativasLogin) {
      const degrau = Math.min(
        this.props.tentativasFalhas - politica.maxTentativasLogin,
        politica.bloqueioProgressivoMin.length - 1,
      );
      const minutos = politica.bloqueioProgressivoMin[degrau] as number;
      const bloqueadoAte = new Date(agora.getTime() + minutos * MS_POR_MINUTO);
      this.props.bloqueadoAte = bloqueadoAte;
      this.registrar(new UsuarioBloqueado(this.props.id, bloqueadoAte, agora));
    }
    this.registrar(new LoginFalhou(this.props.id, motivo, agora));
  }

  registrarLoginCompleto(agora: Date, dispositivoId: DispositivoId): void {
    this.props.tentativasFalhas = 0;
    this.props.bloqueadoAte = null;
    this.registrar(new LoginRealizado(this.props.id, dispositivoId, agora));
  }

  exigeConfigurarMfa(): boolean {
    return this.props.mfa === null || this.props.mfa.confirmadoEm === null;
  }

  prepararMfa(segredo: SegredoTotpCifrado): void {
    if (this.props.mfa?.confirmadoEm) throw new MfaJaConfigurado();
    this.props.mfa = { segredo, confirmadoEm: null, ultimoPasso: null };
  }

  segredoMfaPendenteDeConfirmacao(): SegredoTotpCifrado {
    return this.mfaNaoConfirmado().segredo;
  }

  confirmarMfa(passo: number, codigos: readonly NovoCodigo[], agora: Date): void {
    const { segredo } = this.mfaNaoConfirmado();
    this.validarCodigos(codigos);
    this.props.mfa = { segredo, confirmadoEm: agora, ultimoPasso: passo };
    this.props.codigosDeRecuperacao = this.fabricarCodigos(codigos, agora);
    this.registrar(new MfaConfigurado(this.props.id, agora));
  }

  segredoMfaConfirmado(): SegredoTotpCifrado {
    if (this.exigeConfigurarMfa() || this.props.mfa === null) throw new MfaObrigatorio();
    return this.props.mfa.segredo;
  }

  ultimoPassoTotp(): number | null {
    return this.props.mfa?.ultimoPasso ?? null;
  }

  aceitarPassoTotp(passo: number): void {
    const mfa = this.props.mfa;
    if (mfa === null) throw new MfaObrigatorio();
    if (mfa.ultimoPasso !== null && passo <= mfa.ultimoPasso) throw new CodigoMfaInvalido();
    this.props.mfa = { ...mfa, ultimoPasso: passo };
  }

  consumirCodigoDeRecuperacao(hash: string, agora: Date): void {
    const codigo = this.props.codigosDeRecuperacao.find((c) => c.estaDisponivel() && c.hash === hash);
    if (codigo === undefined) throw new CodigoMfaInvalido();
    codigo.usar(agora);
    this.registrar(new CodigoDeRecuperacaoUsado(this.props.id, this.codigosDisponiveis(), agora));
  }

  codigosDisponiveis(): number {
    return this.props.codigosDeRecuperacao.filter((c) => c.estaDisponivel()).length;
  }

  substituirCodigosDeRecuperacao(codigos: readonly NovoCodigo[], agora: Date): void {
    if (this.exigeConfigurarMfa()) throw new MfaObrigatorio();
    this.validarCodigos(codigos);
    this.props.codigosDeRecuperacao = this.fabricarCodigos(codigos, agora);
    this.registrar(new CodigosDeRecuperacaoRegenerados(this.props.id, agora));
  }

  iniciarReconfiguracaoMfa(segredo: SegredoTotpCifrado): void {
    if (this.exigeConfigurarMfa()) throw new MfaObrigatorio();
    this.props.mfaPendente = segredo;
  }

  confirmarReconfiguracaoMfa(passo: number, codigos: readonly NovoCodigo[], agora: Date): void {
    const pendente = this.props.mfaPendente;
    if (pendente === null) throw new MfaObrigatorio();
    this.validarCodigos(codigos);
    this.props.mfa = { segredo: pendente, confirmadoEm: agora, ultimoPasso: passo };
    this.props.mfaPendente = null;
    this.props.codigosDeRecuperacao = this.fabricarCodigos(codigos, agora);
    this.registrar(new MfaConfigurado(this.props.id, agora));
  }

  trocarSenha(novoHash: HashDeSenha, agora: Date): void {
    this.props.hashDeSenha = novoHash;
    this.props.senhaAlteradaEm = agora;
    this.registrar(new SenhaAlterada(this.props.id, agora));
  }

  desativar(agora: Date): void {
    if (this.props.situacao === 'desativado') return;
    this.props.situacao = 'desativado';
    this.registrar(new UsuarioDesativado(this.props.id, agora));
  }

  redefinirAcessoAdministrativamente(novoHash: HashDeSenha, agora: Date): void {
    this.props.hashDeSenha = novoHash;
    this.props.senhaAlteradaEm = agora;
    this.props.mfa = null;
    this.props.mfaPendente = null;
    this.props.codigosDeRecuperacao = [];
    this.props.tentativasFalhas = 0;
    this.props.bloqueadoAte = null;
    this.registrar(new AcessoRedefinidoAdministrativamente(this.props.id, agora));
    this.registrar(new SenhaAlterada(this.props.id, agora));
  }

  ehProprietarioAtivo(): boolean {
    return this.props.situacao === 'ativo' && this.props.papeis.includes('proprietario');
  }

  private mfaNaoConfirmado(): ConfiguracaoMfa {
    const mfa = this.props.mfa;
    if (mfa === null) throw new MfaObrigatorio();
    if (mfa.confirmadoEm !== null) throw new MfaJaConfigurado();
    return mfa;
  }

  private validarCodigos(codigos: readonly NovoCodigo[]): void {
    if (codigos.length !== QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO) throw new DadoInvalido('codigosDeRecuperacao');
  }

  private fabricarCodigos(codigos: readonly NovoCodigo[], agora: Date): CodigoDeRecuperacao[] {
    return codigos.map((c) => CodigoDeRecuperacao.novo(c.id, c.hash, agora));
  }
}
