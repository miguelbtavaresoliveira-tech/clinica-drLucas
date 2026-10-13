import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearUsuarioComMfa,
  type AmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  CodigoMfaInvalido,
  ContextoDeAcesso,
  DispositivoId,
  MfaObrigatorio,
  PROPRIETARIO,
  ReautenticacaoNecessaria,
  SemPermissao,
} from '../../domain/index.js';
import { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { ConfirmarReconfiguracaoDeMfa } from './confirmar-reconfiguracao-de-mfa.js';
import { IniciarReconfiguracaoDeMfa } from './iniciar-reconfiguracao-de-mfa.js';
import { RegenerarCodigosDeRecuperacao } from './regenerar-codigos-de-recuperacao.js';

async function montar() {
  const amb = criarAmbienteDeTeste();
  const semeado = await semearUsuarioComMfa(amb);
  const login = await entrar(amb, semeado.usuario.id);
  const ctx = new ContextoDeAcesso(semeado.usuario.id, DispositivoId.de(login.dispositivoId), [PROPRIETARIO]);
  const verificadorDeMfa = new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos);
  const base = { uow: amb.uow, relogio: amb.relogio, auditor: amb.auditor, barramento: amb.barramento };
  return {
    amb,
    ...semeado,
    ctx,
    verificadorDeMfa,
    regenerar: new RegenerarCodigosDeRecuperacao({ ...base, verificadorDeMfa, codigos: amb.codigos }),
    iniciar: new IniciarReconfiguracaoDeMfa({
      ...base,
      hasher: amb.hasher,
      totp: amb.totp,
      cofre: amb.cofre,
      politica: amb.politica,
    }),
    confirmar: new ConfirmarReconfiguracaoDeMfa({ ...base, verificadorDeMfa, codigos: amb.codigos }),
  };
}

function novoCodigoTotp(amb: AmbienteDeTeste): string {
  const n = amb.totp.codigosValidos.size;
  const codigo = String(500000 + n);
  amb.totp.codigosValidos.set(codigo, 1001 + n);
  return codigo;
}

describe('RegenerarCodigosDeRecuperacao', () => {
  it('feliz: os códigos antigos deixam de funcionar e os novos funcionam', async () => {
    const { amb, usuario, codigosDeRecuperacao, ctx, regenerar, verificadorDeMfa } = await montar();
    const saida = await regenerar.executar({ ctx, codigoMfa: novoCodigoTotp(amb), ip: null });
    expect(saida.codigosDeRecuperacao).toHaveLength(10);
    const agora = amb.relogio.agora();
    const antigo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(await verificadorDeMfa.verificar(antigo, { tipo: 'recuperacao', valor: codigosDeRecuperacao[0]! }, agora)).toEqual({ ok: false });
    const novo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(await verificadorDeMfa.verificar(novo, { tipo: 'recuperacao', valor: saida.codigosDeRecuperacao[0]! }, agora)).toEqual({
      ok: true,
      usouRecuperacao: true,
    });
    const tipos = amb.repos.auditoria.registros.map((r) => r.tipo);
    expect(tipos).toContain('codigos-de-recuperacao-regenerados');
    expect(tipos.at(-1)).toBe('reautenticacao-sensivel');
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(saida.codigosDeRecuperacao[0]);
  });

  it('TOTP errado lança ReautenticacaoNecessaria e mantém os códigos antigos', async () => {
    const { amb, usuario, ctx, regenerar } = await montar();
    await expect(regenerar.executar({ ctx, codigoMfa: '000000', ip: null })).rejects.toThrow(ReautenticacaoNecessaria);
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.codigosDisponiveis()).toBe(10);
    expect(salvo.tentativasFalhas).toBe(0);
  });

  it('sem permissão lança SemPermissao', async () => {
    const { usuario, ctx, regenerar } = await montar();
    const semPapel = new ContextoDeAcesso(usuario.id, ctx.dispositivoId, []);
    await expect(regenerar.executar({ ctx: semPapel, codigoMfa: '123456', ip: null })).rejects.toThrow(SemPermissao);
  });
});

describe('Reconfiguração de MFA (UC-16)', () => {
  it('iniciar com senha errada lança ReautenticacaoNecessaria e conta a falha', async () => {
    const { amb, usuario, ctx, iniciar } = await montar();
    await expect(iniciar.executar({ ctx, senhaAtual: 'errada', ip: null })).rejects.toThrow(ReautenticacaoNecessaria);
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.tentativasFalhas).toBe(1);
    expect(salvo.mfaPendente).toBeNull();
  });

  it('iniciar não derruba o MFA atual: login com o segredo antigo continua funcionando', async () => {
    const { amb, usuario, senha, ctx, iniciar, verificadorDeMfa } = await montar();
    const saida = await iniciar.executar({ ctx, senhaAtual: senha, ip: null });
    expect(saida.urlOtpauth).toContain(saida.segredo);
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.exigeConfigurarMfa()).toBe(false);
    expect(salvo.mfaPendente).not.toBeNull();
    const r = await verificadorDeMfa.verificar(salvo, { tipo: 'totp', valor: novoCodigoTotp(amb) }, amb.relogio.agora());
    expect(r).toEqual({ ok: true, usouRecuperacao: false });
    await expect(entrar(amb, usuario.id)).resolves.toBeDefined();
  });

  it('confirmar troca o segredo e gera 10 códigos novos', async () => {
    const { amb, usuario, senha, ctx, iniciar, confirmar } = await montar();
    const { segredo } = await iniciar.executar({ ctx, senhaAtual: senha, ip: null });
    amb.totp.codigosValidos.set('777777', 9000);
    const saida = await confirmar.executar({ ctx, codigo: '777777', ip: null });
    expect(saida.codigosDeRecuperacao).toHaveLength(10);
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.mfaPendente).toBeNull();
    expect(await amb.cofre.decifrar(salvo.segredoMfaConfirmado().bytes())).toBe(segredo);
    expect(salvo.ultimoPassoTotp()).toBe(9000);
    expect(salvo.codigosDisponiveis()).toBe(10);
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toContain('mfa-configurado');
  });

  it('confirmar com código errado lança CodigoMfaInvalido e mantém o pendente', async () => {
    const { amb, usuario, senha, ctx, iniciar, confirmar } = await montar();
    await iniciar.executar({ ctx, senhaAtual: senha, ip: null });
    await expect(confirmar.executar({ ctx, codigo: '000000', ip: null })).rejects.toThrow(CodigoMfaInvalido);
    expect((await amb.repos.usuarios.porId(usuario.id))!.mfaPendente).not.toBeNull();
  });

  it('confirmar sem iniciar lança MfaObrigatorio', async () => {
    const { ctx, confirmar } = await montar();
    await expect(confirmar.executar({ ctx, codigo: '123456', ip: null })).rejects.toThrow(MfaObrigatorio);
  });

  it('sem permissão lança SemPermissao em iniciar e confirmar', async () => {
    const { usuario, senha, ctx, iniciar, confirmar } = await montar();
    const semPapel = new ContextoDeAcesso(usuario.id, ctx.dispositivoId, []);
    await expect(iniciar.executar({ ctx: semPapel, senhaAtual: senha, ip: null })).rejects.toThrow(SemPermissao);
    await expect(confirmar.executar({ ctx: semPapel, codigo: '123456', ip: null })).rejects.toThrow(SemPermissao);
  });
});
