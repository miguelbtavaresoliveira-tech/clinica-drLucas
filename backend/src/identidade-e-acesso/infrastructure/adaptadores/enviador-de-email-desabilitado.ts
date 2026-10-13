import { Logger } from '@nestjs/common';
import type { EnviadorDeEmail } from '../../application/portas/index.js';

/** Usado quando o SMTP não está configurado (desenvolvimento e testes). Nunca registra destinatário nem token. */
export class EnviadorDeEmailDesabilitado implements EnviadorDeEmail {
  private readonly logger = new Logger(EnviadorDeEmailDesabilitado.name);

  enviarRedefinicaoDeSenha(): Promise<void> {
    this.logger.warn('SMTP não configurado; e-mail de redefinição não enviado.');
    return Promise.resolve();
  }
}
