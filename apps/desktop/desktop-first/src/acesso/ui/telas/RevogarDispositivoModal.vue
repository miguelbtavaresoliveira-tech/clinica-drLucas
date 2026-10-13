<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ItemDeDispositivo } from '../../application/tipos';
import { ehCodigoTotp } from '../../application/validacoes';
import { revogarDispositivo } from '../../infrastructure/api-identidade';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import { useReautenticacao } from '../composables/useReautenticacao';
import { useToast } from '../composables/useToast';

const props = defineProps<{ dispositivo: ItemDeDispositivo | null }>();
const emit = defineEmits<{ fechar: []; revogado: [] }>();

const { comReautenticacao } = useReautenticacao();
const { mostrar } = useToast();

const motivo = ref('');
const codigo = ref('');
const erroMotivo = ref<string | null>(null);
const erroCodigo = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

const aberto = computed(() => props.dispositivo !== null);

watch(aberto, () => {
  motivo.value = '';
  codigo.value = '';
  erroMotivo.value = null;
  erroCodigo.value = null;
  banner.value = null;
});

async function revogar(): Promise<void> {
  const alvo = props.dispositivo;
  if (alvo === null || enviando.value) return;
  banner.value = null;
  const motivoLimpo = motivo.value.trim();
  erroMotivo.value = motivoLimpo.length >= 3 && motivoLimpo.length <= 200 ? null : 'Informe o motivo (de 3 a 200 caracteres).';
  erroCodigo.value = ehCodigoTotp(codigo.value) ? null : 'Informe o código de 6 dígitos do autenticador.';
  if (erroMotivo.value !== null || erroCodigo.value !== null) return;

  enviando.value = true;
  try {
    await comReautenticacao(() => revogarDispositivo(alvo.id, motivoLimpo, codigo.value));
    mostrar('Dispositivo revogado.');
    emit('revogado');
    emit('fechar');
  } catch (e) {
    const erro = paraErroDoApp(e);
    codigo.value = '';
    if (erro.codigo === 'REAUTENTICACAO_NECESSARIA') {
      erroCodigo.value = 'Código do autenticador inválido.';
    } else if (erro.codigo === 'DISPOSITIVO_NAO_ENCONTRADO') {
      banner.value = { titulo: 'Dispositivo não encontrado', texto: 'Ele pode já ter sido removido. A lista será atualizada.' };
      emit('revogado');
    } else {
      banner.value = mensagemAmigavel(erro);
    }
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <ModalDialogo :aberto="aberto" :titulo="`Revogar ${dispositivo?.apelido ?? ''}`" @fechar="emit('fechar')">
    <form id="form-revogar" class="space-y-4" novalidate @submit.prevent="revogar">
      <AlertaBanner v-if="dispositivo?.atual" variante="aviso" titulo="Este é o computador em uso">
        Este computador será bloqueado imediatamente.
      </AlertaBanner>
      <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
      <CampoTexto
        id="input-motivo-revogacao"
        v-model="motivo"
        data-autofocus
        rotulo="Motivo"
        placeholder="Ex.: Computador perdido"
        obrigatorio
        :maxlength="200"
        :erro="erroMotivo"
        :desabilitado="enviando"
      />
      <CampoCodigo id="input-codigo-revogacao" v-model="codigo" rotulo="Código do autenticador" :erro="erroCodigo" :desabilitado="enviando" />
    </form>
    <template #acoes>
      <BaseBotao variante="secundario" :desabilitado="enviando" @click="emit('fechar')">Cancelar</BaseBotao>
      <BaseBotao tipo="submit" form="form-revogar" variante="perigo" :carregando="enviando" texto-carregando="Revogando...">
        Revogar acesso
      </BaseBotao>
    </template>
  </ModalDialogo>
</template>
