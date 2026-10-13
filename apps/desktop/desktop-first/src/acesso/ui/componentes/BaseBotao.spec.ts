import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import BaseBotao from './BaseBotao.vue';

describe('BaseBotao', () => {
  it('renderiza um <button type="button"> por padrão com o texto do slot', () => {
    render(BaseBotao, { slots: { default: 'Salvar' } });
    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao).toHaveAttribute('type', 'button');
    expect(botao).toBeEnabled();
    expect(botao).not.toHaveAttribute('aria-busy');
  });

  it('carregando fica desabilitado, com aria-busy e o texto de carregamento', () => {
    render(BaseBotao, { props: { carregando: true, textoCarregando: 'Entrando…' }, slots: { default: 'Entrar' } });
    const botao = screen.getByRole('button', { name: 'Entrando…' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Entrar')).not.toBeInTheDocument();
  });

  it('desabilitado não dispara clique', async () => {
    let cliques = 0;
    render(BaseBotao, { props: { desabilitado: true }, attrs: { onClick: () => cliques++ }, slots: { default: 'Salvar' } });
    await userEvent.click(screen.getByRole('button'));
    expect(cliques).toBe(0);
  });

  it('habilitado dispara clique', async () => {
    let cliques = 0;
    render(BaseBotao, { attrs: { onClick: () => cliques++ }, slots: { default: 'Salvar' } });
    await userEvent.click(screen.getByRole('button'));
    expect(cliques).toBe(1);
  });

  it('tipo submit é repassado e a largura total aplica w-full', () => {
    render(BaseBotao, { props: { tipo: 'submit', larguraTotal: true }, slots: { default: 'Enviar' } });
    const botao = screen.getByRole('button');
    expect(botao).toHaveAttribute('type', 'submit');
    expect(botao.className).toContain('w-full');
  });

  it.each([
    ['primario', 'bg-brand-700'],
    ['secundario', 'border-slate-300'],
    ['fantasma', 'text-brand-700'],
    ['perigo', 'bg-rose-700'],
  ] as const)('variante %s usa %s', (variante, classe) => {
    render(BaseBotao, { props: { variante }, slots: { default: 'x' } });
    expect(screen.getByRole('button').className).toContain(classe);
  });

  it('mostra o slot de ícone', () => {
    render(BaseBotao, { slots: { default: 'Ir', icone: '<svg data-testid="icone"></svg>' } });
    expect(screen.getByTestId('icone')).toBeInTheDocument();
  });
});
