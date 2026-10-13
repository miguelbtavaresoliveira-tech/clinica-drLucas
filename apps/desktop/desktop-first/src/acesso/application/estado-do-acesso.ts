// Estado do acesso espelhado do Rust (singleton de módulo). Só leitura para a UI:
// quem altera é o Rust, que avisa pelo evento `acesso://estado-alterado`.
import { readonly, ref, type Ref } from 'vue';
import { aoMudarEstado, estadoDoAcesso } from '../infrastructure/comandos-tauri';
import type { EstadoDoAcesso } from './tipos';

const estado = ref<EstadoDoAcesso | null>(null);
let removerEscuta: (() => void) | null = null;
let registrando: Promise<void> | null = null;

async function carregar(): Promise<EstadoDoAcesso> {
  const atual = await estadoDoAcesso();
  estado.value = atual;
  return atual;
}

function definir(e: EstadoDoAcesso): void {
  estado.value = e;
}

/**
 * Comandos que mudam o estado devolvem o novo `EstadoDoAcesso`. Aplicá-lo na hora evita que o guard
 * do roteador consulte um estado velho caso a resposta chegue antes do evento do Rust.
 */
function sincronizarCom(resposta: unknown): void {
  if (typeof resposta === 'object' && resposta !== null && 'situacao' in resposta && typeof resposta.situacao === 'string') {
    estado.value = resposta as EstadoDoAcesso;
  }
}

/** Registra o listener uma única vez, mesmo com chamadas simultâneas. */
function iniciarEscuta(): Promise<void> {
  if (removerEscuta !== null) return Promise.resolve();
  registrando ??= aoMudarEstado(definir)
    .then((remover) => {
      removerEscuta = remover;
    })
    .finally(() => {
      registrando = null;
    });
  return registrando;
}

function pararEscuta(): void {
  removerEscuta?.();
  removerEscuta = null;
}

export function useEstadoDoAcesso() {
  return {
    estado: readonly(estado) as Readonly<Ref<EstadoDoAcesso | null>>,
    carregar,
    definir,
    sincronizarCom,
    iniciarEscuta,
    pararEscuta,
  };
}

/** Uso exclusivo de testes: volta o singleton ao estado inicial. */
export function reiniciarEstadoDoAcessoParaTeste(): void {
  pararEscuta();
  registrando = null;
  estado.value = null;
}
