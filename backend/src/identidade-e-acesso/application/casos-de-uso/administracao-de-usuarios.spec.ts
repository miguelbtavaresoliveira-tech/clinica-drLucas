import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearUsuarioComMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  ContextoDeAcesso,
  DispositivoId,
  Email,
  EmailInvalido,
  PROPRIETARIO,
  PoliticaDeProprietario,
  SemPermissao,
  SenhaFraca,
  UltimoProprietario,
  Usuario,
  UsuarioId,
  UsuarioNaoEncontrado,
} from '../../domain/index.js';
import { DesativarUsuario } from './desativar-usuario.js';
import { RedefinirAcessoAdministrativo } from './redefinir-acesso-administrativo.js';

async function montar() {
  const amb = criarAmbienteDeTeste();
  const semeado = await semearUsuarioComMfa(amb);
  const login = await entrar(amb, semeado.usuario.id);
  const ctx = new ContextoDeAcesso(semeado.usuario.id, DispositivoId.de(login.dispositivoId), [PROPRIETARIO]);
  const desativar = new DesativarUsuario({
    uow: amb.uow,
    relogio: amb.relogio,
    politicaDeProprietario: new PoliticaDeProprietario(),
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  const redefinir = new RedefinirAcessoAdministrativo({
    uow: amb.uow,
    hasher: amb.hasher,
    politicaDeSenha: amb.politicaDeSenha,
    politica: amb.politica,
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, ...semeado, login, ctx, desativar, redefinir };
}

async function semearSegundoProprietario(amb: Awaited<ReturnType<typeof montar>>['amb']): Promise<Usuario> {
  const segundo = Usuario.criar({
    nome: 'Sócio',
    email: Email.criar('socio@clinica.com'),
    hashDeSenha: await amb.hasher.gerar('senha-do-socio-forte-1'),
    papeis: ['proprietario'],
    agora: amb.relogio.agora(),
  });
  await amb.repos.usuarios.salvar(segundo);
  return segundo;
}

describe('DesativarUsuario', () => {
  it('desativar o único proprietário lança UltimoProprietario e nada muda', async () => {
    const { amb, usuario, ctx, desativar } = await montar();
    await expect(desativar.executar({ ctx, usuarioId: usuario.id.valor, ip: null })).rejects.toThrow(UltimoProprietario);
    expect((await amb.repos.usuarios.porId(usuario.id))?.situacao).toBe('ativo');
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(1);
  });

  it('com dois proprietários desativa o alvo, revoga as sessões e audita', async () => {
    const { amb, usuario, ctx, desativar } = await montar();
    const segundo = await semearSegundoProprietario(amb);
    await entrar(amb, usuario.id);
    await desativar.executar({ ctx, usuarioId: usuario.id.valor, ip: '8.8.8.8' });
    expect((await amb.repos.usuarios.porId(usuario.id))?.situacao).toBe('desativado');
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect((await amb.repos.usuarios.porId(segundo.id))?.situacao).toBe('ativo');
    const tipos = amb.repos.auditoria.registros.map((r) => r.tipo);
    expect(tipos).toContain('usuario-desativado');
    expect(tipos).toContain('sessao-revogada');
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({ ip: '8.8.8.8' });
  });

  it('o registro do usuário desativado continua existindo (RN-04)', async () => {
    const { amb, usuario, ctx, desativar } = await montar();
    await semearSegundoProprietario(amb);
    await desativar.executar({ ctx, usuarioId: usuario.id.valor, ip: null });
    expect(await amb.repos.usuarios.porId(usuario.id)).not.toBeNull();
  });

  it('sem permissão lança SemPermissao', async () => {
    const { usuario, ctx, desativar } = await montar();
    const semPapel = new ContextoDeAcesso(usuario.id, ctx.dispositivoId, []);
    await expect(desativar.executar({ ctx: semPapel, usuarioId: usuario.id.valor, ip: null })).rejects.toThrow(SemPermissao);
  });

  it.each(['nao-e-uuid', UsuarioId.novo().valor])('id %s lança UsuarioNaoEncontrado', async (id) => {
    const { ctx, desativar } = await montar();
    await expect(desativar.executar({ ctx, usuarioId: id, ip: null })).rejects.toThrow(UsuarioNaoEncontrado);
  });
});

describe('RedefinirAcessoAdministrativo', () => {
  const NOVA = 'senha-nova-do-administrador-55';

  it('deixa o usuário exigindo configurar MFA, sem códigos, sem sessões e com a nova senha', async () => {
    const { amb, usuario, redefinir } = await montar();
    await redefinir.executar({ email: 'lucas@clinica.com', novaSenha: NOVA });
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.exigeConfigurarMfa()).toBe(true);
    expect(salvo.codigosDeRecuperacao).toHaveLength(0);
    expect(salvo.bloqueadoAte).toBeNull();
    expect(await amb.hasher.conferir(NOVA, salvo.hashDeSenha)).toBe(true);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    const tipos = amb.repos.auditoria.registros.map((r) => r.tipo);
    expect(tipos).toContain('acesso-redefinido-administrativamente');
    expect(tipos).toContain('senha-alterada');
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(NOVA);
  });

  it('invalida tokens de redefinição pendentes', async () => {
    const { amb, usuario, redefinir } = await montar();
    const expiraEm = new Date(amb.relogio.agora().getTime() + 600_000);
    await amb.repos.tokensDeRedefinicao.criar({ hash: 'h-pendente', usuarioId: usuario.id, expiraEm });
    await redefinir.executar({ email: 'lucas@clinica.com', novaSenha: NOVA });
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido('h-pendente', amb.relogio.agora())).toBeNull();
  });

  it('e-mail inexistente lança UsuarioNaoEncontrado', async () => {
    const { redefinir } = await montar();
    await expect(redefinir.executar({ email: 'ninguem@clinica.com', novaSenha: NOVA })).rejects.toThrow(UsuarioNaoEncontrado);
  });

  it('e-mail inválido e senha fraca são rejeitados antes de qualquer mudança', async () => {
    const { amb, usuario, redefinir } = await montar();
    const antes = (await amb.repos.usuarios.porId(usuario.id))!.hashDeSenha.valor;
    await expect(redefinir.executar({ email: 'sem-arroba', novaSenha: NOVA })).rejects.toThrow(EmailInvalido);
    await expect(redefinir.executar({ email: 'lucas@clinica.com', novaSenha: 'curta' })).rejects.toThrow(SenhaFraca);
    expect((await amb.repos.usuarios.porId(usuario.id))!.hashDeSenha.valor).toBe(antes);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(1);
  });
});
