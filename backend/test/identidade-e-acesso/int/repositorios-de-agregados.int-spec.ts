import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ConflitoDeConcorrencia,
} from '../../../src/identidade-e-acesso/application/portas/index.js';
import {
  Dispositivo,
  DispositivoId,
  Email,
  HashDeSenha,
  POLITICA_PADRAO,
  SegredoTotpCifrado,
  SessaoDeLogin,
  Usuario,
  UsuarioId,
} from '../../../src/identidade-e-acesso/domain/index.js';
import { criarConexao } from '../../../src/identidade-e-acesso/infrastructure/persistencia/conexao.js';
import { DispositivoRepositorioDrizzle } from '../../../src/identidade-e-acesso/infrastructure/persistencia/repositorios/dispositivo-repositorio-drizzle.js';
import { SessaoDeLoginRepositorioDrizzle } from '../../../src/identidade-e-acesso/infrastructure/persistencia/repositorios/sessao-de-login-repositorio-drizzle.js';
import { UsuarioRepositorioDrizzle } from '../../../src/identidade-e-acesso/infrastructure/persistencia/repositorios/usuario-repositorio-drizzle.js';
import { limparBanco, urlDoBancoDeTeste } from './banco-de-teste.js';

const conexao = criarConexao(urlDoBancoDeTeste());
const usuarios = new UsuarioRepositorioDrizzle(conexao.db);
const dispositivos = new DispositivoRepositorioDrizzle(conexao.db);
const sessoes = new SessaoDeLoginRepositorioDrizzle(conexao.db);

const T0 = new Date('2026-10-13T12:00:00.000Z');
const HASH = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
const CHAVE = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
const hexa = (n: number): string => n.toString(16).padStart(64, '0');
const segredo = (n: number): SegredoTotpCifrado => SegredoTotpCifrado.de(new Uint8Array(61).fill(n));

const novoUsuario = (email = 'lucas@clinica.com'): Usuario =>
  Usuario.criar({ nome: 'Lucas', email: Email.criar(email), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });

const dezCodigos = (prefixo: number) =>
  Array.from({ length: 10 }, (_, i) => ({ id: crypto.randomUUID(), hash: hexa(prefixo * 100 + i) }));

function novoDispositivo(usuarioId: UsuarioId, minutos = 0): Dispositivo {
  return Dispositivo.registrar({
    usuarioId,
    apelido: `Mac ${String(minutos)}`,
    plataforma: 'macos',
    chavePublicaAuditoria: CHAVE,
    agora: new Date(T0.getTime() + minutos * 60_000),
  });
}

const novaSessao = (u: UsuarioId, d: DispositivoId, hash: string): SessaoDeLogin =>
  SessaoDeLogin.iniciar({ usuarioId: u, dispositivoId: d, refreshHash: hash, agora: T0, politica: POLITICA_PADRAO });

