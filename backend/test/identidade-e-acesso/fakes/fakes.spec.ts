import { describe, expect, it } from 'vitest';
import { ConflitoDeConcorrencia } from '../../../src/identidade-e-acesso/application/portas/index.js';
import {
  Dispositivo,
  DispositivoId,
  Email,
  HashDeSenha,
  SessaoDeLogin,
  Usuario,
  UsuarioId,
  POLITICA_PADRAO,
} from '../../../src/identidade-e-acesso/domain/index.js';
import {
  CHAVE_PUBLICA_DE_TESTE,
  GeradorDeCodigosFalso,
  VerificadorDeAssinaturaDeTeste,
  criarAmbienteDeTeste,
  semearDispositivo,
  semearUsuarioComMfa,
} from './index.js';

const HASH_SENHA = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def');

const novoUsuario = (email = 'a@b.com', agora = new Date('2026-10-13T12:00:00.000Z')): Usuario =>
  Usuario.criar({ nome: 'Lucas', email: Email.criar(email), hashDeSenha: HASH_SENHA, papeis: ['proprietario'], agora });

describe('repositórios em memória', () => {
  it('guarda cópias: mutar a instância original sem salvar não altera o estado salvo', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    await amb.repos.usuarios.salvar(u);
    u.desativar(amb.relogio.agora());
    const lido = await amb.repos.usuarios.porId(u.id);
    expect(lido?.situacao).toBe('ativo');
    expect(lido).not.toBe(u);
  });

  it('salvar incrementa a versão da instância recebida', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    expect(u.versao).toBe(0);
    await amb.repos.usuarios.salvar(u);
    expect(u.versao).toBe(1);
    await amb.repos.usuarios.salvar(u);
    expect(u.versao).toBe(2);
  });

  it('salvar com versão desatualizada lança ConflitoDeConcorrencia', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    await amb.repos.usuarios.salvar(u);
    const a = await amb.repos.usuarios.porId(u.id);
    const b = await amb.repos.usuarios.porId(u.id);
    await amb.repos.usuarios.salvar(a as Usuario);
    await expect(amb.repos.usuarios.salvar(b as Usuario)).rejects.toThrow(ConflitoDeConcorrencia);
  });

  it('versão 0 com id já existente lança ConflitoDeConcorrencia', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    await amb.repos.usuarios.salvar(u);
    const clone = Usuario.reconstituir({
      id: u.id,
      nome: u.nome,
      email: u.email,
      situacao: u.situacao,
      papeis: u.papeis,
      hashDeSenha: u.hashDeSenha,
      senhaAlteradaEm: u.senhaAlteradaEm,
      mfa: null,
      mfaPendente: null,
      codigosDeRecuperacao: [],
      tentativasFalhas: 0,
      bloqueadoAte: null,
      criadoEm: u.criadoEm,
      versao: 0,
    });
    await expect(amb.repos.usuarios.salvar(clone)).rejects.toThrow(ConflitoDeConcorrencia);
  });

  it('simula o UNIQUE do e-mail', async () => {
    const amb = criarAmbienteDeTeste();
    await amb.repos.usuarios.salvar(novoUsuario('a@b.com'));
    await expect(amb.repos.usuarios.salvar(novoUsuario('A@B.com'))).rejects.toThrow(ConflitoDeConcorrencia);
  });

  it('conta apenas proprietários ativos', async () => {
    const amb = criarAmbienteDeTeste();
    const u1 = novoUsuario('a@b.com');
    const u2 = novoUsuario('c@d.com');
    u2.desativar(amb.relogio.agora());
    await amb.repos.usuarios.salvar(u1);
    await amb.repos.usuarios.salvar(u2);
    expect(await amb.repos.usuarios.contarProprietariosAtivos()).toBe(1);
  });

  it('simula o índice único de sessão ativa por dispositivo', async () => {
    const amb = criarAmbienteDeTeste();
    const usuarioId = UsuarioId.novo();
    const dispositivoId = DispositivoId.novo();
    const nova = (hash: string): SessaoDeLogin =>
      SessaoDeLogin.iniciar({ usuarioId, dispositivoId, refreshHash: hash, agora: amb.relogio.agora(), politica: POLITICA_PADRAO });
    const primeira = nova('a'.repeat(64));
    await amb.repos.sessoes.salvar(primeira);
    await expect(amb.repos.sessoes.salvar(nova('b'.repeat(64)))).rejects.toThrow(ConflitoDeConcorrencia);
    primeira.revogar('logout', amb.relogio.agora());
    await amb.repos.sessoes.salvar(primeira);
    await expect(amb.repos.sessoes.salvar(nova('b'.repeat(64)))).resolves.toBeUndefined();
  });

  it('porRefreshHash casa o atual e o anterior', async () => {
    const amb = criarAmbienteDeTeste();
    const s = SessaoDeLogin.iniciar({
      usuarioId: UsuarioId.novo(),
      dispositivoId: DispositivoId.novo(),
      refreshHash: 'a'.repeat(64),
      agora: amb.relogio.agora(),
      politica: POLITICA_PADRAO,
    });
    s.rotacionar('a'.repeat(64), 'b'.repeat(64), amb.relogio.agora());
    await amb.repos.sessoes.salvar(s);
    expect((await amb.repos.sessoes.porRefreshHash('a'.repeat(64)))?.id.valor).toBe(s.id.valor);
    expect((await amb.repos.sessoes.porRefreshHash('b'.repeat(64)))?.id.valor).toBe(s.id.valor);
    expect(await amb.repos.sessoes.porRefreshHash('c'.repeat(64))).toBeNull();
  });

  it('dispositivos: ativos exclui revogados e todos vêm em ordem de registro', async () => {
    const amb = criarAmbienteDeTeste();
    const usuarioId = UsuarioId.novo();
    const criar = (minutos: number): Dispositivo =>
      Dispositivo.registrar({
        usuarioId,
        apelido: `d${String(minutos)}`,
        plataforma: 'macos',
        chavePublicaAuditoria: CHAVE_PUBLICA_DE_TESTE,
        agora: new Date(amb.relogio.agora().getTime() + minutos * 60_000),
      });
    const tarde = criar(10);
    const cedo = criar(1);
    await amb.repos.dispositivos.salvar(tarde);
    await amb.repos.dispositivos.salvar(cedo);
    cedo.revogar('perdido', amb.relogio.agora());
    await amb.repos.dispositivos.salvar(cedo);
    expect((await amb.repos.dispositivos.todosDoUsuario(usuarioId)).map((d) => d.apelido)).toEqual(['d1', 'd10']);
    expect((await amb.repos.dispositivos.ativosDoUsuario(usuarioId)).map((d) => d.apelido)).toEqual(['d10']);
  });
});

