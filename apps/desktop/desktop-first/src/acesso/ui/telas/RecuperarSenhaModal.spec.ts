import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import RecuperarSenhaModal from './RecuperarSenhaModal.vue';

const solicitarRedefinicao = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  solicitarRedefinicao: (...args: unknown[]) => (solicitarRedefinicao as (...a: unknown[]) => unknown)(...args),
}));

async function abrir(emailInicial = 'lucas@clinica.com') {
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'login' });
  const utilitarios = render(RecuperarSenhaModal, {
    props: { aberto: true, emailInicial },
    global: { plugins: [roteador] },
  });
  return { roteador, ...utilitarios };
}

const MENSAGEM = 'Se o e-mail estiver cadastrado, você receberá um código em instantes.';

describe('RecuperarSenhaModal', () => {
  beforeEach(() => {
    solicitarRedefinicao.mockReset();
  });

  it('abre com o título, a descrição e o e-mail do login pré-preenchido', async () => {
    await abrir('lucas@clinica.com');
    const dialogo = screen.getByRole('dialog', { name: 'Recuperação de Acesso' });
    expect(dialogo).toHaveAccessibleDescription('Enviaremos um código de redefinição para o seu e-mail.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('lucas@clinica.com');
  });

  it('não oferece WhatsApp, só e-mail', async () => {
    await abrir();
    expect(document.body.textContent ?? '').not.toContain('WhatsApp');
    expect(screen.getByText('E-mail cadastrado')).toBeInTheDocument();
  });

  it('envia o e-mail aparado e mostra a mensagem neutra', async () => {
    solicitarRedefinicao.mockResolvedValue(null);
    await abrir('');
    await userEvent.type(screen.getByLabelText('E-mail'), '  lucas@clinica.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
    expect(await screen.findByText(MENSAGEM)).toBeInTheDocument();
    expect(solicitarRedefinicao).toHaveBeenCalledWith('lucas@clinica.com');
  });

  it('a mensagem é a mesma para qualquer e-mail (RN-12)', async () => {
    solicitarRedefinicao.mockResolvedValue(null);
    for (const email of ['existe@clinica.com', 'nao-existe@outro.com']) {
      const { unmount } = await abrir(email);
      await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
      expect(await screen.findByText(MENSAGEM)).toBeInTheDocument();
      unmount();
    }
  });

  it('e-mail inválido não chama o Rust', async () => {
    await abrir('semarroba');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(solicitarRedefinicao).not.toHaveBeenCalled();
  });

  it('SEM_CONEXAO mostra o banner de conexão e mantém o formulário', async () => {
    solicitarRedefinicao.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(screen.queryByText(MENSAGEM)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar código de redefinição' })).toBeEnabled();
  });

  it('o botão fica ocupado durante o envio', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    solicitarRedefinicao.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
    const ocupado = await screen.findByRole('button', { name: 'Enviando...' });
    expect(ocupado).toBeDisabled();
    expect(ocupado).toHaveAttribute('aria-busy', 'true');
    concluir(null);
    await screen.findByText(MENSAGEM);
  });

  it('"Já tenho o código" fecha o modal e vai para a tela de redefinição', async () => {
    solicitarRedefinicao.mockResolvedValue(null);
    const { roteador, emitted } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código de redefinição' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Já tenho o código' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('redefinir-senha');
    });
    expect(emitted()['fechar']).toHaveLength(1);
  });

  it('Cancelar e Esc emitem fechar', async () => {
    const { emitted } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(emitted()['fechar']).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(emitted()['fechar']).toHaveLength(2);
  });
});
