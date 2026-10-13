import { render, screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarEstadoDoAcessoParaTeste, useEstadoDoAcesso } from '../../application/estado-do-acesso';
import type { EstadoDoAcesso } from '../../application/tipos';
import { ErroDoApp } from '../../infrastructure/erros';
import { reiniciarReautenticacaoParaTeste } from '../composables/useReautenticacao';
import { limparToasts, useToastsVisiveis } from '../composables/useToast';
import { criarRoteador } from '../../../router';
import SegurancaTela from './SegurancaTela.vue';

const trocarSenha = vi.fn();
const regenerarCodigos = vi.fn();
const iniciarReconfiguracaoMfa = vi.fn();
const confirmarReconfiguracaoMfa = vi.fn();
const alterarSenhaMestre = vi.fn();
const ativarBiometria = vi.fn();
const desativarBiometria = vi.fn();
const reautenticar = vi.fn();

vi.mock('../../infrastructure/api-identidade', () => ({
  trocarSenha: (...a: unknown[]) => (trocarSenha as (...x: unknown[]) => unknown)(...a),
  regenerarCodigos: (...a: unknown[]) => (regenerarCodigos as (...x: unknown[]) => unknown)(...a),
  iniciarReconfiguracaoMfa: (...a: unknown[]) => (iniciarReconfiguracaoMfa as (...x: unknown[]) => unknown)(...a),
  confirmarReconfiguracaoMfa: (...a: unknown[]) => (confirmarReconfiguracaoMfa as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('../../infrastructure/comandos-tauri', () => ({
  sinalDeAtividade: () => Promise.resolve(null),
  renovarSessao: () => Promise.resolve({}),
  bloquear: () => Promise.resolve({}),
  alterarSenhaMestre: (...a: unknown[]) => (alterarSenhaMestre as (...x: unknown[]) => unknown)(...a),
  ativarBiometria: (...a: unknown[]) => (ativarBiometria as (...x: unknown[]) => unknown)(...a),
  desativarBiometria: () => (desativarBiometria as () => unknown)(),
  reautenticar: (...a: unknown[]) => (reautenticar as (...x: unknown[]) => unknown)(...a),
}));

const NORMAL: EstadoDoAcesso = {
  situacao: 'normal',
  exigeLoginCompleto: false,
  biometriaDisponivel: true,
  biometriaHabilitada: false,
  segundosAteNovaTentativa: 0,
  sessaoOnline: true,
  usuario: { id: 'u', nome: 'Lucas Damasceno', email: 'l@c.com' },
  eventosPendentes: 0,
};

const CODIGOS = Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-${String(2000 + i)}`);
const SEGREDO = { segredo: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', urlOtpauth: 'otpauth://totp/EVO:lucas?secret=GEZDGNBVGY3TQOJQ' };
const SENHA_FORTE = 'uma-senha-nova-bem-forte-1';
const textosDosToasts = () => useToastsVisiveis().toasts.value.map((t) => t.texto);

async function abrir(extras: Partial<EstadoDoAcesso> = {}) {
  useEstadoDoAcesso().definir({ ...NORMAL, ...extras });
  const roteador = criarRoteador(createMemoryHistory());
  await roteador.push({ name: 'seguranca' });
  return render(SegurancaTela, { global: { plugins: [roteador] } });
}

const dialogo = (nome: string | RegExp) => screen.findByRole('dialog', { name: nome });
/** Campo dentro do diálogo aberto (evita ambiguidade com os cartões que ficam atrás do modal). */
const campoNoDialogo = async (rotulo: string | RegExp) => within(await screen.findByRole('dialog')).getByLabelText(rotulo);

describe('SegurancaTela', () => {
  beforeEach(() => {
    reiniciarEstadoDoAcessoParaTeste();
    reiniciarReautenticacaoParaTeste();
    limparToasts();
    for (const f of [trocarSenha, regenerarCodigos, iniciarReconfiguracaoMfa, confirmarReconfiguracaoMfa, alterarSenhaMestre, ativarBiometria, desativarBiometria, reautenticar]) {
      f.mockReset();
    }
  });

  it('mostra o título e os 5 cartões com seus botões', async () => {
    await abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Segurança' })).toBeInTheDocument();
    for (const titulo of ['Senha de login', 'Códigos de recuperação', 'Aplicativo autenticador', 'Senha mestre deste computador', 'Biometria']) {
      expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeInTheDocument();
    }
    for (const botao of ['Trocar senha', 'Gerar novos códigos', 'Reconfigurar', 'Alterar senha mestre']) {
      expect(screen.getByRole('button', { name: botao })).toBeInTheDocument();
    }
    expect(screen.getByText('Usada para entrar no servidor. Trocar desconecta os outros computadores.')).toBeInTheDocument();
  });

  describe('trocar senha de login', () => {
    async function abrirModal() {
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
      return dialogo('Trocar senha de login');
    }

    it('senhas diferentes ou fracas bloqueiam o envio', async () => {
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha atual/), 'atual');
      await userEvent.type(screen.getByLabelText(/^Nova senha/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), 'outra-senha-diferente');
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar senha' }));
      expect(screen.getByText('A nova senha não atende às regras abaixo.')).toBeInTheDocument();
      expect(trocarSenha).not.toHaveBeenCalled();
    });

    it('chama trocarSenha(atual, nova), mostra o toast e fecha', async () => {
      trocarSenha.mockResolvedValue(undefined);
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha atual/), 'senha-atual-ok');
      await userEvent.type(screen.getByLabelText(/^Nova senha/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar senha' }));
      await waitFor(() => {
        expect(trocarSenha).toHaveBeenCalledWith('senha-atual-ok', SENHA_FORTE);
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(textosDosToasts()).toContain('Senha alterada. Os outros computadores foram desconectados.');
    });

    it('CREDENCIAIS_INVALIDAS vira "Senha atual incorreta." e limpa os campos', async () => {
      trocarSenha.mockRejectedValue(new ErroDoApp('CREDENCIAIS_INVALIDAS', 'x', { status: 401 }));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha atual/), 'errada');
      await userEvent.type(screen.getByLabelText(/^Nova senha/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar senha' }));
      expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Nova senha/)).toHaveValue('');
    });

    it('SENHA_FRACA do servidor aparece no campo da nova senha', async () => {
      trocarSenha.mockRejectedValue(new ErroDoApp('SENHA_FRACA', 'x', { status: 422 }));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha atual/), 'atual');
      await userEvent.type(screen.getByLabelText(/^Nova senha/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar senha' }));
      expect(await screen.findByText(/Use ao menos 12 caracteres/)).toBeInTheDocument();
    });

    it('a ação é envolvida pela reautenticação local', async () => {
      reautenticar.mockResolvedValue(null);
      trocarSenha.mockRejectedValueOnce(new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x')).mockResolvedValueOnce(undefined);
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha atual/), 'atual');
      await userEvent.type(screen.getByLabelText(/^Nova senha/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar senha' }));
      const reauth = await dialogo('Confirme sua identidade');
      await userEvent.type(within(reauth).getByLabelText(/^Senha mestre/), 'mestre');
      await userEvent.click(within(reauth).getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => {
        expect(trocarSenha).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('códigos de recuperação', () => {
    async function abrirModal() {
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Gerar novos códigos' }));
      return dialogo('Gerar novos códigos de recuperação');
    }

    it('código incompleto bloqueia o envio', async () => {
      await abrirModal();
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123');
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar novos códigos' }));
      expect(screen.getByText('Informe o código de 6 dígitos do autenticador.')).toBeInTheDocument();
      expect(regenerarCodigos).not.toHaveBeenCalled();
    });

    it('gera os códigos, só permite concluir depois de marcar e os remove do DOM ao fechar', async () => {
      regenerarCodigos.mockResolvedValue(CODIGOS);
      await abrirModal();
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '123456');
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar novos códigos' }));
      expect(await screen.findByText('ABCD-EFGH-JKMN-2000')).toBeInTheDocument();
      expect(regenerarCodigos).toHaveBeenCalledWith('123456');
      const concluir = screen.getByRole('button', { name: 'Concluir' });
      expect(concluir).toBeDisabled();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await userEvent.click(screen.getByLabelText('Guardei os códigos'));
      expect(concluir).toBeEnabled();
      await userEvent.click(concluir);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(document.body.textContent ?? '').not.toContain('ABCD-EFGH-JKMN-2000');
    });

    it('código do autenticador errado (servidor) aparece no campo', async () => {
      regenerarCodigos.mockRejectedValue(new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x', { status: 403 }));
      await abrirModal();
      await userEvent.type(screen.getByLabelText('Código do autenticador'), '000000');
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar novos códigos' }));
      expect(await screen.findByText('Código do autenticador inválido.')).toBeInTheDocument();
    });
  });

  describe('reconfigurar autenticador (3 etapas)', () => {
    it('passa pela senha, pelo QR + código e pelos novos códigos', async () => {
      iniciarReconfiguracaoMfa.mockResolvedValue(SEGREDO);
      confirmarReconfiguracaoMfa.mockResolvedValue(CODIGOS);
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
      await dialogo('Reconfigurar o aplicativo autenticador');
      expect(screen.getByText(/Etapa 1 de 3/)).toBeInTheDocument();
      await userEvent.type(await campoNoDialogo(/^Senha de login/), 'senha-de-login');
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText(/Etapa 2 de 3/)).toBeInTheDocument();
      expect(iniciarReconfiguracaoMfa).toHaveBeenCalledWith('senha-de-login');
      expect((await screen.findByRole('img', { name: /QR code/ })).getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      await userEvent.type(screen.getByLabelText('Código do novo aplicativo'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(await screen.findByText(/Etapa 3 de 3/)).toBeInTheDocument();
      expect(confirmarReconfiguracaoMfa).toHaveBeenCalledWith('123456');
      expect(screen.getByText('ABCD-EFGH-JKMN-2000')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled();
      await userEvent.click(screen.getByLabelText('Guardei os códigos'));
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(document.body.textContent ?? '').not.toContain('ABCD-EFGH-JKMN-2000');
    });

    it('senha de login incorreta fica na etapa 1 com a mensagem no campo', async () => {
      iniciarReconfiguracaoMfa.mockRejectedValue(new ErroDoApp('REAUTENTICACAO_NECESSARIA', 'x', { status: 403 }));
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
      await userEvent.type(await campoNoDialogo(/^Senha de login/), 'errada');
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText('Senha de login incorreta.')).toBeInTheDocument();
      expect(screen.getByText(/Etapa 1 de 3/)).toBeInTheDocument();
    });

    it('código inválido na etapa 2 mantém a etapa e permite tentar de novo', async () => {
      iniciarReconfiguracaoMfa.mockResolvedValue(SEGREDO);
      confirmarReconfiguracaoMfa.mockRejectedValueOnce(new ErroDoApp('CODIGO_MFA_INVALIDO', 'x', { status: 401 }));
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
      await userEvent.type(await campoNoDialogo(/^Senha de login/), 'senha');
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      await userEvent.type(await screen.findByLabelText('Código do novo aplicativo'), '000000');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(await screen.findByText(/Código inválido\. Digite o código atual/)).toBeInTheDocument();
      expect(screen.getByText(/Etapa 2 de 3/)).toBeInTheDocument();
    });

    it('cancelar descarta o segredo pendente da memória', async () => {
      iniciarReconfiguracaoMfa.mockResolvedValue(SEGREDO);
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
      await userEvent.type(await campoNoDialogo(/^Senha de login/), 'senha');
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      await screen.findByText(/Etapa 2 de 3/);
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(document.body.textContent ?? '').not.toContain('GEZD');
    });
  });

  describe('senha mestre', () => {
    async function abrirModal() {
      await abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha mestre' }));
      return dialogo('Alterar senha mestre');
    }

    it('senhas diferentes bloqueiam; iguais e fortes chamam alterarSenhaMestre(atual, nova)', async () => {
      alterarSenhaMestre.mockResolvedValue(null);
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha mestre atual/), 'mestre-atual');
      await userEvent.type(screen.getByLabelText(/^Nova senha mestre/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha mestre/), 'diferente-da-nova-1');
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Alterar senha mestre' }));
      expect(alterarSenhaMestre).not.toHaveBeenCalled();
      await userEvent.clear(screen.getByLabelText(/^Confirme a nova senha mestre/));
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha mestre/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Alterar senha mestre' }));
      await waitFor(() => {
        expect(alterarSenhaMestre).toHaveBeenCalledWith('mestre-atual', SENHA_FORTE);
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(textosDosToasts()).toContain('Senha mestre alterada.');
    });

    it('SENHA_MESTRE_INCORRETA aparece no campo da senha atual', async () => {
      alterarSenhaMestre.mockRejectedValue(new ErroDoApp('SENHA_MESTRE_INCORRETA', 'x'));
      await abrirModal();
      await userEvent.type(screen.getByLabelText(/^Senha mestre atual/), 'errada');
      await userEvent.type(screen.getByLabelText(/^Nova senha mestre/), SENHA_FORTE);
      await userEvent.type(screen.getByLabelText(/^Confirme a nova senha mestre/), SENHA_FORTE);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Alterar senha mestre' }));
      expect(await screen.findByText('Senha mestre atual incorreta.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Nova senha mestre/)).toHaveValue('');
    });
  });

  describe('biometria', () => {
    const interruptor = () => screen.getByRole('switch', { name: 'Biometria' });

    it('indisponível: interruptor desabilitado e texto explicativo', async () => {
      await abrir({ biometriaDisponivel: false });
      expect(interruptor()).toBeDisabled();
      expect(screen.getByText('Indisponível neste computador.')).toBeInTheDocument();
    });

    it('disponível e desativada: aria-checked=false e o texto de apoio', async () => {
      await abrir();
      expect(interruptor()).toBeEnabled();
      expect(interruptor()).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByText(/Touch ID ou Windows Hello/)).toBeInTheDocument();
    });

    it('ativar pede a senha mestre e chama ativarBiometria(senha)', async () => {
      ativarBiometria.mockResolvedValue({});
      await abrir();
      await userEvent.click(interruptor());
      const pedido = await dialogo('Ativar biometria');
      await userEvent.type(within(pedido).getByLabelText(/^Senha mestre/), 'mestre-ok');
      await userEvent.click(within(pedido).getByRole('button', { name: 'Ativar' }));
      await waitFor(() => {
        expect(ativarBiometria).toHaveBeenCalledWith('mestre-ok');
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('senha mestre errada ao ativar mostra o erro e mantém o pedido aberto', async () => {
      ativarBiometria.mockRejectedValue(new ErroDoApp('SENHA_MESTRE_INCORRETA', 'x'));
      await abrir();
      await userEvent.click(interruptor());
      const pedido = await dialogo('Ativar biometria');
      await userEvent.type(within(pedido).getByLabelText(/^Senha mestre/), 'errada');
      await userEvent.click(within(pedido).getByRole('button', { name: 'Ativar' }));
      expect(await screen.findByText('Senha mestre incorreta.')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Ativar biometria' })).toBeInTheDocument();
    });

    it('habilitada: aria-checked=true e desativar chama desativarBiometria()', async () => {
      desativarBiometria.mockResolvedValue({});
      await abrir({ biometriaHabilitada: true });
      expect(interruptor()).toHaveAttribute('aria-checked', 'true');
      await userEvent.click(interruptor());
      await waitFor(() => {
        expect(desativarBiometria).toHaveBeenCalledTimes(1);
      });
      expect(await screen.findByRole('switch', { name: 'Biometria' })).toBeInTheDocument();
    });

    it('falha ao desativar mostra o erro no cartão', async () => {
      desativarBiometria.mockRejectedValue(new ErroDoApp('INTERNO', 'x'));
      await abrir({ biometriaHabilitada: true });
      await userEvent.click(interruptor());
      expect(await screen.findByText('Não foi possível concluir')).toBeInTheDocument();
    });
  });
});
