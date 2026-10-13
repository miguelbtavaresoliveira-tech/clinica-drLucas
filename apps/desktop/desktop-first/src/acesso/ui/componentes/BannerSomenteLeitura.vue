<script setup lang="ts">
import { PhWarning } from '@phosphor-icons/vue';
import BaseBotao from './BaseBotao.vue';

defineProps<{ tentando?: boolean }>();
const emit = defineEmits<{ tentar: [] }>();
</script>

<template>
  <div role="status" class="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900">
    <PhWarning :size="20" weight="bold" class="shrink-0" aria-hidden="true" />
    <p class="flex-1 min-w-64">
      <strong>Modo somente leitura:</strong> este computador está sem sincronizar há muito tempo ou o relógio foi
      alterado. Conecte-se à internet para voltar a editar.
    </p>
    <BaseBotao variante="secundario" class="!min-h-9 !py-2" :carregando="tentando" texto-carregando="Conectando..." @click="emit('tentar')">
      Tentar conectar
    </BaseBotao>
  </div>
</template>
