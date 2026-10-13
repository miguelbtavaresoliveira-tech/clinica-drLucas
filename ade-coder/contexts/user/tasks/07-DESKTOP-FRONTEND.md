# 📋 07 — Desktop: frontend Vue 3 (telas a partir do Figma)

> **Objetivo**: Construir as telas do contexto Identidade e Acesso no app desktop (login, MFA, senha mestre, desbloqueio, dispositivos, segurança, avisos de modo offline/revogação), fiéis ao Figma e falando **só** com os comandos Rust (D-005).
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: Vue 3.5 (`<script setup lang="ts">`), vue-router 4, Tailwind v4 (`@tailwindcss/vite`), `@phosphor-icons/vue`, `qrcode`, Vitest + Testing Library (`@testing-library/vue`, `user-event`, `jest-dom`), Playwright + `@axe-core/playwright`.
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-002, D-003, D-005), `06-DESKTOP-RUST.md` (**Contrato de comandos Tauri**), SPEC §7.2 "Telas", referência visual `ade-coder/contexts/user/figma-components/page-login.md`.

## Regras desta camada
- Pasta: `apps/desktop/desktop-first/src/`. Comandos executar em `apps/desktop/desktop-first/`.
- **Proibido**: `fetch`/`XMLHttpRequest`/`axios` (toda chamada passa por `src/acesso/infrastructure/comandos-tauri.ts`); `localStorage`/`sessionStorage`/`IndexedDB` para qualquer dado de acesso; `v-html`/`innerHTML`; URLs externas em `src`/`href`; CDN; `console.log`.
  Verificação: `grep -rnE "fetch\(|localStorage|sessionStorage|v-html|innerHTML|https?://" src --include=*.ts --include=*.vue | grep -v "\.spec\.ts"` deve imprimir nada.
