import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { SessaoExpirada, type ContextoDeAcesso } from '../../../domain/index.js';
import type { RequisicaoAutenticada } from '../requisicao-autenticada.js';

export const ContextoAtual = createParamDecorator((_dado: unknown, contexto: ExecutionContext): ContextoDeAcesso => {
  const ctx = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().contextoDeAcesso;
  if (ctx === undefined) throw new SessaoExpirada();
  return ctx;
});