describe('unidade de trabalho em memória', () => {
  it('faz rollback quando o trabalho lança depois de salvar', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    await expect(
      amb.uow.executar(async (r) => {
        await r.usuarios.salvar(u);
        await r.desafios.criar({ id: 'd1', usuarioId: u.id, expiraEm: new Date('2030-01-01T00:00:00Z') });
        throw new Error('falha');
      }),
    ).rejects.toThrow('falha');
    expect(await amb.repos.usuarios.porId(u.id)).toBeNull();
    expect(await amb.repos.desafios.porId('d1')).toBeNull();
  });

  it('confirma o estado quando o trabalho termina sem erro', async () => {
    const amb = criarAmbienteDeTeste();
    const u = novoUsuario();
    const retorno = await amb.uow.executar(async (r) => {
      await r.usuarios.salvar(u);
      return 42;
    });
    expect(retorno).toBe(42);
    expect(await amb.repos.usuarios.porId(u.id)).not.toBeNull();
  });
});

describe('desafios e tokens de redefinição', () => {
  it('marcarUsado devolve true uma vez e false na segunda; false se expirado', async () => {
    const amb = criarAmbienteDeTeste();
    const agora = amb.relogio.agora();
    const usuarioId = UsuarioId.novo();
    await amb.repos.desafios.criar({ id: 'ok', usuarioId, expiraEm: new Date(agora.getTime() + 60_000) });
    expect(await amb.repos.desafios.marcarUsado('ok', agora)).toBe(true);
    expect(await amb.repos.desafios.marcarUsado('ok', agora)).toBe(false);
    await amb.repos.desafios.criar({ id: 'exp', usuarioId, expiraEm: agora });
    expect(await amb.repos.desafios.marcarUsado('exp', agora)).toBe(false);
    expect(await amb.repos.desafios.marcarUsado('inexistente', agora)).toBe(false);
  });

  it('token de redefinição: válido, consumo único e invalidação em lote', async () => {
    const amb = criarAmbienteDeTeste();
    const agora = amb.relogio.agora();
    const usuarioId = UsuarioId.novo();
    const expiraEm = new Date(agora.getTime() + 60_000);
    await amb.repos.tokensDeRedefinicao.criar({ hash: 'h1', usuarioId, expiraEm });
    await amb.repos.tokensDeRedefinicao.criar({ hash: 'h2', usuarioId, expiraEm });
    expect((await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido('h1', agora))?.valor).toBe(usuarioId.valor);
    expect(await amb.repos.tokensDeRedefinicao.consumir('h1', agora)).toBe(true);
    expect(await amb.repos.tokensDeRedefinicao.consumir('h1', agora)).toBe(false);
    await amb.repos.tokensDeRedefinicao.invalidarDoUsuario(usuarioId, agora);
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido('h2', agora)).toBeNull();
  });
});

