import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDoApp } from '../../infrastructure/erros';
import { limparToasts } from '../composables/useToast';
import { criarRoteador } from '../../../router';
import RedefinirSenhaTela from './RedefinirSenhaTela.vue';

const concluirRedefinicao = vi.fn();

vi.mock('../../infrastructure/comandos-tauri', () => ({
  concluirRedefinicao: (...args: unknown[]) => (concluirRedefinicao as (...a: unknown[]) => unknown)(...args),
}));

const TOKEN = 'A'.repeat(43);
const SENHA = 'uma-senha-nova-bem-forte-1';

async function abrir() {
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'redefinir-senha' });
  const utilitarios = render(RedefinirSenhaTela, { global: { plugins: [roteador] } });
  return { roteador, ...utilitarios };
}

async function preencherBase(opcoes: { token?: string; senha?: string; confirmacao?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/^Código de redefinição/), opcoes.token ?? TOKEN);
  await userEvent.type(screen.getByLabelText(/^Nova senha/), opcoes.senha ?? SENHA);
  await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), opcoes.confirmacao ?? opcoes.senha ?? SENHA);
}

const enviar = () => userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

describe('RedefinirSenhaTela', () => {
  beforeEach(() => {
    concluirRedefinicao.mockReset();
    limparToasts();
  });

  it('mostra o cabeçalho e as regras da senha', async () => {
    await abrir();
    expect(screen.getByRole('heading', { level: 2, name: 'Redefinir senha' })).toBeInTheDocument();
    expect(screen.getByText('Recuperação de acesso')).toBeInTheDocument();
    expect(screen.getByText(/Pelo menos 12 caracteres/)).toBeInTheDocument();
  });

  it('atualiza as regras conforme a digitação (com texto para leitores de tela)', async () => {
    await abrir();
    const regra = () => screen.getByText(/Pelo menos 12 caracteres/).closest('li');
    expect(regra()).toHaveTextContent('pendente');
    await userEvent.type(screen.getByLabelText(/^Nova senha/), 'x'.repeat(12));
    expect(regra()).toHaveTextContent('atendida');
  });

  it('senhas diferentes bloqueiam o envio', async () => {
    await abrir();
    await preencherBase({ confirmacao: 'outra-senha-diferente-9' });
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    expect(screen.getByText('A nova senha não atende às regras abaixo.')).toBeInTheDocument();
    expect(concluirRedefinicao).not.toHaveBeenCalled();
  });

  it('token vazio ou incompleto bloqueia o envio', async () => {
    await abrir();
    await preencherBase({ token: 'curto' });
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    expect(screen.getByText('Cole o código de redefinição recebido por e-mail.')).toBeInTheDocument();
    expect(concluirRedefinicao).not.toHaveBeenCalled();
  });

  it('código incompleto bloqueia o envio', async () => {
    await abrir();
    await preencherBase();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123');
    await enviar();
    expect(screen.getByText('Informe o código de 6 dígitos do aplicativo.')).toBeInTheDocument();
    expect(concluirRedefinicao).not.toHaveBeenCalled();
  });

  it('envia { tipo: "totp" } e, no sucesso, mostra o toast e vai para o login', async () => {
    concluirRedefinicao.mockResolvedValue(null);
    const { roteador } = await abrir();
    await preencherBase({ token: `  ${TOKEN}  ` });
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    await waitFor(() => {
      expect(roteador.currentRoute.value.name).toBe('login');
    });
    expect(concluirRedefinicao).toHaveBeenCalledWith(TOKEN, SENHA, { tipo: 'totp', valor: '123456' });
  });

  it('a alternância usa aria-pressed e envia { tipo: "recuperacao" }', async () => {
    concluirRedefinicao.mockResolvedValue(null);
    await abrir();
    const alternar = screen.getByRole('button', { name: 'Usar código de recuperação' });
    expect(alternar).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(alternar);
    expect(screen.getByRole('button', { name: 'Usar código do autenticador' })).toHaveAttribute('aria-pressed', 'true');
    await preencherBase();
    await userEvent.type(screen.getByLabelText(/^Código de recuperação/), 'ABCD-EFGH-JKMN-PQRS');
    await enviar();
    await waitFor(() => {
      expect(concluirRedefinicao).toHaveBeenCalledWith(TOKEN, SENHA, { tipo: 'recuperacao', valor: 'ABCD-EFGH-JKMN-PQRS' });
    });
  });

  it('código de recuperação com formato inválido é recusado localmente', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Usar código de recuperação' }));
    await preencherBase();
    await userEvent.type(screen.getByLabelText(/^Código de recuperação/), 'ABC');
    await enviar();
    expect(screen.getByText('Informe um código de recuperação válido (16 caracteres).')).toBeInTheDocument();
    expect(concluirRedefinicao).not.toHaveBeenCalled();
  });

  it('TOKEN_DE_REDEFINICAO_INVALIDO mostra a mensagem da tabela e limpa as senhas', async () => {
    concluirRedefinicao.mockRejectedValue(new ErroDoApp('TOKEN_DE_REDEFINICAO_INVALIDO', 'x'));
    await abrir();
    await preencherBase();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Código de redefinição inválido');
    expect(alerta).toHaveTextContent('Peça um novo e-mail de redefinição.');
    expect(screen.getByLabelText(/^Nova senha/)).toHaveValue('');
  });

  it('CODIGO_MFA_INVALIDO aparece no campo do código', async () => {
    concluirRedefinicao.mockRejectedValue(new ErroDoApp('CODIGO_MFA_INVALIDO', 'x'));
    await abrir();
    await preencherBase();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    expect(await screen.findByText(/Código inválido ou já usado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Código do autenticador')).toHaveAttribute('aria-invalid', 'true');
  });

  it('SENHA_FRACA mostra o banner correspondente', async () => {
    concluirRedefinicao.mockRejectedValue(new ErroDoApp('SENHA_FRACA', 'x'));
    await abrir();
    await preencherBase();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha fraca');
  });

  it('durante o envio o botão fica ocupado', async () => {
    let concluir: (v: unknown) => void = () => undefined;
    concluirRedefinicao.mockReturnValue(new Promise((resolve) => (concluir = resolve)));
    await abrir();
    await preencherBase();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
    await enviar();
    expect(await screen.findByRole('button', { name: 'Redefinindo...' })).toBeDisabled();
    concluir(null);
  });
});
