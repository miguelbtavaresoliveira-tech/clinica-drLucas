import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { urlDoBancoDeTeste } from './banco-de-teste.js';

describe('conexão com o banco de testes', () => {
  const original = process.env['DATABASE_URL_TESTE'];

  afterEach(() => {
    if (original === undefined) delete process.env['DATABASE_URL_TESTE'];
    else process.env['DATABASE_URL_TESTE'] = original;
  });

  it('executa SELECT 1 pelo Drizzle', async () => {
    const conexao = criarConexao(urlDoBancoDeTeste());
    try {
      const resultado = await conexao.db.execute<{ um: number }>(sql`select 1 as um`);
      expect(resultado.rows[0]?.um).toBe(1);
    } finally {
      await conexao.encerrar();
    }
  });

  it('recusa um banco que não termina com _teste', () => {
    process.env['DATABASE_URL_TESTE'] = 'postgres://clinica:x@127.0.0.1:5432/clinica';
    expect(() => urlDoBancoDeTeste()).toThrow('Banco de teste precisa terminar com _teste');
  });

  it('recusa quando DATABASE_URL_TESTE está ausente ou vazia', () => {
    delete process.env['DATABASE_URL_TESTE'];
    const semArquivoEnv = () => urlDoBancoDeTeste();
    // O .env local pode definir a variável: forçamos vazio depois do carregamento.
    process.env['DATABASE_URL_TESTE'] = '';
    expect(semArquivoEnv).toThrow('DATABASE_URL_TESTE ausente');
  });

  it('encerrar() fecha o pool', async () => {
    const conexao = criarConexao(urlDoBancoDeTeste());
    await conexao.db.execute(sql`select 1`);
    expect(conexao.pool.totalCount).toBeGreaterThan(0);
    await conexao.encerrar();
    expect(conexao.pool.totalCount).toBe(0);
  });
});
