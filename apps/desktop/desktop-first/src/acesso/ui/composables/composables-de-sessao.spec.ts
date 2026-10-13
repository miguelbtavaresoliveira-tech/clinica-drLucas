import { render } from '@testing-library/vue';
import { createMemoryHistory } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { reiniciarFluxoDeLoginParaTeste } from '../../application/fluxo-de-login';
import type { EstadoDoAcesso, Situacao } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import { useEstadoDoAcessoNaUI } from './useEstadoDoAcesso';
import { useSessaoOnline } from './useSessaoOnline';
import { useSinalDeAtividade } from './useSinalDeAtividade';

const sinalDeAtividade = vi.fn();
const renovarSessao = vi.fn();
const estadoDoAcesso = vi.fn();
let aoMudar: ((e: EstadoDoAcesso) => void) | null = null;
const removerEscuta = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  sinalDeAtividade: () => (sinalDeAtividade as () => unknown)(),
  renovarSessao: () => (renovarSessao as () => unknown)(),
  estadoDoAcesso: () => (estadoDoAcesso as () => unknown)(),
  aoMudarEstado: (cb: (e: EstadoDoAcesso) => void) => {
    aoMudar = cb;
    return Promise.resolve(removerEscuta);
  },
}));

const estado = (situacao: Situacao, extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso => ({
  situacao,
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: { id: 'u', nome: 'Lucas Damasceno', email: 'l@c.com' },
  eventosPendentes: 0,
  ...extras,
});

function montar<T>(usar: () => T) {
  let resultado: T | undefined;
  const Harness = defineComponent({
    setup() {
      resultado = usar();
      return () => h('div');
    },
  });
  const utilitarios = render(Harness);
  return { ...utilitarios, resultado: () => resultado as T };
}

beforeEach(() => {
  reiniciarEstadoDoAcessoParaTeste();
  reiniciarFluxoDeLoginParaTeste();
  sinalDeAtividade.mockReset().mockResolvedValue(null);
  renovarSessao.mockReset().mockResolvedValue(estado('normal'));
  estadoDoAcesso.mockReset();
  removerEscuta.mockReset();
  aoMudar = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSinalDeAtividade', () => {
  it('50 eventos em 10 s geram no máximo 1 sinal; depois de 10 s, mais um', () => {
    vi.useFakeTimers();
    montar(() => useSinalDeAtividade(() => true));
    for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('pointerdown'));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9_999);
    window.dispatchEvent(new Event('keydown'));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    window.dispatchEvent(new Event('keydown'));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(2);
  });

  it.each(['pointerdown', 'keydown', 'wheel', 'touchstart'])('o evento %s conta como atividade', (evento) => {
    montar(() => useSinalDeAtividade(() => true));
    window.dispatchEvent(new Event(evento));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
  });

  it('para de enviar depois de desmontar e remove os listeners', () => {
    const remover = vi.spyOn(window, 'removeEventListener');
    const { unmount } = montar(() => useSinalDeAtividade(() => true));
    unmount();
    expect(remover.mock.calls.map(([e]) => e)).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'wheel', 'touchstart']));
    window.dispatchEvent(new Event('pointerdown'));
    expect(sinalDeAtividade).not.toHaveBeenCalled();
    remover.mockRestore();
  });

  it('só escuta quando o app está liberado: bloqueado não envia; ao liberar passa a enviar', async () => {
    useEstadoDoAcesso().definir(estado('bloqueado'));
    montar(() => useSinalDeAtividade());
    window.dispatchEvent(new Event('pointerdown'));
    expect(sinalDeAtividade).not.toHaveBeenCalled();
    useEstadoDoAcesso().definir(estado('normal'));
    await nextTick();
    window.dispatchEvent(new Event('pointerdown'));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
    useEstadoDoAcesso().definir(estado('bloqueado'));
    await nextTick();
    vi.useFakeTimers();
    vi.advanceTimersByTime(20_000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
  });

  it('uma falha no sinal não gera erro não tratado', async () => {
    sinalDeAtividade.mockRejectedValue(new Error('falha'));
    montar(() => useSinalDeAtividade(() => true));
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(sinalDeAtividade).toHaveBeenCalledTimes(1);
  });
});

