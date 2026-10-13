// Único ponto de acesso ao Rust (Tauri). Nenhuma outra parte do app chama
// `invoke`/`listen` diretamente — ver proibição no topo de `07-DESKTOP-FRONTEND.md`.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { paraErroDoApp } from './erros';
import type {
  CodigoInformado,
  EstadoDoAcesso,
  RespostaIniciarLogin,
  ResumoDoLogin,
  SegredoMfa,
} from '../application/tipos';

async function invocar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args ?? {});
  } catch (e) {
    throw paraErroDoApp(e);
  }
}

export function estadoDoAcesso(): Promise<EstadoDoAcesso> {
  return invocar('estado_do_acesso');
}

export function configurarDesbloqueio(senha: string): Promise<EstadoDoAcesso> {
  return invocar('configurar_desbloqueio', { senha });
}

export function desbloquearComSenha(senha: string): Promise<EstadoDoAcesso> {
  return invocar('desbloquear_com_senha', { senha });
}

export function bloquear(): Promise<EstadoDoAcesso> {
  return invocar('bloquear');
}

export function sinalDeAtividade(): Promise<null> {
  return invocar('sinal_de_atividade');
}

export function iniciarLogin(email: string, senha: string): Promise<RespostaIniciarLogin> {
  return invocar('api_iniciar_login', { email, senha });
}

export function gerarSegredoMfa(desafio: string): Promise<SegredoMfa> {
  return invocar('api_gerar_segredo_mfa', { desafio });
}

export function confirmarMfa(
  desafio: string,
  codigo: string,
): Promise<{ codigosDeRecuperacao: string[] }> {
  return invocar('api_confirmar_mfa', { desafio, codigo });
}

export function concluirLogin(desafio: string, codigo: CodigoInformado): Promise<ResumoDoLogin> {
  return invocar('api_concluir_login', { desafio, codigo });
}

export function renovarSessao(): Promise<EstadoDoAcesso> {
  return invocar('api_renovar_sessao');
}

export function encerrarSessao(): Promise<EstadoDoAcesso> {
  return invocar('api_encerrar_sessao');
}

export function solicitarRedefinicao(email: string): Promise<null> {
  return invocar('api_solicitar_redefinicao', { email });
}

export function concluirRedefinicao(
  token: string,
  novaSenha: string,
  codigo: CodigoInformado,
): Promise<null> {
  return invocar('api_concluir_redefinicao', { token, novaSenha, codigo });
}

export function requisicaoAutenticada<T>(
  metodo: 'GET' | 'POST',
  caminho: string,
  corpo: object | null,
): Promise<T> {
  return invocar('api_requisicao_autenticada', { metodo, caminho, corpo });
}

export function enviarAuditoriaPendente(): Promise<{ enviados: number }> {
  return invocar('enviar_auditoria_pendente');
}

export function reautenticar(
  metodo: 'senha' | 'biometria',
  senha: string | null,
): Promise<null> {
  return invocar('reautenticar', { metodo, senha });
}

export function alterarSenhaMestre(atual: string, nova: string): Promise<null> {
  return invocar('alterar_senha_mestre', { atual, nova });
}

export function previaRedefinicaoLocal(): Promise<{ eventosPendentes: number }> {
  return invocar('previa_redefinicao_local');
}

export function redefinirDesbloqueioLocal(confirmacao: 'DESCARTAR'): Promise<EstadoDoAcesso> {
  return invocar('redefinir_desbloqueio_local', { confirmacao });
}

export function redefinirComputadorRevogado(confirmacao: 'DESCARTAR'): Promise<EstadoDoAcesso> {
  return invocar('redefinir_computador_revogado', { confirmacao });
}

export function desbloquearComBiometria(): Promise<EstadoDoAcesso> {
  return invocar('desbloquear_com_biometria');
}

export function ativarBiometria(senha: string): Promise<EstadoDoAcesso> {
  return invocar('ativar_biometria', { senha });
}

export function desativarBiometria(): Promise<EstadoDoAcesso> {
  return invocar('desativar_biometria');
}

export async function aoMudarEstado(cb: (estado: EstadoDoAcesso) => void): Promise<() => void> {
  return listen<EstadoDoAcesso>('acesso://estado-alterado', (evento) => {
    cb(evento.payload);
  });
}
