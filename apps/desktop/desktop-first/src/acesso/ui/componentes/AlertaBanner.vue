<script setup lang="ts">
import { PhCheckCircle, PhInfo, PhWarning, PhWarningCircle } from '@phosphor-icons/vue';
import { computed } from 'vue';

const props = defineProps<{
  variante: 'erro' | 'aviso' | 'sucesso' | 'info';
  titulo: string;
}>();

const estilos = {
  erro: { caixa: 'bg-rose-50 border-rose-200', icone: 'bg-rose-100 text-rose-700', titulo: 'text-rose-900', texto: 'text-rose-800' },
  aviso: { caixa: 'bg-amber-50 border-amber-200', icone: 'bg-amber-100 text-amber-800', titulo: 'text-amber-900', texto: 'text-amber-900' },
  sucesso: { caixa: 'bg-emerald-50 border-emerald-200', icone: 'bg-emerald-100 text-emerald-800', titulo: 'text-emerald-900', texto: 'text-emerald-900' },
  info: { caixa: 'bg-teal-50 border-teal-200', icone: 'bg-teal-100 text-teal-800', titulo: 'text-teal-900', texto: 'text-teal-900' },
} as const;

const icones = { erro: PhWarningCircle, aviso: PhWarning, sucesso: PhCheckCircle, info: PhInfo } as const;

const estilo = computed(() => estilos[props.variante]);
const papel = computed(() => (props.variante === 'erro' || props.variante === 'aviso' ? 'alert' : 'status'));
</script>

<template>
  <div :role="papel" :class="['p-4 rounded-2xl border flex items-start gap-3', estilo.caixa]">
    <div :class="['w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', estilo.icone]" aria-hidden="true">
      <component :is="icones[variante]" :size="20" weight="bold" />
    </div>
    <div class="flex-1">
      <h4 :class="['text-xs font-bold', estilo.titulo]">{{ titulo }}</h4>
      <div :class="['text-xs mt-0.5', estilo.texto]"><slot /></div>
    </div>
  </div>
</template>
