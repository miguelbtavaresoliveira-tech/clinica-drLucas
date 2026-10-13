import { render, screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limparToasts } from '../composables/useToast';
import ListaDeCodigosDeRecuperacao from './ListaDeCodigosDeRecuperacao.vue';
import NotificacaoToast from './NotificacaoToast.vue';

const CODIGOS = Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-${String(1000 + i)}`);
const escrever = vi.fn().mockResolvedValue(undefined);

function montar() {
  return render({
    components: { ListaDeCodigosDeRecuperacao, NotificacaoToast },
    setup: () => ({ codigos: CODIGOS }),
    template: '<div><ListaDeCodigosDeRecuperacao :codigos="codigos" /><NotificacaoToast /></div>',
  });
}

describe('ListaDeCodigosDeRecuperacao', () => {
  beforeEach(() => {
    limparToasts();
    escrever.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
  });

  it('mostra os 10 códigos em fonte monoespaçada', () => {
    montar();
    const lista = screen.getByRole('list', { name: 'Códigos de recuperação' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(10);
    expect(itens[0]?.className).toContain('font-mono');
    expect(itens[0]).toHaveTextContent('ABCD-EFGH-JKMN-1000');
  });

  it('avisa que os códigos aparecem uma única vez', () => {
    montar();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Estes códigos aparecem só agora. Cada um funciona uma vez. Guarde-os fora deste computador.',
    );
  });

  it('"Copiar todos" grava um código por linha', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar todos' }));
    expect(escrever).toHaveBeenCalledTimes(1);
    const texto = escrever.mock.calls[0]?.[0] as string;
    expect(texto.split('\n')).toEqual(CODIGOS);
    expect(await screen.findByText('Códigos copiados')).toBeInTheDocument();
  });

  it('falha ao copiar mostra aviso e não lança', async () => {
    escrever.mockRejectedValueOnce(new Error('negado'));
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar todos' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
  });
});
