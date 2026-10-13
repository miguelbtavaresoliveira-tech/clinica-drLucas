# Decisões Arquiteturais

Registro das decisões que complementam ou ajustam as especificações em `docs/` e `ade-coder/contexts/`. Cada decisão tem motivo e impacto. Em conflito entre uma especificação e este arquivo, **este arquivo prevalece**.

---

## Contexto Identidade e Acesso (user) — 2026-10-13

### D-001 — ORM do backend: Drizzle
- **Decisão**: persistência com `drizzle-orm` + `pg` (node-postgres); migrations com `drizzle-kit`; todas as tabelas no schema PostgreSQL `identidade` via `pgSchema('identidade')`.
- **Motivo**: `docs/tecnical-decisions/tecnical-decisions-v1.md` §2.3 desaconselha Prisma (client único para todo o schema). Drizzle permite que cada módulo declare suas próprias tabelas e mantém SQL tipado.
- **Impacto**: SPEC §7.1 "ORM a definir" resolvido. Confirmado pelo usuário.

### D-002 — Login e recuperação por WhatsApp ficam fora do escopo
- **Decisão**: a tela de login segue a SPEC (e-mail + senha → código TOTP). Removidos do Figma: botão "Entrar via Código Rápido no WhatsApp", opção WhatsApp na recuperação, checkbox "Manter conectado", seletor "Visualizar Estado" e textos com dados fictícios.
- **Motivo**: não existem na SPEC; RN-23 (app sempre abre bloqueado) contradiz "manter conectado"; o canal de WhatsApp ainda não está decidido. Confirmado pelo usuário.

### D-003 — Frontend em Vue 3 com Tailwind v4 local
- **Decisão**: o app desktop continua em **Vue 3** (o código existente), não React como diz a SPEC/doc técnico. Estilo com `tailwindcss` v4 + `@tailwindcss/vite`, ícones `@phosphor-icons/vue`, fontes `@fontsource/plus-jakarta-sans` e `@fontsource/jetbrains-mono`. Nada carregado de CDN.
- **Motivo**: o scaffold existente é Vue; CDN não funciona offline e é bloqueado pela CSP do Tauri. Confirmado pelo usuário.

### D-004 — Camada domain dentro do backend
- **Decisão**: `backend/src/identidade-e-acesso/domain/` (não `packages/domain`). O domain não importa nada de `@nestjs/*`, `drizzle-orm`, `pg`, `node:*` (exceto o global `crypto.randomUUID`). As regras que o desktop precisa offline (modo offline, bloqueio local) são implementadas em Rust (DT-08, DT-11, DT-12).
- **Motivo**: não existe monorepo na raiz; extrair para `packages/` depois é mecânico se a regra de pureza for respeitada. Confirmado pelo usuário.

### D-005 — Toda chamada HTTP do desktop passa pelo Rust
- **Decisão**: o Vue nunca chama a API com `fetch`. O Rust (`reqwest`) faz todas as requisições; access token fica só na memória do Rust; refresh token só no Keychain/Credential Manager. O Vue recebe apenas dados de negócio. O backend **não habilita CORS**.
- **Motivo**: reforça DT-05 e DT-08 (nenhum token alcançável por script), elimina CORS e a necessidade de `connect-src` para a API na CSP.

### D-006 — Colunas e campos adicionais no schema `identidade`
- `usuarios.mfa_segredo_pendente_cifrado bytea` (reconfiguração de MFA sem derrubar o MFA atual — D-010).
- `codigos_de_recuperacao.criado_em timestamptz NOT NULL`.
- `dispositivos.chave_publica_auditoria text NOT NULL` (Ed25519, base64, 32 bytes): enviada pelo app em `POST /auth/login/concluir` e usada para validar a assinatura dos lotes de auditoria (UC-14, RN-39).
- `auditoria_de_acesso.hash text NOT NULL` (hash do próprio registro) e `auditoria_de_acesso.id_origem uuid UNIQUE NULL` (id gerado no app, para idempotência do lote).
- Gatilho que impede `UPDATE`/`DELETE` em `auditoria_de_acesso` (RN-39 append-only).

### D-007 — E-mail transacional via SMTP genérico e token colado no app
- **Decisão**: adaptador `SmtpEnviadorDeEmail` com `nodemailer`, configurado por env (funciona com qualquer provedor SMTP; DT-16 continua em aberto só quanto ao provedor). O e-mail traz o **token de redefinição em texto** e um link `URL_REDEFINICAO_SENHA?token=...`; no app, a tela "Redefinir senha" tem campo para colar o token. Sem deep link no MVP.

### D-008 — Reautenticação no servidor para ações sensíveis
- **Decisão**: `RevogarDispositivo` (UC-09) e `RegenerarCodigosDeRecuperacao` (UC-13) exigem `codigoMfa` (TOTP válido, sujeito a RN-10) no corpo da requisição. `TrocarSenha` (UC-10) e `ReconfigurarMfa` (UC-16) exigem `senhaAtual`. Falha → `ReautenticacaoNecessaria` (403). A reautenticação **local** (RN-29, UL-07) continua sendo exigida pelo app antes de chamar esses endpoints.

