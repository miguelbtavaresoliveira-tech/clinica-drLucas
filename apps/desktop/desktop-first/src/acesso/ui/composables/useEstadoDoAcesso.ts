import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useEstadoDoAcesso } from '../../application/estado-do-acesso';
import { destinoPara, type NomeDaRota } from '../../application/fluxo-de-acesso';
import { useFluxoDeLogin } from '../../application/fluxo-de-login';

/**
 * Montado uma vez no `App.vue`: carrega o estado, escuta as mudanças vindas do Rust e, quando a
 * tela atual deixa de ser permitida (bloqueio por inatividade, revogação...), leva o usuário à rota certa.
 * (Não confundir com `useEstadoDoAcesso` da camada de aplicação, que guarda o estado.)
 */
export function useEstadoDoAcessoNaUI(): void {
  const router = useRouter();
  const { estado, carregar, iniciarEscuta, pararEscuta } = useEstadoDoAcesso();
  const { mfa } = useFluxoDeLogin();

  watch(estado, async (atual) => {
    if (atual === null) return;
    const nome = router.currentRoute.value.name;
    if (typeof nome !== 'string') return;
    const destino = destinoPara(nome as NomeDaRota, { estado: atual, mfaPendente: mfa.value });
    if (destino !== null) await router.replace({ name: destino });
  });

  onMounted(async () => {
    try {
      await carregar();
    } catch {
      // Sem estado ainda: o guard do roteador tenta de novo na próxima navegação.
    }
    await iniciarEscuta();
  });

  onUnmounted(pararEscuta);
}
