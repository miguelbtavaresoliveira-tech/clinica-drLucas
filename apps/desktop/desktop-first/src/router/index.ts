import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";

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

export function criarRoteador(historico: RouterHistory = createWebHashHistory()): Router {
  return createRouter({ history: historico, routes: rotas });
}
