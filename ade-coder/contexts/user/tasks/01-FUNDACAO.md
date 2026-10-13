# 📋 01 — Fundação (repositório, dependências, configuração, banco)

> **Objetivo**: Deixar backend e desktop prontos para receber o contexto Identidade e Acesso: repositório limpo, dependências aprovadas, configuração validada, Postgres local e ferramentas de teste.
> **Branch Git**: `feature/identidade-e-acesso` · **Commit base**: `f47862e` · **Status Geral**: ⏳ Em Progresso
> **Stack e versões**: Node 24, pnpm 12.11.2, NestJS 12, TypeScript 6, Vitest 4, oxlint, Vue 3.5, Vite 8, Tauri 2, PostgreSQL 17.
> **Leitura obrigatória antes de qualquer tarefa**: `00-INDICE.md` (seção 4 — Diretrizes Universais) e `DECISIONS.md` na raiz.

## 🎯 Mapa de Arquivos

| Arquivo | Ação | Tarefa |
|---|---|---|
| `.gitignore` (raiz) | Criar | TASK-001 |
| `backend/node_modules/**` | Remover do índice git (sem apagar do disco) | TASK-001 |
| `backend/package.json`, `backend/pnpm-lock.yaml`, `backend/.oxlintrc.json` | Editar | TASK-002 |
| `backend/src/identidade-e-acesso/infrastructure/config/configuracao.ts` (+ `.spec.ts`) | Criar | TASK-003 |
| `backend/.env.example`, `backend/src/main.ts` | Criar / Editar | TASK-003 |
| `backend/docker-compose.yml`, `backend/docker/postgres/init/01-criar-banco-de-teste.sql`, `backend/drizzle.config.ts`, `backend/vitest.config.int.ts` | Criar | TASK-004 |
| `backend/src/identidade-e-acesso/infrastructure/persistencia/conexao.ts`, `backend/test/identidade-e-acesso/int/*` | Criar | TASK-004 |
| `apps/desktop/pnpm-workspace.yaml`, `apps/desktop/pnpm-lock.yaml`, `apps/desktop/desktop-first/{package.json,vite.config.ts,vitest.config.ts,playwright.config.ts,.oxlintrc.json,tsconfig.json,tsconfig.node.json}`, `apps/desktop/desktop-first/src/test/setup.ts`, `apps/desktop/desktop-first/src/env.d.ts` | Editar / Criar | TASK-005 |
| `apps/desktop/desktop-first/src-tauri/tauri.conf.json`, `apps/desktop/desktop-first/index.html` | Editar | TASK-006 |

---

### TASK-001: Remover `node_modules` do git e criar `.gitignore` na raiz
- **Status**: `[ ] Pendente`
- **Depende de**: nenhuma
- **Objetivo**: O commit `9d17971` versionou 45.509 arquivos de `backend/node_modules`. Isso infla o repositório, esconde mudanças reais em diffs e permite que pacotes adulterados entrem por commit (D-015).
- **Arquivos permitidos**: `.gitignore` (raiz, novo); remoção do índice de `backend/node_modules/**`
- **Arquivos proibidos**: qualquer outro; **não** apague a pasta `backend/node_modules` do disco
- **Contrato**: conteúdo exato do `.gitignore` da raiz:
  ```gitignore
  # dependências
  node_modules/
  # build
  dist/
  build/
  target/
  *.tsbuildinfo
  # ambiente e segredos
  .env
  .env.*
  !.env.example
  # testes
  coverage/
  playwright-report/
  test-results/
  # SO / IDE
  .DS_Store
  Thumbs.db
  .idea/
  ```
- **Passo a passo**:
  1. `git checkout -b feature/identidade-e-acesso` (se a branch ainda não existir).
  2. Criar `.gitignore` na raiz com o conteúdo acima.
  3. `git rm -r --cached --quiet backend/node_modules`
  4. `git add .gitignore`
  5. Conferir com `git status --short | grep -v "^D  backend/node_modules" ` que só `.gitignore` aparece além das remoções.
  6. Commit.
