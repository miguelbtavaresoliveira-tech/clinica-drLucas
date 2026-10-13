# Arquitetura Técnica — Decisões, Ajustes e Riscos (v1)

> Base: as sugestões de stack recebidas, o PRD v8 e o modelo de domínio. Para cada sugestão: o que adotar, o que ajustar e por quê. Itens marcados como **verificado** foram conferidos em documentação pública (fontes no final).

---

## 1. Resumo da stack

| Camada | Escolha | Status |
| --- | --- | --- |
| App desktop | **Tauri 2 + React (TypeScript)** | Adotada |
| Backend | **NestJS**, monólito modular (um módulo por contexto) | Adotada |
| Banco local | **SQLite criptografado (SQLCipher)** | Adotada, com ressalva sobre o plugin (seção 3) |
| Banco central | Não definido. Sugestão: **PostgreSQL** | **Em aberto** |
| Monorepo | **Nx ou Turborepo** com pacote `@clinica/domain` | Adotada, com ajuste (2.1) |
| Sincronização | Fila de mutações (outbox) + pull do servidor | Adotada, com ajustes (2.2) |
| Eventos entre módulos | `@nestjs/event-emitter` | Adotada, com ajuste (2.4) |
| Mensagens automáticas | No servidor, nunca no app | Adotada; fila simplificada (2.5) |
| Estado do frontend | SQLite local como fonte de verdade + store leve só para UI | Ajuste (2.4) |

---

## 2. Avaliação das sugestões

### 2.1 Monorepo e pacote compartilhado ✅ com um ajuste

Certo: uma única linguagem ubíqua em TypeScript, consumida pelo app e pela API.

**Ajuste:** o app precisa aplicar as regras **offline**, então o pacote compartilhado não pode ter só interfaces, enums e VOs. Ele deve conter também o **comportamento dos agregados e as políticas**: Política de Ausência, bloqueio de horário duplicado, "quiropraxia exige avaliação", valor travado após execução, janela de 3 dias. O servidor **revalida tudo** e nunca confia no cliente.

```
apps/
  desktop/        Tauri + React
  api/            NestJS
packages/
  domain/         regras puras, sem React, Nest ou Tauri
    compartilhado/   Dinheiro, CPF, Percentual (só VOs genéricos)
    agenda/ atendimento-clinico/ planos-e-cobranca/ ...
```

Use `eslint-plugin-boundaries` também aqui: `domain` não importa nada de fora, e um contexto não importa de outro (só do `compartilhado`).

### 2.2 Sincronização offline (outbox) ⚠️ precisa de ajustes

A ideia central (gravar o estado e o evento na mesma transação, enviar em lote, servidor idempotente) está correta. Problemas a corrigir:

1. **Falta o pull (servidor → app).** A sugestão cobre só o envio. Mas o PRD exige Fluxo de Evolução atualizado a cada conexão (defasagem máxima de \~2 dias) e Agenda/Financeiro offline, possivelmente em mais de um computador. Adicione um cursor por dispositivo e um endpoint `GET /sync/changes?since=<cursor>`, aplicado localmente numa transação.
2. **Ordenar por `created_at` é frágil**, pois depende do relógio do computador. Use um número sequencial local monotônico (`seq`) mais `device_id`. Eventos do mesmo agregado devem ser aplicados em ordem; se um falha, interrompa os seguintes daquele agregado.
3. **Idempotência sem transação.** No exemplo do servidor, executar o comando e gravar o evento processado são dois passos separados; uma queda entre eles faz o evento ser reprocessado. Faça os dois **na mesma transação** e com chave única no `event_id`.
4. **Evento preso em `PROCESSING`.** Se o app fecha no meio do envio, ele nunca volta. Ao iniciar, devolva `PROCESSING` para `PENDING`.
5. **Atomicidade no cliente.** O exemplo usa `db.transaction(...)` no JavaScript. Não consegui confirmar essa API no plugin SQL oficial do Tauri. Para garantir "estado + outbox na mesma transação", faça a gravação dentro de **um único comando Rust** (ver seção 3).
6. **Mídia não cabe no outbox JSON.** Fotos e vídeos precisam de uma **fila de upload própria**: arquivo local criptografado, envio em partes com retomada, e só ficam "sincronizados" quando o upload termina. Foto tirada em atendimento domiciliar sem internet é um caso real.
7. **Dois modelos de conflito misturados.** A sugestão usa delta por campo (que permitiria mesclar campos diferentes) e controle de versão do agregado (que marca conflito em qualquer divergência). Isso contradiz a decisão do PRD de mostrar as duas versões inteiras lado a lado. **Proposta:** conflito **por agregado**. Se a versão-base do evento diverge da versão do servidor, o resultado é `CONFLICT` e a UI mostra as duas versões completas. O histórico append-only de revisões continua existindo, mas sem merge automático por campo no MVP. O cenário da "secretária" na sugestão é de multiusuário, que só entra daqui a \~2 anos.
8. **Tipos do exemplo não batem com o domínio.** `aggregate_type = 'AtendimentoClinico'` é nome de contexto, não de agregado, e `nivel_dor` pertence à **Sessão**, não ao Tratamento. Use `Avaliacao`, `FluxoDeEvolucao`, `Sessao`, `Agendamento`...
9. **Auditoria.** O PRD pede logs locais de auditoria. Não apague o outbox como único rastro: mantenha `SYNCED` ou uma tabela de auditoria separada.

