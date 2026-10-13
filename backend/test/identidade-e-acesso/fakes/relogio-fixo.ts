import type { Relogio } from '../../../src/identidade-e-acesso/application/portas/index.js';

export class RelogioFixo implements Relogio {
  private atual: Date;

  constructor(inicio: Date) {
    this.atual = new Date(inicio.getTime());
  }

  agora(): Date {
    return new Date(this.atual.getTime());
  }

  avancar(ms: number): void {
    this.atual = new Date(this.atual.getTime() + ms);
  }

  definir(d: Date): void {
    this.atual = new Date(d.getTime());
  }
}
