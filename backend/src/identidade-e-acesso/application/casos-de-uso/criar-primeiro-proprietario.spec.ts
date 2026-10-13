import { describe, expect, it } from 'vitest';
import { criarAmbienteDeTeste, semearUsuarioComMfa } from '../../../../test/identidade-e-acesso/fakes/index.js';
import { EmailInvalido, ProprietarioJaExiste, SenhaFraca, UsuarioId } from '../../domain/index.js';
import { CriarPrimeiroProprietario } from './criar-primeiro-proprietario.js';

const SENHA = 'uma-senha-bem-forte-42';

function montar() {
  const amb = criarAmbienteDeTeste();
  const caso = new CriarPrimeiroProprietario({
    uow: amb.uow,
    hasher: amb.hasher,
    politicaDeSenha: amb.politicaDeSenha,
    politica: amb.politica,
    relogio: amb.relogio,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, caso };
}

describe('CriarPrimeiroProprietario', () => {
  it('cria o proprietário, audita, publica o evento e salva só o hash', async () => {
    const { amb, caso } = montar();
    const { usuarioId } = await caso.executar({ nome: 'Lucas', email: 'Lucas@Clinica.com', senha: SENHA });
    const usuario = await amb.repos.usuarios.porId(UsuarioId.de(usuarioId));
    expect(usuario?.ehProprietarioAtivo()).toBe(true);
    expect(usuario?.email.valor).toBe('lucas@clinica.com');
    expect(usuario?.hashDeSenha.valor).not.toBe(SENHA);
    expect(amb.repos.auditoria.registros.map((r) => r.tipo)).toEqual(['usuario-criado']);
    expect(amb.barramento.publicados.map((e) => e.tipo)).toEqual(['UsuarioCriado']);
  });

  it('a senha nunca aparece no estado persistido nem na auditoria', async () => {
    const { amb, caso } = montar();
    await caso.executar({ nome: 'Lucas', email: 'a@b.com', senha: SENHA });
    expect(JSON.stringify([...amb.uow.estado.usuarios.values()])).not.toContain(SENHA);
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain(SENHA);
  });

  it('um segundo proprietário lança ProprietarioJaExiste', async () => {
    const { amb, caso } = montar();
    await semearUsuarioComMfa(amb);
    await expect(caso.executar({ nome: 'Outro', email: 'outro@b.com', senha: SENHA })).rejects.toThrow(
      ProprietarioJaExiste,
    );
  });

  it('e-mail inválido lança EmailInvalido', async () => {
    const { caso } = montar();
    await expect(caso.executar({ nome: 'Lucas', email: 'sem-arroba', senha: SENHA })).rejects.toThrow(EmailInvalido);
  });

  it('senha fraca lança SenhaFraca e nada é salvo', async () => {
    const { amb, caso } = montar();
    await expect(caso.executar({ nome: 'Lucas', email: 'a@b.com', senha: 'curta' })).rejects.toThrow(SenhaFraca);
    expect(amb.uow.estado.usuarios.size).toBe(0);
    expect(amb.repos.auditoria.registros).toHaveLength(0);
  });

  it('senha comum é rejeitada', async () => {
    const { caso } = montar();
    await expect(caso.executar({ nome: 'Lucas', email: 'a@b.com', senha: 'fisioterapia123' })).rejects.toThrow(
      SenhaFraca,
    );
  });
});
