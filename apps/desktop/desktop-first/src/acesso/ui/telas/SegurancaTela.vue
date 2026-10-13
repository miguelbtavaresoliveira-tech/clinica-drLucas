<script setup lang="ts">
import { PhDeviceMobile, PhFingerprint, PhKey, PhLockKey, PhPassword } from '@phosphor-icons/vue';
import { ref } from 'vue';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { ativarBiometria, desativarBiometria } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import { useReautenticacao } from '../composables/useReautenticacao';
import { useToast } from '../composables/useToast';
import AppShell from '../layout/AppShell.vue';
import AlterarSenhaMestreModal from './AlterarSenhaMestreModal.vue';
import ReconfigurarMfaModal from './ReconfigurarMfaModal.vue';
import RegenerarCodigosModal from './RegenerarCodigosModal.vue';
import TrocarSenhaModal from './TrocarSenhaModal.vue';

const { estado } = useEstadoDoAcesso();
const { comReautenticacao } = useReautenticacao();
const { mostrar } = useToast();

const modal = ref<'senha' | 'codigos' | 'mfa' | 'mestre' | null>(null);
const fechar = (): void => {
  modal.value = null;
};

// Biometria: ativar pede a senha mestre; desativar só pede a reautenticação local.
const pedindoSenhaDaBiometria = ref(false);
const senhaBiometria = ref('');
const erroBiometria = ref<string | null>(null);
const bannerBiometria = ref<{ titulo: string; texto: string } | null>(null);
const alterandoBiometria = ref(false);

async function alternarBiometria(): Promise<void> {
  if (estado.value?.biometriaDisponivel !== true || alterandoBiometria.value) return;
  bannerBiometria.value = null;
  if (estado.value.biometriaHabilitada) {
    alterandoBiometria.value = true;
    try {
      await comReautenticacao(() => desativarBiometria());
      mostrar('Biometria desativada.');
    } catch (e) {
      bannerBiometria.value = mensagemAmigavel(paraErroDoApp(e));
    } finally {
      alterandoBiometria.value = false;
    }
  } else {
    senhaBiometria.value = '';
    erroBiometria.value = null;
    pedindoSenhaDaBiometria.value = true;
  }
}

async function ativar(): Promise<void> {
  if (senhaBiometria.value.length === 0) {
    erroBiometria.value = 'Informe a senha mestre.';
    return;
  }
  alterandoBiometria.value = true;
  const tentativa = senhaBiometria.value;
  senhaBiometria.value = '';
  try {
    await ativarBiometria(tentativa);
    pedindoSenhaDaBiometria.value = false;
    mostrar('Biometria ativada.');
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'SENHA_MESTRE_INCORRETA') erroBiometria.value = 'Senha mestre incorreta.';
    else {
      pedindoSenhaDaBiometria.value = false;
      bannerBiometria.value = mensagemAmigavel(erro);
    }
  } finally {
    alterandoBiometria.value = false;
  }
}

