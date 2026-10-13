import { IdentificadorUuid } from '../comum/identificador-uuid.js';

export class SessaoDeLoginId extends IdentificadorUuid {
  private readonly marca = 'SessaoDeLoginId' as const;

  private constructor(valor: string) {
    super(valor);
  }

  static novo(): SessaoDeLoginId {
    return new SessaoDeLoginId(crypto.randomUUID());
  }

  static de(valor: string): SessaoDeLoginId {
    return new SessaoDeLoginId(IdentificadorUuid.normalizar(valor));
  }
}
