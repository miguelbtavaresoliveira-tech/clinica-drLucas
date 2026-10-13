import { DadoInvalido } from '../erros.js';

export class HashDeSenha {
  private constructor(private readonly _valor: string) {}

  static de(valor: string): HashDeSenha {
    if (!valor.startsWith('$argon2id$')) throw new DadoInvalido('hashDeSenha');
    return new HashDeSenha(valor);
  }

  get valor(): string {
    return this._valor;
  }

  toString(): string {
    return '[protegido]';
  }

  toJSON(): string {
    return '[protegido]';
  }
}
