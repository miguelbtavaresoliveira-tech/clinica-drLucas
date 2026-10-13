import { render, screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso, Situacao } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { criarRoteador } from '../../../router';
import InicioTela from '../telas/InicioTela.vue';
import ConectarTela from '../telas/ConectarTela.vue';

const sinalDeAtividade = vi.fn();
const renovarSessao = vi.fn();
const bloquear = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  sinalDeAtividade: () => (sinalDeAtividade as () => unknown)(),
  renovarSessao: () => (renovarSessao as () => unknown)(),
  bloquear: () => (bloquear as () => unknown)(),
}));

const estado = (situacao: Situacao, extras: Partial<EstadoDoAcesso> = {}): EstadoDoAcesso => ({
  situacao,
  exigeLoginCompleto: false,
  biometriaDisponivel: false,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: { id: 'u', nome: 'Lucas Damasceno Silva', email: 'l@c.com' },
  eventosPendentes: 0,
  ...extras,
});

async function abrirInicio(e: EstadoDoAcesso = estado('normal')) {
  useEstadoDoAcesso().definir(e);
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'inicio' });
  const utilitarios = render(InicioTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

describe('AppShell + InicioTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    sinalDeAtividade.mockReset().mockResolvedValue(null);
    // O Rust devolve o estado vigente; o mock faz o mesmo para não mudar a situação do teste.
    renovarSessao.mockReset().mockImplementation(() => Promise.resolve(useEstadoDoAcesso().estado.value));
    bloquear.mockReset().mockResolvedValue(estado('bloqueado'));
  });

  it('saúda pelo primeiro nome e mostra o aviso dos módulos', async () => {
    await abrirInicio();
    expect(screen.getByRole('heading', { level: 1, name: 'Olá, Lucas' })).toBeInTheDocument();
    expect(screen.getByText('Os módulos clínicos aparecerão aqui.')).toBeInTheDocument();
  });

  it('tem navegação principal com aria-current no link da página atual', async () => {
    await abrirInicio();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent?.trim())).toEqual(['Início', 'Dispositivos', 'Segurança']);
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Dispositivos' })).not.toHaveAttribute('aria-current');
  });

  it('mostra o nome do usuário (truncável) e o indicador de conexão', async () => {
    await abrirInicio();
    const nome = screen.getByText('Lucas Damasceno Silva');
    expect(nome.className).toContain('truncate');
    expect(nome.className).toContain('max-w-[12rem]');
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('Online'))).toBe(true);
  });

  it('o botão Bloquear tem texto visível e chama bloquear()', async () => {
    await abrirInicio();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(bloquear).toHaveBeenCalledTimes(1);
  });

  it('falha ao bloquear não gera erro e o botão volta ao normal', async () => {
    bloquear.mockRejectedValue(new Error('falha'));
    await abrirInicio();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bloquear' })).toBeEnabled();
    });
  });

  it('o banner de somente leitura aparece só nesse estado', async () => {
    const normal = await abrirInicio(estado('normal'));
    expect(screen.queryByText(/Modo somente leitura/)).not.toBeInTheDocument();
    normal.unmount();
    reiniciarEstadoDoAcessoParaTeste();
    await abrirInicio(estado('somente_leitura'));
    expect(screen.getByText(/Modo somente leitura/)).toBeInTheDocument();
    expect(screen.getByText(/Conecte-se à internet para voltar a editar/)).toBeInTheDocument();
  });

  it('"Tentar conectar" renova a sessão', async () => {
    await abrirInicio(estado('somente_leitura'));
    renovarSessao.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar conectar' }));
    expect(renovarSessao).toHaveBeenCalledTimes(1);
  });

  it('sessão expirada no servidor mostra o aviso com link para entrar', async () => {
    renovarSessao.mockRejectedValue(new ErroDoApp('SESSAO_EXPIRADA', 'x'));
    await abrirInicio();
    expect(await screen.findByText('Sua sessão no servidor expirou. Entre novamente para sincronizar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('sem conexão mostra o aviso discreto de modo local', async () => {
    renovarSessao.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrirInicio();
    expect(await screen.findByText('Sem conexão. Trabalhando no modo local.')).toBeInTheDocument();
  });

  it('usa landmarks semânticos e não contém dado fora do necessário', async () => {
    await abrirInicio();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('l@c.com');
  });

  it('envia sinais de atividade enquanto o app está liberado', async () => {
    await abrirInicio();
    window.dispatchEvent(new Event('keydown'));
    expect(sinalDeAtividade).toHaveBeenCalled();
  });
});

describe('ConectarTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    renovarSessao.mockReset();
  });

  async function abrir() {
    const roteador = criarRoteador(createMemoryHistory());
    await roteador.push({ name: 'conectar' });
    return render(ConectarTela, { global: { plugins: [roteador] } });
  }

  it('explica o bloqueio e oferece "Tentar agora"', async () => {
    await abrir();
    expect(screen.getByRole('heading', { level: 2, name: 'Conecte-se para continuar' })).toBeInTheDocument();
    expect(screen.getByText(/os dados ficam indisponíveis até a próxima conexão/)).toBeInTheDocument();
  });

  it('"Tentar agora" chama renovarSessao', async () => {
    renovarSessao.mockResolvedValue(estado('normal'));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(renovarSessao).toHaveBeenCalledTimes(1);
  });

  it('falha mostra o banner com o motivo e permite tentar de novo', async () => {
    renovarSessao.mockRejectedValue(new ErroDoApp('SEM_CONEXAO', 'x'));
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(screen.getByRole('button', { name: 'Tentar agora' })).toBeEnabled();
  });
});
