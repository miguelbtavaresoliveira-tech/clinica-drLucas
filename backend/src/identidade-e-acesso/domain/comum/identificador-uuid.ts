import { IdentificadorInvalido } from '../erros.js';

export const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export abstract class IdentificadorUuid {
  protected constructor(readonly valor: string) {}

  protected static normalizar(valor: string): string {
    const normalizado = valor.trim().toLowerCase();
    if (!REGEX_UUID.test(normalizado)) throw new IdentificadorInvalido();
    return normalizado;
  }

  igual(outro: IdentificadorUuid): boolean {
    return this.constructor === outro.constructor && this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
