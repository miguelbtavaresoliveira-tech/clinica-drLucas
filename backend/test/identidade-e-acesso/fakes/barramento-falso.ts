import type { EventoDeDominio } from '../../../src/identidade-e-acesso/domain/index.js';
import type { BarramentoDeEventos } from '../../../src/identidade-e-acesso/application/portas/index.js';

export class BarramentoFalso implements BarramentoDeEventos {
  readonly publicados: EventoDeDominio[] = [];

  publicar(eventos: readonly EventoDeDominio[]): Promise<void> {
    this.publicados.push(...eventos);
    return Promise.resolve();
  }
}
