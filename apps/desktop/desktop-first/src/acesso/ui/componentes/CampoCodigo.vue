<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { somenteDigitos } from '../../application/validacoes';

const props = withDefaults(
  defineProps<{
    id: string;
    rotulo: string;
    modelValue: string;
    erro?: string | null;
    desabilitado?: boolean;
    autofoco?: boolean;
  }>(),
  { erro: null, desabilitado: false, autofoco: false },
);

const emit = defineEmits<{ 'update:modelValue': [valor: string]; completo: [codigo: string] }>();

const campo = ref<HTMLInputElement | null>(null);
const descritoPor = computed(() => (props.erro ? `${props.id}-erro` : undefined));

onMounted(async () => {
  if (!props.autofoco) return;
  await nextTick();
  campo.value?.focus();
});

function aplicar(alvo: HTMLInputElement, bruto: string): void {
  const limpo = somenteDigitos(bruto, 6);
  alvo.value = limpo;
  emit('update:modelValue', limpo);
  if (limpo.length === 6) emit('completo', limpo);
}

function aoDigitar(evento: Event): void {
  const alvo = evento.target as HTMLInputElement;
  aplicar(alvo, alvo.value);
}

/** O maxlength do navegador cortaria "123 456" antes da limpeza; por isso o colar é tratado aqui. */
function aoColar(evento: ClipboardEvent): void {
  const texto = evento.clipboardData?.getData('text');
  if (texto === undefined) return;
  evento.preventDefault();
  aplicar(evento.target as HTMLInputElement, texto);
}
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-xs font-bold uppercase tracking-wider text-slate-700">{{ rotulo }}</label>
    <input
      :id="id"
      ref="campo"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      :value="modelValue"
      :disabled="desabilitado"
      :aria-invalid="erro ? 'true' : undefined"
      :aria-describedby="descritoPor"
      :class="[
        'w-full py-3 rounded-xl text-2xl font-mono font-semibold tracking-[0.5em] text-center text-slate-800 shadow-sm transition-all',
        'focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed',
        erro
          ? 'bg-rose-50/40 border-2 border-rose-500 focus:ring-rose-500/20 focus:border-rose-600'
          : 'bg-slate-50/70 border border-slate-300 focus:ring-teal-700/20 focus:border-teal-700 focus:bg-white',
      ]"
      @input="aoDigitar"
      @paste="aoColar"
    />
    <p v-if="erro" :id="`${id}-erro`" class="text-xs font-medium text-rose-700">{{ erro }}</p>
  </div>
</template>