### D-009 — Formato canônico dos registros de auditoria (v1)
- `canonico = ["v1", id, ocorridoEm, tipo, usuarioId ?? "", dispositivoId ?? "", detalheCanonico, hashAnterior ?? ""].join("|")`
- `ocorridoEm`: ISO 8601 UTC com milissegundos e `Z` (`2026-10-13T12:00:00.000Z`).
- `detalheCanonico`: JSON compacto com chaves em ordem alfabética; valores só `string`, inteiro, `boolean` ou `null` (sem aninhamento, sem float).
- `hash = sha256_hex(utf8(canonico))` (hex minúsculo). `assinatura = base64(ed25519_sign(utf8(hash)))`.
- **Vetor de teste** (chave privada Ed25519 = semente `0102…1f20`, chave pública base64 `ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=`):
  - R1: id `7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01`, `2026-10-13T12:00:00.000Z`, tipo `desbloqueio-local-ok`, usuário `11111111-1111-4111-8111-111111111111`, dispositivo `22222222-2222-4222-8222-222222222222`, detalhe `{"metodo":"senha"}`, hashAnterior nulo → hash `b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a`, assinatura `GF3Oyr16Q05pZ0AsNlDUcFQrJ6s3NYfAjjjn1iD4HI9YY1FkG+YBhkPSKtvbSn9VKXHB+B3g6pEYjLhxMFWlAg==`.
  - R2: id `…0c02`, `2026-10-13T12:05:30.250Z`, tipo `desbloqueio-local-falhou`, mesmos ids, detalhe `{"tentativa":3,"metodo":"senha"}` (canonizado como `{"metodo":"senha","tentativa":3}`), hashAnterior = hash de R1 → hash `c7edbcc06f8a1c8cc116d7c219e116416d096d1f2b7c5f6a4d1fdb93a415c215`, assinatura `5fKIHaVqujfDRkxeXhrycN9Uq2Rt4PfWIRmFEoyVAz2gaaV6cUhdlp6PpIOUNwwEZfXyMz67mfVfe54Lr6yqCQ==`.
- **Motivo**: TypeScript (servidor) e Rust (app) precisam produzir bytes idênticos.

### D-010 — Novo caso de uso UC-16 `ReconfigurarMfa`
- **Decisão**: RN-34 ("perdeu o autenticador: entra com código de recuperação e reconfigura o MFA") vira dois endpoints autenticados: iniciar (exige `senhaAtual`, grava segredo **pendente**) e confirmar (código do novo segredo; troca o segredo, gera 10 novos códigos). O MFA atual continua valendo até a confirmação.
- **Motivo**: sem segredo pendente, abandonar a reconfiguração deixaria a conta exigindo "configurar MFA" com só a senha (rebaixamento de segurança).

### D-011 — Erros e eventos adicionais
- Erros novos: `EmailInvalido` (422), `DesafioInvalido` (401), `TokenDeRedefinicaoInvalido` (401), `MfaJaConfigurado` (409), `ProprietarioJaExiste` (409), `UsuarioNaoEncontrado` (404), `DispositivoNaoEncontrado` (404), `AuditoriaInvalida` (422). Erro de infraestrutura `ConflitoDeConcorrencia` (409).
- `ContaDesativada` responde **401 com o mesmo corpo de `CredenciaisInvalidas`** (RN-12; a tabela §6.6 da SPEC não o mapeava).
- O evento de revogação de dispositivo chama-se `DispositivoFoiRevogado` (tipo `'DispositivoRevogado'`) para não colidir com o erro `DispositivoRevogado`.
- Eventos novos: `CodigosDeRecuperacaoRegenerados`, `UsuarioDesativado`, `AcessoRedefinidoAdministrativamente`.

### D-012 — Validação e configuração sem bibliotecas extras do Nest
- **Decisão**: validação de entrada HTTP e de variáveis de ambiente com `zod` v4 (pipe próprio). Sem `class-validator` e sem `@nestjs/config`: `.env` é carregado em `main.ts` com `process.loadEnvFile()` (Node ≥ 20.12) somente se o arquivo existir.

### D-013 — Formato de segredos opacos
- Códigos de recuperação: 80 bits, Crockford base32, formato `XXXX-XXXX-XXXX-XXXX`; guardados como `sha256_hex` da forma normalizada (maiúsculas, sem `-`/espaços, `O→0`, `I→1`, `L→1`).
- Refresh token e token de redefinição: 32 bytes aleatórios em `base64url`; guardados como `sha256_hex`.
- Segredo TOTP: cifrado com AES-256-GCM no formato `0x01 || iv(12) || cifrado || tag(16)`, AAD `identidade.mfa.v1`.

### D-014 — Expiração da sessão é absoluta
- A `SessaoDeLogin` expira 30 dias após a criação; a rotação do refresh **não** estende o prazo (fiel ao código de referência da SPEC §5.2).

### D-015 — `node_modules` fora do controle de versão
- `backend/node_modules` (45.509 arquivos) foi commitado em `9d17971`. Será removido do índice (sem apagar do disco) e um `.gitignore` na raiz passa a ignorar `node_modules/`, `dist/`, `target/` e `.env`.