- Componentes: `<script setup lang="ts">`, `defineProps` com tipos, `defineEmits` tipado. Lógica de negócio fora do template (em `application/`). Todo listener/timer criado em `onMounted` é removido em `onUnmounted`.
- Textos em português do Brasil; datas exibidas com `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })`.
- Contraste: texto sobre fundo claro usa no mínimo `slate-500` (#64748b). O Figma usa `text-slate-400` em textos pequenos sobre branco (contraste 2,6:1, reprova AA) → **trocar por `text-slate-500`** em todos esses casos, inclusive placeholders.
- Testes de componente usam `vi.mock('<caminho>/comandos-tauri')` (não chamam o Tauri real). Seletores por papel/rótulo (`getByRole`, `getByLabelText`), nunca por classe CSS.
- Janela mínima do app é 1024×700 (TASK-006). **Breakpoints obrigatórios**: 1024×700, 1280×800, 1440×900.

## Rotas (fonte única)

| Rota | `name` | Componente | Quando é permitida (regra em `fluxo-de-acesso.ts`) |
|---|---|---|---|
| `/` | `inicio` | `InicioTela` | `normal` ou `somente_leitura` |
| `/entrar` | `login` | `LoginTela` | sempre, exceto `revogado` |
| `/entrar/mfa/configurar` | `mfa-configurar` | `MfaConfigurarTela` | há desafio em memória com `mfa: 'configurar'` |
| `/entrar/mfa/verificar` | `mfa-verificar` | `MfaVerificarTela` | há desafio em memória |
| `/redefinir-senha` | `redefinir-senha` | `RedefinirSenhaTela` | sempre, exceto `revogado` |
| `/senha-mestre/definir` | `definir-senha-mestre` | `DefinirSenhaMestreTela` | `sem_configuracao` **e** `sessaoOnline` |
| `/desbloquear` | `desbloqueio` | `DesbloqueioTela` | `bloqueado` |
| `/dispositivos` | `dispositivos` | `DispositivosTela` | `normal` ou `somente_leitura` |
| `/seguranca` | `seguranca` | `SegurancaTela` | `normal` ou `somente_leitura` |
| `/conectar` | `conectar` | `ConectarTela` | `offline_expirado` |
| `/dispositivo-revogado` | `dispositivo-revogado` | `DispositivoRevogadoTela` | `revogado` |

## 🎯 Mapa de Arquivos (base `apps/desktop/desktop-first/`)

| Arquivo | Tarefa |
|---|---|
| `src/styles/tema.css`, `src/main.ts`, `src/App.vue`, `src/router/index.ts`, remoção de `src/assets/vue.svg`, `public/tauri.svg`, `public/vite.svg` | TASK-080 |
| `src/acesso/infrastructure/{comandos-tauri,api-identidade,erros}.ts`, `e2e/fixtures/tauri-mock.ts` | TASK-081 |
| `src/acesso/application/{tipos,fluxo-de-acesso,estado-do-acesso,fluxo-de-login,validacoes}.ts` | TASK-082 |
| `src/acesso/ui/componentes/*.vue`, `src/acesso/ui/composables/useToast.ts` | TASK-083 |
| `src/acesso/ui/layout/{AuthLayout,PainelInstitucional,conteudo-institucional}`, `ui/componentes/IndicadorConexao.vue` | TASK-084 |
| `src/acesso/ui/telas/LoginTela.vue` | TASK-085 |
| `src/acesso/ui/telas/{RecuperarSenhaModal,RedefinirSenhaTela}.vue` | TASK-086 |
| `src/acesso/ui/telas/MfaConfigurarTela.vue`, `ui/componentes/{QrCodeAutenticador,ListaDeCodigosDeRecuperacao}.vue` | TASK-087 |
| `src/acesso/ui/telas/MfaVerificarTela.vue` | TASK-088 |
| `src/acesso/ui/telas/DefinirSenhaMestreTela.vue` | TASK-089 |
| `src/acesso/ui/telas/{DesbloqueioTela,RedefinirDesbloqueioModal}.vue` | TASK-090 |
| `src/acesso/ui/layout/AppShell.vue`, `ui/telas/{InicioTela,ConectarTela}.vue`, `ui/componentes/{BannerSomenteLeitura,BannerSessao}.vue`, `ui/composables/{useSinalDeAtividade,useEstadoDoAcesso,useSessaoOnline}.ts` | TASK-091 |
| `src/acesso/ui/componentes/ReautenticacaoModal.vue`, `ui/composables/useReautenticacao.ts` | TASK-092 |
| `src/acesso/ui/telas/{DispositivosTela,RevogarDispositivoModal}.vue` | TASK-093 |
| `src/acesso/ui/telas/SegurancaTela.vue` + modais de segurança | TASK-094 |
| `src/acesso/ui/telas/DispositivoRevogadoTela.vue`, `e2e/*.spec.ts` | TASK-095 |

---

### TASK-080: Tema (tokens do Figma), roteador e casca do app
- **Status**: `[🔍 Aguardando Revisão]` (worker2, commit 71c1725; aviso do vite sobre import sem extensão em vitest.config.ts, da TASK-005)
- **Depende de**: TASK-005, TASK-006
- **Objetivo**: Substituir o template "Tauri + Vue" pela base do app: tokens de design do Figma em Tailwind v4, fontes locais, roteador com as rotas da tabela e `App.vue` mínimo.
- **Arquivos permitidos**: `src/styles/tema.css` (novo), `src/main.ts`, `src/App.vue`, `src/router/index.ts` (novo), `src/router/rotas.spec.ts` (novo), `src/acesso/ui/telas/*.vue` **somente como placeholders** de uma linha (`<template><h1>Nome da tela</h1></template>`) para cada componente da tabela de rotas; remover `src/assets/vue.svg`, `public/tauri.svg`, `public/vite.svg`
- **Arquivos proibidos**: todo o resto
- **Referência visual**: bloco `tailwind.config` e `<style>` de `page-login.md` (linhas 14–62).
- **Componentes e rotas**: `router/index.ts` exporta `export const rotas: RouteRecordRaw[]` (tabela de rotas, `component` com import dinâmico `() => import(...)`) e `export function criarRoteador(historico = createWebHashHistory()): Router`. Guard global fica para a TASK-082.
- **Contrato** (`tema.css`):
  ```css
  @import "tailwindcss";
  @theme {
    --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, monospace;
    --color-brand-50: #eff9fa; --color-brand-100: #d7f0f2; --color-brand-200: #b4e2e6; --color-brand-500: #14b8a6;
    --color-brand-600: #0d9488; --color-brand-700: #0f4c5c; --color-brand-800: #0c3b48; --color-brand-900: #082832; --color-brand-950: #04171d;
    --color-surface: #f8f9ff; --color-surface-dim: #cbdbf5; --color-surface-low: #eff4ff; --color-surface-card: #ffffff;
  }
  @layer base {
    body { @apply bg-[#f0f4f8] text-slate-800 font-sans antialiased min-h-screen; }
    :focus-visible { @apply outline-2 outline-offset-2 outline-brand-700; }
  }
  .mesh-gradient { /* copiar exatamente o gradiente de page-login.md linhas 50–54 */ }
  ```
  `main.ts`: importa `@fontsource/plus-jakarta-sans/{400,500,600,700,800}.css`, `@fontsource/jetbrains-mono/{400,500}.css`, `./styles/tema.css`; `createApp(App).use(criarRoteador()).mount('#app')`.
  `App.vue`: `<RouterView />` dentro de `<div class="min-h-screen">` (o host de toasts entra na TASK-083).
- **Estados obrigatórios**: não se aplica (casca).
- **Responsividade**: n/a nesta tarefa.
- **Acessibilidade**: `:focus-visible` global definido acima.
- **Passo a passo**: criar tema; trocar `main.ts`/`App.vue`; criar roteador e placeholders; apagar os SVGs de template; testar.
- **Testes obrigatórios** (`rotas.spec.ts`): cada caminho da tabela resolve para o `name` correto (`router.resolve('/entrar').name === 'login'`); rota desconhecida (`/xyz`) redireciona para `inicio` (adicione `{ path: '/:caminho(.*)*', redirect: { name: 'inicio' } }`).
- **Requisitos de segurança**: `createWebHashHistory` (o app é servido do bundle local); nenhuma fonte/ícone remoto.
- **Restrições de dependência e performance**: telas por import dinâmico (code splitting); nenhuma dependência nova.
- **Critérios de aceite**: [ ] `pnpm run build` sem warnings novos · [ ] testes passam · [ ] `grep -rn "greet\|Tauri + Vue" src` vazio
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: guards, componentes.
- **Convenção de commit**: `feat(TASK-080): add design tokens, router and app shell`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-081: Infraestrutura — comandos Tauri tipados, erros e mock de E2E
- **Status**: `[🔍 Aguardando Revisão]` (worker2, commit a754c25; @tauri-apps/api 2.12.3; e2e/fixtures/tauri-mock.ts reimplementa o protocolo IPC em vez de reusar @tauri-apps/api/mocks, que só funciona em jsdom — ver comentário no arquivo)
- **Depende de**: TASK-080
- **Objetivo**: Um único ponto de acesso ao Rust, tipado conforme o contrato do arquivo 06, com erros normalizados e mensagens amigáveis.
- **Arquivos permitidos**: `src/acesso/infrastructure/comandos-tauri.ts`, `src/acesso/infrastructure/api-identidade.ts`, `src/acesso/infrastructure/erros.ts`, `src/acesso/application/tipos.ts`, seus `.spec.ts`; `e2e/fixtures/tauri-mock.ts`, `e2e/fixtures/estados.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - `application/tipos.ts`: tipos TypeScript **idênticos** ao bloco de formatos do arquivo 06 (`Situacao`, `EstadoDoAcesso`, `ResumoDoLogin`, `UsuarioResumo`) mais: `RespostaIniciarLogin { desafio; mfa: 'configurar'|'verificar'; expiraEm: string }`, `SegredoMfa { segredo; urlOtpauth }`, `CodigoInformado`, `ItemDeDispositivo { id; apelido; plataforma: 'macos'|'windows'; registradoEm: string; ultimoCheckIn: string; situacao: 'ativo'|'revogado'; revogadoEm: string|null; atual: boolean }`.
  - `erros.ts`:
    ```ts
    export class ErroDoApp extends Error { constructor(readonly codigo: string, mensagem: string, readonly extras: { segundosRestantes?: number; status?: number; tentarApos?: string } = {}); }
    export function paraErroDoApp(e: unknown): ErroDoApp;  // objeto { codigo: string, mensagem: string, ... } → ErroDoApp; qualquer outra coisa → ErroDoApp('INTERNO', 'Erro interno.')
    export function mensagemAmigavel(e: ErroDoApp): { titulo: string; texto: string };
    ```
    Tabela de `mensagemAmigavel` (texto exato):
    | `codigo` | título | texto |
    |---|---|---|
    | `CREDENCIAIS_INVALIDAS` | Credenciais não encontradas | E-mail ou senha incorretos. Verifique os dados e tente novamente. |
    | `CONTA_BLOQUEADA` | Conta temporariamente bloqueada | Muitas tentativas. Tente novamente após {HH:mm de tentarApos}. |
    | `MUITAS_REQUISICOES` | Muitas tentativas | Aguarde um minuto e tente novamente. |
    | `CODIGO_MFA_INVALIDO` | Código inválido | O código não confere ou já foi usado. Entre novamente. |
    | `DESAFIO_INVALIDO` | Sessão de login expirada | Entre novamente com e-mail e senha. |
    | `SEM_CONEXAO` | Sem conexão com o servidor | Verifique a internet e tente novamente. |
    | `SESSAO_EXPIRADA` | Sessão expirada | Entre novamente para sincronizar. |
    | `LIMITE_DE_DISPOSITIVOS_ATINGIDO` | Limite de computadores atingido | Revogue um computador em Dispositivos, a partir de outro computador conectado. |
    | `DISPOSITIVO_REVOGADO` | Computador desconectado | O acesso deste computador foi revogado. |
    | `SENHA_FRACA` | Senha fraca | Use ao menos 12 caracteres, diferente do e-mail e que não seja comum. |
    | `SENHA_MESTRE_INCORRETA` | Senha mestre incorreta | Verifique a senha e tente novamente. |
    | `AGUARDE_ANTES_DE_TENTAR` | Aguarde | Tente novamente em {segundosRestantes} s. |
    | `EXIGE_LOGIN_COMPLETO` | Entre com e-mail e senha | Por segurança, faça o login completo para liberar o desbloqueio. |
    | `REAUTENTICACAO_NECESSARIA` | Confirme sua identidade | Digite sua senha mestre para continuar. |
    | `TOKEN_DE_REDEFINICAO_INVALIDO` | Código de redefinição inválido | Peça um novo e-mail de redefinição. |
    | `BIOMETRIA_INDISPONIVEL` | Biometria indisponível | Use sua senha mestre. |
    | `SOMENTE_LEITURA` | Modo somente leitura | Conecte-se à internet para voltar a editar. |
    | (qualquer outro) | Não foi possível concluir | Tente novamente. Se persistir, reinicie o aplicativo. |
  - `comandos-tauri.ts`: uma função por linha do contrato do arquivo 06, com nomes em camelCase (`estadoDoAcesso()`, `configurarDesbloqueio(senha)`, `desbloquearComSenha(senha)`, `bloquear()`, `sinalDeAtividade()`, `iniciarLogin(email, senha)`, `gerarSegredoMfa(desafio)`, `confirmarMfa(desafio, codigo)`, `concluirLogin(desafio, codigo)`, `renovarSessao()`, `encerrarSessao()`, `solicitarRedefinicao(email)`, `concluirRedefinicao(token, novaSenha, codigo)`, `requisicaoAutenticada<T>(metodo, caminho, corpo)`, `enviarAuditoriaPendente()`, `reautenticar(metodo, senha)`, `alterarSenhaMestre(atual, nova)`, `previaRedefinicaoLocal()`, `redefinirDesbloqueioLocal(confirmacao)`, `redefinirComputadorRevogado(confirmacao)`, `desbloquearComBiometria()`, `ativarBiometria(senha)`, `desativarBiometria()`), todas via `invocar<T>(cmd, args)` que faz `invoke` e converte rejeição com `paraErroDoApp`. Mais `aoMudarEstado(cb): Promise<() => void>` com `listen('acesso://estado-alterado', e => cb(e.payload))`.
  - `api-identidade.ts` (usa `requisicaoAutenticada`): `listarDispositivos(): Promise<ItemDeDispositivo[]>` (`GET /dispositivos` → `.dispositivos`), `revogarDispositivo(id, motivo, codigoMfa)`, `trocarSenha(senhaAtual, novaSenha)`, `regenerarCodigos(codigoMfa): Promise<string[]>`, `iniciarReconfiguracaoMfa(senhaAtual): Promise<SegredoMfa>`, `confirmarReconfiguracaoMfa(codigo): Promise<string[]>`. `id` validado com regex UUID antes de montar o caminho (inválido → `ErroDoApp('INTERNO', ...)`).
  - `e2e/fixtures/tauri-mock.ts`: `instalarMockTauri(page: Page, cenario: CenarioDeComandos): Promise<void>` — `page.addInitScript` que define `window.__TAURI_INTERNALS__` com `invoke(cmd, args)` respondendo pelo `cenario` (mapa `comando → resposta | { erro: ErroDoApp }`, serializável) e suporte a eventos (`transformCallback`, `plugin:event|listen`, `plugin:event|unlisten`); `emitirEstado(page, estado)` dispara `acesso://estado-alterado`; `chamadasRegistradas(page)` devolve `{ cmd, args }[]`. Antes de escrever, leia `node_modules/@tauri-apps/api/core.js` e `mocks.js` e reproduza o formato que eles esperam; registre a versão do `@tauri-apps/api` no relatório.
  - `e2e/fixtures/estados.ts`: fábricas `estadoSemConfiguracao()`, `estadoBloqueado(extras?)`, `estadoNormal(extras?)`, `estadoSomenteLeitura()`, `estadoRevogado()`.
- **Testes obrigatórios**: `comandos-tauri.spec.ts` com `mockIPC` de `@tauri-apps/api/mocks` — cada função chama o comando com o nome snake_case e argumentos camelCase exatos (`it.each`); rejeição `{ codigo: 'SENHA_MESTRE_INCORRETA', mensagem: 'x' }` vira `ErroDoApp` com `codigo`; rejeição string vira `INTERNO`. `erros.spec.ts`: tabela completa; `CONTA_BLOQUEADA` formata `tentarApos` `2026-10-13T12:30:00.000Z` como `09:30`. `api-identidade.spec.ts`: caminho `'/dispositivos/<uuid>/revogar'` correto; id `'../auth/refresh'` rejeitado sem invocar.
- **Requisitos de segurança**: nenhum token trafega pelo JS; caminhos montados só com ids validados.
- **Restrições de dependência e performance**: só `@tauri-apps/api` (já instalado).
- **Critérios de aceite**: [ ] todas as 23 funções existem e batem com o contrato · [ ] testes passam · [ ] verificação de proibidos (topo) vazia
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: estado reativo (TASK-082).
- **Convenção de commit**: `feat(TASK-081): add typed tauri command layer and error messages`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-082: Application — estado do acesso, fluxo de login, regras de rota e validações
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 172 testes, vue-tsc, oxlint e build limpos; tabela destinoPara com 47 linhas; guard em router/index.ts recebe dependências (sem deps = sem guard, para os testes de rotas))
- **Depende de**: TASK-081
- **Objetivo**: Concentrar as decisões de navegação e validação em TypeScript puro e testável; ligar o guard do roteador.
- **Arquivos permitidos**: `src/acesso/application/fluxo-de-acesso.ts`, `estado-do-acesso.ts`, `fluxo-de-login.ts`, `validacoes.ts` e seus `.spec.ts` (novos); `src/router/index.ts` (editar: adicionar `beforeEach`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // fluxo-de-acesso.ts
  export type NomeDaRota = 'inicio'|'login'|'mfa-configurar'|'mfa-verificar'|'redefinir-senha'|'definir-senha-mestre'|'desbloqueio'|'dispositivos'|'seguranca'|'conectar'|'dispositivo-revogado';
  export interface ContextoDeNavegacao { estado: EstadoDoAcesso; mfaPendente: 'configurar' | 'verificar' | null; }
  export function rotaPadrao(e: EstadoDoAcesso): NomeDaRota;
  // revogado→'dispositivo-revogado'; sem_configuracao→'login'; bloqueado→ exigeLoginCompleto ? 'login' : 'desbloqueio'; offline_expirado→'conectar'; normal|somente_leitura→'inicio'
  export function destinoPara(rota: NomeDaRota, c: ContextoDeNavegacao): NomeDaRota | null;  // null = pode entrar; senão para onde redirecionar
  // regras na ordem: revogado → só 'dispositivo-revogado'; 'dispositivo-revogado' sem revogado → rotaPadrao;
  // 'login'|'redefinir-senha' → null; 'mfa-configurar' exige mfaPendente === 'configurar', 'mfa-verificar' exige mfaPendente !== null, senão 'login';
  // 'definir-senha-mestre' exige sem_configuracao && sessaoOnline, senão rotaPadrao; 'desbloqueio' exige bloqueado, senão rotaPadrao;
  // 'conectar' exige offline_expirado, senão rotaPadrao; 'inicio'|'dispositivos'|'seguranca' exigem normal|somente_leitura, senão rotaPadrao

  // estado-do-acesso.ts (singleton de módulo)
  export function useEstadoDoAcesso(): { estado: Readonly<Ref<EstadoDoAcesso | null>>; carregar(): Promise<EstadoDoAcesso>; definir(e: EstadoDoAcesso): void; iniciarEscuta(): Promise<void>; pararEscuta(): void; };

  // fluxo-de-login.ts (singleton, só memória)
  export function useFluxoDeLogin(): { desafio: Readonly<Ref<string | null>>; mfa: Readonly<Ref<'configurar'|'verificar'|null>>;
    aviso: Ref<string | null>; iniciar(r: RespostaIniciarLogin): void; avancarParaVerificacao(): void; limpar(): void; };

  // validacoes.ts
  export function ehEmailValido(v: string): boolean;                // mesma regex do backend: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ após trim
  export interface RegraDeSenha { chave: 'tamanho-minimo'|'tamanho-maximo'|'confere'; ok: boolean; texto: string; }
  export function regrasDaSenhaMestre(senha: string, confirmacao: string): RegraDeSenha[];  // 'Pelo menos 12 caracteres', 'No máximo 128 caracteres', 'As duas senhas conferem' (contar com [...senha].length)
  export function somenteDigitos(v: string, max = 6): string;
  export function ehCodigoTotp(v: string): boolean;                  // /^\d{6}$/
  export function ehCodigoDeRecuperacao(v: string): boolean;         // remove '-' e espaços, maiúsculas → /^[0-9A-Z]{16}$/
  ```
  Guard (`router/index.ts`): `router.beforeEach(async (to) => { const e = estado.value ?? await carregar(); const destino = destinoPara(to.name as NomeDaRota, { estado: e, mfaPendente: mfa.value }); return destino === null ? true : { name: destino }; })`.
- **Testes obrigatórios**: tabela de `destinoPara` com **todas** as combinações rota × situação (`it.each` de pelo menos 30 linhas, incluindo `exigeLoginCompleto`, `mfaPendente` nulo/configurar/verificar e `definir-senha-mestre` com `sessaoOnline` falso); `rotaPadrao` para as 6 situações; `useFluxoDeLogin` limpa o desafio; `useEstadoDoAcesso.iniciarEscuta` registra o listener uma única vez e `pararEscuta` remove; validações (e-mail, regras com emoji, dígitos, códigos `test-0000-0000-0001`).
- **Requisitos de segurança**: autorização real fica no Rust/servidor; o guard só evita telas sem sentido. Desafio nunca persistido.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test`
- **Fora de escopo**: telas.
- **Convenção de commit**: `feat(TASK-082): add access navigation rules, login flow state and validations`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-083: Componentes base acessíveis
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 232 testes, vue-tsc, oxlint e build limpos. Extra: CampoCodigo trata o evento de colar (o maxlength=6 do navegador cortaria '123 456' antes da limpeza); foco inicial adiado para depois do próximo tick)
- **Depende de**: TASK-080
- **Objetivo**: Componentes reutilizáveis com o visual do Figma e acessibilidade AA.
- **Arquivos permitidos** (novos, em `src/acesso/ui/`): `componentes/BaseBotao.vue`, `CampoTexto.vue`, `CampoSenha.vue`, `CampoCodigo.vue`, `AlertaBanner.vue`, `ModalDialogo.vue`, `NotificacaoToast.vue`, `AvatarIniciais.vue`, `composables/useToast.ts`, um `.spec.ts` por componente; `src/App.vue` (editar: incluir `<NotificacaoToast />`)
- **Arquivos proibidos**: todo o resto
- **Referência visual** (`page-login.md`): botão primário = linha 324 (trocar `bg-[#0f4c5c]` por `bg-brand-700`, `hover:bg-brand-800`, `active:bg-brand-900`); input = linhas 249–257 (ícone à esquerda, `rounded-xl`, foco `ring-teal-700/20 border-teal-700`); input em erro = linha 517; alerta de erro = linhas 227–235; modal = linhas 380–391; toast = linhas 477–484; label = linha 242.
- **Componentes e rotas**:
  | Componente | Props | Emits / slots | Comportamento |
  |---|---|---|---|
  | `BaseBotao` | `variante?: 'primario'\|'secundario'\|'fantasma'\|'perigo'` (padrão primario), `tipo?: 'button'\|'submit'`, `carregando?`, `desabilitado?`, `larguraTotal?`, `textoCarregando?` | slot padrão, `icone` | `<button>` nativo; `disabled` quando carregando/desabilitado; `aria-busy` quando carregando; mostra `PhCircleNotch` girando + `textoCarregando` |
  | `CampoTexto` | `id` (obrigatório), `rotulo`, `modelValue`, `tipo?: 'text'\|'email'`, `obrigatorio?`, `erro?: string\|null`, `dica?`, `autocomplete?`, `placeholder?`, `desabilitado?`, `maxlength?` | `update:modelValue`; slot `icone` | `<label :for="id">` + asterisco visual com `aria-hidden` e `required` no input; `aria-invalid` e `aria-describedby` (`${id}-erro`/`${id}-dica`) |
  | `CampoSenha` | igual ao `CampoTexto` sem `tipo`, + `autocomplete: 'current-password'\|'new-password'` | idem + slot `acao-rotulo` (link "Esqueceu a senha?" à direita do rótulo) | botão alternar visibilidade: `type="button"`, `aria-label` "Mostrar senha"/"Ocultar senha", `aria-pressed`, `aria-controls`; input `font-mono` |
  | `CampoCodigo` | `id`, `rotulo`, `modelValue`, `erro?`, `desabilitado?`, `autofoco?` | `update:modelValue`, `completo` (6 dígitos) | `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`, remove não dígitos ao digitar, texto grande `font-mono tracking-[0.5em] text-center` |
  | `AlertaBanner` | `variante: 'erro'\|'aviso'\|'sucesso'\|'info'`, `titulo` | slot padrão | `role="alert"` para erro/aviso, `role="status"` para os demais; cores: erro rose (Figma), aviso amber, sucesso emerald, info teal |
  | `ModalDialogo` | `aberto`, `titulo`, `descricao?` | `fechar`; slots padrão e `acoes` | `Teleport to="body"`; `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`; foco no primeiro elemento focável ao abrir; **trap** de Tab/Shift+Tab; `Esc` fecha; clique no fundo fecha; devolve o foco ao elemento que abriu; botão fechar com `aria-label="Fechar"` |
  | `NotificacaoToast` + `useToast` | — | `useToast(): { mostrar(texto, variante?: 'sucesso'\|'aviso'\|'erro', duracaoMs = 3500): void }` | região `aria-live="polite"` fixa no canto inferior direito; vários toasts empilhados; timers limpos ao desmontar |
  | `AvatarIniciais` | `nome`, `tamanho?: 'sm'\|'md'` | — | iniciais do primeiro e último nome; `aria-hidden="true"` (o nome aparece em texto ao lado) |
