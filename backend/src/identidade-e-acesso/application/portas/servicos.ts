import type { Email, EventoDeDominio, HashDeSenha, NomeDePapel, UsuarioId } from '../../domain/index.js';

export interface HasherDeSenha {
  gerar(senha: string): Promise<HashDeSenha>;
  conferir(senha: string, hash: HashDeSenha): Promise<boolean>;
  /** gasta o mesmo tempo de um conferir real (RN-12) */
  conferirFicticio(senha: string): Promise<void>;
}

export interface ResultadoTotp {
  readonly valido: boolean;
  readonly passo: number;
}

export interface ServicoTotp {
  /** base32 */
  novoSegredo(): string;
  /** otpauth://totp/... */
  urlDoAutenticador(segredo: string, email: string): string;
  /** janela ±1; passo <= ultimoPasso → valido=false */
  verificar(segredo: string, codigo: string, ultimoPasso: number | null): ResultadoTotp;
}

export interface CofreDeSegredos {
  cifrar(texto: string): Promise<Uint8Array>;
  decifrar(dados: Uint8Array): Promise<string>;
}

export interface DadosDoAccess {
  readonly usuarioId: string;
  readonly dispositivoId: string;
  readonly sessaoId: string;
  readonly papeis: readonly NomeDePapel[];
}

export interface EmissorDeTokens {
  emitirAccess(dados: DadosDoAccess, expiraEm: Date): string;
  /** inválido ou expirado → SessaoExpirada */
  verificarAccess(token: string): DadosDoAccess;
  /** 32 bytes base64url + sha256 hex (D-013) */
  gerarTokenOpaco(): { token: string; hash: string };
  hashDe(token: string): string;
  emitirDesafio(usuarioId: UsuarioId, expiraEm: Date): { id: string; token: string };
  /** inválido → DesafioInvalido */
  verificarDesafio(token: string): { id: string; usuarioId: UsuarioId };
}

export interface EnviadorDeEmail {
  enviarRedefinicaoDeSenha(para: Email, dados: { link: string; token: string; expiraEm: Date }): Promise<void>;
}

export interface Relogio {
  agora(): Date;
}

export interface BarramentoDeEventos {
  publicar(eventos: readonly EventoDeDominio[]): Promise<void>;
}

export interface GeradorDeCodigosDeRecuperacao {
  gerar(quantidade: number): { codigo: string; hash: string }[];
  hashDe(codigo: string): string;
}

export interface CalculadoraDeHash {
  sha256Hex(texto: string): string;
}

export interface VerificadorDeAssinatura {
  verificarEd25519(mensagem: string, assinaturaB64: string, chavePublicaB64: string): boolean;
}
