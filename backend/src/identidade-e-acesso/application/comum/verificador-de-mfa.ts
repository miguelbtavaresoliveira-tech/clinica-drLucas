import { CodigoMfaInvalido, SegredoTotpCifrado, type Usuario } from '../../domain/index.js';
import type { CofreDeSegredos, GeradorDeCodigosDeRecuperacao, ServicoTotp } from '../portas/servicos.js';

export type CodigoInformado =
  | { readonly tipo: 'totp'; readonly valor: string }
  | { readonly tipo: 'recuperacao'; readonly valor: string };

export type ResultadoDeMfa = { readonly ok: true; readonly usouRecuperacao: boolean } | { readonly ok: false };

const REGEX_TOTP = /^\d{6}$/;
const RECUPERACAO_MIN = 16;
const RECUPERACAO_MAX = 19;

export class VerificadorDeMfa {
  constructor(
    private readonly totp: ServicoTotp,
    private readonly cofre: CofreDeSegredos,
    private readonly codigos: GeradorDeCodigosDeRecuperacao,
  ) {}

  /** Nunca lança por código errado: devolve `{ ok: false }` sem revelar a etapa que falhou. */
  async verificar(usuario: Usuario, codigo: CodigoInformado, agora: Date): Promise<ResultadoDeMfa> {
    if (codigo.tipo === 'totp') {
      if (!REGEX_TOTP.test(codigo.valor)) return { ok: false };
      const verificado = await this.verificarSegredo(
        usuario.segredoMfaConfirmado(),
        codigo.valor,
        usuario.ultimoPassoTotp(),
      );
      if (!verificado.ok) return { ok: false };
      try {
        usuario.aceitarPassoTotp(verificado.passo);
      } catch (e) {
        if (e instanceof CodigoMfaInvalido) return { ok: false };
        throw e;
      }
      return { ok: true, usouRecuperacao: false };
    }
    if (codigo.valor.length < RECUPERACAO_MIN || codigo.valor.length > RECUPERACAO_MAX) return { ok: false };
    try {
      usuario.consumirCodigoDeRecuperacao(this.codigos.hashDe(codigo.valor), agora);
    } catch (e) {
      if (e instanceof CodigoMfaInvalido) return { ok: false };
      throw e;
    }
    return { ok: true, usouRecuperacao: true };
  }

  async verificarSegredo(
    segredo: SegredoTotpCifrado,
    codigo: string,
    ultimoPasso: number | null,
  ): Promise<{ ok: true; passo: number } | { ok: false }> {
    if (!REGEX_TOTP.test(codigo)) return { ok: false };
    const texto = await this.cofre.decifrar(segredo.bytes());
    const resultado = this.totp.verificar(texto, codigo, ultimoPasso);
    return resultado.valido ? { ok: true, passo: resultado.passo } : { ok: false };
  }
}
