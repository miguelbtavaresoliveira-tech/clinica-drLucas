import { HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  AuditoriaInvalida,
  CodigoMfaInvalido,
  ContaBloqueada,
  ContaDesativada,
  CredenciaisInvalidas,
  DadoInvalido,
  DesafioInvalido,
  DispositivoNaoEncontrado,
  DispositivoRevogado,
  EmailInvalido,
  EmailJaCadastrado,
  IdentificadorInvalido,
  LimiteDeDispositivosAtingido,
  MfaJaConfigurado,
  MfaObrigatorio,
  ProprietarioJaExiste,
  ReautenticacaoNecessaria,
  RefreshReutilizado,
  SemPermissao,
  SenhaFraca,
  SessaoExpirada,
  TokenDeRedefinicaoInvalido,
  UltimoProprietario,
  UsuarioNaoEncontrado,
  type ErroDeDominio,
} from '../../../domain/index.js';
import { ConflitoDeConcorrencia } from '../../../application/portas/index.js';

export interface RespostaDeErro {
  status: number;
  codigo: string;
  mensagem: string;
}

type CorpoDeErro = { erro: Record<string, unknown> };

const MENSAGEM_LOGIN = 'E-mail ou senha incorretos.';
const MENSAGEM_SESSAO = 'Sessão expirada. Entre novamente.';

function resposta(status: number, codigo: string, mensagem: string, extras: Record<string, unknown> = {}) {
  return { status, corpo: { erro: { codigo, mensagem, ...extras } } satisfies CorpoDeErro };
}

function doErro(status: number, e: ErroDeDominio) {
  return resposta(status, e.codigo, e.message);
}

function temCorpoDeErro(corpo: unknown): corpo is CorpoDeErro {
  return typeof corpo === 'object' && corpo !== null && 'erro' in corpo && typeof corpo.erro === 'object' && corpo.erro !== null;
}

/** Erros de parsing do Express/body-parser (JSON malformado, corpo grande demais...) trazem `status` 4xx e `type`. */
function statusDeErroDeParsing(erro: unknown): number | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const e = erro as { status?: unknown; type?: unknown };
  return typeof e.status === 'number' && e.status >= 400 && e.status < 500 && typeof e.type === 'string' ? e.status : null;
}

/** Tradução única de erros para HTTP. Nunca devolve mensagem interna, stack nem valor de entrada. */
export function traduzirErro(erro: unknown): { status: number; corpo: CorpoDeErro } {
  // RN-12: conta desativada e credenciais inválidas são indistinguíveis.
  if (erro instanceof CredenciaisInvalidas || erro instanceof ContaDesativada) {
    return resposta(401, 'CREDENCIAIS_INVALIDAS', MENSAGEM_LOGIN);
  }
  if (erro instanceof CodigoMfaInvalido) return resposta(401, 'CODIGO_MFA_INVALIDO', 'Código de verificação inválido.');
  if (erro instanceof SessaoExpirada || erro instanceof RefreshReutilizado) {
    return resposta(401, 'SESSAO_EXPIRADA', MENSAGEM_SESSAO);
  }
  if (erro instanceof DesafioInvalido) return doErro(401, erro);
  if (erro instanceof TokenDeRedefinicaoInvalido) return doErro(401, erro);
  if (erro instanceof ContaBloqueada) {
    return resposta(423, erro.codigo, erro.message, { tentarApos: erro.ate.toISOString() });
  }
  if (erro instanceof DispositivoRevogado || erro instanceof SemPermissao || erro instanceof ReautenticacaoNecessaria) {
    return doErro(403, erro);
  }
  if (
    erro instanceof LimiteDeDispositivosAtingido ||
    erro instanceof EmailJaCadastrado ||
    erro instanceof MfaJaConfigurado ||
    erro instanceof ProprietarioJaExiste ||
    erro instanceof UltimoProprietario
  ) {
    return doErro(409, erro);
  }
  if (erro instanceof ConflitoDeConcorrencia) return resposta(409, erro.codigo, erro.message);
  if (erro instanceof SenhaFraca) return resposta(422, erro.codigo, erro.message, { motivos: erro.motivos });
  if (erro instanceof MfaObrigatorio || erro instanceof EmailInvalido || erro instanceof IdentificadorInvalido) {
    return doErro(422, erro);
  }
  if (erro instanceof DadoInvalido) return resposta(422, erro.codigo, 'Dado inválido.', { campos: [erro.campo] });
  if (erro instanceof AuditoriaInvalida) return resposta(422, erro.codigo, erro.message, { motivos: [erro.motivo] });
  if (erro instanceof UsuarioNaoEncontrado || erro instanceof DispositivoNaoEncontrado) return doErro(404, erro);
  if (erro instanceof ThrottlerException) {
    return resposta(429, 'MUITAS_REQUISICOES', 'Muitas tentativas. Aguarde um minuto.');
  }
  if (erro instanceof HttpException) {
    const corpo = erro.getResponse();
    if (temCorpoDeErro(corpo)) return { status: erro.getStatus(), corpo };
    return resposta(erro.getStatus(), 'ERRO_HTTP', 'Requisição não atendida.');
  }
  const statusDeParsing = statusDeErroDeParsing(erro);
  if (statusDeParsing !== null) return resposta(statusDeParsing, 'ERRO_HTTP', 'Requisição não atendida.');
  return resposta(500, 'ERRO_INTERNO', 'Erro interno.');
}