- **Testes obrigatórios**: não se aplica código; a verificação é por comando (abaixo).
- **Requisitos de segurança**: `.env` e variantes ignorados; `.env.example` continua versionável.
- **Critérios de aceite**:
  - [ ] `git ls-files | grep -c node_modules` imprime `0`
  - [ ] A pasta `backend/node_modules` continua existindo no disco (`ls backend/node_modules | head -1` lista algo)
  - [ ] `git check-ignore backend/.env` imprime `backend/.env`
  - [ ] `git check-ignore backend/.env.example` não imprime nada (código de saída 1)
- **Comandos de verificação**:
  ```bash
  git ls-files | grep -c node_modules
  git check-ignore backend/.env ; git check-ignore backend/.env.example ; echo "exit=$?"
  git show --stat HEAD | tail -3
  ```
- **Fora de escopo**: reescrever histórico (`filter-repo`), mexer em `backend/.gitignore`.
- **Convenção de commit**: `chore(TASK-001): stop tracking node_modules and add root gitignore`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar a saída real de cada comando]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[APROVADA | APROVADA COM RESSALVAS | REPROVADA]`
- **Achados**: `[ver REVIEW.md, IDs F-001...]`
- **Correções exigidas**: `[lista numerada]`

---

### TASK-002: Dependências, scripts e regras de lint do backend
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-001
- **Objetivo**: Instalar de uma vez todas as bibliotecas previstas no plano (D-001, D-007, D-012, DT-02, DT-03, DT-04, DT-06) e os scripts usados nas tarefas seguintes, para que nenhuma outra tarefa precise tocar `package.json`.
- **Arquivos permitidos**: `backend/package.json`, `backend/pnpm-lock.yaml`, `backend/.oxlintrc.json`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - Dependências de produção (comando exato, dentro de `backend/`):
    `pnpm add drizzle-orm pg argon2 otplib@12.0.1 @nestjs/jwt @nestjs/throttler zod nodemailer`
  - Dependências de desenvolvimento:
    `pnpm add -D drizzle-kit @types/pg @types/nodemailer`
  - `zod` deve ficar na major **4** (`^4.x`). `otplib` fixo em `12.0.1` (sem `^`).
  - Scripts a **adicionar** em `package.json` (não altere os existentes):
    ```json
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test:int": "vitest run --config ./vitest.config.int.ts",
    "db:gerar": "drizzle-kit generate",
    "db:migrar": "drizzle-kit migrate",
    "cli:criar-proprietario": "node dist/identidade-e-acesso/interface/cli/criar-primeiro-proprietario.js",
    "cli:redefinir-acesso": "node dist/identidade-e-acesso/interface/cli/redefinir-acesso.js"
    ```
  - `.oxlintrc.json`: trocar `"typescript/no-explicit-any": "off"` por `"error"` e adicionar `"no-console": ["error", { "allow": ["warn", "error"] }]`.
- **Passo a passo**:
  1. Rodar os dois comandos `pnpm add` acima.
  2. Se o pnpm avisar que `argon2` teve script de build bloqueado, rode `pnpm approve-builds` e aprove **somente** `argon2`. Registre em Desvios o que foi alterado (ex.: campo `pnpm.onlyBuiltDependencies`).
  3. Se houver aviso de *peer dependency* entre `@nestjs/jwt`/`@nestjs/throttler` e `@nestjs/common@12`, **pare** e marque `⛔ Bloqueado` com a mensagem.
  4. Adicionar os scripts.
  5. Ajustar `.oxlintrc.json`.
  6. Rodar todos os comandos de verificação.
- **Testes obrigatórios**: os testes existentes (`app.controller.spec.ts`, `app.e2e-spec.ts`) continuam passando; verificação de carga do argon2 (comando abaixo).
- **Requisitos de segurança**: `pnpm audit --prod` sem vulnerabilidade `high` ou `critical`. Se houver, cole a saída e marque `⛔ Bloqueado`.
- **Critérios de aceite**:
  - [ ] `package.json` lista exatamente as dependências acima (nenhuma a mais)
  - [ ] `otplib` com versão `12.0.1` exata; `zod` major 4
  - [ ] Scripts adicionados com os nomes exatos
  - [ ] `pnpm run lint` passa com a regra `no-explicit-any` em `error`
- **Comandos de verificação**:
  ```bash
  pnpm install --frozen-lockfile
  node -e "import('argon2').then(a=>a.hash('teste',{type:a.argon2id})).then(h=>console.log(h.startsWith('\$argon2id\$')))"
  pnpm run typecheck && pnpm run lint && pnpm test && pnpm run test:e2e && pnpm run build
  pnpm audit --prod
  ```
- **Fora de escopo**: escrever código de aplicação, criar `vitest.config.int.ts` (TASK-004).
- **Convenção de commit**: `chore(TASK-002): add identity context dependencies and scripts`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Versões instaladas** (`pnpm list --depth 0`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-003: Configuração validada por ambiente (`carregarConfiguracao`)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-002
- **Objetivo**: Ler e validar com zod todas as variáveis de ambiente do contexto (segredos, banco, SMTP, parâmetros da SPEC §2), falhando cedo e **sem nunca imprimir valores** (D-012, P-01, P-03).
- **Arquivos permitidos**:
  - `backend/src/identidade-e-acesso/infrastructure/config/configuracao.ts` (novo)
  - `backend/src/identidade-e-acesso/infrastructure/config/configuracao.spec.ts` (novo)
  - `backend/.env.example` (novo)
  - `backend/src/main.ts` (editar)
- **Arquivos proibidos**: todo o resto (inclusive `.env` real)
- **Contrato** (`configuracao.ts`, exports nomeados):
  ```ts
  export interface ParametrosDePolitica {
    inatividadeMin: number; limiteDiasOffline: number; leituraPermitidaAposLimite: boolean;
    maxTentativasLogin: number; bloqueioProgressivoMin: number[]; maxDispositivosAtivos: number;
    tamanhoMinimoSenha: number; validadeAccessMin: number; validadeRefreshDias: number;
    janelaReautenticacaoMin: number; maxFalhasDesbloqueioLocal: number;
  }
  export interface ConfiguracaoSmtp { host: string; porta: number; seguro: boolean; usuario: string; senha: string; remetente: string; }
  export interface Configuracao {
    ambiente: 'development' | 'test' | 'production';
    porta: number;
    databaseUrl: string;
    jwtAccessSegredo: string;
    jwtDesafioSegredo: string;
    totpChaveCifra: Uint8Array;       // 32 bytes decodificados de base64
    smtp: ConfiguracaoSmtp | null;    // null quando SMTP_HOST ausente (só permitido fora de production)
    urlRedefinicaoSenha: string;
    trustProxy: boolean;
    politica: ParametrosDePolitica;
  }
  export class ConfiguracaoInvalida extends Error { constructor(readonly variaveis: readonly string[]) }
  export function carregarConfiguracao(env: Record<string, string | undefined>): Configuracao;
  ```
  Variáveis (nome → regra → padrão):
  | Variável | Regra | Padrão |
  |---|---|---|
  | `NODE_ENV` | `development`\|`test`\|`production` | `development` |
  | `PORT` | inteiro 1–65535 | `3000` |
  | `DATABASE_URL` | URL começando com `postgres://` ou `postgresql://` | obrigatória |
  | `JWT_ACCESS_SEGREDO` | ≥ 32 caracteres | obrigatória |
  | `JWT_DESAFIO_SEGREDO` | ≥ 32 caracteres e **diferente** de `JWT_ACCESS_SEGREDO` | obrigatória |
  | `TOTP_CHAVE_CIFRA_B64` | base64 que decodifica para exatamente 32 bytes | obrigatória |
  | `SMTP_HOST` | texto não vazio | opcional; **obrigatória se `NODE_ENV=production`** |
  | `SMTP_PORTA` | inteiro 1–65535 | `587` |
  | `SMTP_SEGURO` | `true`\|`false` | `false` |
  | `SMTP_USUARIO`, `SMTP_SENHA` | texto | obrigatórias se `SMTP_HOST` definido |
  | `SMTP_REMETENTE` | e-mail | obrigatória se `SMTP_HOST` definido |
  | `URL_REDEFINICAO_SENHA` | URL `https://` (ou `http://localhost` fora de production) | obrigatória |
  | `TRUST_PROXY` | `0`\|`1` | `0` |
  | `POLITICA_INATIVIDADE_MIN` | inteiro ≥ 1 | `10` |
  | `POLITICA_LIMITE_DIAS_OFFLINE` | inteiro ≥ 1 | `5` |
  | `POLITICA_LEITURA_APOS_LIMITE` | `true`\|`false` | `true` |
  | `POLITICA_MAX_TENTATIVAS_LOGIN` | inteiro ≥ 1 | `5` |
  | `POLITICA_BLOQUEIO_PROGRESSIVO_MIN` | lista de inteiros ≥ 1 separados por vírgula, crescente | `1,5,15,60` |
  | `POLITICA_MAX_DISPOSITIVOS` | inteiro ≥ 1 | `3` |
  | `POLITICA_TAMANHO_MINIMO_SENHA` | inteiro ≥ 12 | `12` |
  | `POLITICA_VALIDADE_ACCESS_MIN` | inteiro 1–60 | `15` |
  | `POLITICA_VALIDADE_REFRESH_DIAS` | inteiro 1–90 | `30` |
  | `POLITICA_JANELA_REAUTENTICACAO_MIN` | inteiro ≥ 1 | `5` |
  | `POLITICA_MAX_FALHAS_DESBLOQUEIO_LOCAL` | inteiro ≥ 1 | `10` |
