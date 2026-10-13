<script setup lang="ts">
import { PhArrowLeft, PhDeviceMobile } from '@phosphor-icons/vue';
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { useFluxoDeLogin } from '../../application/fluxo-de-login';
import type { CodigoInformado, ResumoDoLogin } from '../../application/tipos';
import { ehCodigoDeRecuperacao, ehCodigoTotp } from '../../application/validacoes';
import { concluirLogin } from '../../infrastructure/comandos-tauri';
import { ErroDoApp, mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import { useToast } from '../composables/useToast';
import AuthLayout from '../layout/AuthLayout.vue';

const router = useRouter();
const fluxo = useFluxoDeLogin();
const { mostrar } = useToast();
const { carregar } = useEstadoDoAcesso();

/** Erros em que o servidor já consumiu (ou recusou) o desafio: é preciso recomeçar pelo login. */
const RECOMECAR_PELO_LOGIN = new Set([
  'CODIGO_MFA_INVALIDO',
  'DESAFIO_INVALIDO',
  'MFA_OBRIGATORIO',
  'LIMITE_DE_DISPOSITIVOS_ATINGIDO',
]);

const codigoTotp = ref('');
const codigoRecuperacao = ref('');
const usarRecuperacao = ref(false);
const erroCampo = ref<string | null>(null);
const dica = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

onMounted(async () => {
  if (fluxo.desafio.value === null) {
    await router.replace({ name: 'login' });
    return;
  }
  // A tela de configuração deixa uma dica ("código atual"); ela é mostrada uma única vez.
  dica.value = fluxo.aviso.value;
  fluxo.aviso.value = null;
});

async function alternarMetodo(): Promise<void> {
  usarRecuperacao.value = !usarRecuperacao.value;
  erroCampo.value = null;
  await nextTick();
  document.getElementById(usarRecuperacao.value ? 'input-codigo-recuperacao' : 'input-codigo-totp')?.focus();
}

function montarCodigo(): CodigoInformado | null {
  if (usarRecuperacao.value) {
    if (!ehCodigoDeRecuperacao(codigoRecuperacao.value)) {
      erroCampo.value = 'Informe um código de recuperação válido (16 caracteres).';
      return null;
    }
    return { tipo: 'recuperacao', valor: codigoRecuperacao.value.trim() };
  }
  if (!ehCodigoTotp(codigoTotp.value)) {
    erroCampo.value = 'Informe o código de 6 dígitos do aplicativo.';
    return null;
  }
  return { tipo: 'totp', valor: codigoTotp.value };
}

async function voltarAoLoginComAviso(erro: ErroDoApp): Promise<void> {
  fluxo.aviso.value = mensagemAmigavel(erro).texto;
  fluxo.limpar();
  await router.push({ name: 'login' });
}

async function navegarPara(resumo: ResumoDoLogin): Promise<void> {
  try {
    // O login muda o estado (sessão online); consulta o Rust antes que o guard decida a rota.
    await carregar();
  } catch {
    // Sem resposta, o guard segue com o estado que já tem.
  }
  if (resumo.usouCodigoDeRecuperacao) {
    mostrar(
      `Você usou um código de recuperação. Restam ${String(resumo.codigosRestantes)}. Gere novos em Segurança.`,
      'aviso',
      8000,
    );
  }
  const rota = {
    configurar_desbloqueio: 'definir-senha-mestre',
    desbloquear: 'desbloqueio',
    pronto: 'inicio',
  } as const;
  await router.push({ name: rota[resumo.proximoPasso] });
}

async function enviar(): Promise<void> {
  const desafio = fluxo.desafio.value;
  if (desafio === null || enviando.value) return;
  banner.value = null;
  erroCampo.value = null;
  const codigo = montarCodigo();
  if (codigo === null) return;
  enviando.value = true;
  try {
    const resumo = await concluirLogin(desafio, codigo);
    fluxo.limpar();
    codigoTotp.value = '';
    codigoRecuperacao.value = '';
    await navegarPara(resumo);
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'DISPOSITIVO_REVOGADO') {
      fluxo.limpar();
      await router.push({ name: 'dispositivo-revogado' });
    } else if (RECOMECAR_PELO_LOGIN.has(erro.codigo)) {
      await voltarAoLoginComAviso(erro);
    } else {
      banner.value = mensagemAmigavel(erro);
    }
  } finally {
    enviando.value = false;
  }
}

async function voltar(): Promise<void> {
  fluxo.limpar();
  await router.push({ name: 'login' });
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-8">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhDeviceMobile :size="14" weight="bold" aria-hidden="true" />
        Verificação em duas etapas
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
        {{ usarRecuperacao ? 'Digite o código de recuperação' : 'Digite o código do autenticador' }}
      </h2>
      <p class="text-sm text-slate-600">
        {{
          usarRecuperacao
            ? 'Use um dos códigos de recuperação que você guardou. Cada um funciona uma vez.'
            : 'Abra o aplicativo autenticador e digite o código de 6 dígitos.'
        }}
      </p>
    </div>

    <AlertaBanner v-if="dica" class="mb-5" variante="info" titulo="Quase lá">{{ dica }}</AlertaBanner>
    <AlertaBanner v-if="banner" class="mb-5" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <form class="space-y-5" novalidate @submit.prevent="enviar">
      <CampoCodigo
        v-if="!usarRecuperacao"
        id="input-codigo-totp"
        v-model="codigoTotp"
        rotulo="Código do autenticador"
        autofoco
        :erro="erroCampo"
        :desabilitado="enviando"
        @completo="enviar"
      />
      <CampoTexto
        v-else
        id="input-codigo-recuperacao"
        v-model="codigoRecuperacao"
        rotulo="Código de recuperação"
        autocomplete="off"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        monoespacado
        obrigatorio
        :erro="erroCampo"
        :desabilitado="enviando"
      />

      <button
        type="button"
        class="text-xs font-semibold text-teal-800 hover:text-teal-900 hover:underline"
        :aria-pressed="usarRecuperacao"
        @click="alternarMetodo"
      >
        {{ usarRecuperacao ? 'Usar código do autenticador' : 'Usar código de recuperação' }}
      </button>

      <BaseBotao tipo="submit" larguraTotal :carregando="enviando" texto-carregando="Verificando...">Entrar</BaseBotao>
    </form>

    <button
      type="button"
      class="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
      @click="voltar"
    >
      <PhArrowLeft :size="14" weight="bold" aria-hidden="true" />
      Voltar
    </button>
  </AuthLayout>
</template>
