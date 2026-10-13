# 📋 Contexto Identidade e Acesso (user) — Índice do Plano de Tarefas

> **Objetivo**: Construir o contexto Identidade e Acesso (login com MFA, dispositivos, sessões, desbloqueio local offline, permissões, recuperação e auditoria) no backend NestJS e no app desktop Tauri + Vue.
> **Especificação-fonte**: `ade-coder/contexts/user/Contexto Identidade e Acesso — Especificação para Construção.md` (abaixo chamada de **SPEC**). Toda regra `RN-xx`, decisão `DT-xx` e caso de uso `UC-xx`/`UL-xx` citados nas tarefas vêm dela.
> **Referência visual**: `ade-coder/contexts/user/figma-components/page-login.md` (HTML exportado do Figma).
> **Decisões que ajustam a SPEC**: `DECISIONS.md` (raiz do repositório), itens D-001 a D-015. **Leia antes de começar qualquer tarefa.**
> **Branch Git**: `feature/identidade-e-acesso`
> **Commit base**: `f47862e`
> **Status Geral**: ⏳ Em Progresso

---

## 1. Como este plano está organizado

| Arquivo | Área | Tarefas |
|---|---|---|
| `01-FUNDACAO.md` | Higiene do repositório, dependências, configuração, banco | TASK-001 a TASK-006 |
| `02-BACKEND-DOMAIN.md` | Camada **domain** (TypeScript puro, sem Nest) | TASK-010 a TASK-017 |
| `03-BACKEND-APPLICATION.md` | Camada **application** (portas, casos de uso, fakes) | TASK-020 a TASK-034 |
| `04-BACKEND-INFRASTRUCTURE.md` | Camada **infrastructure** (Drizzle/Postgres, Argon2id, TOTP, JWT, e-mail) | TASK-040 a TASK-047 |
| `05-BACKEND-INTERFACE.md` | Camada **interface** (HTTP, guards, CLI administrativa, E2E) | TASK-050 a TASK-057 |
| `06-DESKTOP-RUST.md` | Módulo Rust `acesso_local` (Tauri) | TASK-060 a TASK-073 |
| `07-DESKTOP-FRONTEND.md` | Telas Vue 3 (a partir do Figma) | TASK-080 a TASK-095 |

Os IDs têm intervalos propositalmente para inserir tarefas de correção sem renumerar.

## 2. Ordem de execução (grafo de dependências)

```
TASK-001 ─┬─ BACKEND: TASK-002 ─ 003 ─ 004
          │             └─ 002 ─ DOMAIN 010 ─ {011, 012, 013} ─ 014 / 015 / 016 ─ 017
          │                        └─ APPLICATION 020 ─ 021 ─ 022 ─ 023 ─ 024 … 034 (sequencial)
          │                             ├─ INFRA 041 (após 020) ─ {042, 043, 044 ─ 045}; 040 (após 004) ─ 046 (após 021) ─ 047
          │                             └─ INTERFACE (após 034 e 047) 050 ─ 051 ─ 052 ─ 053 ─ {054 ─ 055, 056} ─ 057
          │
          └─ DESKTOP: TASK-005 ─ 006
                        ├─ RUST 060 ─ 061 ─ {062, 064}; 060 ─ 063; 065 ─ 066 ─ {067, 068 ─ 069 ─ 070, 071}; 063 ─ 072; 073 por último
                        └─ VUE  080 ─ 081 ─ 082; 080 ─ 083 ─ 084; 085 … 095 (sequencial)
```

Regra prática: **backend, Rust e Vue podem andar em paralelo** depois da fundação — o Vue testa contra o contrato de comandos do arquivo 06 com o Tauri simulado, e o Rust testa contra um servidor HTTP simulado com o contrato do arquivo 05. A integração real é verificada na TASK-095 (roteiro manual da SPEC §10). Dentro de cada arquivo, siga a ordem numérica e o campo `Depende de`.

## 3. Comandos globais

**Backend** (executar dentro de `backend/`):
```bash
pnpm exec tsc --noEmit -p tsconfig.json   # tipagem
pnpm run lint                             # oxlint (type-aware)
pnpm test                                 # testes unitários (*.spec.ts)
pnpm run test:int                         # integração com Postgres (*.int-spec.ts) — existe a partir da TASK-004
pnpm run test:e2e                         # E2E HTTP (*.e2e-spec.ts)
pnpm run build                            # nest build
pnpm audit --prod                         # vulnerabilidades
```

**Desktop — frontend** (executar dentro de `apps/desktop/desktop-first/`):
```bash
pnpm exec vue-tsc --noEmit    # tipagem
pnpm run lint                 # oxlint — existe a partir da TASK-006
pnpm test                     # vitest + Testing Library — existe a partir da TASK-006
pnpm run test:e2e             # Playwright — existe a partir da TASK-006
pnpm run build                # vue-tsc + vite build
pnpm audit --prod
```

