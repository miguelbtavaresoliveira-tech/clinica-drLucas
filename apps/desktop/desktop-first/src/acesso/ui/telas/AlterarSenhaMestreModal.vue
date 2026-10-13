<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { regrasDaSenhaMestre } from '../../application/validacoes';
import { alterarSenhaMestre } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import { useReautenticacao } from '../composables/useReautenticacao';
import { useToast } from '../composables/useToast';

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const { comReautenticacao } = useReautenticacao();
const { mostrar } = useToast();

const atual = ref('');
const nova = ref('');
const confirmacao = ref('');
const erroAtual = ref<string | null>(null);
const erroNova = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

const regras = computed(() => regrasDaSenhaMestre(nova.value, confirmacao.value));

function limpar(): void {
  atual.value = '';
  nova.value = '';
  confirmacao.value = '';
}

watch(
  () => props.aberto,
  () => {
    limpar();
    erroAtual.value = null;
    erroNova.value = null;
    banner.value = null;
  },
);

async function enviar(): Promise<void> {
  if (enviando.value) return;
  banner.value = null;
  erroAtual.value = atual.value.length > 0 ? null : 'Informe a senha mestre atual.';
  erroNova.value = regras.value.every((r) => r.ok) ? null : 'A nova senha não atende às regras abaixo.';
  if (erroAtual.value !== null || erroNova.value !== null) return;

  enviando.value = true;
  const [senhaAtual, novaSenha] = [atual.value, nova.value];
  try {
    await comReautenticacao(() => alterarSenhaMestre(senhaAtual, novaSenha));
    limpar();
    mostrar('Senha mestre alterada.');
    emit('fechar');
  } catch (e) {
    const erro = paraErroDoApp(e);
    limpar();
    if (erro.codigo === 'SENHA_MESTRE_INCORRETA') erroAtual.value = 'Senha mestre atual incorreta.';
    else if (erro.codigo === 'SENHA_MESTRE_FRACA') erroNova.value = 'Senha mestre fraca. Use 12 ou mais caracteres e evite senhas comuns.';
    else banner.value = mensagemAmigavel(erro);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <ModalDialogo :aberto="aberto" titulo="Alterar senha mestre" @fechar="emit('fechar')">
    <form id="form-alterar-senha-mestre" class="space-y-4" novalidate @submit.prevent="enviar">
      <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
      <CampoSenha id="input-mestre-atual" v-model="atual" data-autofocus rotulo="Senha mestre atual" autocomplete="current-password" obrigatorio :erro="erroAtual" :desabilitado="enviando" />
      <CampoSenha id="input-mestre-nova" v-model="nova" rotulo="Nova senha mestre" autocomplete="new-password" obrigatorio :erro="erroNova" :desabilitado="enviando" />
      <CampoSenha id="input-mestre-confirmacao" v-model="confirmacao" rotulo="Confirme a nova senha mestre" autocomplete="new-password" obrigatorio :desabilitado="enviando" />
      <ul aria-live="polite" class="space-y-1 text-xs">
        <li v-for="r in regras" :key="r.chave" :class="r.ok ? 'text-emerald-800' : 'text-slate-600'">
          {{ r.ok ? '✓' : '○' }} {{ r.texto }}<span class="sr-only">{{ r.ok ? ' — atendida' : ' — pendente' }}</span>
        </li>
      </ul>
    </form>
    <template #acoes>
      <BaseBotao variante="secundario" :desabilitado="enviando" @click="emit('fechar')">Cancelar</BaseBotao>
      <BaseBotao tipo="submit" form="form-alterar-senha-mestre" :carregando="enviando" texto-carregando="Alterando...">Alterar senha mestre</BaseBotao>
    </template>
  </ModalDialogo>
</template>
