import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import AvatarIniciais from './AvatarIniciais.vue';

describe('AvatarIniciais', () => {
  it.each([
    ['Lucas Damasceno', 'LD'],
    ['Maria da Silva Santos', 'MS'],
    ['  ana  ', 'A'],
    ['joão   pedro', 'JP'],
    ['', '?'],
  ])('%j → %j', (nome, esperado) => {
    const { container } = render(AvatarIniciais, { props: { nome } });
    expect(container.textContent).toBe(esperado);
  });

  it('é decorativo (aria-hidden)', () => {
    const { container } = render(AvatarIniciais, { props: { nome: 'Lucas Damasceno' } });
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('o tamanho sm é menor que o md', () => {
    const sm = render(AvatarIniciais, { props: { nome: 'A B', tamanho: 'sm' } }).container.firstElementChild?.className;
    const md = render(AvatarIniciais, { props: { nome: 'A B' } }).container.firstElementChild?.className;
    expect(sm).toContain('w-8');
    expect(md).toContain('w-10');
  });
});
