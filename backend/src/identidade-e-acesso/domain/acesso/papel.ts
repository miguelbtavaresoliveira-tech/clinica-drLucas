import { DadoInvalido } from '../erros.js';
import type { Permissao } from './permissao.js';

export type NomeDePapel = 'proprietario';

export interface Papel {
  readonly nome: NomeDePapel;
  concede(p: Permissao): boolean;
}

export const PROPRIETARIO: Papel = Object.freeze({ nome: 'proprietario', concede: () => true });

export const PAPEIS: Readonly<Record<NomeDePapel, Papel>> = Object.freeze({ proprietario: PROPRIETARIO });

export function papelPorNome(nome: string): Papel {
  if (!Object.hasOwn(PAPEIS, nome)) throw new DadoInvalido('papel');
  return PAPEIS[nome as NomeDePapel];
}
