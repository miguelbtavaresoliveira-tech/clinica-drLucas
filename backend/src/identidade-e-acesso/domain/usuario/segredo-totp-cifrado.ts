import { DadoInvalido } from '../erros.js';

const TAMANHO_MINIMO = 30;

export class SegredoTotpCifrado {
  private constructor(private readonly _bytes: Uint8Array) {}

  static de(bytes: Uint8Array): SegredoTotpCifrado {
    if (bytes.length < TAMANHO_MINIMO) throw new DadoInvalido('segredoTotp');
    return new SegredoTotpCifrado(Uint8Array.from(bytes));
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this._bytes);
  }

  toString(): string {
    return '[protegido]';
  }

  toJSON(): string {
    return '[protegido]';
  }
}