**Desktop — Rust** (executar dentro de `apps/desktop/desktop-first/src-tauri/`):
```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo audit                   # requer `cargo install cargo-audit` (uma vez)
```

> ⚠️ Pré-requisitos de máquina: Node 24, pnpm 12.11.2, Docker (Postgres local), **Rust estável via rustup** (não está instalado nesta máquina hoje) e, no Windows, Perl (Strawberry Perl) para compilar o SQLCipher com OpenSSL vendorizado. Se faltar algum, marque a tarefa como `⛔ Bloqueado`.

---

## 4. ⚙️ Diretrizes Universais para o Agente Executor (OpenCode)

Você tem pouco contexto e será revisado por um arquiteto que verifica tudo por comando e por diff. Siga o texto literalmente. Em caso de dúvida, pare e pergunte; não adivinhe.

### Fluxo
1. **Uma tarefa por vez.** Só inicie a próxima depois que a atual estiver em `🔍 Aguardando Revisão`, e respeite `Depende de`.
2. **Antes de codar**, leia a tarefa inteira, os arquivos listados, a seção da SPEC citada e um arquivo vizinho para copiar o padrão do projeto.
3. **Um commit por tarefa**, no formato `<tipo>(TASK-XXX): <mensagem em inglês>` (ex.: `feat(TASK-013): add Usuario aggregate`). Em correções após revisão: `fix(TASK-XXX): address F-001, F-003`.
4. **Ao concluir**, preencha o **Relatório do Agente** da tarefa (com saídas reais dos comandos) e mude o status para `🔍 Aguardando Revisão`.

### Escopo (violação = reprovação automática)
5. Altere **somente** os arquivos de `Arquivos permitidos`. Qualquer outro arquivo é proibido, inclusive config, CI, lockfiles e migrations existentes. Exceção única: o lockfile, **apenas** nas tarefas que mandam instalar dependência.
6. Não adicione dependências, não refatore código fora da tarefa, não renomeie nem apague nada que não esteja especificado.
7. Não edite os arquivos de tarefa, exceto o status e o Relatório do Agente da sua tarefa.
8. Não use `git commit --amend`, `rebase`, `push --force` nem `git add .` às cegas. Confira o `git status` e adicione só os arquivos permitidos.

### Qualidade
9. Respeite os padrões do repositório. Proibido: `any` (implícito ou explícito), `@ts-ignore`, `@ts-expect-error` novo, `eslint-disable`/`oxlint-disable`, `console.log` de depuração, `unwrap()`/`expect()` em código Rust de produção (só em testes) e código comentado.
10. **Nunca** enfraqueça, remova, pule (`skip`/`only`/`#[ignore]`) ou altere testes existentes para fazê-los passar. Se um teste antigo quebrar, reporte no relatório.
11. Todo teste exigido na tarefa deve existir e ter asserts reais (nada de teste vazio ou só snapshot).
12. Nenhum segredo, chave, token ou dado sensível no código, em logs, testes ou commits. Use variáveis de ambiente. Valores de teste devem ser obviamente falsos (ex.: `"segredo-de-teste-com-32-caracteres!!"`).

### Convenções técnicas obrigatórias
13. **Backend é ESM** (`"type": "module"`, `moduleResolution: nodenext`): todo import relativo termina em `.js` (ex.: `import { Email } from './email.js';`), mesmo importando um `.ts`.
14. Nomes de domínio em **português sem acento** (`Usuario`, `SessaoDeLogin`, `politicaDeAcesso`), exatamente como nos contratos. Textos para o usuário final em português **com** acento.
15. Datas: sempre `Date` em UTC no backend; nunca `new Date()` direto em domain/application — use o `Relogio` (porta) ou receba `agora: Date` por parâmetro.
16. Exports **nomeados** (sem `export default`), exceto componentes `.vue`.

### Honestidade
17. Uma tarefa só está concluída se **todos** os comandos de validação passaram com zero erros **e** a saída está colada no relatório. Dizer que passou sem mostrar a saída conta como não feito.
18. Se algo não puder ser feito como especificado, não improvise: mude o status para `⛔ Bloqueado`, descreva a dúvida em `Bloqueios` e pare.
19. Registre qualquer desvio da especificação em `Desvios` no relatório, mesmo que pequeno.

### Definição de Pronto (vale para toda tarefa)
- [ ] Critérios de aceite da tarefa atendidos
- [ ] Testes obrigatórios implementados e passando
- [ ] Tipagem, lint, testes e build sem erros
- [ ] Requisitos de segurança atendidos
- [ ] Nenhum arquivo fora de `Arquivos permitidos` alterado
- [ ] Sem dependência nova não prevista
- [ ] Um commit no formato correto
- [ ] Relatório do Agente preenchido

### Legenda de status
`[ ] Pendente` · `[⌛ Em Andamento]` · `[⛔ Bloqueado]` · `[🔍 Aguardando Revisão]` · `[🔁 Reprovada]` · `[x] Aprovada`