**Esquema revisado:**

```sql
-- cliente (SQLite)
CREATE TABLE sync_outbox (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,  -- ordem local monotônica
  id             TEXT NOT NULL UNIQUE,               -- UUID do evento (idempotência)
  device_id      TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,                      -- 'Avaliacao', 'Sessao', ...
  aggregate_id   TEXT NOT NULL,
  base_version   INTEGER NOT NULL,                   -- versão do agregado em que a mudança se baseou
  event_type     TEXT NOT NULL,
  payload        TEXT NOT NULL,                      -- JSON da intenção (delta)
  occurred_at    TEXT NOT NULL,                      -- ISO UTC, informativo
  status         TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING | PROCESSING | SYNCED | CONFLICT | FAILED
  retry_count    INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT
);
CREATE TABLE sync_state (device_id TEXT PRIMARY KEY, last_server_seq INTEGER NOT NULL DEFAULT 0);

-- servidor (Postgres)
-- processed_events(event_id PK, device_id, processed_at)
-- change_log(server_seq BIGSERIAL, aggregate_type, aggregate_id, version, payload)
```

### 2.3 Monólito modular no NestJS ✅ com um cuidado

Certo: um `@Module()` por contexto e `eslint-plugin-boundaries` para impedir atalhos.

**Cuidado com o ORM.** O Prisma gera um único client para todo o schema, então o isolamento por módulo ficaria só na convenção. TypeORM, Drizzle ou Kysely permitem que cada módulo declare suas próprias entidades e repositórios (avaliar). Em qualquer caso: **um schema PostgreSQL por contexto** e proibição de join entre schemas.

### 2.4 Eventos ⚠️ ajuste para eventos financeiros

O `@nestjs/event-emitter` é **em memória e não durável**. Se a Agenda gravar o atendimento e o handler da Cobrança falhar logo depois, o evento se perde: o sinal não é abatido, a multa não é aplicada.

**Ajuste:** para eventos com consequência financeira (`AtendimentoRealizado`, `FaltaRegistrada`, `PagamentoRegistrado`), use um **outbox transacional no servidor**: o evento é gravado na mesma transação do agregado e um despachador o entrega aos handlers com retry e idempotência. O event-emitter pode ser o mecanismo de entrega interno. Eventos sem risco (ex.: notificação visual) podem ir direto.

**Frontend:** como o SQLite local é a fonte de verdade, a UI deve ler dele com consultas reativas, sem duplicar dados num store global. Zustand ou Redux ficam só para estado de interface (filtros, modais, sessão). Os eventos do Tauri servem para avisos da sincronização (ex.: "conflito detectado").

### 2.5 Mensagens e lembretes em background ✅ com simplificação

Certo: responsabilidade 100% do servidor, porque o app pode estar fechado.

**Ajustes:**

