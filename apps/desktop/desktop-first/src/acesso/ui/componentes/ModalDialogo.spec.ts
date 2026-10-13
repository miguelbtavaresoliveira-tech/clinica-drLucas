import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import ModalDialogo from './ModalDialogo.vue';

const Exemplo = defineComponent({
  components: { ModalDialogo },
  setup() {
    const aberto = ref(false);
    return { aberto };
  },
  template: `
    <div>
      <button type="button" @click="aberto = true">Abrir</button>
      <ModalDialogo :aberto="aberto" titulo="Recuperar senha" descricao="Informe seu e-mail." @fechar="aberto = false">
        <label>E-mail <input type="email" /></label>
        <template #acoes>
          <button type="button" @click="aberto = false">Cancelar</button>
          <button type="button">Enviar</button>
        </template>
      </ModalDialogo>
    </div>`,
});

describe('ModalDialogo', () => {
  it('fechado não renderiza nada', () => {
    render(ModalDialogo, { props: { aberto: false, titulo: 'x' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aberto expõe role=dialog, aria-modal, título e descrição', () => {
    render(ModalDialogo, { props: { aberto: true, titulo: 'Recuperar senha', descricao: 'Informe seu e-mail.' } });
    const dialogo = screen.getByRole('dialog', { name: 'Recuperar senha' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleDescription('Informe seu e-mail.');
  });

  it('ao abrir, o foco vai para o primeiro elemento focável (botão Fechar)', async () => {
    render(Exemplo);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByRole('button', { name: 'Fechar' })).toHaveFocus();
  });

  it('Tab no último elemento volta ao primeiro e Shift+Tab no primeiro vai ao último', async () => {
    render(Exemplo);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const fechar = await screen.findByRole('button', { name: 'Fechar' });
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    enviar.focus();
    await userEvent.tab();
    expect(fechar).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(enviar).toHaveFocus();
  });

  it('Esc emite fechar e devolve o foco ao gatilho', async () => {
    render(Exemplo);
    const gatilho = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(gatilho);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(gatilho).toHaveFocus();
  });

  it('o botão Fechar e o clique no fundo emitem fechar', async () => {
    const { emitted, rerender } = render(ModalDialogo, { props: { aberto: true, titulo: 'x' } });
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(emitted()['fechar']).toHaveLength(1);
    await rerender({ aberto: true });
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(emitted()['fechar']).toHaveLength(2);
  });

  it('clicar dentro do diálogo não fecha', async () => {
    const { emitted } = render(ModalDialogo, { props: { aberto: true, titulo: 'x' } });
    await userEvent.click(screen.getByRole('dialog'));
    expect(emitted()['fechar']).toBeUndefined();
  });

  it('é renderizado no body (Teleport)', () => {
    const { container } = render(ModalDialogo, { props: { aberto: true, titulo: 'x' } });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
