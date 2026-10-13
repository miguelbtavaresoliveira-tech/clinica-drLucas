<script setup lang="ts">
import { PhArrowRight, PhEnvelopeSimple, PhLockKey, PhShieldCheck } from '@phosphor-icons/vue';
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { useFluxoDeLogin } from '../../application/fluxo-de-login';
import { ehEmailValido } from '../../application/validacoes';
import { iniciarLogin } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import AuthLayout from '../layout/AuthLayout.vue';

const router = useRouter();
const { estado } = useEstadoDoAcesso();
const fluxo = useFluxoDeLogin();

const ID_EMAIL = 'input-email';
const ID_SENHA = 'input-password';

interface Banner {
  variante: 'erro' | 'aviso' | 'info';
  titulo: string;
  texto: string;
  oferecerDesbloqueioLocal?: boolean;
}

const email = ref('');
const senha = ref('');
const erroEmail = ref<string | null>(null);
const erroSenha = ref<string | null>(null);
const banner = ref<Banner | null>(null);
const carregando = ref(false);
// A TASK-086 troca este marcador pelo modal de recuperação de senha.
const recuperacaoSolicitada = ref(false);

onMounted(() => {
  // Um login novo sempre começa do zero: qualquer desafio anterior é descartado.
  fluxo.limpar();
  if (fluxo.aviso.value !== null) {
    banner.value = { variante: 'erro', titulo: 'Atenção', texto: fluxo.aviso.value };
    fluxo.aviso.value = null;
  } else if (estado.value?.exigeLoginCompleto === true) {
    banner.value = {
      variante: 'info',
      titulo: 'Login completo necessário',
      texto: 'Por segurança, entre com e-mail, senha e código para liberar o desbloqueio local.',
    };
  }
});

async function focar(id: string): Promise<void> {
  await nextTick();
  document.getElementById(id)?.focus();
}

function validar(): boolean {
  erroEmail.value = ehEmailValido(email.value) ? null : 'Informe um e-mail válido.';
  erroSenha.value = senha.value.length > 0 ? null : 'Informe a senha.';
  if (erroEmail.value !== null) void focar(ID_EMAIL);
  else if (erroSenha.value !== null) void focar(ID_SENHA);
  return erroEmail.value === null && erroSenha.value === null;
}

async function enviar(): Promise<void> {
  banner.value = null;
  if (!validar()) return;
  carregando.value = true;
  try {
    const resposta = await iniciarLogin(email.value.trim(), senha.value);
    senha.value = '';
    fluxo.iniciar(resposta);
    await router.push({ name: resposta.mfa === 'configurar' ? 'mfa-configurar' : 'mfa-verificar' });
  } catch (e) {
    tratarErro(paraErroDoApp(e));
  } finally {
    carregando.value = false;
  }
}

function tratarErro(erro: ReturnType<typeof paraErroDoApp>): void {
  const { titulo, texto } = mensagemAmigavel(erro);
  const brando = erro.codigo === 'CONTA_BLOQUEADA' || erro.codigo === 'MUITAS_REQUISICOES';
  banner.value = { variante: brando ? 'aviso' : 'erro', titulo, texto };
  if (erro.codigo === 'CREDENCIAIS_INVALIDAS') {
    // Texto neutro: não revela se o usuário existe.
    erroSenha.value = 'Verifique a senha digitada.';
    senha.value = '';
    void focar(ID_SENHA);
  }
  if (erro.codigo === 'SEM_CONEXAO' && estado.value?.situacao === 'bloqueado' && !estado.value.exigeLoginCompleto) {
    banner.value.oferecerDesbloqueioLocal = true;
  }
}

function usarDesbloqueioLocal(): void {
  void router.push({ name: 'desbloqueio' });
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-2 mb-8">
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
        <PhShieldCheck :size="14" weight="bold" aria-hidden="true" />
        Portal de Acesso Restrito
      </div>
      <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Acesse sua conta</h2>
      <p class="text-sm text-slate-600">
        Digite suas credenciais clínicas para gerenciar pacientes, agenda e finanças.
      </p>
    </div>

    <AlertaBanner v-if="banner" class="mb-6" :variante="banner.variante" :titulo="banner.titulo">
      {{ banner.texto }}
      <button
        v-if="banner.oferecerDesbloqueioLocal"
        type="button"
        class="mt-2 block text-xs font-bold underline"
        @click="usarDesbloqueioLocal"
      >
        Usar desbloqueio local
      </button>
    </AlertaBanner>

    <form class="space-y-5" novalidate @submit.prevent="enviar">
      <CampoTexto
        :id="ID_EMAIL"
        v-model="email"
        rotulo="E-mail"
        tipo="email"
        autocomplete="username"
        placeholder="seu@email.com.br"
        obrigatorio
        :erro="erroEmail"
        :desabilitado="carregando"
      >
        <template #icone><PhEnvelopeSimple :size="20" weight="bold" /></template>
      </CampoTexto>

      <CampoSenha
        :id="ID_SENHA"
        v-model="senha"
        rotulo="Senha de Acesso"
        autocomplete="current-password"
        placeholder="••••••••••••"
        obrigatorio
        :erro="erroSenha"
        :desabilitado="carregando"
      >
        <template #acao-rotulo>
          <button
            type="button"
            class="text-xs font-semibold text-teal-800 hover:text-teal-900 hover:underline transition-all"
            @click="recuperacaoSolicitada = true"
          >
            Esqueceu a senha?
          </button>
        </template>
        <template #icone><PhLockKey :size="20" weight="bold" /></template>
      </CampoSenha>

      <div class="pt-2">
        <BaseBotao tipo="submit" larguraTotal :carregando="carregando" texto-carregando="Autenticando...">
          Entrar no Sistema
          <template #icone><PhArrowRight :size="16" weight="bold" aria-hidden="true" /></template>
        </BaseBotao>
      </div>
    </form>
  </AuthLayout>
</template>
