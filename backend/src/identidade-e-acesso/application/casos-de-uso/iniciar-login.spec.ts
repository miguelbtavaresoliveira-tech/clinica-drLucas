import { describe, expect, it } from 'vitest';
import {
  criarAmbienteDeTeste,
  semearUsuarioComMfa,
  type AmbienteDeTeste,
} from '../../../../test/identidade-e-acesso/fakes/index.js';
import {
  ContaBloqueada,
  ContaDesativada,
  CredenciaisInvalidas,
  Email,
  HashDeSenha,
  Usuario,
} from '../../domain/index.js';
import { IniciarLogin } from './iniciar-login.js';

function montar(amb: AmbienteDeTeste = criarAmbienteDeTeste()) {
  const caso = new IniciarLogin({
    uow: amb.uow,
    hasher: amb.hasher,
    emissor: amb.emissor,
    relogio: amb.relogio,
    politica: amb.politica,
    auditor: amb.auditor,
    barramento: amb.barramento,
  });
  return { amb, caso };
}

async function capturar(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (e) {
    return e as Error;
  }
  throw new Error('esperava erro');
}

describe('IniciarLogin', () => {
  it('login feliz com MFA confirmado devolve verificar e grava o desafio por 5 minutos', async () => {
    const { amb, caso } = montar();
    const { senha } = await semearUsuarioComMfa(amb);
    const saida = await caso.executar({ email: 'lucas@clinica.com', senha, ip: '1.1.1.1' });
    expect(saida.mfa).toBe('verificar');
    expect(saida.expiraEm.getTime()).toBe(amb.relogio.agora().getTime() + 5 * 60_000);
    const { id } = amb.emissor.verificarDesafio(saida.desafio);
    const linha = await amb.repos.desafios.porId(id);
    expect(linha?.expiraEm).toEqual(saida.expiraEm);
    expect(linha?.usadoEm).toBeNull();
  });

  it('primeiro login (sem MFA) devolve configurar', async () => {
    const { amb, caso } = montar();
    const hash = await amb.hasher.gerar('senha-de-teste-forte-123');
    const u = Usuario.criar({
      nome: 'Novo',
      email: Email.criar('novo@clinica.com'),
      hashDeSenha: hash,
      papeis: ['proprietario'],
      agora: amb.relogio.agora(),
    });
    await amb.repos.usuarios.salvar(u);
    const saida = await caso.executar({ email: 'novo@clinica.com', senha: 'senha-de-teste-forte-123', ip: null });
    expect(saida.mfa).toBe('configurar');
  });

  it('e-mail inexistente e senha errada dão a mesma resposta; o inexistente faz conferência fictícia', async () => {
    const { amb, caso } = montar();
    await semearUsuarioComMfa(amb);
    const inexistente = await capturar(caso.executar({ email: 'ninguem@clinica.com', senha: 'x', ip: null }));
    expect(amb.hasher.chamadasFicticias).toBe(1);
    const errada = await capturar(caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null }));
    expect(inexistente).toBeInstanceOf(CredenciaisInvalidas);
    expect(errada).toBeInstanceOf(CredenciaisInvalidas);
    expect(errada.message).toBe(inexistente.message);
  });

  it('e-mail malformado lança CredenciaisInvalidas e faz conferência fictícia', async () => {
    const { amb, caso } = montar();
    const erro = await capturar(caso.executar({ email: 'sem-arroba', senha: 'x', ip: null }));
    expect(erro).toBeInstanceOf(CredenciaisInvalidas);
    expect(amb.hasher.chamadasFicticias).toBe(1);
  });

  it('5 senhas erradas persistem o contador e a 6ª tentativa lança ContaBloqueada', async () => {
    const { amb, caso } = montar();
    const { usuario } = await semearUsuarioComMfa(amb);
    for (let i = 0; i < 5; i++) {
      await expect(caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null })).rejects.toThrow(
        CredenciaisInvalidas,
      );
    }
    expect((await amb.repos.usuarios.porId(usuario.id))?.tentativasFalhas).toBe(5);
    await expect(caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null })).rejects.toThrow(
      ContaBloqueada,
    );
    const tipos = amb.repos.auditoria.registros.map((r) => r.tipo);
    expect(tipos).toContain('usuario-bloqueado');
    expect(tipos.filter((t) => t === 'login-falhou')).toHaveLength(6);
  });

  it('conta bloqueada não confere a senha, mesmo a correta', async () => {
    const { amb, caso } = montar();
    const { senha } = await semearUsuarioComMfa(amb);
    for (let i = 0; i < 5; i++) {
      await caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null }).catch(() => undefined);
    }
    await expect(caso.executar({ email: 'lucas@clinica.com', senha, ip: null })).rejects.toThrow(ContaBloqueada);
  });

  it('senha correta não zera tentativasFalhas', async () => {
    const { amb, caso } = montar();
    const { usuario, senha } = await semearUsuarioComMfa(amb);
    await caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null }).catch(() => undefined);
    await caso.executar({ email: 'lucas@clinica.com', senha, ip: null });
    expect((await amb.repos.usuarios.porId(usuario.id))?.tentativasFalhas).toBe(1);
  });

  it('conta desativada lança ContaDesativada e audita login-falhou com o motivo', async () => {
    const { amb, caso } = montar();
    const { usuario, senha } = await semearUsuarioComMfa(amb);
    const u = (await amb.repos.usuarios.porId(usuario.id))!;
    u.desativar(amb.relogio.agora());
    await amb.repos.usuarios.salvar(u);
    await expect(caso.executar({ email: 'lucas@clinica.com', senha, ip: null })).rejects.toThrow(ContaDesativada);
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({
      tipo: 'login-falhou',
      detalhe: { motivo: 'conta-desativada' },
    });
  });

  it('a auditoria de falha não contém a senha', async () => {
    const { amb, caso } = montar();
    await semearUsuarioComMfa(amb);
    await caso.executar({ email: 'lucas@clinica.com', senha: 'tentativa-secreta-xyz', ip: '9.9.9.9' }).catch(() => undefined);
    expect(JSON.stringify(amb.repos.auditoria.registros)).not.toContain('tentativa-secreta-xyz');
    expect(amb.repos.auditoria.registros.at(-1)).toMatchObject({ tipo: 'login-falhou', ip: '9.9.9.9' });
  });

  it('publica no barramento os eventos do caminho de falha persistido', async () => {
    const { amb, caso } = montar();
    await semearUsuarioComMfa(amb);
    await caso.executar({ email: 'lucas@clinica.com', senha: 'errada', ip: null }).catch(() => undefined);
    expect(amb.barramento.publicados.map((e) => e.tipo)).toEqual(['LoginFalhou']);
  });

  it('HashDeSenha do usuário semeado não é a senha em claro', async () => {
    const { amb } = montar();
    const { usuario, senha } = await semearUsuarioComMfa(amb);
    expect(usuario.hashDeSenha).toBeInstanceOf(HashDeSenha);
    expect(usuario.hashDeSenha.valor).not.toContain(senha);
  });
});