describe('repositórios de agregados (PostgreSQL real)', () => {
  beforeEach(async () => {
    await limparBanco(conexao.db);
  });

  afterAll(async () => {
    await conexao.encerrar();
  });

  describe('UsuarioRepositorioDrizzle', () => {
    it('reconstitui todos os campos de um usuário com MFA, segredo pendente e 10 códigos (1 usado)', async () => {
      const u = novoUsuario();
      u.prepararMfa(segredo(1));
      const codigos = dezCodigos(1);
      u.confirmarMfa(1000, codigos, T0);
      u.consumirCodigoDeRecuperacao(codigos[0]!.hash, new Date(T0.getTime() + 1000));
      u.iniciarReconfiguracaoMfa(segredo(2));
      u.registrarFalhaDeLogin(T0, POLITICA_PADRAO, 'senha');
      await usuarios.salvar(u);
      expect(u.versao).toBe(1);

      for (const lido of [await usuarios.porId(u.id), await usuarios.porEmail(u.email)]) {
        expect(lido).not.toBeNull();
        expect(lido?.id.valor).toBe(u.id.valor);
        expect(lido?.nome).toBe('Lucas');
        expect(lido?.email.valor).toBe('lucas@clinica.com');
        expect(lido?.situacao).toBe('ativo');
        expect(lido?.papeis).toEqual(['proprietario']);
        expect(lido?.hashDeSenha.valor).toBe(HASH.valor);
        expect(lido?.senhaAlteradaEm).toEqual(T0);
        expect(lido?.mfa?.segredo.bytes()).toEqual(segredo(1).bytes());
        expect(lido?.mfa?.confirmadoEm).toEqual(T0);
        expect(lido?.ultimoPassoTotp()).toBe(1000);
        expect(lido?.mfaPendente?.bytes()).toEqual(segredo(2).bytes());
        expect(lido?.tentativasFalhas).toBe(1);
        expect(lido?.bloqueadoAte).toBeNull();
        expect(lido?.criadoEm).toEqual(T0);
        expect(lido?.versao).toBe(1);
        expect(lido?.codigosDeRecuperacao).toHaveLength(10);
        expect(lido?.codigosDisponiveis()).toBe(9);
        const usado = lido?.codigosDeRecuperacao.find((c) => c.hash === codigos[0]!.hash);
        expect(usado?.usadoEm).toEqual(new Date(T0.getTime() + 1000));
      }
    });

    it('guarda no banco só o hash da senha e os bytes cifrados (nunca texto claro)', async () => {
      const u = novoUsuario();
      u.prepararMfa(segredo(7));
      await usuarios.salvar(u);
      const r = await conexao.db.execute<{ hash_de_senha: string; mfa_segredo_cifrado: Buffer }>(
        sql`SELECT hash_de_senha, mfa_segredo_cifrado FROM identidade.usuarios`,
      );
      expect(r.rows[0]?.hash_de_senha.startsWith('$argon2id$')).toBe(true);
      expect(r.rows[0]?.mfa_segredo_cifrado.length).toBe(61);
    });

    it('detecta atualização concorrente (versão otimista)', async () => {
      const u = novoUsuario();
      await usuarios.salvar(u);
      const a = (await usuarios.porId(u.id))!;
      const b = (await usuarios.porId(u.id))!;
      a.trocarSenha(HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$aaa$aaa'), T0);
      b.trocarSenha(HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$bbb$bbb'), T0);
      await usuarios.salvar(a);
      expect(a.versao).toBe(2);
      await expect(usuarios.salvar(b)).rejects.toThrow(ConflitoDeConcorrencia);
      expect((await usuarios.porId(u.id))?.hashDeSenha.valor).toContain('$aaa$aaa');
    });

    it('e-mail duplicado lança ConflitoDeConcorrencia', async () => {
      await usuarios.salvar(novoUsuario('a@b.com'));
      await expect(usuarios.salvar(novoUsuario('A@B.com'))).rejects.toThrow(ConflitoDeConcorrencia);
    });

    it('contarProprietariosAtivos ignora desativados', async () => {
      const ativo = novoUsuario('a@b.com');
      const desativado = novoUsuario('c@d.com');
      desativado.desativar(T0);
      await usuarios.salvar(ativo);
      await usuarios.salvar(desativado);
      expect(await usuarios.contarProprietariosAtivos()).toBe(1);
    });

    it('regenerar códigos remove os antigos do banco', async () => {
      const u = novoUsuario();
      u.prepararMfa(segredo(1));
      u.confirmarMfa(1000, dezCodigos(1), T0);
      await usuarios.salvar(u);
      u.substituirCodigosDeRecuperacao(dezCodigos(2), T0);
      await usuarios.salvar(u);
      const r = await conexao.db.execute<{ total: string; antigos: string }>(sql`
        SELECT count(*) AS total, count(*) FILTER (WHERE hash < ${hexa(200)}) AS antigos
        FROM identidade.codigos_de_recuperacao`);
      expect(r.rows[0]).toEqual({ total: '10', antigos: '0' });
    });

    it('redefinição administrativa remove todos os códigos', async () => {
      const u = novoUsuario();
      u.prepararMfa(segredo(1));
      u.confirmarMfa(1000, dezCodigos(1), T0);
      await usuarios.salvar(u);
      u.redefinirAcessoAdministrativamente(HASH, T0);
      await usuarios.salvar(u);
      const lido = (await usuarios.porId(u.id))!;
      expect(lido.codigosDeRecuperacao).toHaveLength(0);
      expect(lido.exigeConfigurarMfa()).toBe(true);
      expect(lido.mfaPendente).toBeNull();
    });

    it('usuário inexistente devolve null', async () => {
      expect(await usuarios.porId(UsuarioId.novo())).toBeNull();
      expect(await usuarios.porEmail(Email.criar('ninguem@x.com'))).toBeNull();
    });

    it.each(["a';drop/**/table/**/identidade.usuarios;--@a.com", "x'or'1'='1@a.com", 'a"or"1"="1@a.com'])(
      'entrada maliciosa %s não executa SQL nem casa linhas',
      async (payload) => {
        await usuarios.salvar(novoUsuario());
        expect(await usuarios.porEmail(Email.criar(payload))).toBeNull();
        expect(await usuarios.contarProprietariosAtivos()).toBe(1);
      },
    );

    it('o e-mail com espaços (payload clássico) já é recusado pelo value object', () => {
      expect(() => Email.criar("x'); drop table identidade.usuarios; --@a.com")).toThrow();
    });
  });

  describe('DispositivoRepositorioDrizzle', () => {
    it('ida e volta, com ativos sem revogados e todos em ordem de registro', async () => {
      const u = novoUsuario();
      await usuarios.salvar(u);
      const tarde = novoDispositivo(u.id, 10);
      const cedo = novoDispositivo(u.id, 1);
      await dispositivos.salvar(tarde);
      await dispositivos.salvar(cedo);
      cedo.revogar('notebook perdido', new Date(T0.getTime() + 20 * 60_000));
      await dispositivos.salvar(cedo);
      expect(cedo.versao).toBe(2);

      const lido = (await dispositivos.porId(cedo.id))!;
      expect(lido).toMatchObject({
        apelido: 'Mac 1',
        plataforma: 'macos',
        situacao: 'revogado',
        motivoRevogacao: 'notebook perdido',
        chavePublicaAuditoria: CHAVE,
        biometriaHabilitada: false,
        versao: 2,
      });
      expect(lido.revogadoEm).toEqual(new Date(T0.getTime() + 20 * 60_000));
      expect((await dispositivos.todosDoUsuario(u.id)).map((d) => d.apelido)).toEqual(['Mac 1', 'Mac 10']);
      expect((await dispositivos.ativosDoUsuario(u.id)).map((d) => d.apelido)).toEqual(['Mac 10']);
    });

    it('check-in é persistido e a versão otimista protege contra atualização concorrente', async () => {
      const u = novoUsuario();
      await usuarios.salvar(u);
      const d = novoDispositivo(u.id);
      await dispositivos.salvar(d);
      const a = (await dispositivos.porId(d.id))!;
      const b = (await dispositivos.porId(d.id))!;
      a.registrarCheckIn(new Date(T0.getTime() + 5000));
      await dispositivos.salvar(a);
      b.registrarCheckIn(new Date(T0.getTime() + 9000));
      await expect(dispositivos.salvar(b)).rejects.toThrow(ConflitoDeConcorrencia);
      expect((await dispositivos.porId(d.id))?.ultimoCheckIn).toEqual(new Date(T0.getTime() + 5000));
    });

    it('não devolve dispositivos de outro usuário', async () => {
      const a = novoUsuario('a@b.com');
      const b = novoUsuario('c@d.com');
      await usuarios.salvar(a);
      await usuarios.salvar(b);
      await dispositivos.salvar(novoDispositivo(a.id));
      expect(await dispositivos.todosDoUsuario(b.id)).toHaveLength(0);
    });
  });

  describe('SessaoDeLoginRepositorioDrizzle', () => {
    async function preparar() {
      const u = novoUsuario();
      await usuarios.salvar(u);
      const d = novoDispositivo(u.id);
      await dispositivos.salvar(d);
      return { u, d };
    }

    it('ida e volta de todos os campos', async () => {
      const { u, d } = await preparar();
      const s = novaSessao(u.id, d.id, hexa(1));
      await sessoes.salvar(s);
      const lida = (await sessoes.porId(s.id))!;
      expect(lida).toMatchObject({ refreshAtualHash: hexa(1), refreshAnteriorHash: null, situacao: 'ativa', versao: 1 });
      expect(lida.criadaEm).toEqual(T0);
      expect(lida.expiraEm).toEqual(new Date(T0.getTime() + 30 * 86_400_000));
      expect(lida.usuarioId.valor).toBe(u.id.valor);
      expect(lida.dispositivoId.valor).toBe(d.id.valor);
    });

    it('segunda sessão ativa no mesmo dispositivo lança ConflitoDeConcorrencia; após revogar a primeira, a nova entra', async () => {
      const { u, d } = await preparar();
      const primeira = novaSessao(u.id, d.id, hexa(1));
      await sessoes.salvar(primeira);
      await expect(sessoes.salvar(novaSessao(u.id, d.id, hexa(2)))).rejects.toThrow(ConflitoDeConcorrencia);
      primeira.revogar('nova-sessao-no-dispositivo', T0);
      await sessoes.salvar(primeira);
      await expect(sessoes.salvar(novaSessao(u.id, d.id, hexa(2)))).resolves.toBeUndefined();
      expect((await sessoes.ativaDoDispositivo(d.id))?.refreshAtualHash).toBe(hexa(2));
      expect((await sessoes.porId(primeira.id))?.motivoRevogacao).toBe('nova-sessao-no-dispositivo');
    });

    it('porRefreshHash encontra pelo hash atual e pelo anterior após a rotação', async () => {
      const { u, d } = await preparar();
      const s = novaSessao(u.id, d.id, hexa(1));
      await sessoes.salvar(s);
      expect(s.rotacionar(hexa(1), hexa(2), T0)).toBe('rotacionada');
      await sessoes.salvar(s);
      expect((await sessoes.porRefreshHash(hexa(1)))?.id.valor).toBe(s.id.valor);
      expect((await sessoes.porRefreshHash(hexa(2)))?.id.valor).toBe(s.id.valor);
      expect(await sessoes.porRefreshHash(hexa(3))).toBeNull();
    });

    it('ativasDoUsuario lista só as ativas', async () => {
      const { u, d } = await preparar();
      const s = novaSessao(u.id, d.id, hexa(1));
      await sessoes.salvar(s);
      expect(await sessoes.ativasDoUsuario(u.id)).toHaveLength(1);
      s.revogar('logout', T0);
      await sessoes.salvar(s);
      expect(await sessoes.ativasDoUsuario(u.id)).toHaveLength(0);
    });
  });
});
