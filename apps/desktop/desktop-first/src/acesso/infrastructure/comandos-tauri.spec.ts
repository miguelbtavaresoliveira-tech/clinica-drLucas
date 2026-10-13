import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as comandos from './comandos-tauri';

afterEach(() => {
  clearMocks();
});

interface CasoDeComando {
  nome: string;
  cmdEsperado: string;
  argsEsperados: Record<string, unknown>;
  chamar: () => Promise<unknown>;
}

const casos: CasoDeComando[] = [
  { nome: 'estadoDoAcesso', cmdEsperado: 'estado_do_acesso', argsEsperados: {}, chamar: () => comandos.estadoDoAcesso() },
  {
    nome: 'configurarDesbloqueio',
    cmdEsperado: 'configurar_desbloqueio',
    argsEsperados: { senha: 'senha-de-teste-12' },
    chamar: () => comandos.configurarDesbloqueio('senha-de-teste-12'),
  },
  {
    nome: 'desbloquearComSenha',
    cmdEsperado: 'desbloquear_com_senha',
    argsEsperados: { senha: 'senha-de-teste-12' },
    chamar: () => comandos.desbloquearComSenha('senha-de-teste-12'),
  },
  { nome: 'bloquear', cmdEsperado: 'bloquear', argsEsperados: {}, chamar: () => comandos.bloquear() },
  {
    nome: 'sinalDeAtividade',
    cmdEsperado: 'sinal_de_atividade',
    argsEsperados: {},
    chamar: () => comandos.sinalDeAtividade(),
  },
  {
    nome: 'iniciarLogin',
    cmdEsperado: 'api_iniciar_login',
    argsEsperados: { email: 'usuaria@teste.dev', senha: 'senha-de-teste-12' },
    chamar: () => comandos.iniciarLogin('usuaria@teste.dev', 'senha-de-teste-12'),
  },
  {
    nome: 'gerarSegredoMfa',
    cmdEsperado: 'api_gerar_segredo_mfa',
    argsEsperados: { desafio: 'desafio-teste' },
    chamar: () => comandos.gerarSegredoMfa('desafio-teste'),
  },
  {
    nome: 'confirmarMfa',
    cmdEsperado: 'api_confirmar_mfa',
    argsEsperados: { desafio: 'desafio-teste', codigo: '123456' },
    chamar: () => comandos.confirmarMfa('desafio-teste', '123456'),
  },
  {
    nome: 'concluirLogin',
    cmdEsperado: 'api_concluir_login',
    argsEsperados: { desafio: 'desafio-teste', codigo: { tipo: 'totp', valor: '123456' } },
    chamar: () => comandos.concluirLogin('desafio-teste', { tipo: 'totp', valor: '123456' }),
  },
  {
    nome: 'renovarSessao',
    cmdEsperado: 'api_renovar_sessao',
    argsEsperados: {},
    chamar: () => comandos.renovarSessao(),
  },
  {
    nome: 'encerrarSessao',
    cmdEsperado: 'api_encerrar_sessao',
    argsEsperados: {},
    chamar: () => comandos.encerrarSessao(),
  },
  {
    nome: 'solicitarRedefinicao',
    cmdEsperado: 'api_solicitar_redefinicao',
    argsEsperados: { email: 'usuaria@teste.dev' },
    chamar: () => comandos.solicitarRedefinicao('usuaria@teste.dev'),
  },
  {
    nome: 'concluirRedefinicao',
    cmdEsperado: 'api_concluir_redefinicao',
    argsEsperados: {
      token: 'token-de-teste',
      novaSenha: 'senha-de-teste-12',
      codigo: { tipo: 'recuperacao', valor: 'ABCD-1234-EFGH-5678' },
    },
    chamar: () =>
      comandos.concluirRedefinicao('token-de-teste', 'senha-de-teste-12', {
        tipo: 'recuperacao',
        valor: 'ABCD-1234-EFGH-5678',
      }),
  },
  {
    nome: 'requisicaoAutenticada',
    cmdEsperado: 'api_requisicao_autenticada',
    argsEsperados: { metodo: 'GET', caminho: '/dispositivos', corpo: null },
    chamar: () => comandos.requisicaoAutenticada('GET', '/dispositivos', null),
  },
  {
    nome: 'enviarAuditoriaPendente',
    cmdEsperado: 'enviar_auditoria_pendente',
    argsEsperados: {},
    chamar: () => comandos.enviarAuditoriaPendente(),
  },
  {
    nome: 'reautenticar',
    cmdEsperado: 'reautenticar',
    argsEsperados: { metodo: 'senha', senha: 'senha-de-teste-12' },
    chamar: () => comandos.reautenticar('senha', 'senha-de-teste-12'),
  },
  {
    nome: 'alterarSenhaMestre',
    cmdEsperado: 'alterar_senha_mestre',
    argsEsperados: { atual: 'senha-atual-123', nova: 'senha-nova-456789' },
    chamar: () => comandos.alterarSenhaMestre('senha-atual-123', 'senha-nova-456789'),
  },
  {
    nome: 'previaRedefinicaoLocal',
    cmdEsperado: 'previa_redefinicao_local',
    argsEsperados: {},
    chamar: () => comandos.previaRedefinicaoLocal(),
  },
  {
    nome: 'redefinirDesbloqueioLocal',
    cmdEsperado: 'redefinir_desbloqueio_local',
    argsEsperados: { confirmacao: 'DESCARTAR' },
    chamar: () => comandos.redefinirDesbloqueioLocal('DESCARTAR'),
  },
  {
    nome: 'redefinirComputadorRevogado',
    cmdEsperado: 'redefinir_computador_revogado',
    argsEsperados: { confirmacao: 'DESCARTAR' },
    chamar: () => comandos.redefinirComputadorRevogado('DESCARTAR'),
  },
  {
    nome: 'desbloquearComBiometria',
    cmdEsperado: 'desbloquear_com_biometria',
    argsEsperados: {},
    chamar: () => comandos.desbloquearComBiometria(),
  },
  {
    nome: 'ativarBiometria',
    cmdEsperado: 'ativar_biometria',
    argsEsperados: { senha: 'senha-de-teste-12' },
    chamar: () => comandos.ativarBiometria('senha-de-teste-12'),
  },
  {
    nome: 'desativarBiometria',
    cmdEsperado: 'desativar_biometria',
    argsEsperados: {},
    chamar: () => comandos.desativarBiometria(),
  },
];

