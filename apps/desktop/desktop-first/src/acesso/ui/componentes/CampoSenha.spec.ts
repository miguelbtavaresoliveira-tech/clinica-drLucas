import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CampoSenha from './CampoSenha.vue';

const base = { id: 'senha', rotulo: 'Senha', modelValue: 'segredo', autocomplete: 'current-password' as const };

describe('CampoSenha', () => {
  it('começa oculto e o botão alterna o tipo e o aria-pressed', async () => {
    render(CampoSenha, { props: base });
    const campo = screen.getByLabelText('Senha');
    expect(campo).toHaveAttribute('type', 'password');
    const botao = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    expect(botao).toHaveAttribute('aria-controls', 'senha');
    await userEvent.click(botao);
    expect(campo).toHaveAttribute('type', 'text');
    const ocultar = screen.getByRole('button', { name: 'Ocultar senha' });
    expect(ocultar).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(ocultar);
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('o botão de visibilidade não envia o formulário', async () => {
    let enviado = false;
    render({
      components: { CampoSenha },
      setup: () => ({ base, enviar: () => (enviado = true) }),
      template: '<form @submit.prevent="enviar"><CampoSenha v-bind="base" /></form>',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(enviado).toBe(false);
  });

  it('usa fonte monoespaçada e o autocomplete informado', () => {
    render(CampoSenha, { props: { ...base, autocomplete: 'new-password' } });
    const campo = screen.getByLabelText('Senha');
    expect(campo.className).toContain('font-mono');
    expect(campo).toHaveAttribute('autocomplete', 'new-password');
  });

  it('erro expõe aria-invalid e descrição', () => {
    render(CampoSenha, { props: { ...base, erro: 'Senha incorreta.' } });
    const campo = screen.getByLabelText('Senha');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Senha incorreta.');
  });

  it('mostra a ação ao lado do rótulo (link "Esqueceu a senha?")', () => {
    render(CampoSenha, { props: base, slots: { 'acao-rotulo': '<a href="#x">Esqueceu a senha?</a>' } });
    expect(screen.getByRole('link', { name: 'Esqueceu a senha?' })).toBeInTheDocument();
  });

  it('emite update:modelValue ao digitar', async () => {
    const { emitted } = render(CampoSenha, { props: { ...base, modelValue: '' } });
    await userEvent.type(screen.getByLabelText('Senha'), 'a');
    expect(emitted()['update:modelValue']).toEqual([['a']]);
  });

  it('desabilitado desabilita também o botão de visibilidade', () => {
    render(CampoSenha, { props: { ...base, desabilitado: true } });
    expect(screen.getByLabelText('Senha')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeDisabled();
  });
});
