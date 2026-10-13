import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearDispositivo,
  semearUsuarioComMfa,
  type AmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  ContextoDeAcesso,
  DadoInvalido,
  DispositivoId,
  DispositivoNaoEncontrado,
  DispositivoRevogado,
  PROPRIETARIO,
  ReautenticacaoNecessaria,
  SemPermissao,
  SessaoDeLogin,
  UsuarioId,
  type Usuario,
} from '../../domain/index.js';
import { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { ListarDispositivos } from './listar-dispositivos.js';
import { RenovarSessao } from './renovar-sessao.js';
import { RevogarDispositivo } from './revogar-dispositivo.js';

async function montar() {
  const amb = criarAmbienteDeTeste();
  const { usuario } = await semearUsuarioComMfa(amb);
  const login = await entrar(amb, usuario.id);
  const ctx = new ContextoDeAcesso(usuario.id, DispositivoId.de(login.dispositivoId), [PROPRIETARIO]);
  const listar = new ListarDispositivos({ uow: amb.uow });
  const revogar = new RevogarDispositivo({
    uow: amb.uow,
    verificadorDeMfa: new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos),
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, usuario, login, ctx, listar, revogar };
}

/** Registra um código TOTP novo, de passo ainda não usado, e o devolve. */
function novoCodigoTotp(amb: AmbienteDeTeste): string {
  const n = amb.totp.codigosValidos.size;
  const codigo = String(300000 + n);
  amb.totp.codigosValidos.set(codigo, 1001 + n);
  return codigo;
}

const semPermissao = (u: Usuario, d: DispositivoId): ContextoDeAcesso => new ContextoDeAcesso(u.id, d, []);

describe('ListarDispositivos', () => {
  it('inclui revogados e marca o dispositivo atual', async () => {
    const { amb, usuario, login, ctx, listar } = await montar();
    const outro = await semearDispositivo(amb, usuario.id);
    outro.revogar('perdido', amb.relogio.agora());
    await amb.repos.dispositivos.salvar(outro);
    const itens = await listar.executar({ ctx });
    expect(itens).toHaveLength(2);
    expect(itens.find((i) => i.atual)?.id).toBe(login.dispositivoId);
    expect(itens.find((i) => i.id === outro.id.valor)).toMatchObject({ situacao: 'revogado', atual: false });
  });

  it('não lista dispositivos de outro usuário', async () => {
    const { amb, ctx, listar } = await montar();
    await semearDispositivo(amb, UsuarioId.novo());
    expect(await listar.executar({ ctx })).toHaveLength(1);
  });

  it('sem permissão lança SemPermissao', async () => {
    const { usuario, ctx, listar } = await montar();
    await expect(listar.executar({ ctx: semPermissao(usuario, ctx.dispositivoId) })).rejects.toThrow(SemPermissao);
  });
});

describe('RevogarDispositivo', () => {
  it('revogação feliz: dispositivo e sessão revogados, com auditoria da reautenticação', async () => {
    const { amb, usuario, login, ctx, revogar } = await montar();
    const alvo = await semearDispositivo(amb, usuario.id);
    const sessao = SessaoDeLogin.iniciar({
      usuarioId: usuario.id,
      dispositivoId: alvo.id,
      refreshHash: 'c'.repeat(64),
      agora: amb.relogio.agora(),
      politica: amb.politica,
    });
    await amb.repos.sessoes.salvar(sessao);
    const antes = amb.repos.auditoria.registros.length;
    await revogar.executar({ ctx, dispositivoId: alvo.id.valor, motivo: 'notebook perdido', codigoMfa: novoCodigoTotp(amb), ip: '5.5.5.5' });
    expect((await amb.repos.dispositivos.porId(alvo.id))?.situacao).toBe('revogado');
    expect((await amb.repos.sessoes.porId(sessao.id))?.situacao).toBe('revogada');
    const novas = amb.repos.auditoria.registros.slice(antes).map((r) => r.tipo);
    expect(novas).toEqual(['dispositivo-revogado', 'sessao-revogada', 'reautenticacao-sensivel']);
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({ detalhe: { acao: 'revogar-dispositivo' }, ip: '5.5.5.5' });
    expect((await amb.repos.sessoes.ativasDoUsuario(usuario.id)).map((s) => s.dispositivoId.valor)).toEqual([login.dispositivoId]);
  });

  it('código MFA errado lança ReautenticacaoNecessaria, nada é revogado e a falha de login não é contada', async () => {
    const { amb, usuario, ctx, revogar } = await montar();
    const alvo = await semearDispositivo(amb, usuario.id);
    await expect(
      revogar.executar({ ctx, dispositivoId: alvo.id.valor, motivo: 'perdido', codigoMfa: '000000', ip: null }),
    ).rejects.toThrow(ReautenticacaoNecessaria);
    expect((await amb.repos.dispositivos.porId(alvo.id))?.situacao).toBe('ativo');
    expect((await amb.repos.usuarios.porId(usuario.id))?.tentativasFalhas).toBe(0);
  });

  it('dispositivo de outro usuário lança DispositivoNaoEncontrado (IDOR) e nada muda', async () => {
    const { amb, ctx, revogar } = await montar();
    const alheio = await semearDispositivo(amb, UsuarioId.novo());
    await expect(
      revogar.executar({ ctx, dispositivoId: alheio.id.valor, motivo: 'perdido', codigoMfa: novoCodigoTotp(amb), ip: null }),
    ).rejects.toThrow(DispositivoNaoEncontrado);
    expect((await amb.repos.dispositivos.porId(alheio.id))?.situacao).toBe('ativo');
  });

  it.each(['nao-e-uuid', '00000000-0000-4000-8000-000000000000'])('id %s lança DispositivoNaoEncontrado', async (id) => {
    const { amb, ctx, revogar } = await montar();
    await expect(
      revogar.executar({ ctx, dispositivoId: id, motivo: 'perdido', codigoMfa: novoCodigoTotp(amb), ip: null }),
    ).rejects.toThrow(DispositivoNaoEncontrado);
  });

  it('o passo TOTP consumido é persistido mesmo quando o dispositivo não é encontrado', async () => {
    const { amb, usuario, ctx, revogar } = await montar();
    const codigo = novoCodigoTotp(amb);
    await revogar.executar({ ctx, dispositivoId: 'nao-e-uuid', motivo: 'perdido', codigoMfa: codigo, ip: null }).catch(() => undefined);
    await expect(
      revogar.executar({ ctx, dispositivoId: 'nao-e-uuid', motivo: 'perdido', codigoMfa: codigo, ip: null }),
    ).rejects.toThrow(ReautenticacaoNecessaria);
    expect((await amb.repos.usuarios.porId(usuario.id))?.ultimoPassoTotp()).toBeGreaterThan(1001);
  });

  it('motivo com 2 caracteres lança DadoInvalido', async () => {
    const { amb, usuario, ctx, revogar } = await montar();
    const alvo = await semearDispositivo(amb, usuario.id);
    await expect(
      revogar.executar({ ctx, dispositivoId: alvo.id.valor, motivo: 'ab', codigoMfa: novoCodigoTotp(amb), ip: null }),
    ).rejects.toThrow(DadoInvalido);
    expect((await amb.repos.dispositivos.porId(alvo.id))?.situacao).toBe('ativo');
  });

  it('sem permissão lança SemPermissao', async () => {
    const { usuario, ctx, revogar } = await montar();
    await expect(
      revogar.executar({ ctx: semPermissao(usuario, ctx.dispositivoId), dispositivoId: ctx.dispositivoId.valor, motivo: 'perdido', codigoMfa: '123456', ip: null }),
    ).rejects.toThrow(SemPermissao);
  });

  it('depois de revogado, RenovarSessao daquele dispositivo lança DispositivoRevogado', async () => {
    const { amb, usuario, login, ctx, revogar } = await montar();
    const segundo = await entrar(amb, usuario.id);
    await revogar.executar({ ctx, dispositivoId: segundo.dispositivoId, motivo: 'perdido', codigoMfa: novoCodigoTotp(amb), ip: null });
    const renovar = new RenovarSessao({
      uow: amb.uow,
      emissor: amb.emissor,
      relogio: amb.relogio,
      politica: amb.politica,
      auditor: amb.auditor,
      barramento: amb.barramento,
    });
    await expect(
      renovar.executar({ refreshToken: segundo.refreshToken, dispositivoId: segundo.dispositivoId, ip: null }),
    ).rejects.toThrow(DispositivoRevogado);
    await expect(
      renovar.executar({ refreshToken: login.refreshToken, dispositivoId: login.dispositivoId, ip: null }),
    ).resolves.toBeDefined();
  });
});
