import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import DispositivoRevogadoTela from './DispositivoRevogadoTela.vue';

const redefinirComputadorRevogado = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  redefinirComputadorRevogado: (...a: unknown[]) => (redefinirComputadorRevogado as (...x: unknown[]) => unknown)(...a),
}));

const SEM_CONFIGURACAO: EstadoDoAcesso = {
  situacao: 'sem_configuracao',
  exigeLoginCompleto: true,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: false,
  usuario: null,
  eventosPendentes: 0,
};

async function abrir() {
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'dispositivo-revogado' });
  const utilitarios = render(DispositivoRevogadoTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

describe('DispositivoRevogadoTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    redefinirComputadorRevogado.mockReset();
  });

  it('explica o que aconteceu', async () => {
    await abrir();
    expect(screen.getByRole('heading', { level: 2, name: 'Este computador foi desconectado' })).toBeInTheDocument();
    expect(
      screen.getByText(/O acesso deste computador foi revogado\. Os dados locais continuam protegidos pela criptografia/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redefinir este computador' })).toBeInTheDocument();
  });

  it('o botão abre o modal com o aviso de apagar os dados locais', async () => {
    await abrir();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    expect(await screen.findByRole('dialog', { name: 'Redefinir este computador' })).toBeInTheDocument();
    expect(screen.getByText('Todos os dados locais deste computador serão apagados.')).toBeInTheDocument();
  });

  it('o botão do modal só habilita com DESCARTAR exato', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    const apagar = await screen.findByRole('button', { name: 'Apagar dados e redefinir' });
    expect(apagar).toBeDisabled();
    const campo = screen.getByLabelText('Digite DESCARTAR para confirmar');
    for (const invalido of ['descartar', 'DESCARTA', 'DESCARTAR ', 'sim']) {
      await userEvent.clear(campo);
      await userEvent.type(campo, invalido);
      expect(apagar).toBeDisabled();
    }
    await userEvent.clear(campo);
    await userEvent.type(campo, 'DESCARTAR');
    expect(apagar).toBeEnabled();
  });

  it('confirmar chama o comando e vai para o login', async () => {
    redefinirComputadorRevogado.mockResolvedValue(SEM_CONFIGURACAO);
    const { roteador } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    await userEvent.type(await screen.findByLabelText('Digite DESCARTAR para confirmar'), 'DESCARTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar dados e redefinir' }));
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(redefinirComputadorRevogado).toHaveBeenCalledWith('DESCARTAR');
    expect(useEstadoDoAcesso().estado.value?.situacao).toBe('sem_configuracao');
  });

  it('durante o envio o botão fica ocupado', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    redefinirComputadorRevogado.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    await userEvent.type(await screen.findByLabelText('Digite DESCARTAR para confirmar'), 'DESCARTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar dados e redefinir' }));
    const ocupado = await screen.findByRole('button', { name: 'Apagando...' });
    expect(ocupado).toBeDisabled();
    concluir(SEM_CONFIGURACAO);
  });

  it('falha mostra o erro e mantém o modal aberto', async () => {
    redefinirComputadorRevogado.mockRejectedValue(new ErroDoApp('INTERNO', 'x'));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    await userEvent.type(await screen.findByLabelText('Digite DESCARTAR para confirmar'), 'DESCARTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar dados e redefinir' }));
    expect(await screen.findByText('Não foi possível concluir')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Cancelar fecha o modal sem chamar o comando', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Redefinir este computador' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(redefinirComputadorRevogado).not.toHaveBeenCalled();
  });
});
