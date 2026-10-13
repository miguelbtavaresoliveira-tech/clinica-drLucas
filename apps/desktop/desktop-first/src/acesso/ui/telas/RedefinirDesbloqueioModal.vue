<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { useFluxoDeLogin } from '../../application/fluxo-de-login';
import { previaRedefinicaoLocal, redefinirDesbloqueioLocal } from '../../infrastructure/comandos-tauri';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoTexto from '../componentes/CampoTexto.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const router = useRouter();
const { estado, sincronizarCom } = useEstadoDoAcesso();
const fluxo = useFluxoDeLogin();

const PALAVRA = 'DESCARTAR';

const online = computed(() => estado.value?.sessaoOnline === true);
const eventosPendentes = ref<number | null>(null);
const confirmacao = ref('');
const banner = ref<{ titulo: string; texto: string } | null>(null);
const carregandoPrevia = ref(false);
const enviando = ref(false);

watch(
  () => props.aberto,
  async (aberto) => {
    confirmacao.value = '';
    banner.value = null;
    eventosPendentes.value = null;
    if (!aberto || !online.value) return;
    carregandoPrevia.value = true;
    try {
      eventosPendentes.value = (await previaRedefinicaoLocal()).eventosPendentes;
    } catch (e) {
      banner.value = mensagemAmigavel(paraErroDoApp(e));
    } finally {
      carregandoPrevia.value = false;
    }
  },
);

async function entrarParaRedefinir(): Promise<void> {
  fluxo.aviso.value = 'Após entrar, confirme a redefinição do desbloqueio local.';
  emit('fechar');
  await router.push({ name: 'login' });
}

async function descartar(): Promise<void> {
  if (confirmacao.value !== PALAVRA || enviando.value) return;
  banner.value = null;
  enviando.value = true;
  try {
    sincronizarCom(await redefinirDesbloqueioLocal(PALAVRA));
    emit('fechar');
    await router.push({ name: 'definir-senha-mestre' });
  } catch (e) {
    banner.value = mensagemAmigavel(paraErroDoApp(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <ModalDialogo :aberto="aberto" titulo="Esqueci a senha mestre" @fechar="emit('fechar')">
    <template v-if="!online">
      <p class="text-sm text-slate-700">
        Para redefinir, entre com e-mail, senha e código. A cópia local será descartada e baixada novamente.
      </p>
    </template>
    <div v-else class="space-y-4">
      <p class="text-sm text-slate-700">
        A cópia local dos dados será descartada e baixada novamente do servidor. Depois você cria uma nova senha mestre.
      </p>
      <AlertaBanner v-if="eventosPendentes !== null && eventosPendentes > 0" variante="erro" titulo="Registros não enviados">
        Há {{ eventosPendentes }} registros ainda não enviados ao servidor. Eles serão perdidos.
      </AlertaBanner>
      <AlertaBanner v-if="banner" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>
      <CampoTexto
        id="input-confirmar-descarte"
        v-model="confirmacao"
        rotulo="Digite DESCARTAR para confirmar"
        autocomplete="off"
        monoespacado
        :desabilitado="enviando || carregandoPrevia"
      />
    </div>

    <template #acoes>
      <BaseBotao variante="secundario" :desabilitado="enviando" @click="emit('fechar')">Cancelar</BaseBotao>
      <BaseBotao v-if="!online" @click="entrarParaRedefinir">Entrar para redefinir</BaseBotao>
      <BaseBotao
        v-else
        variante="perigo"
        :desabilitado="confirmacao !== PALAVRA || carregandoPrevia"
        :carregando="enviando"
        texto-carregando="Descartando..."
        @click="descartar"
      >
        Descartar e redefinir
      </BaseBotao>
    </template>
  </ModalDialogo>
</template>