- **Estados obrigatórios**: botão normal/carregando/desabilitado; campos normal/erro/desabilitado/focado; alerta nas 4 variantes; modal aberto/fechado.
- **Responsividade**: componentes fluidos (`w-full`); modal `max-w-lg` com `p-4` externo.
- **Acessibilidade**: tudo acima; alvos clicáveis ≥ 24×24 px; nada de `div` clicável.
- **Testes obrigatórios** (Testing Library + `user-event`): botão carregando fica desabilitado e com `aria-busy`; `CampoTexto` associa label (`getByLabelText`) e expõe erro via `aria-describedby`; `CampoSenha` alterna `type` e `aria-pressed`; `CampoCodigo` descarta letras e emite `completo` com `'123456'`; `AlertaBanner` erro tem `role="alert"`; `ModalDialogo`: foco inicial, Tab no último volta ao primeiro, `Esc` emite `fechar`, foco devolvido ao gatilho; `useToast` some após a duração (`vi.useFakeTimers`).
- **Requisitos de segurança**: nenhum `v-html`; textos sempre por interpolação.
- **Restrições de dependência e performance**: só ícones de `@phosphor-icons/vue` importados nominalmente (tree-shaking).
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de proibidos vazia
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: layout e telas.
- **Convenção de commit**: `feat(TASK-083): add accessible base UI components`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-084: `AuthLayout` — split screen institucional do Figma
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 252 testes, vue-tsc, oxlint e build limpos. Descrição institucional sem a menção a WhatsApp (D-002). Screenshots 1024x700/1440x900 ficam para a captura geral da TASK-095)
- **Depende de**: TASK-083
- **Objetivo**: Reproduzir o layout do Figma (barra superior, cartão dividido 46%/54%, painel institucional à esquerda, slot à direita, rodapé) com as remoções de D-002.
- **Arquivos permitidos** (novos, em `src/acesso/ui/`): `layout/AuthLayout.vue`, `layout/PainelInstitucional.vue`, `layout/conteudo-institucional.ts`, `componentes/IndicadorConexao.vue` e `.spec.ts` para `AuthLayout` e `IndicadorConexao`
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `page-login.md` linhas 64–177 (header e lado esquerdo) e 183–184, 357–372 (lado direito e rodapé).
- **Componentes e rotas**:
  - `AuthLayout.vue`: slot padrão = conteúdo central do lado direito (equivalente às linhas 210–357, centralizado `max-w-md mx-auto my-auto`). Estrutura e classes **iguais** ao Figma, com estas mudanças **obrigatórias**:
    | Figma | Implementação |
    |---|---|
    | Header esquerda "Servidor Clínico Seguro (São Paulo - SP)" + "Transição Ativa…" | `<IndicadorConexao />` apenas |
    | Header direita "SSL 256-bit • HIPAA/LGPD Compliant" + "v2.4 Pro Clinic" | `PhShieldCheck` + "Conexão cifrada • LGPD" e `v{{ versao }}` (`__APP_VERSION__`) |
    | Card "Status Operacional de Hoje" (6 pacientes, WhatsApp Sync, Modo Híbrido, data fixa) | **remover** (dados falsos e informação antes do login) |
    | Foto remota do Dr. Lucas (`lh3.googleusercontent.com`) | `<AvatarIniciais :nome="PROFISSIONAL" />` |
    | Selo "Sessão Segura" | "Acesso protegido" |
    | Barra "Visualizar Estado" + "Otimizado para Consultório & Tablet" (linhas 186–207) | **remover** |
    | Rodapé "• Criptografia TLS 1.3", link "Política de Privacidade" (`href="#"`), "EVO v2.4.0" | "Acesso restrito a usuários autorizados" e `EVO v{{ versao }}`; sem link (pendência P-08) |
    | `text-slate-400` sobre branco | `text-slate-500` |
  - `conteudo-institucional.ts`: constantes `MARCA = 'EVO FISIOTERAPIA'`, `SELO = 'Clinical SaaS'`, `PROFISSIONAL = 'Dr. Lucas Damasceno'`, `REGISTRO_PROFISSIONAL = 'CREFITO 248.910-F'`, `ESPECIALIDADE = 'Especialista Coluna & Reabilitação'`, `TITULO = 'Gestão clínica inteligente para o tratamento da dor crônica e coluna.'`, `DESCRICAO` (texto da linha 122), `SITE = 'fisioterapiaevo.com.br'` (texto, não link). **Todos vindos do Figma e pendentes de confirmação com o cliente (P-08).**
  - `IndicadorConexao.vue`: `navigator.onLine` + eventos `online`/`offline` (removidos no `onUnmounted`); online → ponto `bg-emerald-500 animate-pulse` + "Online"; offline → ponto `bg-amber-500` + "Offline — modo local"; `role="status"`.
