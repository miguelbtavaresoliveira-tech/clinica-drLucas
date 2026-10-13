import { render, screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso, ItemDeDispositivo } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { limparToasts, useToastsVisiveis } from '../composables/useToast';
import { reiniciarReautenticacaoParaTeste } from '../composables/useReautenticacao';
import { criarRoteador } from '../../../router';
import DispositivosTela from './DispositivosTela.vue';

const listarDispositivos = vi.fn();
const revogarDispositivo = vi.fn();
const reautenticar = vi.fn();

vi.mock('../../infrastructure/api-identidade', () => ({
  listarDispositivos: () => (listarDispositivos as () => unknown)(),
  revogarDispositivo: (...a: unknown[]) => (revogarDispositivo as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('../../infrastructure/comandos-tauri', () => ({
  sinalDeAtividade: () => Promise.resolve(null),
  renovarSessao: () => Promise.resolve({}),
  bloquear: () => Promise.resolve({}),
  reautenticar: (...a: unknown[]) => (reautenticar as (...x: unknown[]) => unknown)(...a),
}));

const NORMAL: EstadoDoAcesso = {
  situacao: 'normal',
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: { id: 'u', nome: 'Lucas Damasceno', email: 'l@c.com' },
  eventosPendentes: 0,
};

const ATUAL: ItemDeDispositivo = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  apelido: 'MacBook da clínica',
  plataforma: 'macos',
  registradoEm: '2026-10-01T12:00:00.000Z',
  ultimoCheckIn: '2026-10-13T12:30:00.000Z',
  situacao: 'ativo',
  revogadoEm: null,
  atual: true,
};
const OUTRO: ItemDeDispositivo = {
  ...ATUAL,
  id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  apelido: 'Notebook Windows',
  plataforma: 'windows',
  atual: false,
};
const REVOGADO: ItemDeDispositivo = {
  ...OUTRO,
  id: '11111111-2222-4333-8444-555555555555',
  apelido: 'Desktop antigo',
  situacao: 'revogado',
  revogadoEm: '2026-10-10T15:00:00.000Z',
};

async function abrir() {
  useEstadoDoAcesso().definir(NORMAL);
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'dispositivos' });
  return render(DispositivosTela, { global: { plugins: [roteador] } });
}

describe('DispositivosTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    reiniciarReautenticacaoParaTeste();
    limparToasts();
    listarDispositivos.mockReset().mockResolvedValue([ATUAL, OUTRO, REVOGADO]);
    revogarDispositivo.mockReset();
    reautenticar.mockReset();
  });

  it('mostra o título, a orientação e o esqueleto enquanto carrega', async () => {
    let resolver: (v: ItemDeDispositivo[]) => void = () => undefined;
    listarDispositivos.mockReturnValue(new Promise((r) => (resolver = r)));
    await abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Dispositivos' })).toBeInTheDocument();
    expect(screen.getByText('Computadores com acesso à sua conta (máximo de 3 ativos).')).toBeInTheDocument();
    expect(screen.getByText('Carregando dispositivos…')).toBeInTheDocument();
    resolver([]);
    expect(await screen.findByText('Nenhum dispositivo encontrado.')).toBeInTheDocument();
  });

  it('lista os dispositivos com os selos corretos e datas em <time>', async () => {
    await abrir();
    const itens = await screen.findAllByRole('listitem');
    const lista = itens.filter((li) => li.querySelector('time'));
    expect(lista).toHaveLength(3);
    const atual = within(lista[0] as HTMLElement);
    expect(atual.getByText('MacBook da clínica')).toBeInTheDocument();
    expect(atual.getByText('Este computador')).toBeInTheDocument();
    expect(atual.getByText('Ativo')).toBeInTheDocument();
    expect(atual.getAllByText(/\d{2}\/\d{2}\/\d{2}/)).not.toHaveLength(0);
    const revogado = within(lista[2] as HTMLElement);
    expect(revogado.getByText(/Revogado em/)).toBeInTheDocument();
    expect(revogado.queryByText('Este computador')).not.toBeInTheDocument();
    expect(lista[2]?.querySelector('time')?.getAttribute('datetime')).toBeTruthy();
  });

  it('o botão Revogar existe só para ativos e tem rótulo acessível', async () => {
    await abrir();
    await screen.findByText('Notebook Windows');
    expect(screen.getByRole('button', { name: 'Revogar MacBook da clínica' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar Notebook Windows' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revogar Desktop antigo' })).not.toBeInTheDocument();
  });

  it('SEM_CONEXAO mostra o estado offline com "Tentar novamente"', async () => {
    listarDispositivos.mockRejectedValueOnce(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir();
    expect(await screen.findByText('Conecte-se à internet para ver os dispositivos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Notebook Windows')).toBeInTheDocument();
  });

  it('outro erro mostra o banner de erro com "Tentar novamente"', async () => {
    listarDispositivos.mockRejectedValueOnce(new ErroDoApp('INTERNO', 'x'));
    await abrir();
    expect(await screen.findByText('Não foi possível carregar os dispositivos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('lista vazia mostra a mensagem', async () => {
    listarDispositivos.mockResolvedValue([]);
    await abrir();
    expect(await screen.findByText('Nenhum dispositivo encontrado.')).toBeInTheDocument();
  });

  describe('modal de revogação', () => {
    async function abrirModal(nome = 'Notebook Windows') {
      await abrir();
      await userEvent.click(await screen.findByRole('button', { name: `Revogar ${nome}` }));
      return screen.findByRole('dialog', { name: `Revogar ${nome}` });
    }

    it('abre com o título do dispositivo e sem aviso extra para outro computador', async () => {
      await abrirModal();
      expect(screen.queryByText('Este computador será bloqueado imediatamente.')).not.toBeInTheDocument();
    });

    it('avisa quando o dispositivo é o computador em uso', async () => {
      await abrirModal('MacBook da clínica');
      expect(screen.getByText('Este computador será bloqueado imediatamente.')).toBeInTheDocument();
    });

    it('valida o motivo (mínimo de 3 caracteres) e o código antes de chamar o servidor', async () => {
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), 'ab');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      expect(screen.getByText('Informe o motivo (de 3 a 200 caracteres).')).toBeInTheDocument();
      expect(screen.getByText('Informe o código de 6 dígitos do autenticador.')).toBeInTheDocument();
      expect(revogarDispositivo).not.toHaveBeenCalled();
    });

    it('envia id, motivo e código, mostra o toast, fecha e recarrega a lista', async () => {
      revogarDispositivo.mockResolvedValue(undefined);
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), '  Computador perdido  ');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      await waitFor(() => {
        expect(revogarDispositivo).toHaveBeenCalledWith(OUTRO.id, 'Computador perdido', '123456');
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Revogar/ })).not.toBeInTheDocument();
      });
      expect(listarDispositivos).toHaveBeenCalledTimes(2);
      expect(useToastsVisiveis().toasts.value.map((t) => t.texto)).toContain('Dispositivo revogado.');
    });

    it('REAUTENTICACAO_NECESSARIA local abre o modal de reautenticação e repete a revogação', async () => {
      reautenticar.mockResolvedValue(null);
      revogarDispositivo
        .mockRejectedValueOnce(new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x'))
        .mockResolvedValueOnce(undefined);
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), 'Computador perdido');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      const reauth = await screen.findByRole('dialog', { name: 'Confirme sua identidade' });
      await userEvent.type(within(reauth).getByLabelText(/^Senha mestre/), 'senha-mestre-ok');
      await userEvent.click(within(reauth).getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => {
        expect(revogarDispositivo).toHaveBeenCalledTimes(2);
      });
      expect(reautenticar).toHaveBeenCalledWith('senha', 'senha-mestre-ok');
    });

    it('código do autenticador errado (erro do servidor, com status) aparece no campo e limpa o código', async () => {
      revogarDispositivo.mockRejectedValue(new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x', { status: 403 }));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), 'Computador perdido');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '000000');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      expect(await screen.findByText('Código do autenticador inválido.')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Confirme sua identidade' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Código do autenticador')).toHaveValue('');
    });

    it('DISPOSITIVO_NAO_ENCONTRADO avisa e atualiza a lista', async () => {
      revogarDispositivo.mockRejectedValue(new ErroDoApp('DISPOSITIVO_NAO_ENCONTRADO', 'x', { status: 404 }));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), 'Computador perdido');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      expect(await screen.findByText('Dispositivo não encontrado')).toBeInTheDocument();
      await waitFor(() => {
        expect(listarDispositivos).toHaveBeenCalledTimes(2);
      });
    });

    it('SEM_CONEXAO mostra o banner e mantém o modal aberto', async () => {
      revogarDispositivo.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Motivo/), 'Computador perdido');
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }));
      expect(await screen.findByText('Sem conexão com o servidor')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /Revogar/ })).toBeInTheDocument();
    });

    it('Cancelar fecha o modal sem chamar o servidor', async () => {
      await abrirModal();
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Revogar/ })).not.toBeInTheDocument();
      });
      expect(revogarDispositivo).not.toHaveBeenCalled();
    });

    it('o foco inicial do modal vai para o campo Motivo', async () => {
      await abrirModal();
      await waitFor(() => {
        expect(screen.getByLabelText(/^Motivo/)).toHaveFocus();
      });
    });
  });
});
