// Estado transitório do login em andamento (singleton de módulo). Fica só em memória:
// o desafio nunca é persistido (nenhum armazenamento do navegador).
import { readonly, ref, type Ref } from 'vue';
import type { RespostaIniciarLogin } from './tipos';

const desafio = ref<string | null>(null);
const mfa = ref<'configurar' | 'verificar' | null>(null);
const aviso = ref<string | null>(null);

function iniciar(r: RespostaIniciarLogin): void {
  desafio.value = r.desafio;
  mfa.value = r.mfa;
}

/** Depois de configurar o MFA, o mesmo desafio é usado para concluir com o código do autenticador. */
function avancarParaVerificacao(): void {
  mfa.value = 'verificar';
}

function limpar(): void {
  desafio.value = null;
  mfa.value = null;
}

export function useFluxoDeLogin() {
  return {
    desafio: readonly(desafio) as Readonly<Ref<string | null>>,
    mfa: readonly(mfa) as Readonly<Ref<'configurar' | 'verificar' | null>>,
    aviso,
    iniciar,
    avancarParaVerificacao,
    limpar,
  };
}

/** Uso exclusivo de testes. */
export function reiniciarFluxoDeLoginParaTeste(): void {
  limpar();
  aviso.value = null;
}
