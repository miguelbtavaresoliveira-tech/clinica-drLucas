import { describe, expect, it } from 'vitest';
import { CredenciaisInvalidas, UsuarioCriado, UsuarioId } from '../../domain/index.js';
import { desembrulhar, falha, sucesso } from './resultado.js';

describe('Resultado', () => {
  it('desembrulhar de sucesso devolve o valor', () => {
    expect(desembrulhar(sucesso(1))).toBe(1);
  });

  it('desembrulhar de falha lança a mesma instância do erro', () => {
    const erro = new CredenciaisInvalidas();
    let capturado: unknown;
    try {
      desembrulhar(falha(erro));
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBe(erro);
  });

  it('eventos padrão são vazios e eventos informados são preservados', () => {
    expect(sucesso(1).eventos).toEqual([]);
    expect(falha(new Error('x')).eventos).toEqual([]);
    const evento = new UsuarioCriado(UsuarioId.novo(), new Date(0));
    expect(sucesso(1, [evento]).eventos).toEqual([evento]);
    expect(falha(new Error('x'), [evento]).eventos).toEqual([evento]);
  });
});
