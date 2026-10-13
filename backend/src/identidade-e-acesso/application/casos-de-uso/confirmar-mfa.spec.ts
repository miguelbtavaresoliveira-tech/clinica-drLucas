import { describe, expect, it } from 'vitest';
import { criarAmbienteDeTeste, semearUsuarioSemMfa } from '../../../../test/identidade-e-acesso/fakes/index.js';
import { CodigoMfaInvalido, MfaObrigatorio } from '../../domain/index.js';
import { VerificadorDeMfa } from '../comum/verificador-de-mfa.js';
import { ConfirmarMfa } from './confirmar-mfa.js';
import { GerarSegredoDeMfa } from './gerar-segredo-de-mfa.js';

function montar() {
  const amb = criarAmbienteDeTeste();
  const gerar = new GerarSegredoDeMfa({
    uow: amb.uow,
    emissor: amb.emissor,
    totp: amb.totp,
    cofre: amb.cofre,
    relogio: amb.relogio,
  });
  const confirmar = new ConfirmarMfa({
    uow: amb.uow,
    emissor: amb.emissor,
    totp: amb.totp,
    cofre: amb.cofre,
    codigos: amb.codigos,
    verificadorDeMfa: new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos),
    relogio: amb.relogio,
    politica: amb.politica,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  amb.totp.codigosValidos.set('654321', 2000);
  return { amb, gerar, confirmar };
}

describe('ConfirmarMfa', () => {
  it('caminho feliz: 10 códigos distintos, só hashes salvos, MFA configurado e auditado', async () => {
    const { amb, gerar, confirmar } = montar();
    const { usuario, desafio } = await semearUsuarioSemMfa(amb);
    await gerar.executar({ desafio });
    const saida = await confirmar.executar({ desafio, codigo: '654321', ip: '2.2.2.2' });
    expect(saida.codigosDeRecuperacao).toHaveLength(10);
    expect(new Set(saida.codigosDeRecuperacao).size).toBe(10);
    const salvo = await amb.repos.usuarios.porId(usuario.id);
    expect(salvo!.exigeConfigurarMfa()).toBe(false);
    expect(salvo!.codigosDisponiveis()).toBe(10);
    for (const codigo of saida.codigosDeRecuperacao) {
      expect(JSON.stringify(amb.uow.estado.usuarios.get(usuario.id.valor))).not.toContain(codigo);
      expect(salvo!.codigosDeRecuperacao.some((c) => c.hash === amb.codigos.hashDe(codigo))).toBe(true);
    }
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toEqual(['mfa-configurado']);
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(saida.codigosDeRecuperacao[0]);
    expect(amb.barramento.publicados.map((e) => e.tipo)).toEqual(['MfaConfigurado']);
  });

  it('grava o passo do código confirmado (RN-10): o mesmo código não serve no ConcluirLogin', async () => {
    const { amb, gerar, confirmar } = montar();
    const { usuario, desafio } = await semearUsuarioSemMfa(amb);
    await gerar.executar({ desafio });
    await confirmar.executar({ desafio, codigo: '654321', ip: null });
    const salvo = await amb.repos.usuarios.porId(usuario.id);
    expect(salvo!.ultimoPassoTotp()).toBe(2000);
    const verificador = new VerificadorDeMfa(amb.totp, amb.cofre, amb.codigos);
    expect(await verificador.verificar(salvo!, { tipo: 'totp', valor: '654321' }, amb.relogio.agora())).toEqual({ ok: false });
  });

  it('código errado lança CodigoMfaInvalido e persiste a falha contada', async () => {
    const { amb, gerar, confirmar } = montar();
    const { usuario, desafio } = await semearUsuarioSemMfa(amb);
    await gerar.executar({ desafio });
    await expect(confirmar.executar({ desafio, codigo: '000000', ip: null })).rejects.toThrow(CodigoMfaInvalido);
    const salvo = await amb.repos.usuarios.porId(usuario.id);
    expect(salvo!.tentativasFalhas).toBe(1);
    expect(salvo!.exigeConfigurarMfa()).toBe(true);
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toEqual(['login-falhou']);
  });

  it('sem GerarSegredoDeMfa antes, lança MfaObrigatorio', async () => {
    const { amb, confirmar } = montar();
    const { desafio } = await semearUsuarioSemMfa(amb);
    await expect(confirmar.executar({ desafio, codigo: '654321', ip: null })).rejects.toThrow(MfaObrigatorio);
  });

  it('não marca o desafio como usado (o ConcluirLogin o usa em seguida)', async () => {
    const { amb, gerar, confirmar } = montar();
    const { desafio } = await semearUsuarioSemMfa(amb);
    await gerar.executar({ desafio });
    await confirmar.executar({ desafio, codigo: '654321', ip: null });
    const { id } = amb.emissor.verificarDesafio(desafio);
    expect((await amb.repos.desafios.porId(id))?.usadoEm).toBeNull();
  });
});
