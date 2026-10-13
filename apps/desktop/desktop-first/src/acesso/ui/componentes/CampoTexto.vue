<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    id: string;
    rotulo: string;
    modelValue: string;
    tipo?: 'text' | 'email';
    obrigatorio?: boolean;
    erro?: string | null;
    dica?: string;
    autocomplete?: string;
    placeholder?: string;
    desabilitado?: boolean;
    maxlength?: number;
    monoespacado?: boolean;
  }>(),
  { tipo: 'text', obrigatorio: false, erro: null, desabilitado: false, monoespacado: false },
);

const emit = defineEmits<{ 'update:modelValue': [valor: string] }>();

const descritoPor = computed(() => {
  const ids: string[] = [];
  if (props.erro) ids.push(`${props.id}-erro`);
  if (props.dica) ids.push(`${props.id}-dica`);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

function aoDigitar(evento: Event): void {
  emit('update:modelValue', (evento.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
      {{ rotulo }}
      <span v-if="obrigatorio" class="text-rose-600" aria-hidden="true"> *</span>
    </label>
    <div class="relative">
      <div
        v-if="$slots['icone']"
        :class="['absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none', erro ? 'text-rose-600' : 'text-slate-500']"
        aria-hidden="true"
      >
        <slot name="icone" />
      </div>
      <input
        :id="id"
        :type="tipo"
        :value="modelValue"
        :required="obrigatorio"
        :disabled="desabilitado"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :aria-invalid="erro ? 'true' : undefined"
        :aria-describedby="descritoPor"
        :class="[
          'w-full py-3 pr-4 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-500 shadow-sm transition-all',
          'focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed',
          monoespacado ? 'font-mono' : '',
          $slots['icone'] ? 'pl-11' : 'pl-4',
          erro
            ? 'bg-rose-50/40 border-2 border-rose-500 focus:ring-rose-500/20 focus:border-rose-600'
            : 'bg-slate-50/70 hover:bg-slate-50 border border-slate-300 focus:ring-teal-700/20 focus:border-teal-700 focus:bg-white',
        ]"
        @input="aoDigitar"
      />
    </div>
    <p v-if="erro" :id="`${id}-erro`" class="text-xs font-medium text-rose-700">{{ erro }}</p>
    <p v-if="dica" :id="`${id}-dica`" class="text-xs text-slate-600">{{ dica }}</p>
  </div>
</template>
