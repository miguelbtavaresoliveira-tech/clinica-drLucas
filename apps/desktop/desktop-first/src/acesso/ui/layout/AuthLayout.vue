<script setup lang="ts">
import { PhShieldCheck } from '@phosphor-icons/vue';
import IndicadorConexao from '../componentes/IndicadorConexao.vue';
import PainelInstitucional from './PainelInstitucional.vue';

const versao = __APP_VERSION__;
</script>

<template>
  <div class="min-h-screen flex flex-col justify-between selection:bg-teal-500 selection:text-white">
    <header class="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-2.5 flex items-center justify-between text-xs z-30">
      <IndicadorConexao />
      <div class="flex items-center gap-4">
        <span class="inline-flex items-center gap-1 text-slate-600">
          <PhShieldCheck class="text-emerald-700" :size="16" weight="bold" aria-hidden="true" />
          Conexão cifrada • LGPD
        </span>
        <span class="text-slate-300 hidden md:inline" aria-hidden="true">|</span>
        <span class="font-mono text-slate-500 font-medium hidden md:inline">v{{ versao }}</span>
      </div>
    </header>

    <main class="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <div
        class="w-full max-w-6xl bg-white rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-200/90 overflow-hidden flex flex-col lg:flex-row min-h-[640px]"
      >
        <PainelInstitucional />

        <div class="lg:w-[54%] p-8 sm:p-12 lg:p-14 flex flex-col justify-between bg-white relative">
          <div class="my-auto py-6 max-w-md w-full mx-auto">
            <slot />
          </div>

          <footer class="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
              <span>Acesso restrito a usuários autorizados</span>
            </div>
            <span class="font-mono text-slate-600 font-semibold">EVO v{{ versao }}</span>
          </footer>
        </div>
      </div>
    </main>
  </div>
</template>
