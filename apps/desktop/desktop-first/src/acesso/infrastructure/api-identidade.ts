// Chamadas à API HTTP do backend, sempre via `requisicaoAutenticada` (o token
// nunca trafega por este arquivo — fica só no lado Rust, D-005).
import { requisicaoAutenticada } from './comandos-tauri';
import { ErroDoApp } from './erros';
import type { ItemDeDispositivo, SegredoMfa } from '../application/tipos';

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarId(id: string): void {
  if (!REGEX_UUID.test(id)) {
    throw new ErroDoApp('INTERNO', 'Erro interno.');
  }
}

export async function listarDispositivos(): Promise<ItemDeDispositivo[]> {
  const resposta = await requisicaoAutenticada<{ dispositivos: ItemDeDispositivo[] }>(
    'GET',
    '/dispositivos',
    null,
  );
  return resposta.dispositivos;
}

export async function revogarDispositivo(
  id: string,
  motivo: string,
  codigoMfa: string,
): Promise<void> {
  validarId(id);
  await requisicaoAutenticada('POST', `/dispositivos/${id}/revogar`, { motivo, codigoMfa });
}

export async function trocarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  await requisicaoAutenticada('POST', '/auth/senha/trocar', { senhaAtual, novaSenha });
}

export async function regenerarCodigos(codigoMfa: string): Promise<string[]> {
  const resposta = await requisicaoAutenticada<{ codigosDeRecuperacao: string[] }>(
    'POST',
    '/auth/mfa/codigos',
    { codigoMfa },
  );
  return resposta.codigosDeRecuperacao;
}

export async function iniciarReconfiguracaoMfa(senhaAtual: string): Promise<SegredoMfa> {
  return requisicaoAutenticada<SegredoMfa>('POST', '/auth/mfa/reconfigurar', { senhaAtual });
}

export async function confirmarReconfiguracaoMfa(codigo: string): Promise<string[]> {
  const resposta = await requisicaoAutenticada<{ codigosDeRecuperacao: string[] }>(
    'POST',
    '/auth/mfa/reconfigurar/confirmar',
    { codigo },
  );
  return resposta.codigosDeRecuperacao;
}
