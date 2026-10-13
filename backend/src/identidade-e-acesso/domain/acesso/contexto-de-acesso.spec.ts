import { describe, expect, it } from 'vitest';
import { DispositivoId } from '../dispositivo/dispositivo-id.js';
import { SemPermissao } from '../erros.js';
import { UsuarioId } from '../usuario/usuario-id.js';
import { ContextoDeAcesso } from './contexto-de-acesso.js';
import { PROPRIETARIO, type Papel } from './papel.js';

const criar = (papeis: readonly Papel[]): ContextoDeAcesso =>
  new ContextoDeAcesso(UsuarioId.novo(), DispositivoId.novo(), papeis);

describe('ContextoDeAcesso', () => {
  it('proprietário tem permissão', () => {
    const c = criar([PROPRIETARIO]);
    expect(c.temPermissao('financeiro:administrar')).toBe(true);
    expect(c.nomesDosPapeis()).toEqual(['proprietario']);
    expect(() => c.exigir('clinico:escrever')).not.toThrow();
  });

  it('sem papéis, exigir lança SemPermissao com a permissão negada', () => {
    const c = criar([]);
    expect(c.temPermissao('clinico:escrever')).toBe(false);
    let erro: unknown;
    try {
      c.exigir('clinico:escrever');
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(SemPermissao);
    expect((erro as SemPermissao).permissao).toBe('clinico:escrever');
  });
});
