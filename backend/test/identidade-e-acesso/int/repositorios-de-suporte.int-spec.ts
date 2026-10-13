import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Auditor } from '../../../src/identidade-e-acesso/application/auditoria/auditor.js';
import type { RegistroDeAuditoriaDoApp } from '../../../src/identidade-e-acesso/application/auditoria/registro-de-auditoria.js';
import { serializarCanonico } from '../../../src/identidade-e-acesso/application/auditoria/serializacao-canonica.js';
import {
  DispositivoId,
  Email,
  HashDeSenha,
  UsuarioId,
  Usuario,
  UsuarioCriado,
} from '../../../src/identidade-e-acesso/domain/index.js';
import { Sha256CalculadoraDeHash } from '../../../src/identidade-e-acesso/infrastructure/adaptadores/sha256-calculadora-de-hash.js';
import { auditoriaDeAcesso } from '../../../src/identidade-e-acesso/infrastructure/persistencia/schema.js';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { DrizzleUnidadeDeTrabalho } from '../../../src/identidade-e-acesso/infrastructure/persistencia/drizzle-unidade-de-trabalho.js';
import { criarRepositorios } from '../../../src/identidade-e-acesso/infrastructure/persistencia/fabrica-de-repositorios.js';
import { limparBanco, urlDoBancoDeTeste } from './banco-de-teste.js';

const conexao = criarConexao(urlDoBancoDeTeste());
const calculadora = new Sha256CalculadoraDeHash();
const uow = new DrizzleUnidadeDeTrabalho(conexao.db, calculadora);
const repos = criarRepositorios(conexao.db, calculadora);
const auditor = new Auditor();

const T0 = new Date('2026-10-13T12:00:00.000Z');
const HASH = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
const USUARIO_R = '11111111-1111-4111-8111-111111111111';
const DISPOSITIVO_R = '22222222-2222-4222-8222-222222222222';

const mais = (ms: number): Date => new Date(T0.getTime() + ms);

async function semearUsuario(email = 'lucas@clinica.com'): Promise<Usuario> {
  const u = Usuario.criar({ nome: 'Lucas', email: Email.criar(email), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });
  await repos.usuarios.salvar(u);
  return u;
}

const registroServidor = (n: number) =>
  auditor.avulso('login-ok', {
    ocorridoEm: mais(n * 1000),
    usuarioId: UsuarioId.de(USUARIO_R),
    dispositivoId: DispositivoId.de(DISPOSITIVO_R),
    ip: '127.0.0.1',
    detalhe: { sequencia: n, metodo: 'senha' },
  });

const R1: RegistroDeAuditoriaDoApp = {
  origem: 'app',
  id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01',
  tipo: 'desbloqueio-local-ok',
  ocorridoEm: new Date('2026-10-13T12:00:00.000Z'),
  usuarioId: USUARIO_R,
  dispositivoId: DISPOSITIVO_R,
  ip: null,
  detalhe: { metodo: 'senha' },
  hashAnterior: null,
  hash: 'b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a',
  assinatura: 'GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==',
};
const R2: RegistroDeAuditoriaDoApp = {
  ...R1,
  id: '7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02',
  tipo: 'desbloqueio-local-falhou',
  ocorridoEm: new Date('2026-10-13T12:05:30.250Z'),
  detalhe: { tentativa: 3, metodo: 'senha' },
  hashAnterior: R1.hash,
  hash: 'c7edbcc06f8a1c8cc116d7c219e116416d096d1f2b7c5f6a4d1fdb93a415c215',
  assinatura: '5fKIHaVqujfDRkxeXhrycN9Uq2Rt4PfWIRmFEoyVAz2gaaV6cUhdlp6PpIOUNwwEZfXyMz67mfVfe54Lr6yqCQ==',
};

async function lerAuditoria(origem: 'servidor' | 'app') {
  return conexao.db
    .select()
    .from(auditoriaDeAcesso)
    .where(eq(auditoriaDeAcesso.origem, origem))
    .orderBy(asc(auditoriaDeAcesso.id));
}

