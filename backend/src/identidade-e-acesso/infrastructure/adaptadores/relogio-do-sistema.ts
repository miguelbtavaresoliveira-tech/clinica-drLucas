import type { Relogio } from '../../application/portas/index.js';

/** Único `new Date()` sem argumento permitido no backend. */
export class RelogioDoSistema implements Relogio {
  agora(): Date {
    return new Date();
  }
}
