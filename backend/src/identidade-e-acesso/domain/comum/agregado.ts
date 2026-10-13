import type { EventoDeDominio } from './evento-de-dominio.js';

export abstract class Agregado {
  #eventos: EventoDeDominio[] = [];

  protected registrar(evento: EventoDeDominio): void {
    this.#eventos.push(evento);
  }

  puxarEventos(): readonly EventoDeDominio[] {
    const eventos = [...this.#eventos];
    this.#eventos = [];
    return eventos;
  }
}
