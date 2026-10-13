import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  entrar,
  semearUsuarioComMfa,
  semearUsuarioSemMfa,
  type AmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import { CodigoMfaInvalido, MfaObrigatorio, SenhaFraca, TokenDeRedefinicaoInvalido } from '../../domain/index.js';
import { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { ConcluirRedefinicaoDeSenha } from './concluir-redefinicao-de-senha.js';
import { SolicitarRedefinicaoDeSenha } from './solicitar-redefinicao-de-senha.js';

const NOVA = 'redefinida-com-senha-forte-9';

function montar(amb: AmbienteDeTeste = criarAmbienteDeTeste()) {
  const solicitar = new SolicitarRedefinicaoDeSenha({
    uow: amb.uow,
    emissor: amb.emissor,
    enviador: amb.email,
    relogio: amb.relogio,
    auditor: amb.auditor,
    urlRedefinicaoSenha: 'https://app.exemplo.com/redefinir',
  });
  const concluir = new ConcluirRedefinicaoDeSenha({
    uow: amb.uow,
    emissor: amb.emissor,
    hasher: amb.hasher,
    politicaDeSenha: amb.politicaDeSenha,
    politica: amb.politica,
    verificadorDeMfa: new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos),
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, solicitar, concluir };
}

/** Código TOTP novo, com passo maior que qualquer já usado. */
function novoCodigoTotp(amb: AmbienteDeTeste): string {
  const n = amb.totp.codigosValidos.size;
  const codigo = String(400000 + n);
  amb.totp.codigosValidos.set(codigo, 1001 + n);
  return codigo;
}

describe('SolicitarRedefinicaoDeSenha', () => {
  it('e-mail existente: envia 1 e-mail com o token no link e grava só o hash', async () => {
    const { amb, solicitar } = montar();
    const { usuario } = await semearUsuarioComMfa(amb);
    await solicitar.executar({ email: 'LUCAS@clinica.com', ip: '6.6.6.6' });
    expect(amb.email.enviados).toHaveLength(1);
    const enviado = amb.email.enviados[0]!;
    expect(enviado.para).toBe('lucas@clinica.com');
    expect(enviado.link).toBe(`https://app.exemplo.com/redefinir?token=${encodeURIComponent(enviado.token)}`);
    const hash = amb.emissor.hashDe(enviado.token);
    expect((await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido(hash, amb.relogio.agora()))?.valor).toBe(usuario.id.valor);
    expect(JSON.stringify([...amb.uow.estado.tokensDeRedefinicao.keys()])).not.toContain(enviado.token);
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({ tipo: 'redefinicao-de-senha-solicitada', ip: '6.6.6.6' });
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(enviado.token);
  });

  it('o token expira em 30 minutos', async () => {
    const { amb, solicitar } = montar();
    await semearUsuarioComMfa(amb);
    await solicitar.executar({ email: 'lucas@clinica.com', ip: null });
    const hash = amb.emissor.hashDe(amb.email.enviados[0]!.token);
    const limite = amb.relogio.agora().getTime() + 30 * 60_000;
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido(hash, new Date(limite - 1))).not.toBeNull();
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido(hash, new Date(limite))).toBeNull();
  });

  it('inexistente, desativado e malformado: nenhum e-mail e nenhum erro', async () => {
    const { amb, solicitar } = montar();
    const { usuario } = await semearUsuarioComMfa(amb);
    const u = (await amb.repos.usuarios.porId(usuario.id))!;
    u.desativar(amb.relogio.agora());
    await amb.repos.usuarios.salvar(u);
    await expect(solicitar.executar({ email: 'ninguem@clinica.com', ip: null })).resolves.toBeUndefined();
    await expect(solicitar.executar({ email: 'lucas@clinica.com', ip: null })).resolves.toBeUndefined();
    await expect(solicitar.executar({ email: 'malformado', ip: null })).resolves.toBeUndefined();
    expect(amb.email.enviados).toHaveLength(0);
  });

  it('uma nova solicitação invalida o token anterior', async () => {
    const { amb, solicitar } = montar();
    await semearUsuarioComMfa(amb);
    await solicitar.executar({ email: 'lucas@clinica.com', ip: null });
    await solicitar.executar({ email: 'lucas@clinica.com', ip: null });
    const [primeiro, segundo] = amb.email.enviados;
    const agora = amb.relogio.agora();
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido(amb.emissor.hashDe(primeiro!.token), agora)).toBeNull();
    expect(await amb.repos.tokensDeRedefinicao.usuarioDoTokenValido(amb.emissor.hashDe(segundo!.token), agora)).not.toBeNull();
  });

  it('falha do enviador não lança nem vaza', async () => {
    const { amb, solicitar } = montar();
    await semearUsuarioComMfa(amb);
    amb.email.falharProximo = true;
    await expect(solicitar.executar({ email: 'lucas@clinica.com', ip: null })).resolves.toBeUndefined();
  });
});

