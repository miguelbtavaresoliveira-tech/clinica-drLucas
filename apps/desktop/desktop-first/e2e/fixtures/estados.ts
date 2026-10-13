// Fábricas de `EstadoDoAcesso` para cenários de teste E2E.
import type { EstadoDoAcesso } from '../../src/acesso/application/tipos';

const USUARIO_DE_TESTE = { id: 'f7f6a4b0-0000-4000-8000-000000000001', nome: 'Usuária de Teste', email: 'usuaria@teste.dev' };

export function estadoSemConfiguracao(): EstadoDoAcesso {
  return {
    situacao: 'sem_configuracao',
    exigeLoginCompleto: true,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: false,
    usuario: null,
    eventosPendentes: 0,
  };
}

export function estadoBloqueado(extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso {
  return {
    situacao: 'bloqueado',
    exigeLoginCompleto: false,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: true,
    usuario: USUARIO_DE_TESTE,
    eventosPendentes: 0,
    ...extras,
  };
}

export function estadoNormal(extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso {
  return {
    situacao: 'normal',
    exigeLoginCompleto: false,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: true,
    usuario: USUARIO_DE_TESTE,
    eventosPendentes: 0,
    ...extras,
  };
}

export function estadoSomenteLeitura(): EstadoDoAcesso {
  return {
    situacao: 'somente_leitura',
    exigeLoginCompleto: false,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: false,
    usuario: USUARIO_DE_TESTE,
    eventosPendentes: 0,
  };
}

export function estadoRevogado(): EstadoDoAcesso {
  return {
    situacao: 'revogado',
    exigeLoginCompleto: false,
    biometriaDisponivel: false,
    biometriaHabilitada: false,
    segundosAteNovaTentativa: 0,
    sessaoOnline: false,
    usuario: null,
    eventosPendentes: 0,
  };
}
