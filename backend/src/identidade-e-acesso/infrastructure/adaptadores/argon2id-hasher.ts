import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { HashDeSenha } from '../../domain/index.js';
import type { HasherDeSenha } from '../../application/portas/index.js';

export interface ParametrosArgon2 {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/** OWASP: 19 MiB, t=2, p=1. */
export const PARAMETROS_ARGON2_PADRAO: ParametrosArgon2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export class Argon2idHasher implements HasherDeSenha {
  private hashFicticio: Promise<string> | null = null;

  constructor(private readonly parametros: ParametrosArgon2 = PARAMETROS_ARGON2_PADRAO) {}

  async gerar(senha: string): Promise<HashDeSenha> {
    const hash = await argon2.hash(senha, { type: argon2.argon2id, ...this.parametros });
    return HashDeSenha.de(hash);
  }

  async conferir(senha: string, hash: HashDeSenha): Promise<boolean> {
    try {
      return await argon2.verify(hash.valor, senha);
    } catch {
      return false;
    }
  }

  /** Gasta o mesmo tempo de uma conferência real, para não revelar se o e-mail existe (RN-12). */
  async conferirFicticio(senha: string): Promise<void> {
    this.hashFicticio ??= argon2.hash(randomBytes(32).toString('base64'), {
      type: argon2.argon2id,
      ...this.parametros,
    });
    try {
      await argon2.verify(await this.hashFicticio, senha);
    } catch {
      // resultado descartado de propósito
    }
  }
}