- **Passo a passo**:
  1. Criar o esquema zod (`z.object({...})`) com as regras acima; use `z.coerce.number().int()` para números e `z.enum(['true','false']).transform(v => v === 'true')` para booleanos.
  2. Em `carregarConfiguracao`, usar `safeParse`. Em falha, lançar `ConfiguracaoInvalida` com a lista de **nomes** das variáveis inválidas (de `issue.path[0]`). A mensagem do erro é `Configuração inválida: <NOME1>, <NOME2>` — **nunca** inclua valores.
  3. Aplicar as regras cruzadas (segredos diferentes, SMTP em production, lista crescente) com `superRefine`, apontando o `path` da variável.
  4. Criar `.env.example` com **todas** as variáveis, valores falsos óbvios e um comentário mostrando como gerar segredos: `# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Inclua também `DATABASE_URL_TESTE=postgres://clinica:troque-esta-senha@127.0.0.1:5432/clinica_teste` e `POSTGRES_SENHA_LOCAL=troque-esta-senha`.
  5. Em `main.ts`, antes do `bootstrap()`: `import { existsSync } from 'node:fs';` e `if (existsSync('.env')) process.loadEnvFile('.env');`. Não chame `carregarConfiguracao` ainda (será feito pelo módulo na TASK-053).