- **Estados obrigatórios**: online/offline no indicador.
- **Responsividade**: ≥ 1024 px: split lado a lado (`lg:flex-row`, `lg:w-[46%]` / `lg:w-[54%]`); o card nunca ultrapassa `max-w-6xl`; em 1024×700 o conteúdo cabe sem rolagem horizontal (rolagem vertical permitida).
- **Acessibilidade**: `<header>`, `<main>`, `<footer>` semânticos; um único `<h1>` (o título institucional); a tela filha usa `<h2>`; elementos decorativos com `aria-hidden="true"`; `prefers-reduced-motion` desliga `animate-pulse`/`animate-ping` (`motion-safe:`).
- **Testes obrigatórios**: renderiza slot; mostra a versão; **não** contém os textos removidos (`Status Operacional`, `WhatsApp`, `HIPAA`, `Visualizar Estado`, `Tablet`); nenhuma `<img>` com `src` http; indicador alterna ao disparar `window.dispatchEvent(new Event('offline'))` e remove listeners ao desmontar (espie `removeEventListener`).
- **Requisitos de segurança**: nenhum recurso remoto (CSP); nada de dado clínico antes do login.
- **Restrições de dependência e performance**: sem imagens; ícones Phosphor nominais.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshot do layout vazio em 1024×700 e 1440×900 anexado ao relatório (`pnpm dev` + navegador)
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: formulário de login.
- **Convenção de commit**: `feat(TASK-084): add institutional auth layout from figma`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-085: `LoginTela` — e-mail e senha (UC-02)
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 269 testes, vue-tsc, oxlint e build limpos. Desvio: durante o envio os campos ficam desabilitados (CampoTexto não tem readonly); a tela descarta o desafio anterior ao abrir. Screenshots na captura geral da TASK-095)
- **Depende de**: TASK-082, TASK-084
- **Objetivo**: Primeiro passo do login fiel ao Figma, com erros genéricos (RN-12) e estados de bloqueio/limite.
- **Arquivos permitidos**: `src/acesso/ui/telas/LoginTela.vue` (substituir placeholder), `src/acesso/ui/telas/LoginTela.spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `page-login.md` linhas 210–302 e 319–329 (cabeçalho "Portal de Acesso Restrito", "Acesse sua conta", banner de erro, campos, CTA "Entrar no Sistema"). **Remover**: valores pré-preenchidos (`value=`), checkbox "Manter conectado" (304–317), separador "Ou acesse com" e todo o bloco WhatsApp (331–353). Rótulo do primeiro campo: **"E-mail"** (não "E-mail ou Usuário Profissional"). Placeholder do e-mail: `seu@email.com.br`.
- **Componentes e rotas**: rota `login`. Usa `AuthLayout`, `CampoTexto` (`id="input-email"`, `tipo="email"`, `autocomplete="username"`, ícone `PhEnvelopeSimple`), `CampoSenha` (`id="input-password"`, `autocomplete="current-password"`, ícone `PhLockKey`, slot `acao-rotulo` com botão "Esqueceu a senha?" que abre `RecuperarSenhaModal` — TASK-086; até lá, o botão só emite um evento local), `BaseBotao` (`tipo="submit"`, texto "Entrar no Sistema", ícone `PhArrowRight`, `textoCarregando="Autenticando..."`), `AlertaBanner`.
- **Comportamento**:
  1. Ao montar: se `estado.exigeLoginCompleto`, banner `info` "Por segurança, entre com e-mail, senha e código para liberar o desbloqueio local."; se `fluxoDeLogin.aviso` existir, banner `erro` com ele e limpar o aviso.
  2. Submit: e-mail vazio/inválido → erro no campo "Informe um e-mail válido."; senha vazia → "Informe a senha."; não chama o Rust.
  3. Válido: `iniciarLogin(email.trim(), senha)`; sucesso → `fluxoDeLogin.iniciar(resp)` → `router.push({ name: resp.mfa === 'configurar' ? 'mfa-configurar' : 'mfa-verificar' })`.
  4. Erro → `AlertaBanner` com `mensagemAmigavel` (variante `aviso` para `CONTA_BLOQUEADA`/`MUITAS_REQUISICOES`, `erro` para os demais); para `CREDENCIAIS_INVALIDAS` aplicar o estilo de erro do Figma no campo senha (linha 517) com dica "Verifique a senha digitada." (texto neutro, sem dizer que o usuário existe); **limpar a senha** e focar o campo senha.
  5. Para `SEM_CONEXAO` com `estado.situacao === 'bloqueado'` e sem `exigeLoginCompleto`: banner com botão "Usar desbloqueio local" → `desbloqueio`.
- **Estados obrigatórios**: padrão; validação local; carregando (botão desabilitado, campos `readonly`); erro de credenciais; conta bloqueada (com horário); muitas requisições; sem conexão; aviso de login completo exigido.
- **Responsividade**: 1024×700, 1280×800, 1440×900 sem rolagem horizontal; formulário `max-w-md`.
- **Acessibilidade**: `<form novalidate>` com `<h2>`; banners com `role="alert"`; foco vai para o primeiro campo inválido; Enter envia; ordem de tabulação: e-mail → "Esqueceu a senha?" → senha → mostrar senha → Entrar.
- **Testes obrigatórios**: campos vazios não chamam `iniciarLogin`; sucesso navega para `mfa-verificar`/`mfa-configurar` conforme `mfa`; `CREDENCIAIS_INVALIDAS` mostra o banner, limpa a senha e mantém o e-mail; `CONTA_BLOQUEADA` mostra `09:30`; botão desabilitado durante a chamada (promessa pendente); nenhum campo vem pré-preenchido; não existe texto "WhatsApp" nem "Manter conectado".
- **Requisitos de segurança**: senha nunca logada/persistida; `autocomplete` correto (gerenciador de senhas); mensagem genérica.
- **Restrições de dependência e performance**: nenhuma dependência nova.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots nos 3 breakpoints (padrão e erro) no relatório
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: modal de recuperação (TASK-086).
- **Convenção de commit**: `feat(TASK-085): add login screen`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-086: Recuperação de senha — modal "Esqueci a senha" e tela "Redefinir senha" (UC-11, UC-12)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-085
- **Objetivo**: Pedir o e-mail de redefinição (sempre "aceito", RN-12) e concluir com token + nova senha + código MFA (RN-33, D-007).
- **Arquivos permitidos**: `src/acesso/ui/telas/RecuperarSenhaModal.vue` (novo), `src/acesso/ui/telas/RedefinirSenhaTela.vue` (substituir placeholder), `src/acesso/ui/telas/LoginTela.vue` (editar: abrir o modal), e `.spec.ts` dos dois novos
- **Arquivos proibidos**: todo o resto
- **Referência visual**: modal = `page-login.md` linhas 380–474, **somente** com a opção "E-mail Cadastrado" (estilo de opção selecionada da linha 407) — sem WhatsApp. `RedefinirSenhaTela` dentro do `AuthLayout`, mesmo cabeçalho da tela de login (badge `PhKeyReturn` "Recuperação de acesso", `<h2>` "Redefinir senha").
- **Componentes e rotas**:
  - `RecuperarSenhaModal` (props `aberto`, `emailInicial`; emit `fechar`): título "Recuperação de Acesso", descrição "Enviaremos um código de redefinição para o seu e-mail."; `CampoTexto` e-mail (pré-preenchido com o e-mail digitado no login); botões "Cancelar" e "Enviar código de redefinição" (`PhPaperPlaneTilt`). Sucesso (sempre que o comando resolver) → `AlertaBanner` sucesso "Se o e-mail estiver cadastrado, você receberá um código em instantes." + botão "Já tenho o código" → `redefinir-senha`.
  - `RedefinirSenhaTela`: campos "Código de redefinição" (texto, cole do e-mail; `font-mono`; 43 caracteres; `autocomplete="off"`), "Nova senha" + "Confirme a nova senha" (`CampoSenha`, `new-password`, regras de 12+ caracteres visíveis), e o segundo fator: `CampoCodigo` "Código do autenticador" com alternância "Usar código de recuperação". Envio → `concluirRedefinicao(token.trim(), novaSenha, codigo)` → toast "Senha redefinida. Entre com a nova senha." → `login`.
- **Estados obrigatórios**: modal: padrão, enviando, enviado, sem conexão; tela: padrão, validação local (senhas diferentes, token vazio, código incompleto), enviando, `TOKEN_DE_REDEFINICAO_INVALIDO`, `CODIGO_MFA_INVALIDO`, `SENHA_FRACA`, sucesso.
- **Responsividade**: 3 breakpoints; modal `max-w-lg`.
- **Acessibilidade**: modal conforme `ModalDialogo`; mensagens de erro ligadas aos campos; alternância TOTP/recuperação é `button` com `aria-pressed`.
- **Testes obrigatórios**: modal chama `solicitarRedefinicao` com o e-mail e mostra a mesma mensagem para qualquer resposta; erro `SEM_CONEXAO` mostra banner de conexão; tela: senhas diferentes bloqueiam o envio; envia `{ tipo: 'totp', valor }` ou `{ tipo: 'recuperacao', valor }` conforme a alternância; sucesso navega para `login`; `TOKEN_DE_REDEFINICAO_INVALIDO` mostra a mensagem da tabela.
- **Requisitos de segurança**: RN-12 (mensagem idêntica); token só em memória do componente.
- **Restrições de dependência e performance**: nenhuma nova.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots do modal e da tela
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: WhatsApp (D-002).
- **Convenção de commit**: `feat(TASK-086): add password recovery modal and reset screen`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-087: `MfaConfigurarTela` — QR code e códigos de recuperação (UC-03, UC-04)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-085
- **Objetivo**: Configurar o TOTP no primeiro login (RN-07) e mostrar os 10 códigos de recuperação uma única vez (RN-08).
- **Arquivos permitidos**: `src/acesso/ui/telas/MfaConfigurarTela.vue` (substituir placeholder), `src/acesso/ui/componentes/QrCodeAutenticador.vue`, `src/acesso/ui/componentes/ListaDeCodigosDeRecuperacao.vue` (novos) e `.spec.ts` dos três
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AuthLayout` + cabeçalho no padrão do login (badge `PhShieldCheck` "Verificação em duas etapas", `<h2>`). Etapas com indicador "Etapa 1 de 2" / "Etapa 2 de 2" em `text-xs font-semibold text-slate-500 uppercase`.
- **Componentes e rotas**:
  - `QrCodeAutenticador` (props `urlOtpauth`, `segredo`): gera o QR **localmente** com `QRCode.toDataURL(urlOtpauth, { errorCorrectionLevel: 'M', margin: 1, width: 192 })` e mostra `<img :src="dataUrl" alt="QR code para adicionar a conta ao aplicativo autenticador" width="192" height="192">`; abaixo, "Não consegue escanear? Digite esta chave:" + segredo em grupos de 4 (`font-mono`) + botão "Copiar chave" (`navigator.clipboard.writeText`, toast "Chave copiada").
  - `ListaDeCodigosDeRecuperacao` (prop `codigos: string[]`): grade 2 colunas `font-mono`, botão "Copiar todos" (um por linha), `AlertaBanner` aviso "Estes códigos aparecem só agora. Cada um funciona uma vez. Guarde-os fora deste computador."
  - Tela, etapa 1 "Configure o aplicativo autenticador": ao montar chama `gerarSegredoMfa(desafio)`; instruções (1. Abra um app autenticador — Google Authenticator, Microsoft Authenticator ou 1Password; 2. Escaneie o QR code; 3. Digite o código de 6 dígitos); `CampoCodigo` + botão "Confirmar" → `confirmarMfa(desafio, codigo)` → etapa 2.
  - Etapa 2 "Guarde seus códigos de recuperação": `ListaDeCodigosDeRecuperacao` + checkbox obrigatório "Guardei os códigos em local seguro" + botão "Continuar" (desabilitado até marcar) → `fluxoDeLogin.avancarParaVerificacao()`, apaga os códigos da memória do componente e navega para `mfa-verificar` com aviso "Digite o código **atual** do aplicativo (ele muda a cada 30 segundos)."
