import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearUsuarioComMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  ContextoDeAcesso,
  CredenciaisInvalidas,
  DispositivoId,
  PROPRIETARIO,
  SemPermissao,
  SenhaFraca,
} from '../../domain/index.js';
import { TrocarSenha } from './trocar-senha.js';

const NOVA = 'outra-senha-muito-forte-77';

async function montar() {
  const amb = criarAmbienteDeTeste();
  const { usuario, senha } = await semearUsuarioComMfa(amb);
  const atual = await entrar(amb, usuario.id);
  const outro = await entrar(amb, usuario.id);
  const ctx = new ContextoDeAcesso(usuario.id, DispositivoId.de(atual.dispositivoId), [PROPRIETARIO]);
  const caso = new TrocarSenha({
    uow: amb.uow,
    hasher: amb.hasher,
    politicaDeSenha: amb.politicaDeSenha,
    politica: amb.politica,
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, usuario, senha, atual, outro, ctx, caso };
}

describe('TrocarSenha', () => {
  it('troca feliz: a nova senha confere e é auditada, sem a senha na auditoria', async () => {
    const { amb, usuario, senha, ctx, caso } = await montar();
    await caso.executar({ ctx, senhaAtual: senha, novaSenha: NOVA, ip: null });
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(await amb.hasher.conferir(NOVA, salvo.hashDeSenha)).toBe(true);
    expect(await amb.hasher.conferir(senha, salvo.hashDeSenha)).toBe(false);
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toContain('senha-alterada');
    const auditoria = JSON.stringify(amb.repos.auditoria.registros);
    expect(auditoria).not.toContain(NOVA);
    expect(auditoria).not.toContain(senha);
  });

  it('revoga as outras sessões e mantém a do dispositivo atual', async () => {
    const { amb, usuario, senha, atual, outro, ctx, caso } = await montar();
    await caso.executar({ ctx, senhaAtual: senha, novaSenha: NOVA, ip: null });
    const ativas = await amb.repos.sessoes.ativasDoUsuario(usuario.id);
    expect(ativas.map((s) => s.dispositivoId.valor)).toEqual([atual.dispositivoId]);
    const revogada = await amb.repos.sessoes.ativaDoDispositivo(DispositivoId.de(outro.dispositivoId));
    expect(revogada).toBeNull();
    expect(amb.repos.auditoria.registros.filter((r) => r.tipo === 'sessao-revogada')).toMatchObject([
      { detalhe: { motivo: 'senha-alterada' } },
    ]);
  });

  it('senha atual errada lança CredenciaisInvalidas, conta a falha e mantém o hash', async () => {
    const { amb, usuario, ctx, caso } = await montar();
    const antes = (await amb.repos.usuarios.porId(usuario.id))!.hashDeSenha.valor;
    await expect(caso.executar({ ctx, senhaAtual: 'errada', novaSenha: NOVA, ip: null })).rejects.toThrow(CredenciaisInvalidas);
    const depois = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(depois.tentativasFalhas).toBe(1);
    expect(depois.hashDeSenha.valor).toBe(antes);
  });

  it('nova senha igual à atual lança SenhaFraca com igual-a-atual', async () => {
    const { senha, ctx, caso } = await montar();
    let erro: unknown;
    try {
      await caso.executar({ ctx, senhaAtual: senha, novaSenha: senha, ip: null });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(SenhaFraca);
    expect((erro as SenhaFraca).motivos).toEqual(['igual-a-atual']);
  });

  it('nova senha fraca lança SenhaFraca e o hash não muda', async () => {
    const { amb, usuario, senha, ctx, caso } = await montar();
    const antes = (await amb.repos.usuarios.porId(usuario.id))!.hashDeSenha.valor;
    await expect(caso.executar({ ctx, senhaAtual: senha, novaSenha: 'curta', ip: null })).rejects.toThrow(SenhaFraca);
    expect((await amb.repos.usuarios.porId(usuario.id))!.hashDeSenha.valor).toBe(antes);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(2);
  });

  it('sem permissão lança SemPermissao', async () => {
    const { usuario, senha, ctx, caso } = await montar();
    const semPapel = new ContextoDeAcesso(usuario.id, ctx.dispositivoId, []);
    await expect(caso.executar({ ctx: semPapel, senhaAtual: senha, novaSenha: NOVA, ip: null })).rejects.toThrow(SemPermissao);
  });
});
