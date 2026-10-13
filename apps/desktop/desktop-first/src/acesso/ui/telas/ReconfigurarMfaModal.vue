<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SegredoMfa } from '../../application/tipos';
import { ehCodigoTotp } from '../../application/validacoes';
import { confirmarReconfiguracaoMfa, iniciarReconfiguracaoMfa } from '../../infrastructure/api-identidade';
import { mensagemAmigavel, paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import CampoCodigo from '../componentes/CampoCodigo.vue';
import CampoSenha from '../componentes/CampoSenha.vue';
import ListaDeCodigosDeRecuperacao from '../componentes/ListaDeCodigosDeRecuperacao.vue';
import ModalDialogo from '../componentes/ModalDialogo.vue';
import QrCodeAutenticador from '../componentes/QrCodeAutenticador.vue';
import { useReautenticacao } from '../composables/useReautenticacao';
import { useToast } from '../composables/useToast';

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const { comReautenticacao } = useReautenticacao();
const { mostrar } = useToast();

const etapa = ref<1 | 2 | 3>(1);
const senha = ref('');
const segredo = ref<SegredoMfa | null>(null);
const codigo = ref('');
const codigosNovos = ref<string[]>([]);
const guardei = ref(false);
const erroSenha = ref<string | null>(null);
const erroCodigo = ref<string | null>(null);
const banner = ref<{ titulo: string; texto: string } | null>(null);
const enviando = ref(false);

function zerar(): void {
  etapa.value = 1;
  senha.value = '';
  segredo.value = null;
  codigo.value = '';
  codigosNovos.value = [];
  guardei.value = false;
  erroSenha.value = null;
  erroCodigo.value = null;
  banner.value = null;
}

watch(() => props.aberto, zerar);

async function iniciar(): Promise<void> {
  if (enviando.value) return;
  banner.value = null;
  if (senha.value.length === 0) {
    erroSenha.value = 'Informe a senha de login.';
    return;
  }
  erroSenha.value = null;
  enviando.value = true;
  const tentativa = senha.value;
  senha.value = '';
  try {
    segredo.value = await comReautenticacao(() => iniciarReconfiguracaoMfa(tentativa));
    etapa.value = 2;
  } catch (e) {
    const erro = paraErroDoApp(e);
    if (erro.codigo === 'REAUTENTICACAO_NECESSARIA' || erro.codigo === 'CREDENCIAIS_INVALIDAS') erroSenha.value = 'Senha de login incorreta.';
    else banner.value = mensagemAmigavel(erro);
  } finally {
    enviando.value = false;
  }
}

async function confirmar(): Promise<void> {
  if (enviando.value) return;
  banner.value = null;
  if (!ehCodigoTotp(codigo.value)) {
    erroCodigo.value = 'Informe o código de 6 dígitos do aplicativo.';
    return;
  }
  erroCodigo.value = null;
  enviando.value = true;
  const tentativa = codigo.value;
  try {
    codigosNovos.value = await comReautenticacao(() => confirmarReconfiguracaoMfa(tentativa));
    segredo.value = null;
    etapa.value = 3;
    mostrar('Autenticador reconfigurado.');
  } catch (e) {
    const erro = paraErroDoApp(e);
    codigo.value = '';
    if (erro.codigo === 'CODIGO_MFA_INVALIDO') erroCodigo.value = 'Código inválido. Digite o código atual do aplicativo.';
    else banner.value = mensagemAmigavel(erro);
  } finally {
    enviando.value = false;
  }
}

/** Na última etapa os códigos só aparecem uma vez: fechar exige confirmar que foram guardados. */
function pedirParaFechar(): void {
  if (etapa.value === 3 && !guardei.value) return;
  zerar();
  emit('fechar');
}
</script>

<template>
  <ModalDialogo :aberto="aberto" titulo="Reconfigurar o aplicativo autenticador" @fechar="pedirParaFechar">
    <AlertaBanner v-if="banner" class="mb-4" variante="erro" :titulo="banner.titulo">{{ banner.texto }}</AlertaBanner>

    <form v-if="etapa === 1" id="form-reconfigurar-1" class="space-y-4" novalidate @submit.prevent="iniciar">
      <p class="text-sm text-slate-700">Etapa 1 de 3 — confirme sua senha de login. O autenticador atual continua valendo até você concluir.</p>
      <CampoSenha id="input-senha-reconfigurar" v-model="senha" data-autofocus rotulo="Senha de login" autocomplete="current-password" obrigatorio :erro="erroSenha" :desabilitado="enviando" />
    </form>

    <form v-else-if="etapa === 2 && segredo" id="form-reconfigurar-2" class="space-y-4" novalidate @submit.prevent="confirmar">
      <p class="text-sm text-slate-700">Etapa 2 de 3 — escaneie o novo QR code e digite o código.</p>
      <QrCodeAutenticador :url-otpauth="segredo.urlOtpauth" :segredo="segredo.segredo" />
      <CampoCodigo id="input-codigo-reconfigurar" v-model="codigo" rotulo="Código do novo aplicativo" :erro="erroCodigo" :desabilitado="enviando" />
    </form>

    <div v-else-if="etapa === 3" class="space-y-4">
      <p class="text-sm text-slate-700">Etapa 3 de 3 — guarde os novos códigos de recuperação.</p>
      <ListaDeCodigosDeRecuperacao :codigos="codigosNovos" />
      <div class="flex items-start gap-3">
        <input id="guardei-codigos-reconfigurar" v-model="guardei" type="checkbox" class="mt-1 w-4 h-4 accent-teal-700" />
        <label for="guardei-codigos-reconfigurar" class="text-sm text-slate-800">Guardei os códigos</label>
      </div>
    </div>

    <template #acoes>
      <template v-if="etapa === 1">
        <BaseBotao variante="secundario" :desabilitado="enviando" @click="pedirParaFechar">Cancelar</BaseBotao>
        <BaseBotao tipo="submit" form="form-reconfigurar-1" :carregando="enviando" texto-carregando="Verificando...">Continuar</BaseBotao>
      </template>
      <template v-else-if="etapa === 2">
        <BaseBotao variante="secundario" :desabilitado="enviando" @click="pedirParaFechar">Cancelar</BaseBotao>
        <BaseBotao tipo="submit" form="form-reconfigurar-2" :carregando="enviando" texto-carregando="Confirmando...">Confirmar</BaseBotao>
      </template>
      <BaseBotao v-else :desabilitado="!guardei" @click="pedirParaFechar">Concluir</BaseBotao>
    </template>
  </ModalDialogo>
</template>
