<script setup lang="ts">
import { PhFingerprint, PhLockKey } from '@phosphor-icons/vue';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { reautenticar } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import { useEstadoDoModalDeReautenticacao } from '../composables/useReautenticacao';
import AlertaBanner from './AlertaBanner.vue';
import BaseBotao from './BaseBotao.vue';
import CampoSenha from './CampoSenha.vue';
import ModalDialogo from './ModalDialogo.vue';

const ID_SENHA = 'input-reautenticacao';

const { aberto, concluir } = useEstadoDoModalDeReautenticacao();
const { estado } = useEstadoDoAcesso();

const senha = ref('');
const erroSenha = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);
const segundos = ref(0);
let temporizador: ReturnType<typeof setInterval> | null = null;

const biometria = computed(() => estado.value?.biometriaDisponivel === true && estado.value.biometriaHabilitada);
const aguardando = computed(() => segundos.value > 0);

function pararContagem(): void {
  if (temporizador !== null) clearInterval(temporizador);
  temporizador = null;
}

function contar(total: number): void {
  pararContagem();
  segundos.value = total;
  if (total <= 0) return;
  temporizador = setInterval(() => {
    segundos.value -= 1;
    if (segundos.value <= 0) pararContagem();
  }, 1000);
}

/** A senha mestre nunca fica no componente depois que o modal fecha. */
watch(aberto, (agora) => {
  senha.value = '';
  erroSenha.value = null;
  banner.value = null;
  if (!agora) {
    pararContagem();
    segundos.value = 0;
  }
});

onUnmounted(pararContagem);

async function confirmar(): Promise<void> {
  if (senha.value.length === 0 || enviando.value || aguardando.value) return;
  erroSenha.value = null;
  banner.value = null;
  enviando.value = true;
  const tentativa = senha.value;
  senha.value = '';
  try {
    await reautenticar('senha', tentativa);
    concluir(true);
  } catch (e) {
    tratarErro(paraErroDoApp(e));
  } finally {
    enviando.value = false;
  }
}

async function usarBiometria(): Promise<void> {
  banner.value = null;
  enviando.value = true;
  try {
    await reautenticar('biometria', null);
    concluir(true);
  } catch (e) {
    tratarErro(paraErroDoApp(e));
  } finally {
    enviando.value = false;
  }
}

function tratarErro(erro: ReturnType<typeof paraErroDoApp>): void {
  if (erro.codigo === 'SENHA_MESTRE_INCORRETA') {
    erroSenha.value = 'Senha mestre incorreta. Verifique e tente novamente.';
    void nextTick().then(() => document.getElementById(ID_SENHA)?.focus());
  } else if (erro.codigo === 'AGUARDE_ANTES_DE_TENTAR') {
    contar(erro.extras.segundosRestantes ?? 0);
  } else if (erro.codigo === 'EXIGE_LOGIN_COMPLETO') {
    // O Rust bloqueia o app e emite o estado; aqui só desistimos.
    concluir(false);
  } else if (erro.codigo !== 'BIOMETRIA_INDISPONIVEL') {
    banner.value = mensagemAmigavel(erro);
  }
}
</script>

<template>
  <ModalDialogo
    :aberto="aberto"
    titulo="Confirme sua identidade"
    descricao="Por segurança, digite a senha mestre deste computador."
    @fechar="concluir(false)"
  >
    <form id="form-reautenticacao" class="space-y-4" novalidate @submit.prevent="confirmar">
      <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
      <BaseBotao v-if="biometria" variante="secundario" larguraTotal :desabilitado="enviando || aguardando" @click="usarBiometria">
        Usar biometria
        <template #icone><PhFingerprint :size="18" weight="bold" aria-hidden="true" /></template>
      </BaseBotao>
      <CampoSenha
        :id="ID_SENHA"
        data-autofocus
        v-model="senha"
        rotulo="Senha mestre"
        autocomplete="current-password"
        obrigatorio
        :erro="erroSenha"
        :desabilitado="enviando"
      >
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>
    </form>
    <template #acoes>
      <BaseBotao variante="secundario" :desabilitado="enviando" @click="concluir(false)">Cancelar</BaseBotao>
      <BaseBotao
        tipo="submit"
        form="form-reautenticacao"
        :desabilitado="aguardando"
        :carregando="enviando"
        texto-carregando="Verificando..."
      >
        {{ aguardando ? `Aguarde ${segundos} s` : 'Confirmar' }}
      </BaseBotao>
    </template>
  </ModalDialogo>
</template>