describe('useSessaoOnline', () => {
  it('renova ao montar, a cada 10 min e quando a internet volta; limpa tudo ao desmontar', async () => {
    vi.useFakeTimers();
    const { unmount } = montar(() => useSessaoOnline(() => true));
    expect(renovarSessao).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(renovarSessao).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    expect(renovarSessao).toHaveBeenCalledTimes(3);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(renovarSessao).toHaveBeenCalledTimes(3);
  });

  it('guarda SESSAO_EXPIRADA e SEM_CONEXAO e limpa o erro quando volta a funcionar', async () => {
    renovarSessao.mockRejectedValueOnce(new ErroDoApp('SESSAO_EXPIRADA', 'x'));
    const h = montar(() => useSessaoOnline(() => true));
    await vi.waitFor(() => {
      expect(h.resultado().ultimoErro.value).toBe('SESSAO_EXPIRADA');
    });
    renovarSessao.mockRejectedValueOnce(new ErroDoApp('SEM_CONEXAO', 'x'));
    await h.resultado().renovar();
    expect(h.resultado().ultimoErro.value).toBe('SEM_CONEXAO');
    await h.resultado().renovar();
    expect(h.resultado().ultimoErro.value).toBeNull();
  });

  it('DISPOSITIVO_REVOGADO não é tratado aqui (o Rust emite o estado)', async () => {
    renovarSessao.mockRejectedValue(new ErroDoApp('DISPOSITIVO_REVOGADO', 'x'));
    const h = montar(() => useSessaoOnline(() => true));
    await Promise.resolve();
    await h.resultado().renovar();
    expect(h.resultado().ultimoErro.value).toBeNull();
  });

  it('bloqueado não renova; ao liberar passa a renovar', async () => {
    useEstadoDoAcesso().definir(estado('bloqueado'));
    montar(() => useSessaoOnline());
    expect(renovarSessao).not.toHaveBeenCalled();
    useEstadoDoAcesso().definir(estado('normal'));
    await nextTick();
    expect(renovarSessao).toHaveBeenCalledTimes(1);
  });
});

describe('useEstadoDoAcessoNaUI', () => {
  async function abrir() {
    estadoDoAcesso.mockResolvedValue(estado('normal'));
    const roteador = criarRoteador(createMemoryHistory());
    await roteador.push({ name: 'inicio' });
    const Harness = defineComponent({
      setup() {
        useEstadoDoAcessoNaUI();
        return () => h('div');
      },
    });
    const utilitarios = render(Harness, { global: { plugins: [roteador] } });
    await vi.waitFor(() => {
      expect(aoMudar).not.toBeNull();
    });
    return { roteador, ...utilitarios };
  }

  it('carrega o estado e registra a escuta ao montar', async () => {
    await abrir();
    expect(estadoDoAcesso).toHaveBeenCalledTimes(1);
    expect(useEstadoDoAcesso().estado.value?.situacao).toBe('normal');
  });

  it('estado bloqueado leva à tela de desbloqueio sem ação do usuário', async () => {
    const { roteador } = await abrir();
    aoMudar?.(estado('bloqueado'));
    await vi.waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('desbloqueio');
    });
  });

  it('bloqueio que exige login completo leva ao login', async () => {
    const { roteador } = await abrir();
    aoMudar?.(estado('bloqueado', { exigeLoginCompleto: true }));
    await vi.waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
  });

  it('estado revogado leva à tela de revogação', async () => {
    const { roteador } = await abrir();
    aoMudar?.(estado('revogado'));
    await vi.waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('dispositivo-revogado');
    });
  });

  it('offline expirado leva à tela de conexão e somente leitura mantém a página', async () => {
    const { roteador } = await abrir();
    aoMudar?.(estado('somente_leitura'));
    await nextTick();
    expect(roteador.currentRoute.value.name).toBe('inicio');
    aoMudar?.(estado('offline_expirado'));
    await vi.waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('conectar');
    });
  });

  it('remove a escuta ao desmontar', async () => {
    const { unmount } = await abrir();
    unmount();
    expect(removerEscuta).toHaveBeenCalledTimes(1);
  });

  it('falha ao carregar o estado não impede de escutar', async () => {
    estadoDoAcesso.mockRejectedValue(new Error('sem rust'));
    const Harness = defineComponent({
      setup() {
        useEstadoDoAcessoNaUI();
        return () => h('div');
      },
    });
    const roteador = criarRoteador(createMemoryHistory());
    render(Harness, { global: { plugins: [roteador] } });
    await vi.waitFor(() => {
      expect(aoMudar).not.toBeNull();
    });
  });
});