- **Estados obrigatórios**: carregando segredo (esqueleto do QR), erro ao gerar (`DESAFIO_INVALIDO` → `fluxoDeLogin.aviso` + `login`), código inválido (mensagem no campo; `CODIGO_MFA_INVALIDO` aqui **não** consome o desafio — permite tentar de novo), enviando, etapa 2.
- **Responsividade**: 3 breakpoints; QR 192 px fixo; códigos em 2 colunas.
- **Acessibilidade**: `alt` descritivo no QR; segredo também em texto; mudança de etapa move o foco para o novo `<h2>` (`tabindex="-1"`); checkbox com `<label>`.
- **Testes obrigatórios**: chama `gerarSegredoMfa` com o desafio; `<img>` com `src` começando por `data:image/png;base64,`; nenhum `src` http; código correto → mostra 10 códigos; "Continuar" desabilitado até marcar; ao continuar navega para `mfa-verificar` e os códigos não estão mais no DOM; `DESAFIO_INVALIDO` volta ao login; "Copiar todos" chama `clipboard.writeText` com 10 linhas.
- **Requisitos de segurança**: **o segredo TOTP nunca é enviado a serviço externo** (QR gerado localmente); códigos não persistidos.
- **Restrições de dependência e performance**: `qrcode` importado dinamicamente (`await import('qrcode')`) só nesta tela.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots das 2 etapas
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: reconfiguração do MFA (TASK-094 reutiliza os componentes).
- **Convenção de commit**: `feat(TASK-087): add MFA setup screen with local QR code`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-088: `MfaVerificarTela` — código do autenticador ou de recuperação (UC-05)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-087
- **Objetivo**: Concluir o login (RN-11) e direcionar para o próximo passo (senha mestre, desbloqueio ou início).
- **Arquivos permitidos**: `src/acesso/ui/telas/MfaVerificarTela.vue` (substituir placeholder), `.spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AuthLayout`; badge `PhDeviceMobile` "Verificação em duas etapas"; `<h2>` "Digite o código do autenticador"; texto "Abra o aplicativo autenticador e digite o código de 6 dígitos."
- **Componentes e rotas**: `CampoCodigo` (autofoco; ao `completo`, envia automaticamente); botão de texto "Usar código de recuperação" alterna para `CampoTexto` "Código de recuperação" (`font-mono`, placeholder `XXXX-XXXX-XXXX-XXXX`, `autocomplete="off"`); botão "Entrar"; link "Voltar" → `login` (limpa o fluxo).
- **Comportamento**: `concluirLogin(desafio, codigo)` → `fluxoDeLogin.limpar()` → se `usouCodigoDeRecuperacao`, toast aviso "Você usou um código de recuperação. Restam {codigosRestantes}. Gere novos em Segurança."; navegar por `proximoPasso`: `configurar_desbloqueio` → `definir-senha-mestre`; `desbloquear` → `desbloqueio`; `pronto` → `inicio`. Erros: `CODIGO_MFA_INVALIDO`, `DESAFIO_INVALIDO`, `MFA_OBRIGATORIO` e `LIMITE_DE_DISPOSITIVOS_ATINGIDO` → `fluxoDeLogin.aviso = mensagemAmigavel(...).texto`, limpar fluxo e voltar a `login` (o servidor consumiu o desafio); `DISPOSITIVO_REVOGADO` → `dispositivo-revogado`; `SEM_CONEXAO` → banner na própria tela, mantém o desafio.
- **Estados obrigatórios**: padrão TOTP; modo recuperação; enviando; cada erro acima; aviso vindo da configuração ("código atual").
- **Responsividade**: 3 breakpoints.
- **Acessibilidade**: alternância com `aria-pressed`; foco no campo ativo após alternar; banners `role="alert"`.
- **Testes obrigatórios**: 6 dígitos disparam `concluirLogin` com `{ tipo: 'totp', valor: '123456' }`; modo recuperação envia `{ tipo: 'recuperacao', valor }` e rejeita formato inválido localmente; cada `proximoPasso` navega para a rota certa; `CODIGO_MFA_INVALIDO` volta ao login com aviso; toast de código de recuperação com o número restante; sem desafio a rota redireciona para `login` (guard).
- **Requisitos de segurança**: o resumo do login não contém tokens (D-005); desafio limpo após uso.
- **Restrições de dependência e performance**: nenhuma.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots TOTP e recuperação
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: senha mestre.
- **Convenção de commit**: `feat(TASK-088): add MFA verification screen`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-089: `DefinirSenhaMestreTela` (UL-01)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-088
- **Objetivo**: Definir no primeiro acesso a senha mestre que abre os dados deste computador sem internet (RN-24).
- **Arquivos permitidos**: `src/acesso/ui/telas/DefinirSenhaMestreTela.vue` (substituir placeholder), `.spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AuthLayout`; badge `PhLockKey` "Proteção deste computador"; `<h2>` "Crie sua senha mestre"; parágrafo: "Ela protege os dados guardados neste computador e funciona sem internet. Não é enviada ao servidor e não pode ser recuperada: se esquecê-la, será preciso baixar os dados novamente." Dica: "Use uma senha diferente da senha de login."
- **Componentes e rotas**: `CampoSenha` "Senha mestre" e "Confirme a senha mestre" (`new-password`); lista de regras de `regrasDaSenhaMestre` com ícone `PhCheckCircle` (ok, emerald) / `PhCircle` (pendente), em `aria-live="polite"`; botão "Proteger dados" (desabilitado até todas as regras ok; `textoCarregando="Protegendo seus dados..."` — a calibração do Argon2id pode levar alguns segundos).
- **Comportamento**: `configurarDesbloqueio(senha)` → estado `normal` → `inicio` + toast "Dados protegidos neste computador.". Erros: `SENHA_MESTRE_FRACA` (campo), `JA_CONFIGURADO` (→ `desbloqueio`), `EXIGE_LOGIN_COMPLETO` (→ `login`).
- **Estados obrigatórios**: padrão, regras parcialmente atendidas, senhas diferentes, enviando (longo), erro, sucesso.
- **Responsividade**: 3 breakpoints.
- **Acessibilidade**: regras anunciadas; botão desabilitado explica o motivo via `aria-describedby` apontando para a lista.
- **Testes obrigatórios**: botão desabilitado com 11 caracteres e com senhas diferentes; habilitado com 12 iguais; chama `configurarDesbloqueio` com a senha; sucesso navega para `inicio`; os campos são limpos após o envio (sucesso ou erro).
- **Requisitos de segurança**: senha mestre só vai ao comando Rust; nunca armazenada no JS além do `ref` do campo, que é zerado após o envio.
- **Restrições de dependência e performance**: sem medidor de força de terceiros.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshot
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: biometria.
- **Convenção de commit**: `feat(TASK-089): add master password setup screen`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-090: `DesbloqueioTela` e "Esqueci a senha mestre" (UL-02, UL-03, UL-10)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-089
- **Objetivo**: Abrir o app offline com senha mestre (ou biometria, se habilitada), respeitando o atraso persistido (RN-27), e oferecer a redefinição local com aviso de perda de eventos (RN-35).
- **Arquivos permitidos**: `src/acesso/ui/telas/DesbloqueioTela.vue` (substituir placeholder), `src/acesso/ui/telas/RedefinirDesbloqueioModal.vue` (novo), `.spec.ts` dos dois
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AuthLayout`; badge `PhLock` "Aplicativo bloqueado"; `<h2>` "Desbloqueie para continuar"; texto "Digite a senha mestre deste computador."
- **Componentes e rotas**:
  - Botão "Desbloquear com biometria" (`PhFingerprint`, variante secundária) **apenas** se `biometriaDisponivel && biometriaHabilitada`; erro/cancelamento → foco no campo de senha (RN-25).
  - `CampoSenha` "Senha mestre" (`current-password`) + botão "Desbloquear".
  - `segundosAteNovaTentativa > 0` (do estado ou de `AGUARDE_ANTES_DE_TENTAR.segundosRestantes`) → botão desabilitado com contagem regressiva "Tente novamente em {n} s" (`setInterval` de 1 s, limpo ao desmontar e ao chegar a 0).
  - `EXIGE_LOGIN_COMPLETO` (ou `estado.exigeLoginCompleto`) → esconde o formulário e mostra `AlertaBanner` aviso + botão "Entrar com e-mail e senha" → `login`.
  - Link-botão "Esqueci a senha mestre" → `RedefinirDesbloqueioModal`.
  - `RedefinirDesbloqueioModal`: etapa A (sem sessão online): explica "Para redefinir, entre com e-mail, senha e código. A cópia local será descartada e baixada novamente." + botão "Entrar para redefinir" → `fluxoDeLogin.aviso = 'Após entrar, confirme a redefinição do desbloqueio local.'` e `login`. Etapa B (com `sessaoOnline`): chama `previaRedefinicaoLocal()`; se `eventosPendentes > 0`, `AlertaBanner` erro "Há {n} registros ainda não enviados ao servidor. Eles serão perdidos."; campo "Digite DESCARTAR para confirmar"; botão perigo "Descartar e redefinir" habilitado só com o texto exato → `redefinirDesbloqueioLocal('DESCARTAR')` → `definir-senha-mestre`.
- **Estados obrigatórios**: padrão; biometria disponível/indisponível; senha incorreta; contagem regressiva; exige login completo; modal etapas A e B; com e sem eventos pendentes; enviando.
- **Responsividade**: 3 breakpoints.
- **Acessibilidade**: contagem anunciada com `aria-live="polite"` a cada 10 s (não a cada segundo); foco no campo de senha ao montar.
- **Testes obrigatórios** (fake timers): senha certa → `desbloquearComSenha` e navegação para `inicio`; `SENHA_MESTRE_INCORRETA` → mensagem no campo e senha limpa; `AGUARDE_ANTES_DE_TENTAR { segundosRestantes: 5 }` → botão desabilitado e reabilitado após 5 s; `EXIGE_LOGIN_COMPLETO` esconde o formulário; botão de biometria ausente quando não habilitada; modal etapa B exige "DESCARTAR" exato e mostra o número de eventos pendentes; intervalo limpo ao desmontar.
- **Requisitos de segurança**: RN-25, RN-27, RN-28 (nada é apagado por falha; só pela ação confirmada).
- **Restrições de dependência e performance**: nenhuma.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots (padrão, contagem, exige login, modal B)
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: casca do app (TASK-091).
- **Convenção de commit**: `feat(TASK-090): add unlock screen and local unlock reset`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-091: Casca do app, sinais de atividade, sessão online e avisos de modo offline (RN-21, RN-26, DT-11)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-090
- **Objetivo**: Layout das telas autenticadas, envio de atividade ao Rust, reação ao evento `acesso://estado-alterado`, renovação da sessão quando houver internet e o aviso fixo de **modo somente leitura** (SPEC §7.2).
- **Arquivos permitidos** (em `src/acesso/ui/`): `layout/AppShell.vue`, `telas/InicioTela.vue` (substituir placeholder), `telas/ConectarTela.vue` (substituir placeholder), `componentes/BannerSomenteLeitura.vue`, `componentes/BannerSessao.vue`, `composables/useSinalDeAtividade.ts`, `composables/useEstadoDoAcesso.ts`, `composables/useSessaoOnline.ts`, `.spec.ts` de cada; `src/App.vue` (editar)
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AppShell` com barra superior branca no estilo do header do Figma (linha 67: `bg-white/80 backdrop-blur-md border-b`), à esquerda a marca (ícone `PhActivity` em `bg-brand-700/10` + "EVO Clínica"), navegação (`<nav aria-label="Principal">` com `RouterLink` "Início", "Dispositivos", "Segurança"; ativo `text-brand-700 font-semibold`), à direita `IndicadorConexao`, `AvatarIniciais` + nome e botão "Bloquear" (`PhLock`, variante fantasma). Conteúdo em `max-w-6xl mx-auto p-6`.
- **Componentes e rotas**:
  - `InicioTela` (`inicio`): `<h1>` "Olá, {primeiro nome}" + cartão "Os módulos clínicos aparecerão aqui." (placeholder até outros contextos existirem).
  - `ConectarTela` (`conectar`, usa `AuthLayout`): `<h2>` "Conecte-se para continuar"; texto "Este computador está há mais de {limite} dias sem conexão ou o relógio foi alterado. Por segurança, os dados ficam indisponíveis até a próxima conexão."; botão "Tentar agora" → `renovarSessao()`.
  - `BannerSomenteLeitura` (fixo no topo do `AppShell` quando `somente_leitura`, `role="status"`, amber): "Modo somente leitura: este computador está sem sincronizar há muito tempo ou o relógio foi alterado. Conecte-se à internet para voltar a editar." + botão "Tentar conectar" → `renovarSessao()`.
  - `BannerSessao`: quando a última renovação falhou com `SESSAO_EXPIRADA` → "Sua sessão no servidor expirou. Entre novamente para sincronizar." + link "Entrar" → `login`; quando `SEM_CONEXAO` → discreto "Sem conexão. Trabalhando no modo local.".
  - `useEstadoDoAcesso` (montado no `App.vue`): `carregar()` no início e `iniciarEscuta()`; a cada estado recebido, se a rota atual deixou de ser permitida (`destinoPara`), `router.replace({ name: destino })`.
  - `useSinalDeAtividade` (ativo só com `normal`/`somente_leitura`): ouve `pointerdown`, `keydown`, `wheel`, `touchstart` em `window` (`{ passive: true }`) e chama `sinalDeAtividade()` no máximo 1 vez a cada 10 s; remove os listeners ao desmontar ou ao bloquear.
  - `useSessaoOnline`: ao desbloquear, a cada 10 min e no evento `online` chama `renovarSessao()`; guarda `ultimoErro: Ref<'SESSAO_EXPIRADA' | 'SEM_CONEXAO' | null>`; `DISPOSITIVO_REVOGADO` não precisa de tratamento aqui (o Rust emite o estado `revogado`).
  - Botão "Bloquear" → `bloquear()` (o estado emitido leva à tela de desbloqueio).
- **Estados obrigatórios**: normal; somente leitura (banner); sessão expirada; sem conexão; offline expirado (tela `conectar`); bloqueio automático vindo do Rust (navega para `desbloqueio` sem ação do usuário).
- **Responsividade**: barra superior não quebra em 1024 px (nome do usuário trunca com `truncate max-w-[12rem]`).
- **Acessibilidade**: `<nav>` com `aria-current="page"` no link ativo; banners `role="status"`; botão "Bloquear" com texto visível.
- **Testes obrigatórios** (fake timers, `vi.mock` dos comandos): `useSinalDeAtividade` chama no máximo 1 vez em 10 s com 50 eventos e para após desmontar; `useEstadoDoAcesso` navega para `desbloqueio` ao receber estado `bloqueado` e para `dispositivo-revogado` ao receber `revogado`; `useSessaoOnline` chama `renovarSessao` ao montar, após 10 min e no evento `online`, e limpa o intervalo; `BannerSomenteLeitura` aparece só em `somente_leitura`; botão "Bloquear" chama `bloquear`.
- **Requisitos de segurança**: o timer de inatividade **não** está no JS (só sinais, DT-11); nenhum dado sensível no DOM fora das telas autenticadas.
- **Restrições de dependência e performance**: listeners `passive`; *throttle* de 10 s.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots (`inicio` normal e com banner de somente leitura) nos 3 breakpoints
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: telas de dispositivos/segurança.
- **Convenção de commit**: `feat(TASK-091): add app shell, activity signals and offline banners`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-092: Reautenticação para ações sensíveis (UL-07, RN-29)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-091
- **Objetivo**: Um modal único, chamado por código, que pede a senha mestre (ou biometria) e abre a janela de 5 min no Rust.
- **Arquivos permitidos**: `src/acesso/ui/componentes/ReautenticacaoModal.vue`, `src/acesso/ui/composables/useReautenticacao.ts` (novos) e `.spec.ts` dos dois; `src/acesso/ui/layout/AppShell.vue` (editar: montar o modal uma vez)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export function useReautenticacao(): {
    exigir(): Promise<boolean>;                                   // abre o modal; true após reautenticar; false se cancelar
    comReautenticacao<T>(acao: () => Promise<T>): Promise<T>;     // executa; se falhar com REAUTENTICACAO_NECESSARIA, chama exigir() e repete UMA vez; cancelou → lança o erro original
  };
  ```
  Modal: título "Confirme sua identidade", texto "Por segurança, digite a senha mestre deste computador.", `CampoSenha` (`current-password`), botão biometria se habilitada, "Cancelar" e "Confirmar". `reautenticar('senha', senha)`; `SENHA_MESTRE_INCORRETA` no campo; `AGUARDE_ANTES_DE_TENTAR` com contagem; `EXIGE_LOGIN_COMPLETO` → fecha com `false` (o Rust bloqueia o app e emite o estado).
