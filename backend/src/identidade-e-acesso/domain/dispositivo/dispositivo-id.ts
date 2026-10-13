import { IdentificadorUuid } from '../comum/identificador-uuid.js';

export class DispositivoId extends IdentificadorUuid {
  private readonly marca = 'DispositivoId' as const;

  private constructor(valor: string) {
    super(valor);
  }

  static novo(): DispositivoId {
    return new DispositivoId(crypto.randomUUID());
  }

  static de(valor: string): DispositivoId {
    return new DispositivoId(IdentificadorUuid.normalizar(valor));
  }
}
