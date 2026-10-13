<script setup lang="ts">
import { PhCheck, PhWarning, PhWarningCircle } from '@phosphor-icons/vue';
import { onUnmounted } from 'vue';
import { limparToasts, useToastsVisiveis } from '../composables/useToast';

const { toasts } = useToastsVisiveis();

const fundoDoIcone = { sucesso: 'bg-emerald-500', aviso: 'bg-amber-500', erro: 'bg-rose-500' } as const;
const icones = { sucesso: PhCheck, aviso: PhWarning, erro: PhWarningCircle } as const;

onUnmounted(limparToasts);
</script>

<template>
  <div aria-live="polite" class="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 items-end pointer-events-none">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 text-xs"
    >
      <div :class="['w-6 h-6 rounded-full text-white flex items-center justify-center shrink-0', fundoDoIcone[t.variante]]" aria-hidden="true">
        <component :is="icones[t.variante]" :size="14" weight="bold" />
      </div>
      <span>{{ t.texto }}</span>
    </div>
  </div>
</template>
