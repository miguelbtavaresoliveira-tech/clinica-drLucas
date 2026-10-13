<script setup lang="ts">
import { PhShieldCheck } from '@phosphor-icons/vue';
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFluxoDeLogin } from '../../application/fluxo-de-login';
import type { SegredoMfa } from '../../application/tipos';
import { ehCodigoTotp } from '../../application/validacoes';
import { confirmarMfa, gerarSegredoMfa } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import ListaDeCodigosDeRecuperacao from '../componentes/ListaDeCodigosDeRecuperacao.vue';
import QrCodeAutenticador from '../componentes/QrCodeAutenticador.vue';
import AuthLayout from '../layout/AuthLayout.vue';

const router = useRouter();
const fluxo = useFluxoDeLogin();

const etapa = ref<1 | 2>(1);
const segredo = ref<SegredoMfa | null>(null);
const codigo = ref('');
const erroCodigo = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const carregandoSegredo = ref(false);
const confirmando = ref(false);
const codigosDeRecuperacao = ref<string[]>([]);
const guardei = ref(false);
const titulo = ref<HTMLElement | null>(null);

/** O servidor consumiu ou recusou o desafio: recomeça pelo login com um aviso. */
async function voltarAoLogin(texto: string): Promise<void> {
  fluxo.aviso.value = texto;
  fluxo.limpar();
  await router.push({ name: 'login' });
}

async function carregarSegredo(): Promise<void> {
  const desafio = fluxo.desafio.value;
  if (desafio === null) {
    await router.replace({ name: 'login' });
    return;
  }
  banner.value = null;
  carregandoSegredo.value = true;
  try {
    segredo.value = await gerarSegredoMfa(desafio);
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'DESAFIO_INVALIDO') {
      await voltarAoLogin(mensagemAmigavel(erro).texto);
      return;
    }
    banner.value = mensagemAmigavel(erro);
  } finally {
    carregandoSegredo.value = false;
  }
}

onMounted(carregarSegredo);

async function confirmar(): Promise<void> {
  const desafio = fluxo.desafio.value;
  if (desafio === null) return;
  if (!ehCodigoTotp(codigo.value)) {
    erroCodigo.value = 'Informe o código de 6 dígitos do aplicativo.';
    return;
  }
  erroCodigo.value = null;
  banner.value = null;
  confirmando.value = true;
  try {
    const resposta = await confirmarMfa(desafio, codigo.value);
    codigosDeRecuperacao.value = resposta.codigosDeRecuperacao;
    etapa.value = 2;
    await nextTick();
    titulo.value?.focus();
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'DESAFIO_INVALIDO') {
      await voltarAoLogin(mensagemAmigavel(erro).texto);
      return;
    }
    if (erro.codigo === 'CODIGO_MFA_INVALIDO') {
      // Aqui o desafio continua válido: dá para tentar de novo.
      erroCodigo.value = 'Código inválido. Digite o código atual do aplicativo.';
      codigo.value = '';
    } else {
      banner.value = mensagemAmigavel(erro);
    }
  } finally {
    confirmando.value = false;
  }
}

async function continuar(): Promise<void> {
  codigosDeRecuperacao.value = [];
  fluxo.avancarParaVerificacao();
  fluxo.aviso.value = 'Digite o código atual do aplicativo (ele muda a cada 30 segundos).';
  await router.push({ name: 'mfa-verificar' });
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-6">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhShieldCheck :size="14" weight="bold" aria-hidden="true" />
        Verificação em duas etapas
      </div>
      <p class="text-xs font-semibold text-slate-500 uppercase">Etapa {{ etapa }} de 2</p>
      <h2 ref="titulo" tabindex="-1" class="text-2xl font-extrabold text-slate-900 tracking-tight focus:outline-none">
        {{ etapa === 1 ? 'Configure o aplicativo autenticador' : 'Guarde seus códigos de recuperação' }}
      </h2>
    </div>

    <AlertaBanner v-if="banner" class="mb-5" variante="erro" :titulo="banner.titulo">
      {{ banner.texto }}
      <button v-if="!segredo" type="button" class="mt-2 block text-xs font-bold underline" @click="carregarSegredo">
        Tentar novamente
      </button>
    </AlertaBanner>

    <template v-if="etapa === 1">
      <ol class="list-decimal pl-5 space-y-1 text-sm text-slate-700 mb-6">
        <li>Abra um app autenticador — Google Authenticator, Microsoft Authenticator ou 1Password.</li>
        <li>Escaneie o QR code abaixo.</li>
        <li>Digite o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>

      <QrCodeAutenticador v-if="segredo" :url-otpauth="segredo.urlOtpauth" :segredo="segredo.segredo" />
      <div v-else-if="carregandoSegredo" class="w-48 h-48 mx-auto rounded-2xl bg-slate-100 motion-safe:animate-pulse" role="status">
        <span class="sr-only">Gerando o segredo de segurança…</span>
      </div>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="confirmar">
        <CampoCodigo
          id="input-codigo-mfa"
          v-model="codigo"
          rotulo="Código do aplicativo"
          autofoco
          :erro="erroCodigo"
          :desabilitado="confirmando || segredo === null"
        />
        <BaseBotao tipo="submit" larguraTotal :carregando="confirmando" texto-carregando="Confirmando..." :desabilitado="segredo === null">
          Confirmar
        </BaseBotao>
      </form>
    </template>

    <template v-else>
      <ListaDeCodigosDeRecuperacao :codigos="codigosDeRecuperacao" />
      <div class="mt-5 flex items-start gap-3">
        <input id="guardei-codigos" v-model="guardei" type="checkbox" class="mt-1 w-4 h-4 accent-teal-700" />
        <label for="guardei-codigos" class="text-sm text-slate-800">Guardei os códigos em local seguro</label>
      </div>
      <BaseBotao class="mt-5" larguraTotal :desabilitado="!guardei" @click="continuar">Continuar</BaseBotao>
    </template>
  </AuthLayout>
</template>
