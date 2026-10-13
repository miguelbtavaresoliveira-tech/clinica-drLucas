<script setup lang="ts">
import { ref, watch } from 'vue';
import { ehCodigoTotp } from '../../application/validacoes';
import { regenerarCodigos } from '../../infrastructure/api-identidade';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import ListaDeCodigosDeRecuperacao from '../componentes/ListaDeCodigosDeRecuperacao.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import { useReautenticacao } from '../composables/useReautenticacao';

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const { comReautenticacao } = useReautenticacao();

const codigo = ref('');
const erroCodigo = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);
const novosCodigos = ref<string[]>([]);
const guardei = ref(false);

watch(
  () => props.aberto,
  () => {
    codigo.value = '';
    erroCodigo.value = null;
    banner.value = null;
    novosCodigos.value = [];
    guardei.value = false;
  },
);

async function gerar(): Promise<void> {
  if (enviando.value) return;
  banner.value = null;
  if (!ehCodigoTotp(codigo.value)) {
    erroCodigo.value = 'Informe o código de 6 dígitos do autenticador.';
    return;
  }
  erroCodigo.value = null;
  enviando.value = true;
  const tentativa = codigo.value;
  try {
    novosCodigos.value = await comReautenticacao(() => regenerarCodigos(tentativa));
  } catch (e) {
    const erro = paraErroDoApp(e);
    codigo.value = '';
    if (erro.codigo === 'REAUTENTICACAO_NECESSARIA') erroCodigo.value = 'Código do autenticador inválido.';
    else banner.value = mensagemAmigavel(erro);
  } finally {
    enviando.value = false;
  }
}

/** Com os códigos na tela, só se fecha depois de confirmar que foram guardados (eles não aparecem de novo). */
function pedirParaFechar(): void {
  if (novosCodigos.value.length > 0 && !guardei.value) return;
  novosCodigos.value = [];
  emit('fechar');
}
</script>

<template>
  <ModalDialogo :aberto="aberto" titulo="Gerar novos códigos de recuperação" @fechar="pedirParaFechar">
    <template v-if="novosCodigos.length === 0">
      <form id="form-regenerar-codigos" class="space-y-4" novalidate @submit.prevent="gerar">
        <p class="text-sm text-slate-700">Os códigos atuais deixarão de funcionar. Confirme com o código do seu autenticador.</p>
        <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
        <CampoCodigo id="input-codigo-regenerar" v-model="codigo" data-autofocus rotulo="Código do autenticador" :erro="erroCodigo" :desabilitado="enviando" />
      </form>
    </template>
    <div v-else class="space-y-4">
      <ListaDeCodigosDeRecuperacao :codigos="novosCodigos" />
      <div class="flex items-start gap-3">
        <input id="guardei-novos-codigos" v-model="guardei" type="checkbox" class="mt-1 w-4 h-4 accent-teal-700" />
        <label for="guardei-novos-codigos" class="text-sm text-slate-800">Guardei os códigos</label>
      </div>
    </div>
    <template #acoes>
      <template v-if="novosCodigos.length === 0">
        <BaseBotao variante="secundario" :desabilitado="enviando" @click="pedirParaFechar">Cancelar</BaseBotao>
        <BaseBotao tipo="submit" form="form-regenerar-codigos" :carregando="enviando" texto-carregando="Gerando...">Gerar novos códigos</BaseBotao>
      </template>
      <BaseBotao v-else :desabilitado="!guardei" @click="pedirParaFechar">Concluir</BaseBotao>
    </template>
  </ModalDialogo>
</template>
