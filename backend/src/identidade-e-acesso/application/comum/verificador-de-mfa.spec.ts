import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  semearUsuarioComMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import { VerificadorDeMfa } from './verificador-de-mfa.js';

async function preparar() {
  const amb = criarAmbienteDeTeste();
  const semeado = await semearUsuarioComMfa(amb);
  const usuario = (await amb.repos.usuarios.porId(semeado.usuario.id))!;
  const verificador = new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos);
  return { amb, semeado, usuario, verificador };
}

describe('VerificadorDeMfa', () => {
  it('TOTP válido é aceito e o passo é gravado', async () => {
    const { amb, usuario, verificador } = await preparar();
    const r = await verificador.verificar(usuario, { tipo: 'totp', valor: '123456' }, amb.relogio.agora());
    expect(r).toEqual({ ok: true, usouRecuperacao: false });
    expect(usuario.ultimoPassoTotp()).toBe(1001);
  });

  it('RN-10: o mesmo código de novo é recusado', async () => {
    const { amb, usuario, verificador } = await preparar();
    await verificador.verificar(usuario, { tipo: 'totp', valor: '123456' }, amb.relogio.agora());
    const r = await verificador.verificar(usuario, { tipo: 'totp', valor: '123456' }, amb.relogio.agora());
    expect(r).toEqual({ ok: false });
  });

  it.each(['12345', 'abcdef', '1234567', ''])('TOTP %j recusado sem chamar o serviço', async (valor) => {
    const { amb, usuario, verificador } = await preparar();
    const r = await verificador.verificar(usuario, { tipo: 'totp', valor }, amb.relogio.agora());
    expect(r).toEqual({ ok: false });
    expect(amb.totp.chamadasDeVerificar).toBe(0);
  });

  it('TOTP desconhecido é recusado', async () => {
    const { amb, usuario, verificador } = await preparar();
    expect(await verificador.verificar(usuario, { tipo: 'totp', valor: '000000' }, amb.relogio.agora())).toEqual({
      ok: false,
    });
  });

  it('código de recuperação válido: usouRecuperacao e 9 restantes', async () => {
    const { amb, semeado, usuario, verificador } = await preparar();
    const r = await verificador.verificar(
      usuario,
      { tipo: 'recuperacao', valor: semeado.codigosDeRecuperacao[0] as string },
      amb.relogio.agora(),
    );
    expect(r).toEqual({ ok: true, usouRecuperacao: true });
    expect(usuario.codigosDisponiveis()).toBe(9);
  });

  it('código de recuperação reutilizado é recusado', async () => {
    const { amb, semeado, usuario, verificador } = await preparar();
    const codigo = { tipo: 'recuperacao', valor: semeado.codigosDeRecuperacao[0] as string } as const;
    await verificador.verificar(usuario, codigo, amb.relogio.agora());
    expect(await verificador.verificar(usuario, codigo, amb.relogio.agora())).toEqual({ ok: false });
  });

  it('código de recuperação com hífens e minúsculas é aceito', async () => {
    const { amb, usuario, verificador } = await preparar();
    const r = await verificador.verificar(
      usuario,
      { tipo: 'recuperacao', valor: 'test-0000-0000-0001' },
      amb.relogio.agora(),
    );
    expect(r.ok).toBe(true);
  });

  it('código de recuperação com tamanho fora de 16–19 é recusado', async () => {
    const { amb, usuario, verificador } = await preparar();
    expect(await verificador.verificar(usuario, { tipo: 'recuperacao', valor: 'curto' }, amb.relogio.agora())).toEqual({
      ok: false,
    });
    expect(
      await verificador.verificar(usuario, { tipo: 'recuperacao', valor: 'x'.repeat(20) }, amb.relogio.agora()),
    ).toEqual({ ok: false });
  });

  it('código de recuperação inexistente é recusado', async () => {
    const { amb, usuario, verificador } = await preparar();
    expect(
      await verificador.verificar(usuario, { tipo: 'recuperacao', valor: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, amb.relogio.agora()),
    ).toEqual({ ok: false });
  });

  it('verificarSegredo aceita o código válido e devolve o passo', async () => {
    const { usuario, verificador } = await preparar();
    expect(await verificador.verificarSegredo(usuario.segredoMfaConfirmado(), '123456', null)).toEqual({
      ok: true,
      passo: 1001,
    });
    expect(await verificador.verificarSegredo(usuario.segredoMfaConfirmado(), '123456', 1001)).toEqual({ ok: false });
  });
});