describe('comandos-tauri', () => {
  it.each(casos)('$nome invoca $cmdEsperado com os argumentos corretos', async ({ cmdEsperado, argsEsperados, chamar }) => {
    let cmdRecebido = '';
    let argsRecebidos: unknown;
    mockIPC((cmd, args) => {
      cmdRecebido = cmd;
      argsRecebidos = args;
      return null;
    });

    await chamar();

    expect(cmdRecebido).toBe(cmdEsperado);
    expect(argsRecebidos).toEqual(argsEsperados);
  });

  it('tem exatamente as 23 funções do contrato de comandos', () => {
    expect(casos).toHaveLength(23);
  });

  it('converte rejeição objeto { codigo, mensagem } em ErroDoApp com o mesmo código', async () => {
    mockIPC(() => {
      throw { codigo: 'SENHA_MESTRE_INCORRETA', mensagem: 'x' };
    });

    await expect(comandos.desbloquearComSenha('errada')).rejects.toMatchObject({
      name: 'ErroDoApp',
      codigo: 'SENHA_MESTRE_INCORRETA',
      message: 'x',
    });
  });

  it('converte rejeição que não é { codigo, mensagem } em ErroDoApp INTERNO', async () => {
    mockIPC(() => {
      throw 'falha qualquer';
    });

    await expect(comandos.bloquear()).rejects.toMatchObject({
      name: 'ErroDoApp',
      codigo: 'INTERNO',
    });
  });

  it('aoMudarEstado chama o callback quando o evento é emitido', async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const callback = vi.fn();

    await comandos.aoMudarEstado(callback);
    await emit('acesso://estado-alterado', { situacao: 'normal' });

    expect(callback).toHaveBeenCalledWith({ situacao: 'normal' });
  });
});
