<script setup lang="ts">
import { RouterView } from "vue-router";
import NotificacaoToast from "./acesso/ui/componentes/NotificacaoToast.vue";
import { useEstadoDoAcessoNaUI } from "./acesso/ui/composables/useEstadoDoAcesso";

useEstadoDoAcessoNaUI();
</script>

<template>
  <div class="min-h-screen">
    <RouterView />
    <NotificacaoToast />
  </div>
</template>
