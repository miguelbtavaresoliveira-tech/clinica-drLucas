import type { DetalheDeAuditoria } from './registro-de-auditoria.js';

export interface DadosCanonicos {
  id: string;
  ocorridoEm: Date;
  tipo: string;
  usuarioId: string | null;
  dispositivoId: string | null;
  detalhe: DetalheDeAuditoria;
  hashAnterior: string | null;
}

const MAX_CHAVES = 20;
const MAX_TEXTO = 200;
const REGEX_CHAVE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
// eslint-disable-next-line no-control-regex
const REGEX_CONTROLE = /[\u0000-\u001f]/;

export function serializarCanonico(d: DadosCanonicos): string {
  const chaves = Object.keys(d.detalhe).sort();
  const detalhe = `{${chaves.map((k) => `${JSON.stringify(k)}:${JSON.stringify(d.detalhe[k])}`).join(',')}}`;
  return [
    'v1',
    d.id,
    d.ocorridoEm.toISOString(),
    d.tipo,
    d.usuarioId ?? '',
    d.dispositivoId ?? '',
    detalhe,
    d.hashAnterior ?? '',
  ].join('|');
}

export function ehDetalheValido(valor: unknown): valor is DetalheDeAuditoria {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const proto: unknown = Object.getPrototypeOf(valor);
  if (proto !== Object.prototype && proto !== null) return false;
  const entradas = Object.entries(valor);
  if (entradas.length > MAX_CHAVES) return false;
  return entradas.every(([chave, v]) => REGEX_CHAVE.test(chave) && valorValido(v));
}

function valorValido(v: unknown): boolean {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isSafeInteger(v);
  if (typeof v === 'string') return v.length <= MAX_TEXTO && !REGEX_CONTROLE.test(v);
  return false;
}
