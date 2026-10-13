<script setup lang="ts">
import { PhWifiSlash } from '@phosphor-icons/vue';
import { ref } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { renovarSessao } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import AuthLayout from '../layout/AuthLayout.vue';

const { sincronizarCom } = useEstadoDoAcesso();
const banner = ref<{ titulo: string; texto: string } | null>(null);
const tentando = ref(false);

async function tentarAgora(): Promise<void> {
  banner.value = null;
  tentando.value = true;
  try {
    // Com sucesso o Rust emite o novo estado e o app sai desta tela sozinho.
    sincronizarCom(await renovarSessao());
  } catch (e) {
    banner.value = mensagemAmigavel(paraErroDoApp(e));
  } finally {
    tentando.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-8">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
        <PhWifiSlash :size="14" weight="bold" aria-hidden="true" />
        Sem sincronizar
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Conecte-se para continuar</h2>
      <p class="text-sm text-slate-600">
        Este computador está há muitos dias sem conexão ou o relógio foi alterado. Por segurança, os dados ficam
        indisponíveis até a próxima conexão.
      </p>
    </div>

    <AlertaBanner v-if="banner" class="mb-5" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <BaseBotao larguraTotal :carregando="tentando" texto-carregando="Conectando..." @click="tentarAgora">Tentar agora</BaseBotao>
  </AuthLayout>
</template>