describe('repositórios de suporte e unidade de trabalho (PostgreSQL real)', () => {
  beforeEach(async () => {
    await limparBanco(conexao.db);
  });

  afterAll(async () => {
    await conexao.encerrar();
  });

  describe('desafio de login', () => {
    it('é de uso único sob concorrência: de duas transações, só uma recebe true', async () => {
      const u = await semearUsuario();
      const id = crypto.randomUUID();
      await repos.desafios.criar({ id, usuarioId: u.id, expiraEm: mais(60_000) });
      const resultados = await Promise.all([
        uow.executar((r) => r.desafios.marcarUsado(id, T0)),
        uow.executar((r) => r.desafios.marcarUsado(id, T0)),
      ]);
      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect((await repos.desafios.porId(id))?.usadoEm).toEqual(T0);
    });

    it('expirado (agora === expiraEm) e inexistente devolvem false; id mal formado não derruba a consulta', async () => {
      const u = await semearUsuario();
      const id = crypto.randomUUID();
      await repos.desafios.criar({ id, usuarioId: u.id, expiraEm: T0 });
      expect(await repos.desafios.marcarUsado(id, T0)).toBe(false);
      expect(await repos.desafios.marcarUsado(crypto.randomUUID(), T0)).toBe(false);
      expect(await repos.desafios.marcarUsado('nao-e-uuid', T0)).toBe(false);
      expect(await repos.desafios.porId('nao-e-uuid')).toBeNull();
      expect((await repos.desafios.porId(id))?.usuarioId.valor).toBe(u.id.valor);
    });
  });

  describe('token de redefinição', () => {
    it('válido devolve o usuário; consumir funciona uma vez; expirado não vale', async () => {
      const u = await semearUsuario();
      await repos.tokensDeRedefinicao.criar({ hash: 'h1', usuarioId: u.id, expiraEm: mais(60_000) });
      expect((await repos.tokensDeRedefinicao.usuarioDoTokenValido('h1', T0))?.valor).toBe(u.id.valor);
      expect(await repos.tokensDeRedefinicao.consumir('h1', T0)).toBe(true);
      expect(await repos.tokensDeRedefinicao.consumir('h1', T0)).toBe(false);
      expect(await repos.tokensDeRedefinicao.usuarioDoTokenValido('h1', T0)).toBeNull();
      await repos.tokensDeRedefinicao.criar({ hash: 'h2', usuarioId: u.id, expiraEm: mais(60_000) });
      expect(await repos.tokensDeRedefinicao.usuarioDoTokenValido('h2', mais(60_000))).toBeNull();
      expect(await repos.tokensDeRedefinicao.consumir('h2', mais(60_000))).toBe(false);
    });

    it('invalidarDoUsuario impede o consumo', async () => {
      const u = await semearUsuario();
      await repos.tokensDeRedefinicao.criar({ hash: 'h1', usuarioId: u.id, expiraEm: mais(60_000) });
      await repos.tokensDeRedefinicao.invalidarDoUsuario(u.id, T0);
      expect(await repos.tokensDeRedefinicao.consumir('h1', T0)).toBe(false);
    });

    it('o consumo concorrente do mesmo token tem um único vencedor', async () => {
      const u = await semearUsuario();
      await repos.tokensDeRedefinicao.criar({ hash: 'h1', usuarioId: u.id, expiraEm: mais(60_000) });
      const resultados = await Promise.all([
        uow.executar((r) => r.tokensDeRedefinicao.consumir('h1', T0)),
        uow.executar((r) => r.tokensDeRedefinicao.consumir('h1', T0)),
      ]);
      expect(resultados.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('auditoria', () => {
    it('encadeia o hash dos registros do servidor e o formato canônico regrava o mesmo hash', async () => {
      await uow.executar(async (r) => {
        await r.auditoria.registrar(registroServidor(1));
        await r.auditoria.registrar(registroServidor(2));
        await r.auditoria.registrar(registroServidor(3));
      });
      const linhas = await lerAuditoria('servidor');
      expect(linhas).toHaveLength(3);
      expect(linhas[0]?.hashAnterior).toBeNull();
      expect(linhas[1]?.hashAnterior).toBe(linhas[0]?.hash);
      expect(linhas[2]?.hashAnterior).toBe(linhas[1]?.hash);
      for (const l of linhas) {
        const recalculado = calculadora.sha256Hex(
          serializarCanonico({
            id: l.idOrigem,
            ocorridoEm: l.ocorridoEm,
            tipo: l.tipo,
            usuarioId: l.usuarioId,
            dispositivoId: l.dispositivoId,
            detalhe: l.detalhe,
            hashAnterior: l.hashAnterior,
          }),
        );
        expect(l.hash).toBe(recalculado);
        expect(l.assinatura).toBeNull();
      }
    });

    it('a cadeia continua linear com transações concorrentes', async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          uow.executar(async (r) => {
            await r.auditoria.registrar(registroServidor(i * 10 + 1));
            await r.auditoria.registrar(registroServidor(i * 10 + 2));
          }),
        ),
      );
      const linhas = await lerAuditoria('servidor');
      expect(linhas).toHaveLength(10);
      expect(linhas.filter((l) => l.hashAnterior === null)).toHaveLength(1);
      expect(new Set(linhas.map((l) => l.hashAnterior)).size).toBe(10);
      linhas.slice(1).forEach((l, i) => expect(l.hashAnterior).toBe(linhas[i]?.hash));
    });

    it('registros do app guardam os campos recebidos; ultimoHashDoApp e idsExistentes funcionam', async () => {
      await repos.auditoria.registrar(R1);
      await repos.auditoria.registrar(R2);
      expect(await repos.auditoria.ultimoHashDoApp(DispositivoId.de(DISPOSITIVO_R))).toBe(R2.hash);
      expect(await repos.auditoria.ultimoHashDoApp(DispositivoId.novo())).toBeNull();
      const novo = crypto.randomUUID();
      expect(await repos.auditoria.idsExistentes([R1.id, novo])).toEqual(new Set([R1.id]));
      expect(await repos.auditoria.idsExistentes([])).toEqual(new Set());
      const [l1, l2] = await lerAuditoria('app');
      expect(l1?.assinatura).toBe(R1.assinatura);
      expect(l2?.hashAnterior).toBe(R1.hash);
      expect(l2?.detalhe).toEqual({ tentativa: 3, metodo: 'senha' });
      expect(l2?.ocorridoEm).toEqual(R2.ocorridoEm);
    });

    it('idsExistentes ignora ids que não são UUID sem erro de cast', async () => {
      await repos.auditoria.registrar(R1);
      expect(await repos.auditoria.idsExistentes(['lixo', R1.id, "'; drop table x; --"])).toEqual(new Set([R1.id]));
    });

    it('o registro do servidor grava o detalhe como jsonb e o ip', async () => {
      await uow.executar((r) => r.auditoria.registrar(registroServidor(7)));
      const [linha] = await lerAuditoria('servidor');
      expect(linha?.detalhe).toEqual({ sequencia: 7, metodo: 'senha' });
      expect(linha?.ip).toBe('127.0.0.1');
      expect(linha?.usuarioId).toBe(USUARIO_R);
    });

    it('a auditoria gravada é imutável (trigger append-only)', async () => {
      await uow.executar((r) => r.auditoria.registrar(registroServidor(1)));
      await expect(conexao.db.execute(sql`UPDATE identidade.auditoria_de_acesso SET tipo = 'x'`)).rejects.toThrow();
    });
  });

  describe('DrizzleUnidadeDeTrabalho', () => {
    it('faz rollback quando o trabalho salva e depois lança', async () => {
      const u = Usuario.criar({ nome: 'Lucas', email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });
      await expect(
        uow.executar(async (r) => {
          await r.usuarios.salvar(u);
          await r.auditoria.registrar(registroServidor(1));
          throw new Error('falha de propósito');
        }),
      ).rejects.toThrow('falha de propósito');
      expect(await repos.usuarios.porEmail(u.email)).toBeNull();
      expect(await lerAuditoria('servidor')).toHaveLength(0);
    });

    it('confirma quando o trabalho termina sem erro, inclusive ao devolver uma falha como valor', async () => {
      const u = Usuario.criar({ nome: 'Lucas', email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });
      const resultado = await uow.executar(async (r) => {
        await r.usuarios.salvar(u);
        return { ok: false as const };
      });
      expect(resultado.ok).toBe(false);
      expect(await repos.usuarios.porEmail(u.email)).not.toBeNull();
    });

    it('os eventos de domínio podem ser auditados na mesma transação', async () => {
      const u = Usuario.criar({ nome: 'Lucas', email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });
      await uow.executar(async (r) => {
        await r.usuarios.salvar(u);
        await auditor.registrar(r.auditoria, u.puxarEventos(), { ip: null, dispositivoId: null });
      });
      expect((await lerAuditoria('servidor')).map((l) => l.tipo)).toEqual(['usuario-criado']);
      expect(new UsuarioCriado(u.id, T0).tipo).toBe('UsuarioCriado');
    });
  });
});
