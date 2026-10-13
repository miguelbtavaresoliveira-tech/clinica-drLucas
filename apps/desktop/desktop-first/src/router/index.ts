import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";
import { destinoPara, type NomeDaRota } from "../acesso/application/fluxo-de-acesso";
import { useEstadoDoAcesso } from "../acesso/application/estado-do-acesso";
import { useFluxoDeLogin } from "../acesso/application/fluxo-de-login";
import type { EstadoDoAcesso } from "../acesso/application/tipos";

export const rotas: RouteRecordRaw[] = [
  { path: "/", name: "inicio", component: () => import("../acesso/ui/telas/InicioTela.vue") },
  { path: "/entrar", name: "login", component: () => import("../acesso/ui/telas/LoginTela.vue") },
  {
    path: "/entrar/mfa/configurar",
    name: "mfa-configurar",
    component: () => import("../acesso/ui/telas/MfaConfigurarTela.vue"),
  },
  {
    path: "/entrar/mfa/verificar",
    name: "mfa-verificar",
    component: () => import("../acesso/ui/telas/MfaVerificarTela.vue"),
  },
  {
    path: "/redefinir-senha",
    name: "redefinir-senha",
    component: () => import("../acesso/ui/telas/RedefinirSenhaTela.vue"),
  },
  {
    path: "/senha-mestre/definir",
    name: "definir-senha-mestre",
    component: () => import("../acesso/ui/telas/DefinirSenhaMestreTela.vue"),
  },
  {
    path: "/desbloquear",
    name: "desbloqueio",
    component: () => import("../acesso/ui/telas/DesbloqueioTela.vue"),
  },
  {
    path: "/dispositivos",
    name: "dispositivos",
    component: () => import("../acesso/ui/telas/DispositivosTela.vue"),
  },
  {
    path: "/seguranca",
    name: "seguranca",
    component: () => import("../acesso/ui/telas/SegurancaTela.vue"),
  },
  {
    path: "/conectar",
    name: "conectar",
    component: () => import("../acesso/ui/telas/ConectarTela.vue"),
  },
  {
    path: "/dispositivo-revogado",
    name: "dispositivo-revogado",
    component: () => import("../acesso/ui/telas/DispositivoRevogadoTela.vue"),
  },
  { path: "/:caminho(.*)*", redirect: { name: "inicio" } },
];

export interface DependenciasDoGuard {
  /** Estado atual (null = ainda não carregado) e carregamento sob demanda. */
  estado: () => EstadoDoAcesso | null;
  carregar: () => Promise<EstadoDoAcesso>;
  mfaPendente: () => "configurar" | "verificar" | null;
}

/**
 * Evita telas sem sentido para a situação atual. Não é controle de acesso: a autorização
 * real fica no Rust e no servidor.
 */
export function instalarGuard(roteador: Router, deps: DependenciasDoGuard): void {
  roteador.beforeEach(async (para) => {
    if (typeof para.name !== "string") return true;
    let estado = deps.estado();
    if (estado === null) {
      try {
        estado = await deps.carregar();
      } catch {
        return true;
      }
    }
    const destino = destinoPara(para.name as NomeDaRota, { estado, mfaPendente: deps.mfaPendente() });
    return destino === null ? true : { name: destino };
  });
}

/** Sem `deps` o roteador não tem guard (testes de resolução de rotas). */
export function criarRoteador(
  historico: RouterHistory = createWebHashHistory(),
  deps?: DependenciasDoGuard,
): Router {
  const roteador = createRouter({ history: historico, routes: rotas });
  if (deps !== undefined) instalarGuard(roteador, deps);
  return roteador;
}

/** Guard ligado aos singletons reais (usado por `main.ts`). */
export function dependenciasReaisDoGuard(): DependenciasDoGuard {
  const { estado, carregar } = useEstadoDoAcesso();
  const { mfa } = useFluxoDeLogin();
  return { estado: () => estado.value, carregar, mfaPendente: () => mfa.value };
}
