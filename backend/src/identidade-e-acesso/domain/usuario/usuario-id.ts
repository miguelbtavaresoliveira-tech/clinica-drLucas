import { IdentificadorUuid } from '../comum/identificador-uuid.js';

export class UsuarioId extends IdentificadorUuid {
  private readonly marca = 'UsuarioId' as const;

  private constructor(valor: string) {
    super(valor);
  }

  static novo(): UsuarioId {
    return new UsuarioId(crypto.randomUUID());
  }

  static de(valor: string): UsuarioId {
    return new UsuarioId(IdentificadorUuid.normalizar(valor));
  }
}
