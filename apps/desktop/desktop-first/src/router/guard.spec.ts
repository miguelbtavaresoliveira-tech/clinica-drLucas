import { createMemoryHistory } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoDoAcesso, Situacao } from '../acesso/application/tipos';
import { criarRoteador } from './index';

const estado = (situacao: Situacao, extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso => ({
  situacao,
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: null,
  eventosPendentes: 0,
  ...extras,
});

function roteador(inicial: EstadoDoAcesso | null, mfa: 'configurar' | 'verificar' | null = null, carregado?: EstadoDoAcesso) {
  let atual = inicial;
  const carregar = vi.fn(() => {
    if (!carregado) return Promise.reject(new Error('falha'));
    atual = carregado;
    return Promise.resolve(carregado);
  });
  const r = criarRoteador(createMemoryHistory(), { estado: () => atual, carregar, mfaPendente: () => mfa });
  return { r, carregar };
}

describe('guard do roteador', () => {
  it('redireciona bloqueado que tenta abrir a página inicial para o desbloqueio', async () => {
    const { r } = roteador(estado('bloqueado'));
    await r.push('/');
    expect(r.currentRoute.value.name).toBe('desbloqueio');
  });

  it('permite o início quando está normal', async () => {
    const { r } = roteador(estado('normal'));
    await r.push('/');
    expect(r.currentRoute.value.name).toBe('inicio');
  });

  it('revogado só vê a tela de revogação', async () => {
    const { r } = roteador(estado('revogado'));
    await r.push('/entrar');
    expect(r.currentRoute.value.name).toBe('dispositivo-revogado');
  });

  it('MFA sem desafio em memória volta para o login', async () => {
    const { r } = roteador(estado('sem_configuracao'));
    await r.push('/entrar/mfa/verificar');
    expect(r.currentRoute.value.name).toBe('login');
  });

  it('MFA com desafio em memória é permitido', async () => {
    const { r } = roteador(estado('sem_configuracao'), 'configurar');
    await r.push('/entrar/mfa/configurar');
    expect(r.currentRoute.value.name).toBe('mfa-configurar');
  });

  it('carrega o estado sob demanda quando ainda não há', async () => {
    const { r, carregar } = roteador(null, null, estado('offline_expirado'));
    await r.push('/');
    expect(carregar).toHaveBeenCalledTimes(1);
    expect(r.currentRoute.value.name).toBe('conectar');
  });

  it('se o estado não puder ser carregado, a navegação não trava', async () => {
    const { r } = roteador(null);
    await r.push('/entrar');
    expect(r.currentRoute.value.name).toBe('login');
  });
});
