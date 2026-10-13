import { describe, expect, it } from 'vitest';
import { destinoPara, rotaPadrao, type NomeDaRota } from './fluxo-de-acesso';
import type { EstadoDoAcesso, Situacao } from './tipos';

function estado(situacao: Situacao, extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso {
  return {
    situacao,
    exigeLoginCompleto: false,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: false,
    usuario: null,
    eventosPendentes: 0,
    ...extras,
  };
}

describe('rotaPadrao', () => {
  it.each<[string, EstadoDoAcesso, NomeDaRota]>([
    ['revogado', estado('revogado'), 'dispositivo-revogado'],
    ['sem_configuracao', estado('sem_configuracao'), 'login'],
    ['bloqueado sem exigir login completo', estado('bloqueado'), 'desbloqueio'],
    ['bloqueado exigindo login completo', estado('bloqueado', { exigeLoginCompleto: true }), 'login'],
    ['offline_expirado', estado('offline_expirado'), 'conectar'],
    ['normal', estado('normal'), 'inicio'],
    ['somente_leitura', estado('somente_leitura'), 'inicio'],
  ])('%s → %s', (_nome, e, esperado) => {
    expect(rotaPadrao(e)).toBe(esperado);
  });
});

const NORMAL = estado('normal', { sessaoOnline: true });
const LEITURA = estado('somente_leitura');
const BLOQUEADO = estado('bloqueado');
const BLOQUEADO_LOGIN = estado('bloqueado', { exigeLoginCompleto: true });
const SEM_CONFIG_ONLINE = estado('sem_configuracao', { sessaoOnline: true });
const SEM_CONFIG_OFFLINE = estado('sem_configuracao', { sessaoOnline: false });
const EXPIRADO = estado('offline_expirado');
const REVOGADO = estado('revogado');

type Linha = [string, NomeDaRota, EstadoDoAcesso, 'configurar' | 'verificar' | null, NomeDaRota | null];

const tabela: Linha[] = [
  // revogado: só a tela de revogação
  ['revogado → login', 'login', REVOGADO, null, 'dispositivo-revogado'],
  ['revogado → inicio', 'inicio', REVOGADO, null, 'dispositivo-revogado'],
  ['revogado → redefinir-senha', 'redefinir-senha', REVOGADO, null, 'dispositivo-revogado'],
  ['revogado → mfa-verificar com desafio', 'mfa-verificar', REVOGADO, 'verificar', 'dispositivo-revogado'],
  ['revogado → dispositivo-revogado', 'dispositivo-revogado', REVOGADO, null, null],
  // tela de revogação só com revogado
  ['normal → dispositivo-revogado', 'dispositivo-revogado', NORMAL, null, 'inicio'],
  ['bloqueado → dispositivo-revogado', 'dispositivo-revogado', BLOQUEADO, null, 'desbloqueio'],
  ['bloqueado c/ login completo → dispositivo-revogado', 'dispositivo-revogado', BLOQUEADO_LOGIN, null, 'login'],
  ['sem_configuracao → dispositivo-revogado', 'dispositivo-revogado', SEM_CONFIG_ONLINE, null, 'login'],
  ['offline_expirado → dispositivo-revogado', 'dispositivo-revogado', EXPIRADO, null, 'conectar'],
  // login e redefinir-senha: sempre (exceto revogado)
  ['normal → login', 'login', NORMAL, null, null],
  ['bloqueado → login', 'login', BLOQUEADO, null, null],
  ['offline_expirado → login', 'login', EXPIRADO, null, null],
  ['sem_configuracao → redefinir-senha', 'redefinir-senha', SEM_CONFIG_OFFLINE, null, null],
  ['bloqueado → redefinir-senha', 'redefinir-senha', BLOQUEADO, null, null],
  // MFA depende do desafio em memória
  ['mfa-configurar sem desafio', 'mfa-configurar', SEM_CONFIG_OFFLINE, null, 'login'],
  ['mfa-configurar com desafio configurar', 'mfa-configurar', SEM_CONFIG_OFFLINE, 'configurar', null],
  ['mfa-configurar com desafio verificar', 'mfa-configurar', SEM_CONFIG_OFFLINE, 'verificar', 'login'],
  ['mfa-verificar sem desafio', 'mfa-verificar', SEM_CONFIG_OFFLINE, null, 'login'],
  ['mfa-verificar com desafio verificar', 'mfa-verificar', SEM_CONFIG_OFFLINE, 'verificar', null],
  ['mfa-verificar com desafio configurar', 'mfa-verificar', SEM_CONFIG_OFFLINE, 'configurar', null],
  ['mfa-verificar bloqueado c/ login completo e desafio', 'mfa-verificar', BLOQUEADO_LOGIN, 'verificar', null],
  // senha mestre: só sem configuração e online
  ['definir-senha-mestre sem_configuracao online', 'definir-senha-mestre', SEM_CONFIG_ONLINE, null, null],
  ['definir-senha-mestre sem_configuracao offline', 'definir-senha-mestre', SEM_CONFIG_OFFLINE, null, 'login'],
  ['definir-senha-mestre normal', 'definir-senha-mestre', NORMAL, null, 'inicio'],
  ['definir-senha-mestre bloqueado', 'definir-senha-mestre', BLOQUEADO, null, 'desbloqueio'],
  // desbloqueio: só bloqueado
  ['desbloqueio bloqueado', 'desbloqueio', BLOQUEADO, null, null],
  ['desbloqueio bloqueado c/ login completo', 'desbloqueio', BLOQUEADO_LOGIN, null, null],
  ['desbloqueio normal', 'desbloqueio', NORMAL, null, 'inicio'],
  ['desbloqueio sem_configuracao', 'desbloqueio', SEM_CONFIG_ONLINE, null, 'login'],
  ['desbloqueio offline_expirado', 'desbloqueio', EXPIRADO, null, 'conectar'],
  // conectar: só offline_expirado
  ['conectar offline_expirado', 'conectar', EXPIRADO, null, null],
  ['conectar normal', 'conectar', NORMAL, null, 'inicio'],
  ['conectar bloqueado', 'conectar', BLOQUEADO, null, 'desbloqueio'],
  // telas do app: só normal ou somente_leitura
  ['inicio normal', 'inicio', NORMAL, null, null],
  ['inicio somente_leitura', 'inicio', LEITURA, null, null],
  ['inicio bloqueado', 'inicio', BLOQUEADO, null, 'desbloqueio'],
  ['inicio bloqueado c/ login completo', 'inicio', BLOQUEADO_LOGIN, null, 'login'],
  ['inicio sem_configuracao', 'inicio', SEM_CONFIG_ONLINE, null, 'login'],
  ['inicio offline_expirado', 'inicio', EXPIRADO, null, 'conectar'],
  ['dispositivos normal', 'dispositivos', NORMAL, null, null],
  ['dispositivos somente_leitura', 'dispositivos', LEITURA, null, null],
  ['dispositivos bloqueado', 'dispositivos', BLOQUEADO, null, 'desbloqueio'],
  ['dispositivos offline_expirado', 'dispositivos', EXPIRADO, null, 'conectar'],
  ['seguranca normal', 'seguranca', NORMAL, null, null],
  ['seguranca somente_leitura', 'seguranca', LEITURA, null, null],
  ['seguranca sem_configuracao', 'seguranca', SEM_CONFIG_OFFLINE, null, 'login'],
  ['seguranca offline_expirado', 'seguranca', EXPIRADO, null, 'conectar'],
];

describe('destinoPara', () => {
  it('a tabela cobre ao menos 30 combinações', () => {
    expect(tabela.length).toBeGreaterThanOrEqual(30);
  });

  it.each(tabela)('%s', (_nome, rota, e, mfaPendente, esperado) => {
    expect(destinoPara(rota, { estado: e, mfaPendente })).toBe(esperado);
  });

  it('o destino do redirecionamento nunca redireciona de novo (sem laços)', () => {
    const rotas: NomeDaRota[] = [
      'inicio', 'login', 'mfa-configurar', 'mfa-verificar', 'redefinir-senha', 'definir-senha-mestre',
      'desbloqueio', 'dispositivos', 'seguranca', 'conectar', 'dispositivo-revogado',
    ];
    const estados = [NORMAL, LEITURA, BLOQUEADO, BLOQUEADO_LOGIN, SEM_CONFIG_ONLINE, SEM_CONFIG_OFFLINE, EXPIRADO, REVOGADO];
    for (const e of estados) {
      for (const mfaPendente of [null, 'configurar', 'verificar'] as const) {
        for (const rota of rotas) {
          const destino = destinoPara(rota, { estado: e, mfaPendente });
          if (destino !== null) expect(destinoPara(destino, { estado: e, mfaPendente })).toBeNull();
        }
      }
    }
  });
});
