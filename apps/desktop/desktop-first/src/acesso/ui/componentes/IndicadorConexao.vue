<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const online = ref(navigator.onLine);

function marcarOnline(): void {
  online.value = true;
}

function marcarOffline(): void {
  online.value = false;
}

onMounted(() => {
  online.value = navigator.onLine;
  window.addEventListener('online', marcarOnline);
  window.addEventListener('offline', marcarOffline);
});

onUnmounted(() => {
  window.removeEventListener('online', marcarOnline);
  window.removeEventListener('offline', marcarOffline);
});
</script>

<template>
  <span role="status" class="inline-flex items-center gap-1.5 font-semibold text-slate-700">
    <span
      aria-hidden="true"
      :class="['w-2 h-2 rounded-full', online ? 'bg-emerald-500 motion-safe:animate-pulse' : 'bg-amber-500']"
    ></span>
    {{ online ? 'Online' : 'Offline — modo local' }}
  </span>
</template>
