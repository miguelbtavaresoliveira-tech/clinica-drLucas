<script setup lang="ts">
import { PhCopy } from '@phosphor-icons/vue';
import { useToast } from '../composables/useToast';
import AlertaBanner from './AlertaBanner.vue';
import BaseBotao from './BaseBotao.vue';

const props = defineProps<{ codigos: string[] }>();

const { mostrar } = useToast();

async function copiarTodos(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.codigos.join('\n'));
    mostrar('Códigos copiados');
  } catch {
    mostrar('Não foi possível copiar. Anote os códigos manualmente.', 'aviso');
  }
}
</script>

<template>
  <div class="space-y-4">
    <AlertaBanner variante="aviso" titulo="Guarde estes códigos agora">
      Estes códigos aparecem só agora. Cada um funciona uma vez. Guarde-os fora deste computador.
    </AlertaBanner>
    <ul class="grid grid-cols-2 gap-2" aria-label="Códigos de recuperação">
      <li
        v-for="codigo in codigos"
        :key="codigo"
        class="font-mono text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center"
      >
        {{ codigo }}
      </li>
    </ul>
    <BaseBotao variante="secundario" class="!min-h-9 !py-2" @click="copiarTodos">
      Copiar todos
      <template #icone><PhCopy :size="16" weight="bold" aria-hidden="true" /></template>
    </BaseBotao>
  </div>
</template>
