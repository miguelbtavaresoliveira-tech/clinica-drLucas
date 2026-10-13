import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  semearDesafio,
  semearUsuarioComMfa,
  semearUsuarioSemMfa,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import { DesafioInvalido, MfaJaConfigurado } from '../../domain/index.js';
import { GerarSegredoDeMfa } from './gerar-segredo-de-mfa.js';

function montar() {
  const amb = criarAmbienteDeTeste();
  const caso = new GerarSegredoDeMfa({
    uow: amb.uow,
    emissor: amb.emissor,
    totp: amb.totp,
    cofre: amb.cofre,
    relogio: amb.relogio,
  });
  return { amb, caso };
}

describe('GerarSegredoDeMfa', () => {
  it('grava o segredo cifrado (bytes diferentes do texto) e devolve a URL otpauth', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio } = await semearUsuarioSemMfa(amb);
    const saida = await caso.executar({ desafio });
    expect(saida.segredo).toBe('SEGREDO1');
    expect(saida.urlOtpauth).toContain('secret=SEGREDO1');
    const salvo = await amb.repos.usuarios.porId(usuario.id);
    const bytes = salvo!.segredoMfaPendenteDeConfirmacao().bytes();
    expect(new TextDecoder().decode(bytes)).not.toBe('SEGREDO1');
    expect(await amb.cofre.decifrar(bytes)).toBe('SEGREDO1');
    expect(salvo!.exigeConfigurarMfa()).toBe(true);
  });

  it('chamar de novo substitui o segredo pendente', async () => {
    const { amb, caso } = montar();
    const { usuario, desafio } = await semearUsuarioSemMfa(amb);
    await caso.executar({ desafio });
    const segunda = await caso.executar({ desafio });
    expect(segunda.segredo).toBe('SEGREDO2');
    const salvo = await amb.repos.usuarios.porId(usuario.id);
    expect(await amb.cofre.decifrar(salvo!.segredoMfaPendenteDeConfirmacao().bytes())).toBe('SEGREDO2');
  });

  it('MFA já confirmado lança MfaJaConfigurado', async () => {
    const { amb, caso } = montar();
    const { usuario } = await semearUsuarioComMfa(amb);
    const desafio = await semearDesafio(amb, usuario.id);
    await expect(caso.executar({ desafio })).rejects.toThrow(MfaJaConfigurado);
  });

  it('desafio inválido lança DesafioInvalido', async () => {
    const { caso } = montar();
    await expect(caso.executar({ desafio: 'lixo' })).rejects.toThrow(DesafioInvalido);
  });
});
