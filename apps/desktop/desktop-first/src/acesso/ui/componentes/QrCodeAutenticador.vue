<script setup lang="ts">
import { PhCopy } from '@phosphor-icons/vue';
import { computed, onMounted, ref } from 'vue';
import { useToast } from '../composables/useToast';
import BaseBotao from './BaseBotao.vue';

const props = defineProps<{ urlOtpauth: string; segredo: string }>();

const { mostrar } = useToast();
const dataUrl = ref<string | null>(null);
const falhou = ref(false);

/** Agrupa a chave de 4 em 4 para facilitar a digitação. */
const chaveAgrupada = computed(() => props.segredo.replace(/(.{4})/g, '$1 ').trim());

onMounted(async () => {
  try {
    // Gerado localmente: o segredo nunca sai deste computador. Importado só quando a tela é usada.
    const QRCode = await import('qrcode');
    dataUrl.value = await QRCode.toDataURL(props.urlOtpauth, { errorCorrectionLevel: 'M', margin: 1, width: 192 });
  } catch {
    falhou.value = true;
  }
});

async function copiarChave(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.segredo);
    mostrar('Chave copiada');
  } catch {
    mostrar('Não foi possível copiar. Selecione e copie a chave manualmente.', 'aviso');
  }
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div class="w-48 h-48 rounded-2xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
      <img
        v-if="dataUrl"
        :src="dataUrl"
        alt="QR code para adicionar a conta ao aplicativo autenticador"
        width="192"
        height="192"
      />
      <p v-else-if="falhou" class="text-xs text-slate-600 text-center px-4">
        Não foi possível gerar o QR code. Use a chave abaixo.
      </p>
      <div v-else class="w-full h-full bg-slate-100 motion-safe:animate-pulse" aria-busy="true" role="status">
        <span class="sr-only">Gerando QR code…</span>
      </div>
    </div>

    <div class="text-center space-y-2">
      <p class="text-xs text-slate-600">Não consegue escanear? Digite esta chave:</p>
      <p class="font-mono text-sm font-semibold text-slate-900 tracking-wider break-all">{{ chaveAgrupada }}</p>
      <BaseBotao variante="secundario" class="mx-auto !min-h-9 !py-2" @click="copiarChave">
        Copiar chave
        <template #icone><PhCopy :size="16" weight="bold" aria-hidden="true" /></template>
      </BaseBotao>
    </div>
  </div>
</template>