async function comTokenEmitido() {
  const ctx = montar();
  const semeado = await semearUsuarioComMfa(ctx.amb);
  await ctx.solicitar.executar({ email: 'lucas@clinica.com', ip: null });
  const token = ctx.amb.email.enviados[0]!.token;
  return { ...ctx, ...semeado, token };
}

describe('ConcluirRedefinicaoDeSenha', () => {
  it('feliz: troca a senha, revoga todas as sessões e o token não é reutilizável', async () => {
    const { amb, concluir, usuario, token } = await comTokenEmitido();
    await entrar(amb, usuario.id);
    await entrar(amb, usuario.id);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(2);
    await concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null });
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(await amb.hasher.conferir(NOVA, salvo.hashDeSenha)).toBe(true);
    expect(await amb.repos.sessoes.ativasDoUsuario(usuario.id)).toHaveLength(0);
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toContain('senha-alterada');
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(NOVA);
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).rejects.toThrow(TokenDeRedefinicaoInvalido);
  });

  it('token expirado (+31 min) lança TokenDeRedefinicaoInvalido', async () => {
    const { amb, concluir, token } = await comTokenEmitido();
    amb.relogio.avancar(31 * 60_000);
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).rejects.toThrow(TokenDeRedefinicaoInvalido);
  });

  it('token desconhecido lança TokenDeRedefinicaoInvalido', async () => {
    const { amb, concluir } = await comTokenEmitido();
    await expect(
      concluir.executar({ token: 'lixo', novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).rejects.toThrow(TokenDeRedefinicaoInvalido);
  });

  it('exige MFA: código errado lança CodigoMfaInvalido, consome o token e conta a falha', async () => {
    const { amb, concluir, usuario, senha, token } = await comTokenEmitido();
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: '000000' }, ip: null }),
    ).rejects.toThrow(CodigoMfaInvalido);
    const salvo = (await amb.repos.usuarios.porId(usuario.id))!;
    expect(salvo.tentativasFalhas).toBe(1);
    expect(await amb.hasher.conferir(senha, salvo.hashDeSenha)).toBe(true);
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).rejects.toThrow(TokenDeRedefinicaoInvalido);
  });

  it('senha fraca lança SenhaFraca e o token continua válido', async () => {
    const { amb, concluir, token } = await comTokenEmitido();
    await expect(
      concluir.executar({ token, novaSenha: 'curta', codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).rejects.toThrow(SenhaFraca);
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: novoCodigoTotp(amb) }, ip: null }),
    ).resolves.toBeUndefined();
  });

  it('código de recuperação também conclui a redefinição', async () => {
    const { amb, concluir, usuario, codigosDeRecuperacao, token } = await comTokenEmitido();
    await concluir.executar({
      token,
      novaSenha: NOVA,
      codigo: { tipo: 'recuperacao', valor: codigosDeRecuperacao[0]! },
      ip: null,
    });
    expect((await amb.repos.usuarios.porId(usuario.id))!.codigosDisponiveis()).toBe(9);
  });

  it('usuário sem MFA configurado lança MfaObrigatorio', async () => {
    const { amb, solicitar, concluir } = montar();
    await semearUsuarioSemMfa(amb, { email: 'novo@clinica.com' });
    await solicitar.executar({ email: 'novo@clinica.com', ip: null });
    const token = amb.email.enviados[0]!.token;
    await expect(
      concluir.executar({ token, novaSenha: NOVA, codigo: { tipo: 'totp', valor: '123456' }, ip: null }),
    ).rejects.toThrow(MfaObrigatorio);
  });
});
