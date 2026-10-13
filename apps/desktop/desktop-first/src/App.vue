<script setup lang="ts">
import { RouterView } from "vue-router";
import NotificacaoToast from "./acesso/ui/componentes/NotificacaoToast.vue";
</script>

<template>
  <div class="min-h-screen">
    <RouterView />
    <NotificacaoToast />
  </div>
</template>