- **Componentes e rotas**: estado do modal num singleton de módulo dentro de `useReautenticacao.ts`.
- **Estados obrigatórios**: aberto, enviando, senha incorreta, aguarde, sucesso (fecha), cancelado.
- **Responsividade**: `ModalDialogo` padrão.
- **Acessibilidade**: herda do `ModalDialogo`; foco no campo de senha.
- **Testes obrigatórios**: `comReautenticacao` repete a ação uma vez após reautenticar; não repete se cancelar; não abre modal se a ação já der certo; erro diferente de `REAUTENTICACAO_NECESSARIA` é propagado sem abrir o modal; senha limpa após fechar.
- **Requisitos de segurança**: RN-29; senha descartada da memória do componente ao fechar.
- **Restrições de dependência e performance**: nenhuma.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: telas que usam o modal.
- **Convenção de commit**: `feat(TASK-092): add local re-authentication modal`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-093: `DispositivosTela` — listar e revogar (UC-08, UC-09)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-092
- **Objetivo**: Mostrar os computadores da conta e revogar um deles com reautenticação local + código MFA (RN-22, RN-29, D-008).
- **Arquivos permitidos**: `src/acesso/ui/telas/DispositivosTela.vue` (substituir placeholder), `src/acesso/ui/telas/RevogarDispositivoModal.vue` (novo), `.spec.ts` dos dois
- **Arquivos proibidos**: todo o resto
- **Referência visual**: dentro do `AppShell`; `<h1>` "Dispositivos"; texto "Computadores com acesso à sua conta (máximo de 3 ativos)."; lista em cartões brancos `rounded-2xl border border-slate-200` com: ícone `PhAppleLogo`/`PhWindowsLogo`, apelido (negrito), selo "Este computador" (teal) quando `atual`, "Registrado em {data}", "Última conexão {data}", selo de situação ("Ativo" emerald / "Revogado em {data}" slate), botão "Revogar" (variante perigo) só para ativos.
- **Componentes e rotas**:
  - Ao montar: `listarDispositivos()`.
  - `RevogarDispositivoModal` (props `dispositivo`): título "Revogar {apelido}"; se `atual`, `AlertaBanner` aviso "Este computador será bloqueado imediatamente."; `CampoTexto` "Motivo" (3–200, obrigatório, ex.: "Computador perdido"); `CampoCodigo` "Código do autenticador"; botão perigo "Revogar acesso" → `comReautenticacao(() => revogarDispositivo(id, motivo, codigo))` → toast "Dispositivo revogado." → recarregar a lista.
