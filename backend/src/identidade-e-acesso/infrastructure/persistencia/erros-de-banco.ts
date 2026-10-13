function codigoDe(e: unknown): unknown {
  return typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
}

/** `23505` (unique_violation) no erro ou em `cause` (o Drizzle embrulha o erro do driver). */
export function ehViolacaoDeUnicidade(e: unknown): boolean {
  if (codigoDe(e) === '23505') return true;
  const causa = typeof e === 'object' && e !== null && 'cause' in e ? e.cause : undefined;
  return codigoDe(causa) === '23505';
}
