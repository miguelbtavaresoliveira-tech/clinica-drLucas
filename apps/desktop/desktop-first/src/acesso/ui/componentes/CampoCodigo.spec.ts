import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CampoCodigo from './CampoCodigo.vue';

const base = { id: 'codigo', rotulo: 'Código de verificação', modelValue: '' };

describe('CampoCodigo', () => {
  it('tem atributos de código de uso único', () => {
    render(CampoCodigo, { props: base });
    const campo = screen.getByLabelText('Código de verificação');
    expect(campo).toHaveAttribute('inputmode', 'numeric');
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code');
    expect(campo).toHaveAttribute('maxlength', '6');
    expect(campo.className).toContain('font-mono');
    expect(campo.className).toContain('text-center');
  });

  it('descarta letras e símbolos ao digitar', async () => {
    const { emitted } = render(CampoCodigo, { props: base });
    const campo = screen.getByLabelText('Código de verificação');
    await userEvent.type(campo, 'a1b2-');
    expect(emitted()['update:modelValue']).toEqual([[''], ['1'], ['1'], ['12'], ['12']]);
    expect(campo).toHaveValue('12');
  });

  it('emite completo com os 6 dígitos', async () => {
    const { emitted } = render(CampoCodigo, { props: base });
    await userEvent.type(screen.getByLabelText('Código de verificação'), '123456');
    expect(emitted()['completo']).toEqual([['123456']]);
  });

  it('colar texto com formatação mantém só os 6 primeiros dígitos', async () => {
    const { emitted } = render(CampoCodigo, { props: base });
    const campo = screen.getByLabelText('Código de verificação');
    await userEvent.click(campo);
    await userEvent.paste('12 34-56 78');
    expect(campo).toHaveValue('123456');
    expect(emitted()['completo']).toEqual([['123456']]);
  });

  it('não emite completo com menos de 6 dígitos', async () => {
    const { emitted } = render(CampoCodigo, { props: base });
    await userEvent.type(screen.getByLabelText('Código de verificação'), '12345');
    expect(emitted()['completo']).toBeUndefined();
  });

  it('autofoco coloca o foco no campo', async () => {
    render(CampoCodigo, { props: { ...base, autofoco: true } });
    await waitFor(() => {
      expect(screen.getByLabelText('Código de verificação')).toHaveFocus();
    });
  });

  it('sem autofoco o foco não é movido', async () => {
    render(CampoCodigo, { props: base });
    await Promise.resolve();
    expect(screen.getByLabelText('Código de verificação')).not.toHaveFocus();
  });

  it('erro é anunciado como descrição e marca o campo como inválido', () => {
    render(CampoCodigo, { props: { ...base, erro: 'Código inválido.' } });
    const campo = screen.getByLabelText('Código de verificação');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Código inválido.');
  });

  it('desabilitado não aceita digitação', () => {
    render(CampoCodigo, { props: { ...base, desabilitado: true } });
    expect(screen.getByLabelText('Código de verificação')).toBeDisabled();
  });
});
