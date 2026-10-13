<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ nome: string; tamanho?: 'sm' | 'md' }>(), { tamanho: 'md' });

/** Primeira letra do primeiro e do último nome. */
const iniciais = computed(() => {
  const partes = props.nome.trim().split(/\s+/).filter(Boolean);
  const primeiro = partes[0];
  if (primeiro === undefined) return '?';
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined;
  return `${[...primeiro][0] ?? ''}${ultimo === undefined ? '' : ([...ultimo][0] ?? '')}`.toUpperCase();
});
</script>

<template>
  <span
    aria-hidden="true"
    :class="[
      'rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center shrink-0',
      tamanho === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm',
    ]"
    >{{ iniciais }}</span
  >
</template>
