import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IpDaRequisicao = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): string | null => contexto.switchToHttp().getRequest<Request>().ip ?? null,
);
