import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import AlertaBanner from './AlertaBanner.vue';

describe('AlertaBanner', () => {
  it.each([
    ['erro', 'alert', 'bg-rose-50'],
    ['aviso', 'alert', 'bg-amber-50'],
    ['sucesso', 'status', 'bg-emerald-50'],
    ['info', 'status', 'bg-teal-50'],
  ] as const)('variante %s usa role=%s e a cor %s', (variante, papel, cor) => {
    render(AlertaBanner, { props: { variante, titulo: 'Título' }, slots: { default: 'Mensagem' } });
    const alerta = screen.getByRole(papel);
    expect(alerta.className).toContain(cor);
    expect(alerta).toHaveTextContent('Título');
    expect(alerta).toHaveTextContent('Mensagem');
  });

  it('o ícone é decorativo (aria-hidden)', () => {
    const { container } = render(AlertaBanner, { props: { variante: 'erro', titulo: 'x' } });
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('o texto é inserido como texto, nunca como HTML', () => {
    render(AlertaBanner, { props: { variante: 'erro', titulo: '<b>negrito</b>' } });
    expect(screen.getByText('<b>negrito</b>')).toBeInTheDocument();
  });
});
