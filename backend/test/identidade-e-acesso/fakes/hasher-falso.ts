import { HashDeSenha } from '../../../src/identidade-e-acesso/domain/index.js';
import type { HasherDeSenha } from '../../../src/identidade-e-acesso/application/portas/index.js';
import { sha256Hex } from './cripto-de-teste.js';

export class HasherFalso implements HasherDeSenha {
  chamadasFicticias = 0;

  gerar(senha: string): Promise<HashDeSenha> {
    return Promise.resolve(HashDeSenha.de(`$argon2id$falso$${sha256Hex(senha)}`));
  }

  conferir(senha: string, hash: HashDeSenha): Promise<boolean> {
    return Promise.resolve(hash.valor === `$argon2id$falso$${sha256Hex(senha)}`);
  }

  conferirFicticio(_senha: string): Promise<void> {
    this.chamadasFicticias += 1;
    return Promise.resolve();
  }
}
