import { readonly, ref } from 'vue';

export type VarianteDeToast = 'sucesso' | 'aviso' | 'erro';

export interface Toast {
  id: number;
  texto: string;
  variante: VarianteDeToast;
}

const toasts = ref<Toast[]>([]);
const temporizadores = new Map<number, ReturnType<typeof setTimeout>>();
let proximoId = 1;

function remover(id: number): void {
  const t = temporizadores.get(id);
  if (t !== undefined) clearTimeout(t);
  temporizadores.delete(id);
  toasts.value = toasts.value.filter((x) => x.id !== id);
}

function mostrar(texto: string, variante: VarianteDeToast = 'sucesso', duracaoMs = 3500): void {
  const id = proximoId++;
  toasts.value = [...toasts.value, { id, texto, variante }];
  temporizadores.set(
    id,
    setTimeout(() => {
      remover(id);
    }, duracaoMs),
  );
}

/** Para a UI de apresentação (`NotificacaoToast`). */
export function useToastsVisiveis() {
  return { toasts: readonly(toasts), remover };
}

/** Cancela todos os timers (desmontagem do componente e testes). */
export function limparToasts(): void {
  for (const t of temporizadores.values()) clearTimeout(t);
  temporizadores.clear();
  toasts.value = [];
}

export function useToast(): { mostrar: typeof mostrar } {
  return { mostrar };
}
