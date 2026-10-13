import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO } from '../acesso/politica-de-acesso.js';
import { DispositivoId } from '../dispositivo/dispositivo-id.js';
import {
  CodigoMfaInvalido,
  ContaBloqueada,
  ContaDesativada,
  DadoInvalido,
  MfaJaConfigurado,
  MfaObrigatorio,
} from '../erros.js';
import { Email } from './email.js';
import { HashDeSenha } from './hash-de-senha.js';
import { SegredoTotpCifrado } from './segredo-totp-cifrado.js';
import { Usuario, type NovoCodigo, type PropsUsuario } from './usuario.js';
import { UsuarioId } from './usuario-id.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const HASH = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
const HASH2 = HashDeSenha.de('$argon2id$v=19$m=19456,t=2,p=1$ghi$jkl');
const segredo = (n: number): SegredoTotpCifrado => SegredoTotpCifrado.de(new Uint8Array(30).fill(n));

const fabricarUsuario = (overrides: Partial<PropsUsuario> = {}): Usuario =>
  Usuario.reconstituir({
    id: UsuarioId.novo(),
    nome: 'Lucas',
    email: Email.criar('lucas@x.com'),
    situacao: 'ativo',
    papeis: ['proprietario'],
    hashDeSenha: HASH,
    senhaAlteradaEm: T0,
    mfa: null,
    mfaPendente: null,
    codigosDeRecuperacao: [],
    tentativasFalhas: 0,
    bloqueadoAte: null,
    criadoEm: T0,
    versao: 0,
    ...overrides,
  });

