<script setup lang="ts">
import { PhFingerprint, PhLock, PhLockKey } from '@phosphor-icons/vue';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { desbloquearComBiometria, desbloquearComSenha } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import AuthLayout from '../layout/AuthLayout.vue';
import RedefinirDesbloqueioModal from './RedefinirDesbloqueioModal.vue';

const ID_SENHA = 'input-senha-mestre';

const router = useRouter();
const { estado, sincronizarCom } = useEstadoDoAcesso();

const senha = ref('');
const erroSenha = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);
const exigeLoginLocal = ref(false);
const modalAberto = ref(false);
const segundosRestantes = ref(0);
const anuncio = ref('');
let temporizador: ReturnType<typeof setInterval> | null = null;

const exigeLogin = computed(() => exigeLoginLocal.value || estado.value?.exigeLoginCompleto === true);
const biometria = computed(() => estado.value?.biometriaDisponivel === true && estado.value.biometriaHabilitada);
const aguardando = computed(() => segundosRestantes.value > 0);

function pararContagem(): void {
  if (temporizador !== null) clearInterval(temporizador);
  temporizador = null;
}

/** Contagem regressiva de 1 s; o leitor de tela é avisado só a cada 10 s (e ao começar/terminar). */
function iniciarContagem(segundos: number): void {
  pararContagem();
  segundosRestantes.value = segundos;
  if (segundos <= 0) return;
  anuncio.value = `Tente novamente em ${String(segundos)} s`;
  temporizador = setInterval(() => {
    segundosRestantes.value -= 1;
    if (segundosRestantes.value <= 0) {
      pararContagem();
      anuncio.value = 'Você já pode tentar novamente.';
    } else if (segundosRestantes.value % 10 === 0) {
      anuncio.value = `Tente novamente em ${String(segundosRestantes.value)} s`;
    }
  }, 1000);
}

async function focarSenha(): Promise<void> {
  await nextTick();
  document.getElementById(ID_SENHA)?.focus();
}

onMounted(async () => {
  iniciarContagem(estado.value?.segundosAteNovaTentativa ?? 0);
  await focarSenha();
});

onUnmounted(pararContagem);

async function entrar(): Promise<void> {
  if (aguardando.value || enviando.value || senha.value.length === 0) return;
  banner.value = null;
  erroSenha.value = null;
  enviando.value = true;
  const tentativa = senha.value;
  senha.value = '';
  try {
    sincronizarCom(await desbloquearComSenha(tentativa));
    await router.push({ name: 'inicio' });
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'SENHA_MESTRE_INCORRETA') {
      erroSenha.value = 'Senha mestre incorreta. Verifique e tente novamente.';
      void focarSenha();
    } else if (erro.codigo === 'AGUARDE_ANTES_DE_TENTAR') {
      iniciarContagem(erro.extras.segundosRestantes ?? 0);
    } else if (erro.codigo === 'EXIGE_LOGIN_COMPLETO') {
      exigeLoginLocal.value = true;
    } else {
      banner.value = mensagemAmigavel(erro);
    }
  } finally {
    enviando.value = false;
  }
}

async function entrarComBiometria(): Promise<void> {
  banner.value = null;
  try {
    sincronizarCom(await desbloquearComBiometria());
    await router.push({ name: 'inicio' });
  } catch {
    // Erro ou cancelamento: a senha mestre sempre é a alternativa (RN-25).
    void focarSenha();
  }
}

async function irParaLogin(): Promise<void> {
  await router.push({ name: 'login' });
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-8">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhLock :size="14" weight="bold" aria-hidden="true" />
        Aplicativo bloqueado
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Desbloqueie para continuar</h2>
      <p class="text-sm text-slate-600">Digite a senha mestre deste computador.</p>
    </div>

    <AlertaBanner v-if="banner" class="mb-5" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <template v-if="exigeLogin">
      <AlertaBanner variante="aviso" titulo="Entre com e-mail e senha">
        Por segurança, faça o login completo para liberar o desbloqueio.
      </AlertaBanner>
      <BaseBotao class="mt-5" larguraTotal @click="irParaLogin">Entrar com e-mail e senha</BaseBotao>
    </template>

    <template v-else>
      <BaseBotao
        v-if="biometria"
        class="mb-5"
        variante="secundario"
        larguraTotal
        :desabilitado="aguardando || enviando"
        @click="entrarComBiometria"
      >
        Desbloquear com biometria
        <template #icone><PhFingerprint :size="18" weight="bold" aria-hidden="true" /></template>
      </BaseBotao>

      <form class="space-y-5" novalidate @submit.prevent="entrar">
        <CampoSenha
          :id="ID_SENHA"
          v-model="senha"
          rotulo="Senha mestre"
          autocomplete="current-password"
          obrigatorio
          :erro="erroSenha"
          :desabilitado="enviando"
        >
          <template #icone><PhLockKey :size="20" weight="bold" /></template>
        </CampoSenha>

        <BaseBotao tipo="submit" larguraTotal :desabilitado="aguardando" :carregando="enviando" texto-carregando="Verificando...">
          {{ aguardando ? `Tente novamente em ${segundosRestantes} s` : 'Desbloquear' }}
        </BaseBotao>
      </form>
      <p class="sr-only" aria-live="polite">{{ anuncio }}</p>

      <button
        type="button"
        class="mt-6 text-xs font-semibold text-teal-800 hover:text-teal-900 hover:underline"
        @click="modalAberto = true"
      >
        Esqueci a senha mestre
      </button>
    </template>

    <RedefinirDesbloqueioModal :aberto="modalAberto" @fechar="modalAberto = false" />
  </AuthLayout>
</template>
