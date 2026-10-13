import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export interface OpcoesDeEndurecimento {
  producao: boolean;
  confiarNoProxy: boolean;
}

/**
 * Endurecimento do servidor HTTP, usado por `main.ts` e pelos testes E2E.
 * Não habilita CORS de propósito: o app desktop chama a API pelo Rust, sem navegador (D-005).
 * Deve ser chamado antes de `app.init()` / `app.listen()`.
 */
export function endurecerAplicacao(app: NestExpressApplication, opcoes: OpcoesDeEndurecimento): void {
  app.disable('x-powered-by');
  app.set('trust proxy', opcoes.confiarNoProxy ? 1 : false);
  app.useBodyParser('json', { limit: '1mb' });
  app.enableShutdownHooks();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (opcoes.producao) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}
