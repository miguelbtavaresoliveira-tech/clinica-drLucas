import type { Request } from 'express';
import type { ContextoDeAcesso } from '../../domain/index.js';

export interface RequisicaoAutenticada extends Request {
  contextoDeAcesso?: ContextoDeAcesso;
}
