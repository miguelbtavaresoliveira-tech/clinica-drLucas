import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessaoExpirada, type Permissao } from '../../../domain/index.js';
import { CHAVE_PERMISSAO } from '../decorators/requer-permissao.js';
import type { RequisicaoAutenticada } from '../requisicao-autenticada.js';

/** Sem metadado a rota não exige permissão; com metadado, exige contexto autenticado e a permissão. */
@Injectable()
export class PermissaoGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permissao = this.reflector.getAllAndOverride<Permissao | undefined>(CHAVE_PERMISSAO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (permissao === undefined) return true;

    const ctx = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().contextoDeAcesso;
    if (ctx === undefined) throw new SessaoExpirada();
    ctx.exigir(permissao);
    return true;
  }
}