- **Testes obrigatórios** (`configuracao.spec.ts`, função `envValido()` local que retorna um objeto completo de teste):
  1. env válido → retorna `Configuracao` com `politica` nos padrões e `totpChaveCifra.length === 32`;
  2. sem `DATABASE_URL` → lança `ConfiguracaoInvalida` com `variaveis` contendo `'DATABASE_URL'`;
  3. `JWT_ACCESS_SEGREDO` com 31 caracteres → lança, contém `'JWT_ACCESS_SEGREDO'`;
  4. segredos JWT iguais → lança, contém `'JWT_DESAFIO_SEGREDO'`;
  5. `TOTP_CHAVE_CIFRA_B64` com 16 bytes → lança;
  6. `POLITICA_BLOQUEIO_PROGRESSIVO_MIN='1,a'` e `'5,1'` → lançam;
  7. `POLITICA_TAMANHO_MINIMO_SENHA='8'` → lança;
  8. `NODE_ENV=production` sem `SMTP_HOST` → lança contendo `'SMTP_HOST'`;
  9. `NODE_ENV=production` com `URL_REDEFINICAO_SENHA=http://localhost/x` → lança;
  10. **vazamento**: com `JWT_ACCESS_SEGREDO='curto-mas-secreto'`, a `message` do erro **não** contém `'curto-mas-secreto'`.
