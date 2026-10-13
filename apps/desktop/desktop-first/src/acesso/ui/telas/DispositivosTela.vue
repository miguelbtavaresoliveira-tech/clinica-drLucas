<script setup lang="ts">
import { PhAppleLogo, PhDesktop, PhWindowsLogo } from '@phosphor-icons/vue';
import { onMounted, ref } from 'vue';
import type { ItemDeDispositivo } from '../../application/tipos';
import { listarDispositivos } from '../../infrastructure/api-identidade';
import { paraErroDoApp } from '../../infrastructure/erros';
import AlertaBanner from '../componentes/AlertaBanner.vue';
import BaseBotao from '../componentes/BaseBotao.vue';
import AppShell from '../layout/AppShell.vue';
import RevogarDispositivoModal from './RevogarDispositivoModal.vue';

const formato = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
const formatar = (iso: string): string => formato.format(new Date(iso));

type Fase = 'carregando' | 'lista' | 'erro' | 'sem-conexao';

const fase = ref<Fase>('carregando');
const dispositivos = ref<ItemDeDispositivo[]>([]);
const alvo = ref<ItemDeDispositivo | null>(null);

async function carregar(): Promise<void> {
  fase.value = 'carregando';
  try {
    dispositivos.value = await listarDispositivos();
    fase.value = 'lista';
  } catch (e) {
    fase.value = paraErroDoApp(e).codigo === 'SEM_CONEXAO' ? 'sem-conexao' : 'erro';
  }
}

onMounted(carregar);

async function aoRevogar(): Promise<void> {
  await carregar();
}
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Dispositivos</h1>
    <p class="mt-1 text-sm text-slate-600">Computadores com acesso à sua conta (máximo de 3 ativos).</p>

    <div class="mt-6">
      <div v-if="fase === 'carregando'" class="grid gap-4 xl:grid-cols-2" role="status" aria-busy="true">
        <span class="sr-only">Carregando dispositivos…</span>
        <div v-for="n in 2" :key="n" class="h-28 rounded-2xl bg-slate-100 motion-safe:animate-pulse" aria-hidden="true"></div>
      </div>

      <AlertaBanner v-else-if="fase === 'sem-conexao'" variante="aviso" titulo="Sem conexão">
        Conecte-se à internet para ver os dispositivos.
        <BaseBotao variante="secundario" class="mt-3 !min-h-9 !py-2" @click="carregar">Tentar novamente</BaseBotao>
      </AlertaBanner>

      <AlertaBanner v-else-if="fase === 'erro'" variante="erro" titulo="Não foi possível carregar os dispositivos">
        Tente novamente. Se persistir, reinicie o aplicativo.
        <BaseBotao variante="secundario" class="mt-3 !min-h-9 !py-2" @click="carregar">Tentar novamente</BaseBotao>
      </AlertaBanner>

      <p v-else-if="dispositivos.length === 0" class="text-slate-600">Nenhum dispositivo encontrado.</p>

      <ul v-else class="grid gap-4 xl:grid-cols-2">
        <li v-for="d in dispositivos" :key="d.id" class="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div class="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0" aria-hidden="true">
            <PhAppleLogo v-if="d.plataforma === 'macos'" :size="24" weight="fill" />
            <PhWindowsLogo v-else-if="d.plataforma === 'windows'" :size="24" weight="fill" />
            <PhDesktop v-else :size="24" weight="fill" />
          </div>
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-bold text-slate-900 truncate">{{ d.apelido }}</p>
              <span v-if="d.atual" class="text-[11px] font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">Este computador</span>
              <span
                v-if="d.situacao === 'ativo'"
                class="text-[11px] font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md"
                >Ativo</span
              >
              <span v-else class="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                Revogado<template v-if="d.revogadoEm"> em <time :datetime="d.revogadoEm">{{ formatar(d.revogadoEm) }}</time></template>
              </span>
            </div>
            <p class="text-xs text-slate-600">Registrado em <time :datetime="d.registradoEm">{{ formatar(d.registradoEm) }}</time></p>
            <p class="text-xs text-slate-600">Última conexão <time :datetime="d.ultimoCheckIn">{{ formatar(d.ultimoCheckIn) }}</time></p>
          </div>
          <BaseBotao
            v-if="d.situacao === 'ativo'"
            variante="perigo"
            class="!min-h-9 !py-2"
            :aria-label="`Revogar ${d.apelido}`"
            @click="alvo = d"
          >
            Revogar
          </BaseBotao>
        </li>
      </ul>
    </div>

    <RevogarDispositivoModal :dispositivo="alvo" @fechar="alvo = null" @revogado="aoRevogar" />
  </AppShell>
</template>
