export const CONTEXTOS = [
  'pacientes',
  'clinico',
  'agenda',
  'cobranca',
  'financeiro',
  'recibos',
  'contratos',
  'equipamentos',
  'comunicacao',
  'identidade',
] as const;
export const ACOES = ['ler', 'escrever', 'administrar'] as const;

export type Contexto = (typeof CONTEXTOS)[number];
export type Acao = (typeof ACOES)[number];
export type Permissao = `${Contexto}:${Acao}`;

export function ehPermissao(valor: string): valor is Permissao {
  const [contexto, acao, resto] = valor.split(':');
  if (resto !== undefined || contexto === undefined || acao === undefined) return false;
  return (CONTEXTOS as readonly string[]).includes(contexto) && (ACOES as readonly string[]).includes(acao);
}