const dezCodigos = (prefixo = 'a'): NovoCodigo[] =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a${String(i).padStart(2, '0')}`,
    hash: `${prefixo}${String(i)}`.padEnd(64, '0'),
  }));

const comMfaConfirmado = (): Usuario => {
  const u = fabricarUsuario();
  u.prepararMfa(segredo(1));
  u.confirmarMfa(100, dezCodigos(), T0);
  u.puxarEventos();
  return u;
};

const falhar = (u: Usuario, quando: Date): void => u.registrarFalhaDeLogin(quando, POLITICA_PADRAO, 'senha');

describe('Usuario — criação', () => {
  it('cria ativo, versão 0, emite UsuarioCriado', () => {
    const u = Usuario.criar({ nome: ' Lucas ', email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 });
    expect(u.nome).toBe('Lucas');
    expect(u.situacao).toBe('ativo');
    expect(u.versao).toBe(0);
    expect(u.mfa).toBeNull();
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['UsuarioCriado']);
  });

  it.each(['', '   ', 'a'.repeat(121)])('rejeita nome %j', (nome) => {
    expect(() => Usuario.criar({ nome, email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: ['proprietario'], agora: T0 })).toThrow(DadoInvalido);
  });

  it('rejeita lista de papéis vazia', () => {
    expect(() => Usuario.criar({ nome: 'x', email: Email.criar('a@b.com'), hashDeSenha: HASH, papeis: [], agora: T0 })).toThrow(DadoInvalido);
  });

  it('reconstituir não emite eventos', () => {
    expect(fabricarUsuario().puxarEventos()).toEqual([]);
  });

  it('getters de coleções devolvem cópias', () => {
    const u = fabricarUsuario();
    u.papeis.push('proprietario');
    expect(u.papeis).toHaveLength(1);
  });
});

describe('Usuario — bloqueio progressivo (RN-13)', () => {
  it('4 falhas não bloqueiam; a 5ª bloqueia por 1 min e emite UsuarioBloqueado + LoginFalhou', () => {
    const u = fabricarUsuario();
    for (let i = 0; i < 4; i++) falhar(u, T0);
    expect(u.bloqueadoAte).toBeNull();
    u.puxarEventos();
    falhar(u, T0);
    expect(u.bloqueadoAte?.getTime()).toBe(T0.getTime() + 60_000);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['UsuarioBloqueado', 'LoginFalhou']);
  });

  it('o degrau sobe: 1, 5, 15, 60 e permanece em 60', () => {
    const u = fabricarUsuario();
    const esperados = [1, 5, 15, 60, 60];
    for (let i = 0; i < 4; i++) falhar(u, T0);
    esperados.forEach((min) => {
      falhar(u, T0);
      expect(u.bloqueadoAte?.getTime()).toBe(T0.getTime() + min * 60_000);
    });
  });

  it('dentro do bloqueio lança ContaBloqueada com ate correto; no instante exato não lança', () => {
    const ate = new Date(T0.getTime() + 60_000);
    const u = fabricarUsuario({ bloqueadoAte: ate });
    let erro: unknown;
    try {
      u.garantirQuePodeAutenticar(new Date(ate.getTime() - 1));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ContaBloqueada);
    expect((erro as ContaBloqueada).ate).toBe(ate);
    expect(() => u.garantirQuePodeAutenticar(ate)).not.toThrow();
  });

  it('login completo zera o contador e emite LoginRealizado', () => {
    const u = fabricarUsuario();
    for (let i = 0; i < 4; i++) falhar(u, T0);
    u.puxarEventos();
    u.registrarLoginCompleto(T0, DispositivoId.novo());
    expect(u.tentativasFalhas).toBe(0);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['LoginRealizado']);
    falhar(u, T0);
    expect(u.bloqueadoAte).toBeNull();
  });

  it('usuário desativado lança ContaDesativada', () => {
    expect(() => fabricarUsuario({ situacao: 'desativado' }).garantirQuePodeAutenticar(T0)).toThrow(ContaDesativada);
  });
});

describe('Usuario — MFA', () => {
  it('fluxo: exige configurar → preparar → confirmar → não exige; preparar de novo lança', () => {
    const u = fabricarUsuario();
    expect(u.exigeConfigurarMfa()).toBe(true);
    u.prepararMfa(segredo(1));
    expect(u.exigeConfigurarMfa()).toBe(true);
    u.confirmarMfa(100, dezCodigos(), T0);
    expect(u.exigeConfigurarMfa()).toBe(false);
    expect(u.codigosDisponiveis()).toBe(10);
    expect(() => u.prepararMfa(segredo(2))).toThrow(MfaJaConfigurado);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['MfaConfigurado']);
  });

  it('confirmarMfa com 9 códigos lança DadoInvalido', () => {
    const u = fabricarUsuario();
    u.prepararMfa(segredo(1));
    expect(() => u.confirmarMfa(100, dezCodigos().slice(0, 9), T0)).toThrow(DadoInvalido);
  });

  it('segredos: sem MFA lança MfaObrigatorio; após confirmar, o pendente lança MfaJaConfigurado', () => {
    const u = fabricarUsuario();
    expect(() => u.segredoMfaPendenteDeConfirmacao()).toThrow(MfaObrigatorio);
    expect(() => u.segredoMfaConfirmado()).toThrow(MfaObrigatorio);
    u.prepararMfa(segredo(1));
    expect(u.segredoMfaPendenteDeConfirmacao().bytes()[0]).toBe(1);
    u.confirmarMfa(100, dezCodigos(), T0);
    expect(() => u.segredoMfaPendenteDeConfirmacao()).toThrow(MfaJaConfigurado);
    expect(u.segredoMfaConfirmado().bytes()[0]).toBe(1);
  });

  it('RN-10: passo repetido ou anterior é rejeitado; posterior é aceito', () => {
    const u = comMfaConfirmado();
    expect(u.ultimoPassoTotp()).toBe(100);
    expect(() => u.aceitarPassoTotp(100)).toThrow(CodigoMfaInvalido);
    expect(() => u.aceitarPassoTotp(99)).toThrow(CodigoMfaInvalido);
    u.aceitarPassoTotp(101);
    expect(u.ultimoPassoTotp()).toBe(101);
  });
});

describe('Usuario — códigos de recuperação', () => {
  it('consumir reduz para 9 e emite evento com restantes: 9', () => {
    const u = comMfaConfirmado();
    const hash = dezCodigos()[0]!.hash;
    u.consumirCodigoDeRecuperacao(hash, T0);
    expect(u.codigosDisponiveis()).toBe(9);
    const [evento] = u.puxarEventos();
    expect(evento).toMatchObject({ tipo: 'CodigoDeRecuperacaoUsado', restantes: 9 });
  });

  it('reuso do mesmo hash e hash inexistente lançam CodigoMfaInvalido', () => {
    const u = comMfaConfirmado();
    const hash = dezCodigos()[0]!.hash;
    u.consumirCodigoDeRecuperacao(hash, T0);
    expect(() => u.consumirCodigoDeRecuperacao(hash, T0)).toThrow(CodigoMfaInvalido);
    expect(() => u.consumirCodigoDeRecuperacao('f'.repeat(64), T0)).toThrow(CodigoMfaInvalido);
  });

  it('substituir exige MFA confirmado, exige 10 códigos e emite evento', () => {
    expect(() => fabricarUsuario().substituirCodigosDeRecuperacao(dezCodigos(), T0)).toThrow(MfaObrigatorio);
    const u = comMfaConfirmado();
    expect(() => u.substituirCodigosDeRecuperacao(dezCodigos().slice(0, 3), T0)).toThrow(DadoInvalido);
    u.substituirCodigosDeRecuperacao(dezCodigos('b'), T0);
    expect(u.codigosDisponiveis()).toBe(10);
    expect(u.codigosDeRecuperacao[0]?.hash.startsWith('b0')).toBe(true);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['CodigosDeRecuperacaoRegenerados']);
  });
});

describe('Usuario — reconfiguração de MFA (D-010)', () => {
  it('iniciar não altera o MFA atual; confirmar troca o segredo, zera pendente e gera códigos novos', () => {
    const u = comMfaConfirmado();
    u.iniciarReconfiguracaoMfa(segredo(9));
    expect(u.segredoMfaConfirmado().bytes()[0]).toBe(1);
    expect(u.mfaPendente?.bytes()[0]).toBe(9);
    u.confirmarReconfiguracaoMfa(500, dezCodigos('c'), T0);
    expect(u.segredoMfaConfirmado().bytes()[0]).toBe(9);
    expect(u.mfaPendente).toBeNull();
    expect(u.ultimoPassoTotp()).toBe(500);
    expect(u.codigosDeRecuperacao[0]?.hash.startsWith('c0')).toBe(true);
  });

  it('exige MFA confirmado para iniciar e pendente para confirmar', () => {
    expect(() => fabricarUsuario().iniciarReconfiguracaoMfa(segredo(2))).toThrow(MfaObrigatorio);
    expect(() => comMfaConfirmado().confirmarReconfiguracaoMfa(1, dezCodigos(), T0)).toThrow(MfaObrigatorio);
  });
});

describe('Usuario — senha, desativação e redefinição', () => {
  it('trocarSenha atualiza hash, data e emite SenhaAlterada', () => {
    const u = fabricarUsuario();
    const depois = new Date(T0.getTime() + 1000);
    u.trocarSenha(HASH2, depois);
    expect(u.hashDeSenha).toBe(HASH2);
    expect(u.senhaAlteradaEm).toBe(depois);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['SenhaAlterada']);
  });

  it('desativar duas vezes emite um único evento', () => {
    const u = fabricarUsuario();
    u.desativar(T0);
    u.desativar(T0);
    expect(u.situacao).toBe('desativado');
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['UsuarioDesativado']);
  });

  it('redefinirAcessoAdministrativamente limpa MFA, códigos e bloqueio e emite dois eventos', () => {
    const u = comMfaConfirmado();
    u.iniciarReconfiguracaoMfa(segredo(3));
    for (let i = 0; i < 5; i++) falhar(u, T0);
    u.puxarEventos();
    u.redefinirAcessoAdministrativamente(HASH2, T0);
    expect(u.exigeConfigurarMfa()).toBe(true);
    expect(u.mfaPendente).toBeNull();
    expect(u.codigosDeRecuperacao).toHaveLength(0);
    expect(u.bloqueadoAte).toBeNull();
    expect(u.tentativasFalhas).toBe(0);
    expect(u.hashDeSenha).toBe(HASH2);
    expect(u.puxarEventos().map((e) => e.tipo)).toEqual(['AcessoRedefinidoAdministrativamente', 'SenhaAlterada']);
  });

  it('ehProprietarioAtivo considera papel e situação', () => {
    expect(fabricarUsuario().ehProprietarioAtivo()).toBe(true);
    expect(fabricarUsuario({ situacao: 'desativado' }).ehProprietarioAtivo()).toBe(false);
  });

  it('definirVersaoPersistida atualiza a versão', () => {
    const u = fabricarUsuario();
    u.definirVersaoPersistida(4);
    expect(u.versao).toBe(4);
  });
});
