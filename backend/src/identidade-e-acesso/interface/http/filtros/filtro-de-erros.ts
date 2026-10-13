import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { traduzirErro } from './tabela-de-erros.js';

@Catch()
export class FiltroDeErros implements ExceptionFilter {
  private readonly logger = new Logger(FiltroDeErros.name);

  catch(erro: unknown, host: ArgumentsHost): void {
    const { status, corpo } = traduzirErro(erro);
    if (status === 500) {
      const nome = erro instanceof Error ? erro.constructor.name : typeof erro;
      this.logger.error(`Erro não tratado: ${nome}`, erro instanceof Error ? erro.stack : undefined);
    }
    host.switchToHttp().getResponse<Response>().status(status).json(corpo);
  }
}
