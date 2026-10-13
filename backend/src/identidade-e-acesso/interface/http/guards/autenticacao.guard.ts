import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import {
  ContextoDeAcesso,
  DispositivoId,
  SessaoExpirada,
  UsuarioId,
  papelPorNome,
} from '../../../domain/index.js';
import { EMISSOR_DE_TOKENS, type EmissorDeTokens } from '../../../application/portas/index.js';
import type { RequisicaoAutenticada } from '../requisicao-autenticada.js';

const CABECALHO_BEARER = /^bearer\s+(\S+)$/i;

/** Monta o ContextoDeAcesso a partir do access token. Qualquer falha vira `SessaoExpirada` (401 genérico). */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(@Inject(EMISSOR_DE_TOKENS) private readonly emissor: EmissorDeTokens) {}

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const cabecalho = req.headers['authorization'];
    const token = typeof cabecalho === 'string' ? CABECALHO_BEARER.exec(cabecalho)?.[1] : undefined;
    if (token === undefined) throw new SessaoExpirada();

    const dados = this.emissor.verificarAccess(token);
    try {
      req.contextoDeAcesso = new ContextoDeAcesso(
        UsuarioId.de(dados.usuarioId),
        DispositivoId.de(dados.dispositivoId),
        dados.papeis.map(papelPorNome),
      );
    } catch {
      throw new SessaoExpirada();
    }
    return true;
  }
}
