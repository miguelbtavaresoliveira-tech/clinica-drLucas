<script setup lang="ts">
import { computed } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import AppShell from '../layout/AppShell.vue';

const { estado } = useEstadoDoAcesso();

const primeiroNome = computed(() => estado.value?.usuario?.nome.trim().split(/\s+/)[0] ?? '');
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Olá, {{ primeiroNome }}</h1>
    <section class="mt-6 bg-white rounded-2xl border border-slate-200 p-6 text-slate-600" aria-label="Módulos clínicos">
      Os módulos clínicos aparecerão aqui.
    </section>
  </AppShell>
</template>
