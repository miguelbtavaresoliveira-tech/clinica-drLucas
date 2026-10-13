import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  criarConexao,
  type ConexaoDoBanco,
} from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { limparBanco, urlDoBancoDeTeste } from './banco-de-teste.js';

const conexao: ConexaoDoBanco = criarConexao(urlDoBancoDeTeste());
const { db } = conexao;

const UUID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function inserirUsuario(id: string, email: string, situacao = 'ativo'): Promise<void> {
  await db.execute(sql`
    INSERT INTO identidade.usuarios (id, nome, email, situacao, papeis, hash_de_senha, senha_alterada_em, criado_em)
    VALUES (${id}, 'Teste', ${email}, ${situacao}, ARRAY['proprietario'], '$argon2id$x', now(), now())`);
}

async function inserirDispositivo(id: string, usuarioId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO identidade.dispositivos
      (id, usuario_id, apelido, plataforma, registrado_em, ultimo_checkin, chave_publica_auditoria)
    VALUES (${id}, ${usuarioId}, 'Mac', 'macos', now(), now(), 'chave')`);
}

async function inserirSessao(id: string, usuarioId: string, dispositivoId: string, situacao: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO identidade.sessoes_de_login
      (id, usuario_id, dispositivo_id, refresh_atual_hash, criada_em, expira_em, situacao)
    VALUES (${id}, ${usuarioId}, ${dispositivoId}, 'h', now(), now() + interval '1 day', ${situacao})`);
}

async function inserirAuditoria(idOrigem: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO identidade.auditoria_de_acesso (ocorrido_em, tipo, origem, hash, id_origem)
    VALUES (now(), 'login-ok', 'servidor', 'h', ${idOrigem})`);
}

/** O Drizzle embrulha o erro do driver em `cause`. */
async function codigoDoErro(promessa: Promise<unknown>): Promise<{ codigo: string | undefined; mensagem: string }> {
  try {
    await promessa;
  } catch (e) {
    const causa = (e as { cause?: { code?: string; message?: string } }).cause;
    return {
      codigo: causa?.code ?? (e as { code?: string }).code,
      mensagem: `${(e as Error).message} ${causa?.message ?? ''}`,
    };
  }
  throw new Error('esperava erro do banco');
}

describe('schema identidade', () => {
  beforeEach(async () => {
    await limparBanco(db);
  });

  afterAll(async () => {
    await conexao.encerrar();
  });

  it('cria as 7 tabelas no schema identidade', async () => {
    const r = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'identidade' ORDER BY table_name`,
    );
    expect(r.rows.map((l) => l.table_name)).toEqual([
      'auditoria_de_acesso',
      'codigos_de_recuperacao',
      'desafios_de_login',
      'dispositivos',
      'sessoes_de_login',
      'tokens_de_redefinicao',
      'usuarios',
    ]);
  });

  it('impede duas sessões ativas no mesmo dispositivo, mas permite ativa + revogada', async () => {
    await inserirUsuario(UUID(1), 'a@b.com');
    await inserirDispositivo(UUID(2), UUID(1));
    await inserirSessao(UUID(3), UUID(1), UUID(2), 'ativa');
    const erro = await codigoDoErro(inserirSessao(UUID(4), UUID(1), UUID(2), 'ativa'));
    expect(erro.codigo).toBe('23505');
    await expect(inserirSessao(UUID(5), UUID(1), UUID(2), 'revogada')).resolves.toBeUndefined();
  });

  it('a auditoria é append-only: UPDATE, DELETE e TRUNCATE falham', async () => {
    await inserirAuditoria(UUID(10));
    expect((await codigoDoErro(db.execute(sql`UPDATE identidade.auditoria_de_acesso SET tipo = 'x'`))).mensagem).toContain(
      'append-only',
    );
    expect((await codigoDoErro(db.execute(sql`DELETE FROM identidade.auditoria_de_acesso`))).mensagem).toContain(
      'append-only',
    );
    expect((await codigoDoErro(db.execute(sql`TRUNCATE identidade.auditoria_de_acesso`))).mensagem).toContain(
      'append-only',
    );
    const r = await db.execute<{ total: string }>(sql`SELECT count(*) AS total FROM identidade.auditoria_de_acesso`);
    expect(r.rows[0]?.total).toBe('1');
  });

  it('rejeita valores fora do domínio (check) e e-mail duplicado (unique)', async () => {
    const check = await codigoDoErro(inserirUsuario(UUID(1), 'a@b.com', 'xyz'));
    expect(check.codigo).toBe('23514');
    await inserirUsuario(UUID(1), 'a@b.com');
    expect((await codigoDoErro(inserirUsuario(UUID(2), 'a@b.com'))).codigo).toBe('23505');
    const plataforma = await codigoDoErro(
      db.execute(sql`
        INSERT INTO identidade.dispositivos
          (id, usuario_id, apelido, plataforma, registrado_em, ultimo_checkin, chave_publica_auditoria)
        VALUES (${UUID(3)}, ${UUID(1)}, 'x', 'linux', now(), now(), 'c')`),
    );
    expect(plataforma.codigo).toBe('23514');
  });

  it('exige integridade referencial', async () => {
    expect((await codigoDoErro(inserirDispositivo(UUID(2), UUID(99)))).codigo).toBe('23503');
  });

  it('id_origem é único na auditoria', async () => {
    await inserirAuditoria(UUID(10));
    expect((await codigoDoErro(inserirAuditoria(UUID(10)))).codigo).toBe('23505');
  });

  it('limparBanco esvazia tudo, inclusive a auditoria, e a trava de TRUNCATE volta a valer', async () => {
    await inserirUsuario(UUID(1), 'a@b.com');
    await inserirAuditoria(UUID(10));
    await limparBanco(db);
    const r = await db.execute<{ u: string; a: string }>(sql`
      SELECT (SELECT count(*) FROM identidade.usuarios) AS u,
             (SELECT count(*) FROM identidade.auditoria_de_acesso) AS a`);
    expect(r.rows[0]).toEqual({ u: '0', a: '0' });
    await inserirAuditoria(UUID(11));
    expect((await codigoDoErro(db.execute(sql`TRUNCATE identidade.auditoria_de_acesso`))).mensagem).toContain(
      'append-only',
    );
  });
});
