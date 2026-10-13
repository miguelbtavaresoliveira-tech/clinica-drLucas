import { Logger } from '@nestjs/common';
import type { EventoDeDominio } from '../../domain/index.js';
import type { BarramentoDeEventos } from '../../application/portas/index.js';

export type AssinanteDeEvento = (evento: EventoDeDominio) => Promise<void>;

export class BarramentoEmProcesso implements BarramentoDeEventos {
  private readonly logger = new Logger(BarramentoEmProcesso.name);
  private readonly assinantes = new Map<string, AssinanteDeEvento[]>();

  assinar(tipo: string, assinante: AssinanteDeEvento): void {
    this.assinantes.set(tipo, [...(this.assinantes.get(tipo) ?? []), assinante]);
  }

  /** Um assinante que falha é registrado (sem payload) e não interrompe os demais. */
  async publicar(eventos: readonly EventoDeDominio[]): Promise<void> {
    for (const evento of eventos) {
      for (const assinante of this.assinantes.get(evento.tipo) ?? []) {
        try {
          await assinante(evento);
        } catch {
          this.logger.error(`Falha em assinante de ${evento.tipo}`);
        }
      }
    }
  }
}
