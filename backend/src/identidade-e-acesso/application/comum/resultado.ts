import type { EventoDeDominio } from '../../domain/index.js';

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T; readonly eventos: readonly EventoDeDominio[] }
  | { readonly ok: false; readonly erro: Error; readonly eventos: readonly EventoDeDominio[] };

export function sucesso<T>(valor: T, eventos: readonly EventoDeDominio[] = []): Resultado<T> {
  return { ok: true, valor, eventos };
}

export function falha<T>(erro: Error, eventos: readonly EventoDeDominio[] = []): Resultado<T> {
  return { ok: false, erro, eventos };
}

export function desembrulhar<T>(r: Resultado<T>): T {
  if (r.ok) return r.valor;
  throw r.erro;
}