- **Requisitos de segurança**: nenhum valor de variável em mensagens de erro ou logs; `.env.example` sem segredo real; validação de tamanho mínimo dos segredos.
- **Critérios de aceite**:
  - [ ] Os 10 testes passam
  - [ ] `.env.example` lista todas as variáveis da tabela + `DATABASE_URL_TESTE` + `POSTGRES_SENHA_LOCAL`
  - [ ] `main.ts` só carrega `.env` se existir
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/infrastructure/config/configuracao.spec.ts
  pnpm run build
  ```
- **Fora de escopo**: provider Nest da configuração (TASK-053), validação de `PoliticaDeAcesso` do domínio (TASK-012).
- **Convenção de commit**: `feat(TASK-003): add validated environment configuration`

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

### TASK-004: Postgres local, conexão Drizzle e suíte de integração
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-003
- **Objetivo**: Subir PostgreSQL 17 via Docker apenas em `127.0.0.1`, criar o banco de teste, a conexão Drizzle e a configuração `test:int` com trava contra rodar testes no banco errado (D-001).
- **Arquivos permitidos**:
  - `backend/docker-compose.yml` (novo)
  - `backend/docker/postgres/init/01-criar-banco-de-teste.sql` (novo)
  - `backend/drizzle.config.ts` (novo)
  - `backend/vitest.config.int.ts` (novo)
  - `backend/src/identidade-e-acesso/infrastructure/persistencia/conexao.ts` (novo)
  - `backend/test/identidade-e-acesso/int/banco-de-teste.ts` (novo)
  - `backend/test/identidade-e-acesso/int/global-setup.ts` (novo)
  - `backend/test/identidade-e-acesso/int/conexao.int-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - `docker-compose.yml`:
    ```yaml
    services:
      postgres:
        image: postgres:17-alpine
        environment:
          POSTGRES_USER: clinica
          POSTGRES_PASSWORD: ${POSTGRES_SENHA_LOCAL:?defina POSTGRES_SENHA_LOCAL no .env}
          POSTGRES_DB: clinica
        ports:
          - "127.0.0.1:5432:5432"
        volumes:
          - pgdata:/var/lib/postgresql/data
          - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U clinica -d clinica"]
          interval: 5s
          timeout: 3s
          retries: 10
    volumes:
      pgdata: {}
    ```
  - `01-criar-banco-de-teste.sql`: `CREATE DATABASE clinica_teste OWNER clinica;`
  - `drizzle.config.ts`:
    ```ts
    import { existsSync } from 'node:fs';
    import { defineConfig } from 'drizzle-kit';
    if (existsSync('.env')) process.loadEnvFile('.env');
    export default defineConfig({
      dialect: 'postgresql',
      schema: './src/identidade-e-acesso/infrastructure/persistencia/schema.ts',
      out: './drizzle',
      schemaFilter: ['identidade'],
      dbCredentials: { url: process.env.DATABASE_URL ?? '' },
      strict: true,
      verbose: true,
    });
    ```
    (Este é o único `export default` permitido no backend, exigido pelo drizzle-kit.)
  - `conexao.ts`:
    ```ts
    import { Pool } from 'pg';
    import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
    export interface ConexaoDoBanco { readonly db: NodePgDatabase; readonly pool: Pool; encerrar(): Promise<void>; }
    export function criarConexao(url: string): ConexaoDoBanco; // Pool { connectionString: url, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }
    ```
  - `banco-de-teste.ts`:
    ```ts
    export function urlDoBancoDeTeste(): string; // carrega .env se existir; lê DATABASE_URL_TESTE; lança Error('DATABASE_URL_TESTE ausente') se vazio; lança Error('Banco de teste precisa terminar com _teste') se o nome do banco (pathname da URL) não terminar com "_teste"
    ```
  - `vitest.config.int.ts`: igual ao `vitest.config.e2e.ts`, mas `include: ['**/*.int-spec.ts']`, `fileParallelism: false`, `testTimeout: 20_000`, `globalSetup: ['./test/identidade-e-acesso/int/global-setup.ts']`.
  - `global-setup.ts`: `export default async function setup(): Promise<void>` (export default exigido pelo Vitest) que chama `urlDoBancoDeTeste()`, abre `criarConexao`, executa `SELECT 1` e encerra. (Na TASK-040 ele passa a aplicar as migrations.)
- **Passo a passo**:
  1. Criar os arquivos conforme o contrato.
  2. Criar seu `backend/.env` local (não commitar) a partir do `.env.example`.
  3. `docker compose up -d` e aguardar `healthy` (`docker compose ps`).
  4. Escrever o teste de integração e rodar.
