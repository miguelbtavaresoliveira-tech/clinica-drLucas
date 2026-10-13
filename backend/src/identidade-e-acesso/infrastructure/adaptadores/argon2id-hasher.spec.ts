import { describe, expect, it, vi } from 'vitest';
import { HashDeSenha } from '../../domain/index.js';
import { Argon2idHasher } from './argon2id-hasher.js';

const espiaoDeHash = vi.hoisted(() => vi.fn());

vi.mock('argon2', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('argon2')>();
  return {
    ...original,
    hash: (...args: Parameters<typeof original.hash>) => {
      espiaoDeHash(...args);
      return original.hash(...args);
    },
  };
});

describe('Argon2idHasher', () => {
  it('gera hash argon2id com os parâmetros OWASP (19 MiB, t=2, p=1)', async () => {
    const hash = await new Argon2idHasher().gerar('senha-forte-123');
    expect(hash.valor.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hash.valor).toMatch(/\$m=19456,/);
    expect(hash.valor).toMatch(/[,$]t=2[,$]/);
    expect(hash.valor).toMatch(/[,$]p=1[,$]/);
    expect(hash.valor).not.toContain('senha-forte-123');
  });

  it('confere a senha certa e rejeita a errada', async () => {
    const hasher = new Argon2idHasher();
    const hash = await hasher.gerar('senha-forte-123');
    expect(await hasher.conferir('senha-forte-123', hash)).toBe(true);
    expect(await hasher.conferir('outra', hash)).toBe(false);
  });

  it('hash corrompido devolve false sem lançar', async () => {
    const corrompido = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$lixo$lixo');
    expect(await new Argon2idHasher().conferir('qualquer', corrompido)).toBe(false);
  });

  it('o mesmo texto gera hashes diferentes (salt)', async () => {
    const hasher = new Argon2idHasher();
    expect((await hasher.gerar('abc-def-ghi-123')).valor).not.toBe((await hasher.gerar('abc-def-ghi-123')).valor);
  });

  it('conferirFicticio não lança e reutiliza o mesmo hash fictício', async () => {
    espiaoDeHash.mockClear();
    const hasher = new Argon2idHasher();
    await expect(hasher.conferirFicticio('x')).resolves.toBeUndefined();
    await hasher.conferirFicticio('y');
    expect(espiaoDeHash).toHaveBeenCalledTimes(1);
  });

  it('aceita parâmetros customizados', async () => {
    const hasher = new Argon2idHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
    expect((await hasher.gerar('senha-forte-123')).valor).toMatch(/\$m=8,/);
  });
});
