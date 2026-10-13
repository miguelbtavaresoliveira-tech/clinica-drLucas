<script setup lang="ts">
import { PhEnvelopeSimple, PhPaperPlaneTilt } from '@phosphor-icons/vue';
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ehEmailValido } from '../../application/validacoes';
import { solicitarRedefinicao } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';

const props = withDefaults(defineProps<{ aberto: boolean; emailInicial?: string }>(), { emailInicial: '' });
const emit = defineEmits<{ fechar: [] }>();

const router = useRouter();
const email = ref(props.emailInicial);
const erroEmail = ref<string | null>(null);
const erroDeEnvio = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);
const enviado = ref(false);

// A cada abertura o modal recomeça do zero, já com o e-mail digitado no login.
watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    email.value = props.emailInicial;
    erroEmail.value = null;
    erroDeEnvio.value = null;
    enviado.value = false;
  },
);

async function enviar(): Promise<void> {
  erroDeEnvio.value = null;
  if (!ehEmailValido(email.value)) {
    erroEmail.value = 'Informe um e-mail válido.';
    return;
  }
  erroEmail.value = null;
  enviando.value = true;
  try {
    await solicitarRedefinicao(email.value.trim());
    // Sempre a mesma mensagem, exista ou não o e-mail (RN-12).
    enviado.value = true;
  } catch (e) {
    erroDeEnvio.value = mensagemAmigavel(paraErroDoApp(e));
  } finally {
    enviando.value = false;
  }
}

async function irParaRedefinicao(): Promise<void> {
  emit('fechar');
  await router.push({ name: 'redefinir-senha' });
}
</script>

<template>
  <ModalDialogo
    :aberto="aberto"
    titulo="Recuperação de Acesso"
    descricao="Enviaremos um código de redefinição para o seu e-mail."
    @fechar="emit('fechar')"
  >
    <div class="space-y-4">
      <div class="flex items-center gap-3 p-3 rounded-2xl border-2 border-teal-700 bg-teal-50/60">
        <div class="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 flex items-center justify-center shrink-0" aria-hidden="true">
          <PhEnvelopeSimple :size="22" weight="bold" />
        </div>
        <div>
          <p class="text-sm font-bold text-slate-900">E-mail cadastrado</p>
          <p class="text-xs text-slate-600">O código chega na caixa de entrada do e-mail da sua conta.</p>
        </div>
      </div>

      <AlertaBanner v-if="enviado" variante="sucesso" titulo="Pedido recebido">
        Se o e-mail estiver cadastrado, você receberá um código em instantes.
      </AlertaBanner>
      <AlertaBanner v-if="erroDeEnvio" variante="erro" :titulo="erroDeEnvio.titulo">{{ erroDeEnvio.texto }}</AlertaBanner>

      <form v-if="!enviado" id="form-recuperar-senha" novalidate @submit.prevent="enviar">
        <CampoTexto
          id="input-email-recuperacao"
          v-model="email"
          rotulo="E-mail"
          tipo="email"
          autocomplete="username"
          placeholder="seu@email.com.br"
          :erro="erroEmail"
          :desabilitado="enviando"
        />
      </form>
    </div>

    <template #acoes>
      <template v-if="enviado">
        <BaseBotao @click="irParaRedefinicao">Já tenho o código</BaseBotao>
      </template>
      <template v-else>
        <BaseBotao variante="secundario" :desabilitado="enviando" @click="emit('fechar')">Cancelar</BaseBotao>
        <BaseBotao
          tipo="submit"
          form="form-recuperar-senha"
          :carregando="enviando"
          texto-carregando="Enviando..."
        >
          Enviar código de redefinição
          <template #icone><PhPaperPlaneTilt :size="16" weight="bold" aria-hidden="true" /></template>
        </BaseBotao>
      </template>
    </template>
  </ModalDialogo>
</template>
