<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue';
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

const props = defineProps<{
  aberto: boolean;
  titulo: string;
  descricao?: string;
}>();

const emit = defineEmits<{ fechar: [] }>();

const idBase = useId();
const idTitulo = `${idBase}-titulo`;
const idDescricao = `${idBase}-descricao`;
const caixa = ref<HTMLElement | null>(null);
let gatilho: HTMLElement | null = null;

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(): HTMLElement[] {
  return Array.from(caixa.value?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
}

watch(
  () => props.aberto,
  async (aberto) => {
    if (aberto) {
      gatilho = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      // Um campo marcado com data-autofocus tem preferência; senão, o primeiro elemento focável.
      const preferido = caixa.value?.querySelector<HTMLElement>('input[data-autofocus], [data-autofocus] input');
      (preferido ?? focaveis()[0])?.focus();
    } else {
      gatilho?.focus();
      gatilho = null;
    }
  },
);

onBeforeUnmount(() => {
  if (props.aberto) gatilho?.focus();
});

function aoPressionarTecla(evento: KeyboardEvent): void {
  if (evento.key === 'Escape') {
    evento.stopPropagation();
    emit('fechar');
    return;
  }
  if (evento.key !== 'Tab') return;
  const itens = focaveis();
  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];
  if (primeiro === undefined || ultimo === undefined) {
    evento.preventDefault();
    return;
  }
  if (evento.shiftKey && document.activeElement === primeiro) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primeiro.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="aberto"
      class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="emit('fechar')"
    >
      <div
        ref="caixa"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="idTitulo"
        :aria-describedby="descricao ? idDescricao : undefined"
        class="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 relative"
        @keydown="aoPressionarTecla"
      >
        <button
          type="button"
          aria-label="Fechar"
          class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors"
          @click="emit('fechar')"
        >
          <PhX :size="16" weight="bold" aria-hidden="true" />
        </button>
        <h2 :id="idTitulo" class="text-lg font-extrabold text-slate-900 pr-10">{{ titulo }}</h2>
        <p v-if="descricao" :id="idDescricao" class="text-sm text-slate-600 mt-1">{{ descricao }}</p>
        <div class="mt-5"><slot /></div>
        <div v-if="$slots['acoes']" class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <slot name="acoes" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
