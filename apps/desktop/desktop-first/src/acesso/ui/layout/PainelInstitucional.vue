<script setup lang="ts">
import { PhActivity, PhLockKey } from '@phosphor-icons/vue';
import AvatarIniciais from '../componentes/AvatarIniciais.vue';
import {
  DESCRICAO,
  ESPECIALIDADE,
  MARCA,
  PROFISSIONAL,
  REGISTRO_PROFISSIONAL,
  SELO,
  SITE,
  TITULO,
} from './conteudo-institucional';
</script>

<template>
  <div class="lg:w-[46%] mesh-gradient relative p-8 sm:p-12 flex flex-col justify-between text-white overflow-hidden">
    <div class="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" aria-hidden="true"></div>
    <div class="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" aria-hidden="true"></div>

    <div class="relative z-10 space-y-6">
      <div class="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 rounded-2xl shadow-sm">
        <div class="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300" aria-hidden="true">
          <PhActivity :size="22" weight="bold" />
        </div>
        <div>
          <div class="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            {{ MARCA }}
            <span class="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/30 text-teal-200 border border-teal-400/30">{{ SELO }}</span>
          </div>
          <div class="text-[11px] font-medium text-slate-300 tracking-wide uppercase">{{ PROFISSIONAL }} • {{ REGISTRO_PROFISSIONAL }}</div>
        </div>
      </div>

      <div class="pt-4 space-y-3">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-xs font-semibold">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-ping" aria-hidden="true"></span>
          Acesso Exclusivo & Operacional
        </div>
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white">{{ TITULO }}</h1>
        <p class="text-sm text-slate-300 leading-relaxed max-w-md">{{ DESCRICAO }}</p>
      </div>
    </div>

    <div class="relative z-10 my-8">
      <div class="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-4 sm:p-5 shadow-lg flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <AvatarIniciais :nome="PROFISSIONAL" tamanho="sm" />
          <div>
            <div class="text-xs font-semibold text-white">{{ PROFISSIONAL }}</div>
            <div class="text-[10px] text-slate-300">{{ ESPECIALIDADE }}</div>
          </div>
        </div>
        <div class="text-[11px] text-teal-200 bg-teal-500/20 px-2 py-0.5 rounded-md border border-teal-400/20 font-medium">
          Acesso protegido
        </div>
      </div>
    </div>

    <div class="relative z-10 pt-2 flex items-center justify-between text-xs text-slate-300 border-t border-white/10">
      <div class="flex items-center gap-1.5">
        <PhLockKey class="text-teal-400" :size="16" weight="bold" aria-hidden="true" />
        <span>Criptografia ponta a ponta</span>
      </div>
      <span class="text-[11px]">{{ SITE }}</span>
    </div>
  </div>
</template>