---

## 5. 🎯 Mapa de pastas (destino final)

```
backend/
  docker-compose.yml  .env.example  drizzle.config.ts  vitest.config.int.ts
  drizzle/                                   # migrations geradas (TASK-040)
  src/identidade-e-acesso/
    domain/
      comum/            agregado.ts  evento-de-dominio.ts  erro-de-dominio.ts  identificador-uuid.ts
      usuario/          usuario.ts  usuario-id.ts  email.ts  hash-de-senha.ts  codigo-de-recuperacao.ts  segredo-totp-cifrado.ts
      dispositivo/      dispositivo.ts  dispositivo-id.ts
      sessao-de-login/  sessao-de-login.ts  sessao-de-login-id.ts
      acesso/           permissao.ts  papel.ts  contexto-de-acesso.ts  politica-de-acesso.ts
      servicos/         politica-de-senha.ts  politica-de-proprietario.ts  politica-de-limite-de-dispositivos.ts  avaliador-de-modo-offline.ts
      erros.ts  eventos.ts  index.ts
    application/
      portas/           *.ts  tokens.ts  index.ts
      auditoria/        registro-de-auditoria.ts  serializacao-canonica.ts  auditor.ts
      casos-de-uso/     <nome-do-caso>.ts (+ .spec.ts)
      comum/            verificacao-de-mfa.ts  validacao-de-desafio.ts  constantes.ts
    infrastructure/
      config/           configuracao.ts  politica-de-acesso.config.ts
      persistencia/     schema.ts  conexao.ts  mapeadores.ts  repositorios/*.ts  drizzle-unidade-de-trabalho.ts
      adaptadores/      argon2id-hasher.ts  otplib-servico-totp.ts  aes-gcm-cofre-de-segredos.ts  jwt-emissor-de-tokens.ts
                        smtp-enviador-de-email.ts  relogio-do-sistema.ts  barramento-em-processo.ts
                        gerador-de-codigos-de-recuperacao.ts  sha256-calculadora-de-hash.ts  ed25519-verificador-de-assinatura.ts
      seguranca/        senhas-comuns.ts
    interface/
      http/             controllers/  dtos/  guards/  decorators/  pipes/  filtros/
      cli/              criar-primeiro-proprietario.ts  redefinir-acesso.ts
    identidade-e-acesso.module.ts
  test/identidade-e-acesso/
    fakes/              (repositórios e adaptadores em memória — TASK-021)
    int/                global-setup.ts  banco-de-teste.ts
    e2e/                *.e2e-spec.ts

apps/desktop/desktop-first/
  src-tauri/src/acesso_local/   mod.rs erros.rs cripto.rs armazenamento.rs cofre_so.rs banco_local.rs estado.rs
                                relogio.rs modo_offline.rs inatividade.rs auditoria.rs sessao_remota.rs biometria.rs comandos.rs
  src/
    styles/tema.css   router/index.ts
    acesso/application/  acesso/infrastructure/  acesso/ui/{componentes,layout,telas,composables}
  e2e/
```

**Arquivos proibidos em todo o plano (salvo quando a tarefa listar explicitamente)**: `.env` (real), `package.json`/lockfiles, `Cargo.toml`/`Cargo.lock`, `tauri.conf.json`, `capabilities/*.json`, `.github/**`, migrations já geradas, `docs/**`, arquivos desta pasta `tasks/`.

## 6. Pendências que bloqueiam partes do plano

| ID | Pendência | Afeta | Até resolver |
|---|---|---|---|
| P-01 | Valores **assumidos** da SPEC §2 (10 min, 5 dias, leitura após limite, 3 dispositivos) | Config | Usar os padrões; todos vêm de env (TASK-003) |
| P-02 | Provedor de e-mail (DT-16) | TASK-045 | Adaptador SMTP genérico (D-007); em dev/teste usa o fake |
| P-03 | Cofre de segredos do servidor (DT-17) e hospedagem | TASK-003 | Segredos vêm de variáveis de ambiente |
| P-04 | Spike de biometria (DT-10) | TASK-072 | Plano B: só senha mestre (TASK-071 deixa a porta pronta) |
| P-05 | Domínio de produção da API | TASK-069 | `EVO_API_URL` em tempo de build; padrão `http://localhost:3000` só em debug |
| P-06 | Retenção dos logs de auditoria | — | Sem expurgo no MVP |
| P-07 | Login/recuperação por WhatsApp (presente no Figma) | — | **Fora do escopo** (D-002) |
| P-08 | Textos institucionais do Figma (nome, CREFITO, especialidade, site) e link de Política de Privacidade | TASK-084 | Usar os textos do Figma como constantes; sem link de privacidade |
| P-09 | Usuário de banco de produção sem posse das tabelas (para o gatilho append-only não poder ser desligado pela aplicação) | Deploy | Registrar no plano de hospedagem (DT-17) |
