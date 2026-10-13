<script setup lang="ts">
import { PhActivity, PhLock } from '@phosphor-icons/vue';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { bloquear } from '../../infrastructure/comandos-tauri';
import AvatarIniciais from '../componentes/AvatarIniciais.vue';
import BannerSessao from '../componentes/BannerSessao.vue';
import BannerSomenteLeitura from '../componentes/BannerSomenteLeitura.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import IndicadorConexao from '../componentes/IndicadorConexao.vue';
import ReautenticacaoModal from '../componentes/ReautenticacaoModal.vue';
import { useSessaoOnline } from '../composables/useSessaoOnline';
import { useSinalDeAtividade } from '../composables/useSinalDeAtividade';

const { estado } = useEstadoDoAcesso();
const { ultimoErro, renovar } = useSessaoOnline();
useSinalDeAtividade();

const tentando = ref(false);
const bloqueando = ref(false);

async function tentarConectar(): Promise<void> {
  tentando.value = true;
  try {
    await renovar();
  } finally {
    tentando.value = false;
  }
}

async function bloquearAgora(): Promise<void> {
  bloqueando.value = true;
  try {
    // O estado emitido pelo Rust leva o app à tela de desbloqueio.
    await bloquear();
  } catch {
    // Se falhar, o app continua aberto; o usuário pode tentar de novo.
  } finally {
    bloqueando.value = false;
  }
}

const links = [
  { nome: 'inicio', texto: 'Início' },
  { nome: 'dispositivos', texto: 'Dispositivos' },
  { nome: 'seguranca', texto: 'Segurança' },
] as const;
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-2.5 flex items-center justify-between gap-4 text-sm z-30">
      <div class="flex items-center gap-6 min-w-0">
        <div class="flex items-center gap-2 font-bold text-slate-900 shrink-0">
          <span class="w-8 h-8 rounded-xl bg-brand-700/10 text-brand-700 flex items-center justify-center" aria-hidden="true">
            <PhActivity :size="18" weight="bold" />
          </span>
          EVO Clínica
        </div>
        <nav aria-label="Principal" class="flex items-center gap-1">
          <RouterLink
            v-for="l in links"
            :key="l.nome"
            :to="{ name: l.nome }"
            class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            active-class="!text-brand-700 font-semibold bg-brand-50"
            exact-active-class="!text-brand-700 font-semibold bg-brand-50"
          >
            {{ l.texto }}
          </RouterLink>
        </nav>
      </div>

      <div class="flex items-center gap-4 text-xs shrink-0">
        <IndicadorConexao />
        <div v-if="estado?.usuario" class="flex items-center gap-2">
          <AvatarIniciais :nome="estado.usuario.nome" tamanho="sm" />
          <span class="truncate max-w-[12rem] font-medium text-slate-800">{{ estado.usuario.nome }}</span>
        </div>
        <BaseBotao variante="fantasma" class="!min-h-9 !py-2" :carregando="bloqueando" texto-carregando="Bloqueando..." @click="bloquearAgora">
          Bloquear
          <template #icone><PhLock :size="16" weight="bold" aria-hidden="true" /></template>
        </BaseBotao>
      </div>
    </header>

    <BannerSomenteLeitura v-if="estado?.situacao === 'somente_leitura'" :tentando="tentando" @tentar="tentarConectar" />
    <BannerSessao :erro="ultimoErro" />

    <main class="flex-1 w-full max-w-6xl mx-auto p-6">
      <slot />
    </main>

    <ReautenticacaoModal />
  </div>
</template>