describe('adaptadores falsos', () => {
  it('gerador de códigos nunca reinicia e normaliza no hashDe', () => {
    const g = new GeradorDeCodigosFalso();
    const a = g.gerar(10);
    const b = g.gerar(2);
    expect(a[0]?.codigo).toBe('TEST-0000-0000-0001');
    expect(b[0]?.codigo).toBe('TEST-0000-0000-0011');
    expect(g.hashDe('test-0000-0000-0001')).toBe(a[0]?.hash);
  });

  it('VerificadorDeAssinaturaDeTeste valida a assinatura R1 do D-009 e rejeita byte alterado', () => {
    const v = new VerificadorDeAssinaturaDeTeste();
    const hash = 'b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a';
    const assinatura =
      'GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==';
    expect(v.verificarEd25519(hash, assinatura, CHAVE_PUBLICA_DE_TESTE)).toBe(true);
    expect(v.verificarEd25519(`${hash.slice(0, -1)}b`, assinatura, CHAVE_PUBLICA_DE_TESTE)).toBe(false);
    expect(v.verificarEd25519(hash, 'x', CHAVE_PUBLICA_DE_TESTE)).toBe(false);
    expect(v.verificarEd25519(hash, assinatura, 'curta')).toBe(false);
  });

  it('semeadores criam usuário com MFA, 10 códigos e dispositivo', async () => {
    const amb = criarAmbienteDeTeste();
    const { usuario, codigosDeRecuperacao, codigoValido } = await semearUsuarioComMfa(amb);
    const lido = await amb.repos.usuarios.porId(usuario.id);
    expect(lido?.exigeConfigurarMfa()).toBe(false);
    expect(lido?.codigosDisponiveis()).toBe(10);
    expect(codigosDeRecuperacao).toHaveLength(10);
    expect(amb.totp.verificar('x', codigoValido, 1000)).toEqual({ valido: true, passo: 1001 });
    const d = await semearDispositivo(amb, usuario.id);
    expect((await amb.repos.dispositivos.porId(d.id))?.apelido).toBe('MacBook de teste');
  });

  it('enviador de e-mail falha só uma vez quando solicitado', async () => {
    const amb = criarAmbienteDeTeste();
    amb.email.falharProximo = true;
    const email = Email.criar('a@b.com');
    const dados = { link: 'l', token: 't', expiraEm: amb.relogio.agora() };
    await expect(amb.email.enviarRedefinicaoDeSenha(email, dados)).rejects.toThrow();
    await expect(amb.email.enviarRedefinicaoDeSenha(email, dados)).resolves.toBeUndefined();
    expect(amb.email.enviados).toHaveLength(1);
  });

  it('cofre falso cifra e decifra; emissor falso emite e verifica desafio e access', async () => {
    const amb = criarAmbienteDeTeste();
    expect(await amb.cofre.decifrar(await amb.cofre.cifrar('segredo'))).toBe('segredo');
    const usuarioId = UsuarioId.novo();
    const { id, token } = amb.emissor.emitirDesafio(usuarioId, amb.relogio.agora());
    expect(amb.emissor.verificarDesafio(token)).toEqual({ id, usuarioId });
    expect(() => amb.emissor.verificarDesafio('lixo')).toThrow();
    const dados = { usuarioId: 'u', dispositivoId: 'd', sessaoId: 's', papeis: ['proprietario' as const] };
    expect(amb.emissor.verificarAccess(amb.emissor.emitirAccess(dados, amb.relogio.agora()))).toEqual(dados);
    expect(() => amb.emissor.verificarAccess('x')).toThrow();
  });

  it('relógio fixo devolve cópias e avança', () => {
    const amb = criarAmbienteDeTeste();
    const a = amb.relogio.agora();
    a.setFullYear(1999);
    expect(amb.relogio.agora().getFullYear()).toBe(2026);
    amb.relogio.avancar(1000);
    expect(amb.relogio.agora().toISOString()).toBe('2026-10-13T12:00:01.000Z');
  });
});
