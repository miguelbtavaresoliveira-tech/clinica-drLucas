import { render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IndicadorConexao from './IndicadorConexao.vue';

function definirOnline(valor: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value: valor, configurable: true });
}

describe('IndicadorConexao', () => {
  afterEach(() => {
    definirOnline(true);
    vi.restoreAllMocks();
  });

  it('online: mostra "Online" com ponto verde e role=status', () => {
    definirOnline(true);
    render(IndicadorConexao);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Online');
    expect(status.querySelector('span[aria-hidden="true"]')?.className).toContain('bg-emerald-500');
  });

  it('a animação respeita prefers-reduced-motion (motion-safe)', () => {
    definirOnline(true);
    render(IndicadorConexao);
    const ponto = screen.getByRole('status').querySelector('span[aria-hidden="true"]');
    expect(ponto?.className).toContain('motion-safe:animate-pulse');
    expect(ponto?.className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it('já começa offline quando o navegador está offline', () => {
    definirOnline(false);
    render(IndicadorConexao);
    expect(screen.getByRole('status')).toHaveTextContent('Offline — modo local');
  });

  it('alterna ao disparar os eventos offline e online', async () => {
    definirOnline(true);
    render(IndicadorConexao);
    window.dispatchEvent(new Event('offline'));
    await nextTick();
    expect(screen.getByRole('status')).toHaveTextContent('Offline — modo local');
    expect(screen.getByRole('status').querySelector('span[aria-hidden="true"]')?.className).toContain('bg-amber-500');
    window.dispatchEvent(new Event('online'));
    await nextTick();
    expect(screen.getByRole('status')).toHaveTextContent('Online');
  });

  it('remove os listeners ao desmontar', () => {
    const remover = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(IndicadorConexao);
    unmount();
    const removidos = remover.mock.calls.map(([evento]) => evento);
    expect(removidos).toContain('online');
    expect(removidos).toContain('offline');
  });

  it('depois de desmontado, eventos não causam erro', () => {
    const { unmount } = render(IndicadorConexao);
    unmount();
    expect(() => window.dispatchEvent(new Event('offline'))).not.toThrow();
  });
});
