<script setup lang="ts">
import { PhShieldWarning } from '@phosphor-icons/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { redefinirComputadorRevogado } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import AuthLayout from '../layout/AuthLayout.vue';

const PALAVRA = 'DESCARTAR';

const router = useRouter();
const { sincronizarCom } = useEstadoDoAcesso();

const modalAberto = ref(false);
const confirmacao = ref('');
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

function abrir(): void {
  confirmacao.value = '';
  banner.value = null;
  modalAberto.value = true;
}

async function redefinir(): Promise<void> {
  if (confirmacao.value !== PALAVRA || enviando.value) return;
  banner.value = null;
  enviando.value = true;
  try {
    sincronizarCom(await redefinirComputadorRevogado(PALAVRA));
    modalAberto.value = false;
    await router.push({ name: 'login' });
  } catch (e) {
    banner.value = mensagemAmigavel(paraErroDoApp(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-4 mb-8">
      <div class="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center" aria-hidden="true">
        <PhShieldWarning :size="30" weight="bold" />
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Este computador foi desconectado</h2>
      <p class="text-sm text-slate-600">
        O acesso deste computador foi revogado. Os dados locais continuam protegidos pela criptografia e não podem ser
        abertos.
      </p>
    </div>

    <BaseBotao variante="perigo" larguraTotal @click="abrir">Redefinir este computador</BaseBotao>

    <ModalDialogo :aberto="modalAberto" titulo="Redefinir este computador" @fechar="modalAberto = false">
      <div class="space-y-4">
        <AlertaBanner variante="erro" titulo="Ação irreversível">Todos os dados locais deste computador serão apagados.</AlertaBanner>
        <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
        <CampoTexto
          id="input-confirmar-redefinicao"
          v-model="confirmacao"
          data-autofocus
          rotulo="Digite DESCARTAR para confirmar"
          autocomplete="off"
          monoespacado
          :desabilitado="enviando"
        />
      </div>
      <template #acoes>
        <BaseBotao variante="secundario" :desabilitado="enviando" @click="modalAberto = false">Cancelar</BaseBotao>
        <BaseBotao
          variante="perigo"
          :desabilitado="confirmacao !== PALAVRA"
          :carregando="enviando"
          texto-carregando="Apagando..."
          @click="redefinir"
        >
          Apagar dados e redefinir
        </BaseBotao>
      </template>
    </ModalDialogo>
  </AuthLayout>
</template>