const cartao = 'bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4';
const icone = 'w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0';
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Segurança</h1>
    <p class="mt-1 text-sm text-slate-600">Gerencie a senha, o autenticador e a proteção deste computador.</p>

    <div class="mt-6 space-y-4">
      <section :class="cartao" aria-labelledby="titulo-senha">
        <div :class="icone" aria-hidden="true"><PhKey :size="24" weight="bold" /></div>
        <div class="flex-1">
          <h2 id="titulo-senha" class="font-bold text-slate-900">Senha de login</h2>
          <p class="text-sm text-slate-600">Usada para entrar no servidor. Trocar desconecta os outros computadores.</p>
        </div>
        <BaseBotao variante="secundario" @click="modal = 'senha'">Trocar senha</BaseBotao>
      </section>

      <section :class="cartao" aria-labelledby="titulo-codigos">
        <div :class="icone" aria-hidden="true"><PhPassword :size="24" weight="bold" /></div>
        <div class="flex-1">
          <h2 id="titulo-codigos" class="font-bold text-slate-900">Códigos de recuperação</h2>
          <p class="text-sm text-slate-600">Use quando perder o celular com o autenticador.</p>
        </div>
        <BaseBotao variante="secundario" @click="modal = 'codigos'">Gerar novos códigos</BaseBotao>
      </section>

      <section :class="cartao" aria-labelledby="titulo-mfa">
        <div :class="icone" aria-hidden="true"><PhDeviceMobile :size="24" weight="bold" /></div>
        <div class="flex-1">
          <h2 id="titulo-mfa" class="font-bold text-slate-900">Aplicativo autenticador</h2>
          <p class="text-sm text-slate-600">Troque o celular ou o aplicativo autenticador.</p>
        </div>
        <BaseBotao variante="secundario" @click="modal = 'mfa'">Reconfigurar</BaseBotao>
      </section>

      <section :class="cartao" aria-labelledby="titulo-mestre">
        <div :class="icone" aria-hidden="true"><PhLockKey :size="24" weight="bold" /></div>
        <div class="flex-1">
          <h2 id="titulo-mestre" class="font-bold text-slate-900">Senha mestre deste computador</h2>
          <p class="text-sm text-slate-600">Abre os dados deste computador sem internet.</p>
        </div>
        <BaseBotao variante="secundario" @click="modal = 'mestre'">Alterar senha mestre</BaseBotao>
      </section>

      <section :class="cartao" aria-labelledby="titulo-biometria">
        <div :class="icone" aria-hidden="true"><PhFingerprint :size="24" weight="bold" /></div>
        <div class="flex-1">
          <h2 id="titulo-biometria" class="font-bold text-slate-900">Biometria</h2>
          <p class="text-sm text-slate-600">
            {{
              estado?.biometriaDisponivel
                ? 'Desbloqueie com Touch ID ou Windows Hello. A senha mestre continua funcionando.'
                : 'Indisponível neste computador.'
            }}
          </p>
          <AlertaBanner v-if="bannerBiometria" class="mt-3" variante="erro" :titulo="bannerBiometria.titulo">{{ bannerBiometria.texto }}</AlertaBanner>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="estado?.biometriaHabilitada === true"
          aria-labelledby="titulo-biometria"
          :disabled="estado?.biometriaDisponivel !== true || alterandoBiometria"
          :class="[
            'relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
            estado?.biometriaHabilitada ? 'bg-brand-700' : 'bg-slate-300',
          ]"
          @click="alternarBiometria"
        >
          <span
            aria-hidden="true"
            :class="['absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform', estado?.biometriaHabilitada ? 'translate-x-5' : '']"
          ></span>
        </button>
      </section>
    </div>

    <TrocarSenhaModal :aberto="modal === 'senha'" @fechar="fechar" />
    <RegenerarCodigosModal :aberto="modal === 'codigos'" @fechar="fechar" />
    <ReconfigurarMfaModal :aberto="modal === 'mfa'" @fechar="fechar" />
    <AlterarSenhaMestreModal :aberto="modal === 'mestre'" @fechar="fechar" />

    <ModalDialogo :aberto="pedindoSenhaDaBiometria" titulo="Ativar biometria" descricao="Digite a senha mestre para confirmar." @fechar="pedindoSenhaDaBiometria = false">
      <form id="form-ativar-biometria" novalidate @submit.prevent="ativar">
        <CampoSenha id="input-senha-biometria" v-model="senhaBiometria" data-autofocus rotulo="Senha mestre" autocomplete="current-password" obrigatorio :erro="erroBiometria" :desabilitado="alterandoBiometria" />
      </form>
      <template #acoes>
        <BaseBotao variante="secundario" :desabilitado="alterandoBiometria" @click="pedindoSenhaDaBiometria = false">Cancelar</BaseBotao>
        <BaseBotao tipo="submit" form="form-ativar-biometria" :carregando="alterandoBiometria" texto-carregando="Ativando...">Ativar</BaseBotao>
      </template>
    </ModalDialogo>
  </AppShell>
</template>
