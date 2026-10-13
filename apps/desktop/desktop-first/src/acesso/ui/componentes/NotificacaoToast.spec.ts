import { render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limparToasts, useToast } from '../composables/useToast';
import NotificacaoToast from './NotificacaoToast.vue';

describe('NotificacaoToast + useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    limparToasts();
  });

  afterEach(() => {
    limparToasts();
    vi.useRealTimers();
  });

  it('a região é aria-live="polite"', () => {
    const { container } = render(NotificacaoToast);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('mostra o toast e ele some após a duração padrão de 3,5 s', async () => {
    render(NotificacaoToast);
    useToast().mostrar('Salvo com sucesso');
    await nextTick();
    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();
    vi.advanceTimersByTime(3499);
    await nextTick();
    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(screen.queryByText('Salvo com sucesso')).not.toBeInTheDocument();
  });

  it('respeita a duração informada e empilha vários toasts', async () => {
    render(NotificacaoToast);
    const { mostrar } = useToast();
    mostrar('Primeiro', 'sucesso', 1000);
    mostrar('Segundo', 'erro', 5000);
    await nextTick();
    expect(screen.getByText('Primeiro')).toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(screen.queryByText('Primeiro')).not.toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
  });

  it('desmontar o componente cancela os timers pendentes', async () => {
    const { unmount } = render(NotificacaoToast);
    useToast().mostrar('Pendente');
    await nextTick();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o texto é inserido como texto (sem HTML)', async () => {
    render(NotificacaoToast);
    useToast().mostrar('<img src=x onerror=alert(1)>', 'aviso');
    await nextTick();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
