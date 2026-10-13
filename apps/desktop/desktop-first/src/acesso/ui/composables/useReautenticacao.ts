import { readonly, ref } from 'vue';
import { paraErroDoApp } from '../../infrastructure/erros';

// Estado do modal de reautenticação (singleton de módulo): um único modal montado no AppShell.
const aberto = ref(false);
let resolver: ((ok: boolean) => void) | null = null;
let pendente: Promise<boolean> | null = null;

function exigir(): Promise<boolean> {
  // Chamadas simultâneas compartilham o mesmo modal e o mesmo resultado.
  pendente ??= new Promise<boolean>((resolve) => {
    resolver = resolve;
    aberto.value = true;
  });
  return pendente;
}

/** Chamado pelo modal: `true` = reautenticou; `false` = cancelou ou o app foi bloqueado. */
function concluir(ok: boolean): void {
  aberto.value = false;
  const resolve = resolver;
  resolver = null;
  pendente = null;
  resolve?.(ok);
}

/** Só o erro vindo do Rust (sem status HTTP) pede a senha mestre; o do servidor (com status) é do formulário. */
function pedeReautenticacaoLocal(e: unknown): boolean {
  const erro = paraErroDoApp(e);
  return erro.codigo === 'REAUTENTICACAO_NECESSARIA' && erro.extras.status === undefined;
}

async function comReautenticacao<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (e) {
    if (!pedeReautenticacaoLocal(e)) throw e;
    if (!(await exigir())) throw e;
    return acao();
  }
}

export function useReautenticacao(): {
  exigir(): Promise<boolean>;
  comReautenticacao<T>(acao: () => Promise<T>): Promise<T>;
} {
  return { exigir, comReautenticacao };
}

/** Para o `ReautenticacaoModal`. */
export function useEstadoDoModalDeReautenticacao() {
  return { aberto: readonly(aberto), concluir };
}

/** Uso exclusivo de testes. */
export function reiniciarReautenticacaoParaTeste(): void {
  concluir(false);
}
