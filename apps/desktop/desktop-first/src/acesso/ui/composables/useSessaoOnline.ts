import { onUnmounted, ref, watch } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { renovarSessao } from '../../infrastructure/comandos-tauri';
import { paraErroDoApp } from '../../infrastructure/erros';

const INTERVALO_MS = 10 * 60_000;

export type ErroDeSessao = 'SESSAO_EXPIRADA' | 'SEM_CONEXAO' | null;

/**
 * Mantém a sessão do servidor viva: renova ao desbloquear, a cada 10 min e quando a internet volta.
 * Revogação do dispositivo não é tratada aqui: o Rust emite o estado `revogado`.
 */
export function useSessaoOnline(ativo?: () => boolean) {
  const { estado, sincronizarCom } = useEstadoDoAcesso();
  const estaAtivo = ativo ?? (() => estado.value?.situacao === 'normal' || estado.value?.situacao === 'somente_leitura');
  const ultimoErro = ref<ErroDeSessao>(null);
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let escutando = false;

  async function renovar(): Promise<void> {
    try {
      sincronizarCom(await renovarSessao());
      ultimoErro.value = null;
    } catch (e) {
      const codigo = paraErroDoApp(e).codigo;
      if (codigo === 'SESSAO_EXPIRADA' || codigo === 'SEM_CONEXAO') ultimoErro.value = codigo;
    }
  }

  function aoVoltarOnline(): void {
    void renovar();
  }

  function iniciar(): void {
    if (escutando) return;
    escutando = true;
    void renovar();
    intervalo = setInterval(() => {
      void renovar();
    }, INTERVALO_MS);
    window.addEventListener('online', aoVoltarOnline);
  }

  function parar(): void {
    if (!escutando) return;
    escutando = false;
    if (intervalo !== null) clearInterval(intervalo);
    intervalo = null;
    window.removeEventListener('online', aoVoltarOnline);
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

  return { ultimoErro, renovar };
}
