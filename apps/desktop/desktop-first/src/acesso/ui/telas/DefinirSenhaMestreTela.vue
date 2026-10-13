<script setup lang="ts">
import { PhCheckCircle, PhCircle, PhLockKey } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { regrasDaSenhaMestre } from '../../application/validacoes';
import { configurarDesbloqueio } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import { useToast } from '../composables/useToast';
import AuthLayout from '../layout/AuthLayout.vue';

const router = useRouter();
const { mostrar } = useToast();
const { sincronizarCom } = useEstadoDoAcesso();

const senha = ref('');
const confirmacao = ref('');
const erroSenha = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

const regras = computed(() => regrasDaSenhaMestre(senha.value, confirmacao.value));
const todasAtendidas = computed(() => regras.value.every((r) => r.ok));

/** A senha mestre só existe no campo; é zerada depois de cada envio. */
function limparCampos(): void {
  senha.value = '';
  confirmacao.value = '';
}

async function enviar(): Promise<void> {
  if (!todasAtendidas.value || enviando.value) return;
  banner.value = null;
  erroSenha.value = null;
  enviando.value = true;
  const tentativa = senha.value;
  limparCampos();
  try {
    sincronizarCom(await configurarDesbloqueio(tentativa));
    mostrar('Dados protegidos neste computador.');
    await router.push({ name: 'inicio' });
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'SENHA_MESTRE_FRACA') {
      erroSenha.value = 'Senha mestre fraca. Use 12 ou mais caracteres e evite senhas comuns.';
    } else if (erro.codigo === 'JA_CONFIGURADO') {
      await router.push({ name: 'desbloqueio' });
    } else if (erro.codigo === 'EXIGE_LOGIN_COMPLETO') {
      await router.push({ name: 'login' });
    } else {
      banner.value = mensagemAmigavel(erro);
    }
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-6">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhLockKey :size="14" weight="bold" aria-hidden="true" />
        Proteção deste computador
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Crie sua senha mestre</h2>
      <p class="text-sm text-slate-600">
        Ela protege os dados guardados neste computador e funciona sem internet. Não é enviada ao servidor e não pode
        ser recuperada: se esquecê-la, será preciso baixar os dados novamente.
      </p>
      <p class="text-sm font-semibold text-slate-700">Use uma senha diferente da senha de login.</p>
    </div>

    <AlertaBanner v-if="banner" class="mb-5" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <form class="space-y-5" novalidate @submit.prevent="enviar">
      <CampoSenha
        id="input-senha-mestre"
        v-model="senha"
        rotulo="Senha mestre"
        autocomplete="new-password"
        obrigatorio
        :erro="erroSenha"
        :desabilitado="enviando"
      >
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>

      <CampoSenha
        id="input-confirmacao-senha-mestre"
        v-model="confirmacao"
        rotulo="Confirme a senha mestre"
        autocomplete="new-password"
        obrigatorio
        :desabilitado="enviando"
      >
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>

      <ul id="regras-senha-mestre" aria-live="polite" class="space-y-1 text-xs">
        <li v-for="r in regras" :key="r.chave" :class="['flex items-center gap-2', r.ok ? 'text-emerald-800' : 'text-slate-600']">
          <PhCheckCircle v-if="r.ok" :size="16" weight="fill" aria-hidden="true" />
          <PhCircle v-else :size="16" aria-hidden="true" />
          <span>{{ r.texto }}<span class="sr-only">{{ r.ok ? ' — atendida' : ' — pendente' }}</span></span>
        </li>
      </ul>

      <BaseBotao
        tipo="submit"
        larguraTotal
        :desabilitado="!todasAtendidas"
        :carregando="enviando"
        texto-carregando="Protegendo seus dados..."
        aria-describedby="regras-senha-mestre"
      >
        Proteger dados
      </BaseBotao>
    </form>
  </AuthLayout>
</template>
