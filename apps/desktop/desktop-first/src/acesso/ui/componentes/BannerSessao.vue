<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { ErroDeSessao } from '../composables/useSessaoOnline';

defineProps<{ erro: ErroDeSessao }>();
</script>

<template>
  <div
    v-if="erro === 'SESSAO_EXPIRADA'"
    role="status"
    class="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-sm text-amber-900 flex flex-wrap items-center gap-2"
  >
    <span>Sua sessão no servidor expirou. Entre novamente para sincronizar.</span>
    <RouterLink :to="{ name: 'login' }" class="font-bold underline">Entrar</RouterLink>
  </div>
  <div v-else-if="erro === 'SEM_CONEXAO'" role="status" class="px-6 py-1.5 text-xs text-slate-600 bg-slate-50 border-b border-slate-200">
    Sem conexão. Trabalhando no modo local.
  </div>
</template>
