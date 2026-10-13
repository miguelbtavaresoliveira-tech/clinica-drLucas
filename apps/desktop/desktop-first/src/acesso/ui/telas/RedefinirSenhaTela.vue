<script setup lang="ts">
import { PhCheckCircle, PhCircle, PhKeyReturn, PhLockKey } from '@phosphor-icons/vue';
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ehCodigoDeRecuperacao,
  ehCodigoTotp,
  regrasDaSenhaMestre,
} from '../../application/validacoes';
import { concluirRedefinicao } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import { useToast } from '../composables/useToast';
import AuthLayout from '../layout/AuthLayout.vue';

const router = useRouter();
const { mostrar } = useToast();

const REGEX_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const token = ref('');
const novaSenha = ref('');
const confirmacao = ref('');
const codigoTotp = ref('');
const codigoRecuperacao = ref('');
const usarRecuperacao = ref(false);

const erroToken = ref<string | null>(null);
const erroSenha = ref<string | null>(null);
const erroCodigo = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

const regras = computed(() => regrasDaSenhaMestre(novaSenha.value, confirmacao.value));

async function focar(id: string): Promise<void> {
  await nextTick();
  document.getElementById(id)?.focus();
}

async function alternarMetodo(): Promise<void> {
  usarRecuperacao.value = !usarRecuperacao.value;
  erroCodigo.value = null;
  await focar(usarRecuperacao.value ? 'input-codigo-recuperacao' : 'input-codigo-totp');
}

function validar(): boolean {
  erroToken.value = REGEX_TOKEN.test(token.value.trim()) ? null : 'Cole o código de redefinição recebido por e-mail.';
  erroSenha.value = regras.value.every((r) => r.ok) ? null : 'A nova senha não atende às regras abaixo.';
  const codigoOk = usarRecuperacao.value
    ? ehCodigoDeRecuperacao(codigoRecuperacao.value)
    : ehCodigoTotp(codigoTotp.value);
  erroCodigo.value = codigoOk
    ? null
    : usarRecuperacao.value
      ? 'Informe um código de recuperação válido (16 caracteres).'
      : 'Informe o código de 6 dígitos do aplicativo.';
  if (erroToken.value !== null) void focar('input-token');
  else if (erroSenha.value !== null) void focar('input-nova-senha');
  else if (erroCodigo.value !== null) void focar(usarRecuperacao.value ? 'input-codigo-recuperacao' : 'input-codigo-totp');
  return erroToken.value === null && erroSenha.value === null && erroCodigo.value === null;
}

function limparSegredos(): void {
  novaSenha.value = '';
  confirmacao.value = '';
  codigoTotp.value = '';
  codigoRecuperacao.value = '';
}

async function enviar(): Promise<void> {
  banner.value = null;
  if (!validar()) return;
  enviando.value = true;
  try {
    await concluirRedefinicao(
      token.value.trim(),
      novaSenha.value,
      usarRecuperacao.value
        ? { tipo: 'recuperacao', valor: codigoRecuperacao.value.trim() }
        : { tipo: 'totp', valor: codigoTotp.value },
    );
    limparSegredos();
    token.value = '';
    mostrar('Senha redefinida. Entre com a nova senha.');
    await router.push({ name: 'login' });
  } catch (e) {
    const erro = paraErroDoApp(e);
    limparSegredos();
    if (erro.codigo === 'CODIGO_MFA_INVALIDO') {
      erroCodigo.value = 'Código inválido ou já usado. O pedido de redefinição foi consumido: solicite um novo.';
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
    <div class="space-y-2 mb-8">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhKeyReturn :size="14" weight="bold" aria-hidden="true" />
        Recuperação de acesso
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Redefinir senha</h2>
      <p class="text-sm text-slate-600">
        Cole o código recebido por e-mail, escolha uma nova senha e confirme com o segundo fator.
      </p>
    </div>

    <AlertaBanner v-if="banner" class="mb-6" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <form class="space-y-5" novalidate @submit.prevent="enviar">
      <CampoTexto
        id="input-token"
        v-model="token"
        rotulo="Código de redefinição"
        autocomplete="off"
        placeholder="Cole aqui o código do e-mail"
        monoespacado
        obrigatorio
        :erro="erroToken"
        :desabilitado="enviando"
      />

      <CampoSenha
        id="input-nova-senha"
        v-model="novaSenha"
        rotulo="Nova senha"
        autocomplete="new-password"
        obrigatorio
        :erro="erroSenha"
        :desabilitado="enviando"
      >
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>

      <CampoSenha
        id="input-confirmacao"
        v-model="confirmacao"
        rotulo="Confirme a nova senha"
        autocomplete="new-password"
        obrigatorio
        :desabilitado="enviando"
      >
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>

      <ul id="regras-senha" aria-live="polite" class="space-y-1 text-xs">
        <li v-for="r in regras" :key="r.chave" :class="['flex items-center gap-2', r.ok ? 'text-emerald-800' : 'text-slate-600']">
          <PhCheckCircle v-if="r.ok" :size="16" weight="fill" aria-hidden="true" />
          <PhCircle v-else :size="16" aria-hidden="true" />
          <span>{{ r.texto }}<span class="sr-only">{{ r.ok ? ' — atendida' : ' — pendente' }}</span></span>
        </li>
      </ul>

      <div class="space-y-3">
        <CampoCodigo
          v-if="!usarRecuperacao"
          id="input-codigo-totp"
          v-model="codigoTotp"
          rotulo="Código do autenticador"
          :erro="erroCodigo"
          :desabilitado="enviando"
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
          :erro="erroCodigo"
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
      </div>

      <BaseBotao tipo="submit" larguraTotal :carregando="enviando" texto-carregando="Redefinindo...">
        Redefinir senha
      </BaseBotao>
    </form>
  </AuthLayout>
</template>
