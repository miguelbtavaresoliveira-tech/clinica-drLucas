import type { OnApplicationShutdown } from '@nestjs/common';
import type { ConexaoDoBanco } from './conexao.js';

/** Fecha o pool de conexões quando a aplicação encerra (SIGTERM com shutdown hooks, ou `app.close()`). */
export class CicloDeVidaDoBanco implements OnApplicationShutdown {
  constructor(private readonly conexao: ConexaoDoBanco) {}

  async onApplicationShutdown(): Promise<void> {
    await this.conexao.encerrar();
  }
}