- **Estados obrigatórios**: carregando (esqueleto com 2 cartões), lista, vazia ("Nenhum dispositivo encontrado."), erro com botão "Tentar novamente", sem conexão ("Conecte-se à internet para ver os dispositivos."), modal: validação, enviando, `REAUTENTICACAO_NECESSARIA` vindo do servidor (código MFA errado → "Código do autenticador inválido."), `DISPOSITIVO_NAO_ENCONTRADO`.
- **Responsividade**: cartões em coluna única até 1280 px; 2 colunas a partir de 1280 px (`xl:grid-cols-2`).
- **Acessibilidade**: lista como `<ul>`/`<li>`; botão "Revogar" com `aria-label="Revogar {apelido}"`; datas também em `<time datetime>`.
- **Testes obrigatórios**: renderiza itens com selos corretos; botão "Revogar" ausente para revogados; modal valida motivo < 3; envia `revogarDispositivo` com id/motivo/código; `REAUTENTICACAO_NECESSARIA` local abre o modal de reautenticação (mock de `useReautenticacao`); `SEM_CONEXAO` mostra o estado offline; sucesso recarrega a lista.
- **Requisitos de segurança**: RN-29 + MFA no servidor; id vem da lista (validado em `api-identidade.ts`).
- **Restrições de dependência e performance**: nenhuma.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots (lista e modal)
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: renomear dispositivo.
- **Convenção de commit**: `feat(TASK-093): add devices screen with revocation`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-094: `SegurancaTela` — senha, códigos, autenticador, senha mestre e biometria (UC-10, UC-13, UC-16, UL-05, UL-06)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-093, TASK-087
- **Objetivo**: Reunir as ações de segurança da conta e do computador, todas com reautenticação local (RN-29).
- **Arquivos permitidos** (em `src/acesso/ui/telas/`): `SegurancaTela.vue` (substituir placeholder), `TrocarSenhaModal.vue`, `RegenerarCodigosModal.vue`, `ReconfigurarMfaModal.vue`, `AlterarSenhaMestreModal.vue` (novos) e `.spec.ts` de cada
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AppShell`; `<h1>` "Segurança"; 5 cartões empilhados (mesmo estilo dos dispositivos), cada um com título, descrição e botão à direita:
  | Cartão | Descrição | Botão → ação |
  |---|---|---|
  | Senha de login | "Usada para entrar no servidor. Trocar desconecta os outros computadores." | "Trocar senha" → `TrocarSenhaModal`: senha atual, nova, confirmação → `comReautenticacao(() => trocarSenha(...))` → toast "Senha alterada. Os outros computadores foram desconectados." |
  | Códigos de recuperação | "Use quando perder o celular com o autenticador." | "Gerar novos códigos" → `RegenerarCodigosModal`: `CampoCodigo` → `regenerarCodigos(codigo)` → `ListaDeCodigosDeRecuperacao` + checkbox "Guardei os códigos" para fechar |
  | Aplicativo autenticador | "Troque o celular ou o aplicativo autenticador." | "Reconfigurar" → `ReconfigurarMfaModal`: etapa 1 senha de login → `iniciarReconfiguracaoMfa`; etapa 2 `QrCodeAutenticador` + `CampoCodigo` → `confirmarReconfiguracaoMfa`; etapa 3 `ListaDeCodigosDeRecuperacao` |
  | Senha mestre deste computador | "Abre os dados deste computador sem internet." | "Alterar senha mestre" → `AlterarSenhaMestreModal`: atual, nova, confirmação (regras de `regrasDaSenhaMestre`) → `alterarSenhaMestre(atual, nova)` → toast "Senha mestre alterada." |
  | Biometria | `biometriaDisponivel` ? "Desbloqueie com Touch ID ou Windows Hello. A senha mestre continua funcionando." : "Indisponível neste computador." | interruptor (`role="switch"`, `aria-checked`) → ativar: pede senha mestre → `ativarBiometria(senha)`; desativar → `desativarBiometria()`; desabilitado quando indisponível |
- **Estados obrigatórios**: cada modal com validação, enviando, erro (`SENHA_FRACA`, `CREDENCIAIS_INVALIDAS` → "Senha atual incorreta.", `REAUTENTICACAO_NECESSARIA` do servidor → "Senha/código incorreto.", `CODIGO_MFA_INVALIDO`, `SENHA_MESTRE_INCORRETA`, `SEM_CONEXAO`), sucesso; biometria indisponível/desativada/ativada.
- **Responsividade**: cartões em coluna única; modais `max-w-lg`.
- **Acessibilidade**: interruptor com `role="switch"` e rótulo; cada modal com `<h2>` próprio; listas de códigos copiáveis.
- **Testes obrigatórios**: cada modal chama a função correta com os argumentos certos; senhas diferentes bloqueiam o envio; `comReautenticacao` envolve as ações de servidor; reconfigurar MFA passa pelas 3 etapas; interruptor de biometria desabilitado quando indisponível; códigos somem do DOM ao fechar o modal.
- **Requisitos de segurança**: RN-16, RN-29, D-008, D-010; nenhum código/segredo persiste após fechar.
- **Restrições de dependência e performance**: `qrcode` continua com import dinâmico.
- **Critérios de aceite**: [ ] testes passam · [ ] screenshots da tela e de cada modal
- **Comandos de verificação**: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`
- **Fora de escopo**: desativar usuário (UC-15 fica sem tela no MVP).
- **Convenção de commit**: `feat(TASK-094): add security settings screen`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-095: `DispositivoRevogadoTela` e E2E completo com acessibilidade (UL-09, SPEC §10)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-094, TASK-073 (Rust completo — necessário para a verificação manual)
- **Objetivo**: Tela do computador revogado e a suíte Playwright que percorre o roteiro "Pronto quando" da SPEC §10 com o Tauri simulado, auditoria axe e screenshots.
- **Arquivos permitidos**: `src/acesso/ui/telas/DispositivoRevogadoTela.vue` (substituir placeholder) e `.spec.ts`; `e2e/primeiro-acesso.spec.ts`, `e2e/desbloqueio.spec.ts`, `e2e/modo-offline-e-revogacao.spec.ts`, `e2e/acessibilidade.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Referência visual**: `AuthLayout`; ícone `PhShieldWarning` em `bg-rose-50 text-rose-600 rounded-2xl`; `<h2>` "Este computador foi desconectado"; texto "O acesso deste computador foi revogado. Os dados locais continuam protegidos pela criptografia e não podem ser abertos."; botão perigo "Redefinir este computador" → modal com `AlertaBanner` erro "Todos os dados locais deste computador serão apagados." + campo "Digite DESCARTAR" → `redefinirComputadorRevogado('DESCARTAR')` → `login`.
- **Componentes e rotas**: rota `dispositivo-revogado`.
- **Estados obrigatórios**: padrão, modal, confirmação inválida, enviando.
- **Responsividade**: 3 breakpoints.
- **Acessibilidade**: mesmo padrão das telas de auth.
- **Testes obrigatórios**:
  - Componente: botão do modal habilitado só com "DESCARTAR"; chama o comando e navega para `login`.
  - **E2E** (`instalarMockTauri`, viewport 1280×800):
    1. `primeiro-acesso`: estado `sem_configuracao` → login → `mfa: 'configurar'` → QR visível (`img[src^="data:image/png"]`) → código → 10 códigos → marcar "Guardei" → verificar código → `proximoPasso: 'configurar_desbloqueio'` → definir senha mestre → `inicio` com "Olá, Lucas"; asserte pela lista de chamadas que nenhum argumento enviado contém `refreshToken`/`accessToken`;
    2. `desbloqueio`: estado `bloqueado` → senha errada (mensagem) → `AGUARDE_ANTES_DE_TENTAR` (botão desabilitado) → senha certa → `inicio`; `emitirEstado(bloqueado)` estando no início → volta para `desbloqueio` (**bloqueio por inatividade**);
    3. `modo-offline-e-revogacao`: estado `somente_leitura` → banner visível; `emitirEstado(revogado)` → tela de revogação; `offline_expirado` → tela `conectar`;
    4. `acessibilidade`: para `login`, `mfa-verificar`, `definir-senha-mestre`, `desbloqueio`, `inicio`, `dispositivos`, `seguranca`, `dispositivo-revogado`: `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()` com **zero** violações `serious`/`critical`; navegação só por teclado no login (Tab até "Entrar no Sistema" e Enter envia); e `page.screenshot({ path: 'test-results/telas/<tela>-<largura>.png' })` em 1024×700, 1280×800 e 1440×900.
  - Durante todos os E2E, `page.on('console')` não registra `error`/`warning` (falhar o teste se houver).
- **Requisitos de segurança**: confirmação digitada para apagar dados; nenhum token no JS (verificado no E2E 1).
- **Restrições de dependência e performance**: relatar no relatório o tamanho do bundle (`dist/assets/*.js`, soma em KB) antes (TASK-080) e depois; o chunk inicial não pode conter `qrcode`.
- **Critérios de aceite**: [ ] todos os testes passam · [ ] 0 violações axe serious/critical · [ ] 24 screenshots gerados (8 telas × 3 larguras) e listados no relatório · [ ] verificação de proibidos vazia
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
  pnpm run test:e2e
  pnpm audit --prod
  grep -rnE "fetch\(|localStorage|sessionStorage|v-html|innerHTML|https?://" src --include=*.ts --include=*.vue | grep -v "\.spec\.ts" ; echo "exit=$?"
  ```
- **Fora de escopo**: E2E com o binário Tauri real (manual, ver abaixo).
- **Verificação manual obrigatória** (colar no relatório): com backend local rodando (`backend/` `pnpm start:dev`) e proprietário criado (TASK-056), `pnpm tauri dev` e executar o roteiro SPEC §10 — primeiro acesso online; fechar e reabrir **sem internet** (desligar o backend) e desbloquear com senha mestre; ficar parado até bloquear; revogar o computador a partir de outra instância e ver o bloqueio na próxima conexão.
- **Convenção de commit**: `feat(TASK-095): add revoked device screen and end-to-end UI tests`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Screenshots**: `[caminhos]`
- **Bundle antes/depois**: `[KB]`
- **Roteiro manual SPEC §10**: `[resultado passo a passo]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`
