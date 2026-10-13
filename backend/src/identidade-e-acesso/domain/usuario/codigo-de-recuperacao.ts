import { REGEX_UUID } from '../comum/identificador-uuid.js';
import { CodigoMfaInvalido, DadoInvalido } from '../erros.js';

const REGEX_HASH = /^[0-9a-f]{64}$/;

export class CodigoDeRecuperacao {
  private constructor(
    readonly id: string,
    readonly hash: string,
    private _usadoEm: Date | null,
    readonly criadoEm: Date,
  ) {}

  static novo(id: string, hash: string, agora: Date): CodigoDeRecuperacao {
    return CodigoDeRecuperacao.validar(id, hash, null, agora);
  }

  static reconstituir(p: { id: string; hash: string; usadoEm: Date | null; criadoEm: Date }): CodigoDeRecuperacao {
    return CodigoDeRecuperacao.validar(p.id, p.hash, p.usadoEm, p.criadoEm);
  }

  private static validar(id: string, hash: string, usadoEm: Date | null, criadoEm: Date): CodigoDeRecuperacao {
    if (!REGEX_UUID.test(id)) throw new DadoInvalido('id');
    if (!REGEX_HASH.test(hash)) throw new DadoInvalido('hash');
    return new CodigoDeRecuperacao(id, hash, usadoEm, criadoEm);
  }

  get usadoEm(): Date | null {
    return this._usadoEm;
  }

  estaDisponivel(): boolean {
    return this._usadoEm === null;
  }

  usar(agora: Date): void {
    if (this._usadoEm !== null) throw new CodigoMfaInvalido();
    this._usadoEm = agora;
  }
}
