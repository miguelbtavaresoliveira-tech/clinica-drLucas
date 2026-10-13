<script setup lang="ts">
import { PhCircleNotch } from '@phosphor-icons/vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo';
    tipo?: 'button' | 'submit';
    carregando?: boolean;
    desabilitado?: boolean;
    larguraTotal?: boolean;
    textoCarregando?: string;
  }>(),
  { variante: 'primario', tipo: 'button', carregando: false, desabilitado: false, larguraTotal: false },
);

const classesDaVariante = {
  primario:
    'bg-brand-700 hover:bg-brand-800 active:bg-brand-900 text-white shadow-lg shadow-brand-700/25 hover:shadow-brand-700/35',
  secundario: 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 active:bg-slate-100',
  fantasma: 'bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100',
  perigo: 'bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white shadow-lg shadow-rose-700/25',
} as const;

const inativo = computed(() => props.carregando || props.desabilitado);
</script>

<template>
  <button
    :type="tipo"
    :disabled="inativo"
    :aria-busy="carregando ? 'true' : undefined"
    :class="[
      'min-h-11 py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
      'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none',
      larguraTotal ? 'w-full' : '',
      classesDaVariante[variante],
    ]"
  >
    <template v-if="carregando">
      <PhCircleNotch class="animate-spin" :size="18" weight="bold" aria-hidden="true" />
      <span>{{ textoCarregando ?? 'Aguarde…' }}</span>
    </template>
    <template v-else>
      <slot name="icone" />
      <span><slot /></span>
    </template>
  </button>
</template>
