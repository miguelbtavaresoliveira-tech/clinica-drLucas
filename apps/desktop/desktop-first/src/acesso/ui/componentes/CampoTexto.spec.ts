import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CampoTexto from './CampoTexto.vue';

const base = { id: 'email', rotulo: 'E-mail', modelValue: '' };

describe('CampoTexto', () => {
  it('associa o rótulo ao campo', () => {
    render(CampoTexto, { props: base });
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });

  it('obrigatório: required no input e asterisco só visual', () => {
    const { container } = render(CampoTexto, { props: { ...base, obrigatorio: true } });
    expect(screen.getByLabelText(/E-mail/)).toBeRequired();
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).toContain('*');
  });

  it('erro: aria-invalid e aria-describedby apontam para a mensagem', () => {
    render(CampoTexto, { props: { ...base, erro: 'E-mail inválido.' } });
    const campo = screen.getByLabelText('E-mail');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('E-mail inválido.');
    expect(screen.getByText('E-mail inválido.')).toHaveAttribute('id', 'email-erro');
  });

  it('dica e erro juntos são descritos pelo campo', () => {
    render(CampoTexto, { props: { ...base, erro: 'Erro.', dica: 'Use seu e-mail.' } });
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Erro. Use seu e-mail.');
  });

  it('sem erro não há aria-invalid', () => {
    render(CampoTexto, { props: base });
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid');
  });

  it('emite update:modelValue ao digitar', async () => {
    const { emitted } = render(CampoTexto, { props: base });
    await userEvent.type(screen.getByLabelText('E-mail'), 'ab');
    expect(emitted()['update:modelValue']).toEqual([['a'], ['ab']]);
  });

  it('repassa tipo, placeholder, autocomplete, maxlength e desabilitado', () => {
    render(CampoTexto, {
      props: { ...base, tipo: 'email', placeholder: 'voce@clinica.com', autocomplete: 'username', maxlength: 254, desabilitado: true },
    });
    const campo = screen.getByLabelText('E-mail');
    expect(campo).toHaveAttribute('type', 'email');
    expect(campo).toHaveAttribute('placeholder', 'voce@clinica.com');
    expect(campo).toHaveAttribute('autocomplete', 'username');
    expect(campo).toHaveAttribute('maxlength', '254');
    expect(campo).toBeDisabled();
  });

  it('mostra o ícone do slot', () => {
    render(CampoTexto, { props: base, slots: { icone: '<svg data-testid="ic"></svg>' } });
    expect(screen.getByTestId('ic')).toBeInTheDocument();
  });
});
