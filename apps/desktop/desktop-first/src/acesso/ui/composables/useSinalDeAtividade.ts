import { onUnmounted, watch } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { sinalDeAtividade } from '../../infrastructure/comandos-tauri';

const INTERVALO_MINIMO_MS = 10_000;
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Avisa o Rust que o usuário está ativo (no máximo 1 vez a cada 10 s). O relógio de inatividade
 * fica no Rust (DT-11): aqui só são enviados sinais, nunca contado tempo.
 */
export function useSinalDeAtividade(ativo?: () => boolean): void {
  const { estado } = useEstadoDoAcesso();
  const estaAtivo = ativo ?? (() => estado.value?.situacao === 'normal' || estado.value?.situacao === 'somente_leitura');
  let ultimoEnvio = 0;
  let escutando = false;

  function aoHaverAtividade(): void {
    const agora = Date.now();
    if (agora - ultimoEnvio < INTERVALO_MINIMO_MS) return;
    ultimoEnvio = agora;
    sinalDeAtividade().catch(() => undefined);
  }

  function iniciar(): void {
    if (escutando) return;
    escutando = true;
    for (const nome of EVENTOS) window.addEventListener(nome, aoHaverAtividade, { passive: true });
  }

  function parar(): void {
    if (!escutando) return;
    escutando = false;
    for (const nome of EVENTOS) window.removeEventListener(nome, aoHaverAtividade);
  }

  watch(
    estaAtivo,
    (ligado) => {
      if (ligado) iniciar();
      else parar();
    },
    { immediate: true },
  );
  onUnmounted(parar);
}