- **Testes obrigatórios** (`conexao.int-spec.ts`):
  1. `SELECT 1 AS um` via `db.execute(sql\`select 1 as um\`)` retorna `um = 1`;
  2. `urlDoBancoDeTeste()` lança quando `DATABASE_URL_TESTE` aponta para `.../clinica` (manipule `process.env` dentro do teste e restaure depois);
  3. `encerrar()` fecha o pool (`pool.totalCount === 0` após encerrar).
- **Requisitos de segurança**: porta do Postgres publicada só em `127.0.0.1`; senha vinda do `.env`; trava `_teste` impede truncar o banco de desenvolvimento.
- **Critérios de aceite**:
  - [ ] `docker compose config` valida sem erro (com `.env` presente)
  - [ ] Os 3 testes de integração passam
  - [ ] `pnpm test` (unitário) **não** executa arquivos `*.int-spec.ts`
- **Comandos de verificação**:
  ```bash
  docker compose config --quiet && docker compose up -d && docker compose ps
  pnpm run typecheck && pnpm run lint
  pnpm run test:int
  pnpm test
  pnpm run build
  ```
- **Fora de escopo**: tabelas e migrations (TASK-040).
- **Convenção de commit**: `chore(TASK-004): add local postgres, drizzle connection and integration test setup`

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

### TASK-005: Workspace do desktop, dependências e ferramentas de teste (Vue)
- **Status**: `[🔍 Aguardando Revisão]` (worker2, commit c005c8e; desvio: .oxlintrc.json ignora src/vite-env.d.ts, scaffold com any; scripts rodados sem o `--` extra)
- **Depende de**: TASK-001
- **Objetivo**: Corrigir o workspace pnpm de `apps/desktop` (hoje ele não inclui `desktop-first`), instalar Tailwind v4, ícones, fontes, roteador, QR code e o ferramental de lint/testes (D-003).
- **Arquivos permitidos**:
  - `apps/desktop/pnpm-workspace.yaml`, `apps/desktop/pnpm-lock.yaml`
  - `apps/desktop/desktop-first/package.json`
  - `apps/desktop/desktop-first/vite.config.ts`
  - `apps/desktop/desktop-first/vitest.config.ts` (novo)
  - `apps/desktop/desktop-first/playwright.config.ts` (novo)
  - `apps/desktop/desktop-first/.oxlintrc.json` (novo)
  - `apps/desktop/desktop-first/tsconfig.json`, `apps/desktop/desktop-first/tsconfig.node.json`
  - `apps/desktop/desktop-first/src/test/setup.ts` (novo)
  - `apps/desktop/desktop-first/src/env.d.ts` (novo)
- **Arquivos proibidos**: `src/App.vue`, `src/main.ts`, `src-tauri/**`, todo o resto
- **Contrato**:
  - `pnpm-workspace.yaml` (em `apps/desktop`): `packages:\n  - 'desktop-first'`
  - Dentro de `apps/desktop/desktop-first`:
    - `pnpm add vue-router@^4 qrcode @phosphor-icons/vue @fontsource/plus-jakarta-sans @fontsource/jetbrains-mono`
    - `pnpm add -D tailwindcss@^4 @tailwindcss/vite@^4 @types/qrcode @types/node vitest jsdom @vue/test-utils @testing-library/vue @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright oxlint`
  - Scripts finais em `package.json`:
    ```json
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "vue-tsc --noEmit",
    "lint": "oxlint src e2e",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
    ```
  - `vite.config.ts`: remover a linha `// @ts-expect-error ...` (agora há `@types/node`), adicionar `import tailwindcss from '@tailwindcss/vite'` e `plugins: [vue(), tailwindcss()]`, e `define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') }`. Manter o restante igual.
  - `src/env.d.ts`: `declare const __APP_VERSION__: string;`
  - `vitest.config.ts`: `mergeConfig(viteConfig, defineConfig({ test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.spec.ts'] } }))`. Como o `vite.config.ts` exporta função, use `defineConfig(viteConfig({ mode: 'test', command: 'serve' }))` ou converta a chamada conforme a API — registre a forma usada.
  - `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';` e `afterEach(() => { clearMocks(); })` importando `clearMocks` de `@tauri-apps/api/mocks`.
  - `playwright.config.ts`: `testDir: './e2e'`, `use: { baseURL: 'http://localhost:1420' }`, `webServer: { command: 'pnpm dev', url: 'http://localhost:1420', reuseExistingServer: !process.env.CI }`, projetos `chromium` (Windows/WebView2) e `webkit` (macOS/WKWebView).
  - `.oxlintrc.json`: `{ "rules": { "typescript/no-explicit-any": "error", "no-console": ["error", { "allow": ["warn", "error"] }] }, "env": { "browser": true } }`
  - `tsconfig.json`: incluir `"types": ["vitest/globals", "@testing-library/jest-dom"]` e `"include"` com `e2e/**/*.ts`. `tsconfig.node.json`: incluir `vitest.config.ts`, `playwright.config.ts` e `"types": ["node"]`.