- `@nestjs/bull` é a versão legada; a atual é `@nestjs/bullmq`. Além disso, BullMQ exige Redis, que é infraestrutura extra para \~20 atendimentos por mês. **Recomendação:** tabela `mensagens_programadas` no PostgreSQL + `@nestjs/schedule` rodando a cada minuto com `SELECT ... FOR UPDATE SKIP LOCKED`. Se crescer, troca-se por fila.
- **Agendamento criado offline:** se ele só sobe para o servidor depois do horário da mensagem (ex.: confirmação 16h antes), a mensagem se perde. Definir a regra: enviar na hora ou descartar.
- O cancelamento da repescagem quando chega `AgendamentoCriado` pressupõe uma regra que **ainda está em aberto** no domínio (cancelar a mensagem se o paciente já fechou).
- O **canal** (WhatsApp Business API ou provedor) continua em aberto e é pré-requisito do envio automático.

---

## 3. Riscos técnicos verificados

| Risco | O que descobri | Plano |
| --- | --- | --- |
| **Biometria no desktop** | O plugin oficial `tauri-plugin-biometric` é registrado só para Android e iOS (**verificado** na documentação do Tauri) | Spike: código Rust próprio com as APIs nativas (Touch ID, Windows Hello) ou crate comunitário. **Plano B:** senha mestre + chave no Keychain/Credential Manager (crate `keyring`), biometria numa segunda fase |
| **SQLCipher no Tauri** | O plugin SQL oficial (sqlx) não traz criptografia por padrão. Existem PRs, forks e plugins comunitários em estágio inicial. Há projeto Tauri que cifra o banco acessando o SQLite pelo lado Rust com `rusqlite` e a feature `bundled-sqlcipher` | **Caminho recomendado:** acessar o banco só pelo Rust (`rusqlite` + SQLCipher) e expor comandos ao React. Isso também resolve a transação atômica (2.2, item 5) |
| **Fotos e vídeos** | SQLCipher cifra só o banco, não os arquivos | Cifrar os arquivos locais separadamente, com chave guardada no Keychain/Credential Manager |
| **Distribuição** | App desktop precisa de assinatura para instalar sem alertas | Conta Apple Developer (notarização) e certificado de assinatura no Windows; configurar auto-update do Tauri |

---

## 4. Decisões técnicas ainda abertas

| # | Decisão | Sugestão inicial |
| --- | --- | --- |
| 1 | Banco central | PostgreSQL, um schema por contexto |
| 2 | Hospedagem do servidor | Região Brasil (LGPD), com backup automático e criptografia em repouso |
| 3 | Autenticação da API | JWT de acesso + refresh; MFA por TOTP; refresh token guardado no Keychain/Credential Manager |
| 4 | Armazenamento de arquivos no servidor | Storage compatível com S3, região Brasil, criptografado |
| 5 | Assinatura digital do Contrato clínica | Plataforma de assinatura eletrônica **ou** fluxo próprio (aceite + data/hora + hash) |
| 6 | Geração do PDF do laudo | No servidor; decidir se precisa funcionar offline |
| 7 | Canal de mensagens | WhatsApp Business API via provedor homologado (**bloqueia** a mensageria automática) |
| 8 | Chave do banco local | Derivada/guardada no Keychain/Credential Manager, liberada só após autenticação |
| 9 | Datas e fuso | Gravar em UTC, exibir em America/Sao_Paulo |
| 10 | Logs | Nunca registrar conteúdo clínico nos logs técnicos |
| 11 | Testes | Domínio testável sem infraestrutura; testes dedicados da Política de Ausência e das regras de agenda |

---

## 5. Spikes sugeridos (antes de construir os contextos)

1. **Banco local:** Rust + `rusqlite` + SQLCipher, um comando transacional (estado + outbox) e a chave no Keychain/Credential Manager.
2. **Biometria desktop** no Mac e no Windows, ou validar o Plano B.
3. **Sincronização:** push e pull com dois dispositivos simulados, idempotência e um conflito provocado.
4. **Upload de mídia offline** com retomada.
5. **Mensagem programada:** tabela + cron com um provedor de WhatsApp em sandbox.

---

*Fontes consultadas: documentação do plugin biometric do Tauri 2 (v2.tauri.app/plugin/biometric), README do plugin comunitário tauri-plugin-libsql (docs.rs), wiki de um projeto Tauri com `rusqlite` + SQLCipher (github.com/Debaq/Dird), PR de suporte a SQLCipher no plugin SQL (github.com/tauri-apps/plugins-workspace/pull/1441).*