- **Passo a passo**:
  1. Editar `pnpm-workspace.yaml`.
  2. Em `apps/desktop`: `pnpm install`. Depois, em `desktop-first`, os dois `pnpm add`.
  3. `pnpm exec playwright install chromium webkit`.
  4. Criar/editar os arquivos de configuração.
  5. Rodar os comandos de verificação (ainda sem testes: use `--passWithNoTests`).
- **Testes obrigatórios**: nenhum novo (tarefa de configuração); `pnpm run build` deve continuar gerando `dist/`.
- **Requisitos de segurança**: nenhuma dependência carregada de CDN; `pnpm audit --prod` sem `high`/`critical`.
- **Critérios de aceite**:
  - [ ] `pnpm -C apps/desktop list -r --depth -1` lista `desktop-first`
  - [ ] `pnpm run build`, `pnpm run typecheck`, `pnpm run lint` passam
  - [ ] `pnpm test -- --passWithNoTests` e `pnpm run test:e2e -- --pass-with-no-tests` saem com código 0
- **Comandos de verificação** (em `apps/desktop/desktop-first`):
  ```bash
  pnpm run typecheck && pnpm run lint && pnpm run build
  pnpm test -- --passWithNoTests
  pnpm run test:e2e -- --pass-with-no-tests
  pnpm audit --prod
  ```
- **Fora de escopo**: telas, `App.vue`, `main.ts`, Rust.
- **Convenção de commit**: `chore(TASK-005): set up desktop workspace, tailwind and test tooling`

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

### TASK-006: Endurecer configuração do Tauri (identificador, janela, CSP)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-005
- **Objetivo**: Trocar o identificador de template, definir janela adequada ao consultório e ativar uma CSP restritiva (hoje `"csp": null`, o que permite carregar qualquer script remoto).
- **Arquivos permitidos**: `apps/desktop/desktop-first/src-tauri/tauri.conf.json`, `apps/desktop/desktop-first/index.html`
- **Arquivos proibidos**: todo o resto (inclusive `Cargo.toml`, `capabilities/`)
- **Contrato** (`tauri.conf.json`, somente estes campos mudam):
  - `"productName": "EVO Clínica"`, `"identifier": "br.com.fisioterapiaevo.clinica"`
  - `app.windows[0]`: `{ "label": "main", "title": "EVO Clínica", "width": 1280, "height": 800, "minWidth": 1024, "minHeight": 700, "center": true }`
  - `app.security.csp`:
    `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'"`
  - `app.security.devCsp`: igual à `csp`, mas `connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 ws://localhost:1421 http://localhost:1420`
  - `index.html`: `<html lang="pt-BR">` e `<title>EVO Clínica</title>`; remover o `<link rel="icon" ... vite.svg>`.
- **Passo a passo**: editar os dois arquivos; validar o JSON; rodar o build do frontend.
- **Testes obrigatórios**: validação de JSON (`node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))"`).
- **Requisitos de segurança**: CSP sem `unsafe-eval`, sem domínios externos, `object-src 'none'`; API não aparece no `connect-src` (D-005: chamadas HTTP saem do Rust).
- **Critérios de aceite**:
  - [ ] Campos exatamente como no contrato
  - [ ] `grep -c "csp\": null" src-tauri/tauri.conf.json` imprime `0`
- **Comandos de verificação** (em `apps/desktop/desktop-first`):
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('ok')"
  pnpm run build
  ```
- **Fora de escopo**: alterar capabilities, plugins, ícones.
- **Convenção de commit**: `chore(TASK-006): harden tauri identifier, window and CSP`

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
