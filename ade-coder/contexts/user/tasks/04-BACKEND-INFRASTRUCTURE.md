# 📋 04 — Backend: camada Infrastructure

> **Objetivo**: Implementar os adaptadores reais das portas: PostgreSQL via Drizzle (schema `identidade`), Argon2id, TOTP (otplib), AES-256-GCM, JWT, SMTP, relógio, barramento, hash e assinatura Ed25519.
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: drizzle-orm + pg, argon2, otplib 12.0.1, @nestjs/jwt, nodemailer, node:crypto, Vitest (unit `*.spec.ts`; integração `*.int-spec.ts` com Postgres real).
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-001, D-006, D-007, D-009, D-013), SPEC §4 e §7.1.

## Regras desta camada
- Pasta: `backend/src/identidade-e-acesso/infrastructure/`. Pode importar `domain/` e `application/`. **Não** importa `interface/`.
- Nenhum adaptador escreve segredo, token, senha, código, e-mail ou hash em log. Use `new Logger('<NomeDaClasse>')` de `@nestjs/common` só para mensagens fixas.
- Erros de biblioteca nunca vazam detalhes: capture e relance um `Error` com mensagem fixa (ou o erro de domínio indicado).
- Testes de integração exigem `docker compose up -d` (TASK-004) e `.env` com `DATABASE_URL_TESTE`.

## 🎯 Mapa de Arquivos

| Arquivo | Tarefa |
|---|---|
| `infrastructure/persistencia/schema.ts`, `drizzle/**` (gerado), `persistencia/conexao.ts` (editar), `test/identidade-e-acesso/int/{global-setup,banco-de-teste}.ts` (editar), `test/identidade-e-acesso/int/schema.int-spec.ts` | TASK-040 |
| `infrastructure/adaptadores/{argon2id-hasher,gerador-de-codigos-de-recuperacao,sha256-calculadora-de-hash,ed25519-verificador-de-assinatura}.ts` | TASK-041 |
| `infrastructure/adaptadores/{otplib-servico-totp,aes-gcm-cofre-de-segredos}.ts` | TASK-042 |
| `infrastructure/adaptadores/jwt-emissor-de-tokens.ts` | TASK-043 |
| `infrastructure/adaptadores/{relogio-do-sistema,barramento-em-processo}.ts`, `infrastructure/seguranca/senhas-comuns.ts`, `infrastructure/config/politica-de-acesso.config.ts` | TASK-044 |
| `infrastructure/adaptadores/{smtp-enviador-de-email,enviador-de-email-desabilitado}.ts` | TASK-045 |
| `infrastructure/persistencia/{mapeadores,erros-de-banco}.ts`, `persistencia/repositorios/{usuario,dispositivo,sessao-de-login}-repositorio-drizzle.ts` | TASK-046 |
| `persistencia/repositorios/{desafio-de-login,token-de-redefinicao,auditoria}-repositorio-drizzle.ts`, `persistencia/{fabrica-de-repositorios,drizzle-unidade-de-trabalho}.ts` | TASK-047 |

---

### TASK-040: Schema Drizzle `identidade`, migrations e trava append-only
- **Status**: `[x] Aprovada` (verificada pelo Claude contra Postgres 17 real: 7 tabelas, índice parcial, trigger append-only (UPDATE/DELETE/TRUNCATE), checks e FKs; 11 testes de integração. Desvio: drizzle-kit generate chamado direto (pnpm run db:gerar -- não repassa --name))
- **Depende de**: TASK-004
- **Objetivo**: Traduzir o esquema SQL da SPEC §7.1 (+ colunas D-006) para Drizzle, gerar as migrations e garantir no banco que a auditoria é append-only (RN-39).
- **Arquivos permitidos**:
  - `backend/src/identidade-e-acesso/infrastructure/persistencia/schema.ts` (novo)
  - `backend/src/identidade-e-acesso/infrastructure/persistencia/conexao.ts` (editar: passar `{ schema }` ao `drizzle` e tipar `NodePgDatabase<typeof schema>`)
  - `backend/drizzle/**` (gerado pelo drizzle-kit + 1 migration custom)
  - `backend/test/identidade-e-acesso/int/global-setup.ts`, `backend/test/identidade-e-acesso/int/banco-de-teste.ts` (editar)
  - `backend/test/identidade-e-acesso/int/schema.int-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato** (`schema.ts`):
  ```ts
  export const identidade = pgSchema('identidade');
  const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({ dataType: () => 'bytea', toDriver: (v) => Buffer.from(v), fromDriver: (v) => new Uint8Array(v) });
  const instante = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });
  export const usuarios = identidade.table('usuarios', { ... }, (t) => [ check(...situacao in ('ativo','desativado')) ]);
  export const codigosDeRecuperacao = identidade.table('codigos_de_recuperacao', { ... }, (t) => [ index().on(t.usuarioId) ]);
  export const dispositivos = identidade.table('dispositivos', { ... }, (t) => [ index().on(t.usuarioId), check(plataforma in ('macos','windows')), check(situacao in ('ativo','revogado')) ]);
  export const sessoesDeLogin = identidade.table('sessoes_de_login', { ... }, (t) => [
    uniqueIndex('uma_sessao_ativa_por_dispositivo').on(t.dispositivoId).where(sql`${t.situacao} = 'ativa'`),
    index().on(t.usuarioId), index().on(t.refreshAtualHash), index().on(t.refreshAnteriorHash), check(situacao in ('ativa','revogada')) ]);
  export const desafiosDeLogin = identidade.table('desafios_de_login', { ... });
  export const tokensDeRedefinicao = identidade.table('tokens_de_redefinicao', { ... }, (t) => [ index().on(t.usuarioId) ]);
  export const auditoriaDeAcesso = identidade.table('auditoria_de_acesso', { ... }, (t) => [ index().on(t.dispositivoId, t.id), check(origem in ('servidor','app')) ]);
  ```
  Colunas: **exatamente** as da SPEC §7.1 (nomes snake_case no banco, camelCase no TS), mais:
  - `usuarios.mfa_segredo_pendente_cifrado bytea NULL`
  - `codigos_de_recuperacao.criado_em timestamptz NOT NULL`
  - `dispositivos.chave_publica_auditoria text NOT NULL`
  - `auditoria_de_acesso.hash text NOT NULL`, `auditoria_de_acesso.id_origem uuid NOT NULL UNIQUE`
  - `usuarios.papeis` = `text('papeis').array().notNull()`; `mfa_ultimo_passo` = `bigint(..., { mode: 'number' })`; `auditoria_de_acesso.id` = `bigserial(..., { mode: 'number' }).primaryKey()`; `detalhe` = `jsonb().notNull().default({})`; `ip` = `inet()`.
  Migration custom `auditoria_append_only` (conteúdo exato):
  ```sql
  CREATE OR REPLACE FUNCTION identidade.impedir_alteracao_de_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'auditoria_de_acesso é append-only';
  END;
  $$;
  --> statement-breakpoint
  CREATE TRIGGER auditoria_append_only BEFORE UPDATE OR DELETE ON identidade.auditoria_de_acesso
    FOR EACH ROW EXECUTE FUNCTION identidade.impedir_alteracao_de_auditoria();
  --> statement-breakpoint
  CREATE TRIGGER auditoria_sem_truncate BEFORE TRUNCATE ON identidade.auditoria_de_acesso
    FOR EACH STATEMENT EXECUTE FUNCTION identidade.impedir_alteracao_de_auditoria();
  ```
  `banco-de-teste.ts` ganha:
  ```ts
  export async function limparBanco(db: NodePgDatabase<typeof schema>): Promise<void>;
  // numa transação: ALTER TABLE identidade.auditoria_de_acesso DISABLE TRIGGER auditoria_sem_truncate;
  //                 TRUNCATE identidade.auditoria_de_acesso, identidade.tokens_de_redefinicao, identidade.desafios_de_login,
  //                          identidade.sessoes_de_login, identidade.codigos_de_recuperacao, identidade.dispositivos, identidade.usuarios RESTART IDENTITY CASCADE;
  //                 ALTER TABLE identidade.auditoria_de_acesso ENABLE TRIGGER auditoria_sem_truncate;
  ```
  `global-setup.ts`: depois do `SELECT 1`, executa `DROP SCHEMA IF EXISTS identidade CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE;` e `migrate(db, { migrationsFolder: './drizzle' })` (de `drizzle-orm/node-postgres/migrator`).
- **Passo a passo**:
  1. Escrever `schema.ts`; ajustar `conexao.ts`.
  2. `pnpm run db:gerar -- --name identidade_inicial` (gera `drizzle/0000_identidade_inicial.sql`; confira que contém `CREATE SCHEMA "identidade"` e o índice parcial com `WHERE`).
  3. `pnpm exec drizzle-kit generate --custom --name auditoria_append_only` e colar o SQL acima no arquivo criado.
  4. Atualizar `global-setup.ts` e `banco-de-teste.ts`; escrever o teste.
- **Testes obrigatórios** (`schema.int-spec.ts`):
  1. as 7 tabelas existem em `information_schema.tables` com `table_schema = 'identidade'`;
  2. inserir duas sessões `ativa` para o mesmo dispositivo falha com código `23505`; uma `ativa` + uma `revogada` passa;
  3. `UPDATE` e `DELETE` em `auditoria_de_acesso` falham com mensagem contendo `append-only`;
  4. `situacao = 'xyz'` em `usuarios` falha (check);
  5. `limparBanco` esvazia tudo, inclusive auditoria.
- **Requisitos de segurança**: auditoria imutável no próprio banco; constraints de domínio no banco (defesa em profundidade); sem dado sensível em claro (só hashes e `bytea` cifrado).
- **Critérios de aceite**: [ ] SQL gerado revisável no diff · [ ] 5 testes passam · [ ] `pnpm run build` passa
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm run test:int
  pnpm test && pnpm run build
  ```
- **Fora de escopo**: repositórios; usuários/roles de banco de produção (registrar em Bloqueios se notar necessidade).
- **Convenção de commit**: `feat(TASK-040): add identidade schema, migrations and append-only audit trigger`

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

### TASK-041: Adaptadores criptográficos — Argon2id, códigos de recuperação, SHA-256, Ed25519
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 449 testes, tsc, oxlint e build ESM limpos. Desvio: argon2 grava m=19456,p=1,t=2 (ordem diferente do texto da tarefa); spec valida cada parâmetro)
- **Depende de**: TASK-020
- **Objetivo**: Implementar `HasherDeSenha` (RN-06, DT-02), `GeradorDeCodigosDeRecuperacao` (D-013), `CalculadoraDeHash` e `VerificadorDeAssinatura` (D-009).
- **Arquivos permitidos** (novos, em `infrastructure/adaptadores/`): `argon2id-hasher.ts`, `gerador-de-codigos-de-recuperacao.ts`, `sha256-calculadora-de-hash.ts`, `ed25519-verificador-de-assinatura.ts` e um `.spec.ts` para cada
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface ParametrosArgon2 { memoryCost: number; timeCost: number; parallelism: number; }
  export const PARAMETROS_ARGON2_PADRAO: ParametrosArgon2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }; // OWASP: 19 MiB, t=2, p=1
  export class Argon2idHasher implements HasherDeSenha {
    constructor(parametros?: ParametrosArgon2);
    gerar(senha): Promise<HashDeSenha>;            // argon2.hash(senha, { type: argon2.argon2id, ...parametros })
    conferir(senha, hash): Promise<boolean>;       // argon2.verify(hash.valor, senha); qualquer exceção → false
    conferirFicticio(senha): Promise<void>;        // na 1ª chamada gera (e guarda em memória) o hash de 32 bytes aleatórios; depois sempre argon2.verify(ficticio, senha) e ignora o resultado
  }
  export class GeradorDeCodigosCrockford implements GeradorDeCodigosDeRecuperacao {
    gerar(quantidade): { codigo: string; hash: string }[];   // cada código: randomBytes(10) → 16 caracteres Crockford base32 → 'XXXX-XXXX-XXXX-XXXX'
    hashDe(codigo): string;                                  // normaliza (maiúsculas; remove '-' e espaços; O→0, I→1, L→1) e sha256 hex
  }
  // alfabeto Crockford: '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  export class Sha256CalculadoraDeHash implements CalculadoraDeHash { sha256Hex(texto: string): string; }  // utf8, hex minúsculo
  export class Ed25519VerificadorDeAssinatura implements VerificadorDeAssinatura {
    verificarEd25519(mensagem, assinaturaB64, chavePublicaB64): boolean;
    // chave: base64 → exatamente 32 bytes; SPKI = Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), chave]);
    // crypto.verify(null, Buffer.from(mensagem,'utf8'), createPublicKey({ key: spki, format: 'der', type: 'spki' }), assinatura(64 bytes));
    // qualquer exceção ou tamanho errado → false
  }
  ```
- **Testes obrigatórios**:
  - Argon2id: hash começa com `$argon2id$v=19$m=19456,t=2,p=1$`; `conferir` certo → true, errado → false, hash corrompido → false (sem lançar); dois `gerar` da mesma senha diferem (salt); `conferirFicticio` não lança e chamado 2× reutiliza o mesmo hash (espie `argon2.hash` com `vi.spyOn` — 1 chamada).
  - Códigos: `gerar(10)` → 10 códigos distintos casando `/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/`; `hash === hashDe(codigo)`; **vetores**: `hashDe('abcd-1234-efgh-5678') === 'be105af532593b07b857dbbb0012fc12a939efb515656aa111fc0120993c0609'`; `hashDe('qrst 0vlx-yzoi-2345') === '19948b23e8529cea4336f5ee159cd5d7d41ef1720077d8ad7d3c3128688ac779'`.
  - SHA-256: `sha256Hex('token-de-teste') === '20fd0ba9f641280a22f72a1145a0892b225fb0b2fdd75a53ba4f83f4596c72ae'`; canônico R1 do D-009 → `b68a202f...508a`.
  - Ed25519: assinaturas R1 e R2 do D-009 válidas com a chave do vetor; mensagem alterada → false; assinatura base64 inválida → false; chave com 31 bytes → false.
- **Requisitos de segurança**: parâmetros Argon2id OWASP; tempo constante para e-mail inexistente; aleatoriedade só de `node:crypto`.
- **Critérios de aceite**: [ ] vetores batem · [ ] nenhum `Math.random` (`grep -rn "Math.random" src/identidade-e-acesso/infrastructure` vazio)
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/infrastructure/adaptadores
  grep -rn "Math.random" src/identidade-e-acesso/infrastructure ; echo "exit=$?"
  ```
- **Fora de escopo**: TOTP e JWT.
- **Convenção de commit**: `feat(TASK-041): add argon2id hasher, recovery codes, sha256 and ed25519 adapters`

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

### TASK-042: `OtplibServicoTotp` e `AesGcmCofreDeSegredos`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 449 testes, tsc, oxlint e build ESM limpos. Desvio: argon2 grava m=19456,p=1,t=2 (ordem diferente do texto da tarefa); spec valida cada parâmetro)
- **Depende de**: TASK-041
- **Objetivo**: TOTP RFC 6238 com janela ±1 e bloqueio de passo repetido (RN-10, DT-03) e cifra do segredo em repouso (DT-03, D-013).
- **Arquivos permitidos** (novos, em `infrastructure/adaptadores/`): `otplib-servico-totp.ts`, `aes-gcm-cofre-de-segredos.ts` e seus `.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export const EMISSOR_TOTP = 'EVO Clínica';
  export class OtplibServicoTotp implements ServicoTotp {
    constructor(relogio: Relogio);
    novoSegredo(): string;                                   // authenticator.generateSecret(20) → base32 (160 bits)
    urlDoAutenticador(segredo, email): string;              // authenticator.keyuri(email, EMISSOR_TOTP, segredo)
    verificar(segredo, codigo, ultimoPasso): ResultadoTotp;
  }
  // verificar:
  //   codigo não casa /^\d{6}$/ → { valido: false, passo: -1 }
  //   agoraMs = relogio.agora().getTime();
  //   delta = authenticator.clone({ step: 30, digits: 6, window: 1, epoch: agoraMs }).checkDelta(codigo, segredo);
  //   delta === null → { valido: false, passo: -1 }
  //   passo = Math.floor(agoraMs / 30_000) + delta;
  //   ultimoPasso !== null && passo <= ultimoPasso → { valido: false, passo }
  //   senão { valido: true, passo }
  export class AesGcmCofreDeSegredos implements CofreDeSegredos {
    constructor(chave: Uint8Array);                          // length !== 32 → Error('Chave de cifra inválida')
    cifrar(texto): Promise<Uint8Array>;                     // [0x01] + iv(12, randomBytes) + cifrado + tag(16); AAD = Buffer.from('identidade.mfa.v1')
    decifrar(dados): Promise<string>;                       // versão ≠ 0x01 ou length < 30 → Error('Segredo cifrado em formato desconhecido'); falha de autenticação → Error('Falha ao decifrar segredo')
  }
  ```
  Import: `import { authenticator } from 'otplib';`. Se o Node reclamar de export nomeado em CommonJS, use `import otplib from 'otplib'; const { authenticator } = otplib;` e registre em Desvios. Confirme nos tipos do otplib 12 que `epoch` é em **milissegundos**; se for em segundos, ajuste e registre.
- **Testes obrigatórios**:
  - TOTP com **vetores RFC 6238** (segredo base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`, `RelogioFixo`): em `59 s` o código `287082` é válido com `passo 1`; em `1111111109 s` → `081804` (passo `37037036`); em `1234567890 s` → `005924` (passo `41152263`);
  - janela: em `89 s`, `287082` válido com passo 1 (delta −1); em `119 s` inválido;
  - **passo repetido**: `verificar(seg, '287082', 1)` em `59 s` → `valido: false`;
  - `'28708'`, `'abcdef'`, `'2870822'` → inválidos sem lançar;
  - `novoSegredo()` tem 32 caracteres base32; URL começa com `otpauth://totp/` e contém `issuer=EVO%20Cl` .
  - Cofre: ida e volta; duas cifras do mesmo texto diferem; alterar 1 byte do cifrado → lança `'Falha ao decifrar segredo'`; chave diferente → lança; versão `0x02` → lança formato; chave de 31 bytes no construtor → lança; a mensagem de erro não contém o texto original.
- **Requisitos de segurança**: segredo TOTP nunca sai do cofre em claro exceto na resposta de UC-03/UC-16; AAD fixo amarra o uso; IV aleatório por cifra.
- **Critérios de aceite**: [ ] vetores RFC passam · [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-041.
- **Fora de escopo**: QR code.
- **Convenção de commit**: `feat(TASK-042): add otplib TOTP service and AES-GCM secret vault`

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

### TASK-043: `JwtEmissorDeTokens`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 449 testes, tsc, oxlint e build ESM limpos. Desvio: argon2 grava m=19456,p=1,t=2 (ordem diferente do texto da tarefa); spec valida cada parâmetro)
- **Depende de**: TASK-041
- **Objetivo**: Access token JWT HS256 de 15 min, desafio de login assinado com segredo separado e tokens opacos (DT-04, D-013).
- **Arquivos permitidos**: `infrastructure/adaptadores/jwt-emissor-de-tokens.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface ConfiguracaoDoEmissor { accessSegredo: string; desafioSegredo: string; }
  export class JwtEmissorDeTokens implements EmissorDeTokens {
    constructor(config: ConfiguracaoDoEmissor, relogio: Relogio, jwt?: JwtService /* padrão: new JwtService() */);
  }
  ```
  | Método | Implementação |
  |---|---|
  | `emitirAccess(d, expiraEm)` | `jwt.sign({ sub: d.usuarioId, did: d.dispositivoId, sid: d.sessaoId, pap: d.papeis, typ: 'access', iat: s(agora), exp: s(expiraEm) }, { secret: accessSegredo, algorithm: 'HS256', issuer: 'clinica-api', audience: 'clinica-desktop' })` onde `s(d) = Math.floor(d.getTime()/1000)` |
  | `verificarAccess(token)` | `jwt.verify(token, { secret: accessSegredo, algorithms: ['HS256'], issuer: 'clinica-api', audience: 'clinica-desktop', clockTimestamp: s(agora) })`; valida com zod `{ sub: uuid, did: uuid, sid: uuid, pap: array de NomeDePapel não vazio, typ: literal 'access' }`; qualquer falha → `SessaoExpirada` |
  | `gerarTokenOpaco()` | `token = randomBytes(32).toString('base64url')` (43 caracteres); `hash = sha256 hex` |
  | `hashDe(token)` | sha256 hex |
  | `emitirDesafio(usuarioId, expiraEm)` | `id = randomUUID()`; `sign({ sub, jti: id, typ: 'desafio', iat, exp }, { secret: desafioSegredo, algorithm: 'HS256', issuer: 'clinica-api', audience: 'clinica-login' })` |
  | `verificarDesafio(token)` | verify com `desafioSegredo`, `audience: 'clinica-login'`, `algorithms: ['HS256']`, `clockTimestamp`; `typ === 'desafio'`; retorna `{ id: jti, usuarioId: UsuarioId.de(sub) }`; qualquer falha → `DesafioInvalido` |
- **Testes obrigatórios**: ida e volta do access; expirado (relógio além de `exp`) → `SessaoExpirada`; access assinado com o segredo do desafio → `SessaoExpirada`; token com `alg: none` (monte header/payload base64url manualmente, assinatura vazia) → `SessaoExpirada`; payload adulterado → `SessaoExpirada`; `typ: 'desafio'` apresentado como access → `SessaoExpirada`; desafio ida e volta; access apresentado como desafio → `DesafioInvalido`; desafio expirado → `DesafioInvalido`; token opaco tem 43 caracteres, dois diferentes, `hashDe(token) === hash`.
- **Requisitos de segurança**: algoritmo fixado (`algorithms: ['HS256']`) contra *alg confusion*; segredos distintos e audiences distintas para access e desafio; claims validadas por schema.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-041.
- **Fora de escopo**: guard HTTP (TASK-051).
- **Convenção de commit**: `feat(TASK-043): add JWT token issuer`

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

### TASK-044: Relógio, barramento, lista de senhas comuns e política a partir da configuração
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 449 testes, tsc, oxlint e build ESM limpos. Desvio: argon2 grava m=19456,p=1,t=2 (ordem diferente do texto da tarefa); spec valida cada parâmetro)
- **Depende de**: TASK-041
- **Objetivo**: Adaptadores simples restantes e a ponte `Configuracao → PoliticaDeAcesso`.
- **Arquivos permitidos** (novos): `infrastructure/adaptadores/relogio-do-sistema.ts`, `infrastructure/adaptadores/barramento-em-processo.ts`, `infrastructure/seguranca/senhas-comuns.ts`, `infrastructure/config/politica-de-acesso.config.ts` e `.spec.ts` para barramento e política
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export class RelogioDoSistema implements Relogio { agora(): Date { return new Date(); } }   // único `new Date()` sem argumento permitido no backend
  export type AssinanteDeEvento = (evento: EventoDeDominio) => Promise<void>;
  export class BarramentoEmProcesso implements BarramentoDeEventos {
    assinar(tipo: string, assinante: AssinanteDeEvento): void;
    publicar(eventos): Promise<void>;   // para cada evento, chama em sequência os assinantes do seu `tipo`; erro de um assinante é capturado,
                                        // logado com logger.error(`Falha em assinante de ${evento.tipo}`) (sem payload) e NÃO interrompe os demais
  }
  export const SENHAS_COMUNS: readonly string[];   // em minúsculas, exatamente as 42 abaixo
  export function politicaDaConfiguracao(c: Configuracao): PoliticaDeAcesso;   // criarPoliticaDeAcesso({ ...c.politica })
  ```
  `SENHAS_COMUNS`: `123456789012, 1234567890123, 12345678901234, 123123123123, 111111111111, 000000000000, abcdefghijkl, aaaaaaaaaaaa, qwertyuiopas, qwertyuiop12, qwertyuiop123, asdfghjklzxc, 1q2w3e4r5t6y, 1qaz2wsx3edc, password1234, password12345, passwordpassword, senha1234567, senha12345678, senhasenha12, minhasenha123, mudar@123456, iloveyou1234, admin1234567, administrador, administrator, welcome12345, bemvindo1234, fisioterapia, fisioterapia1, fisioterapia123, fisioterapia2024, fisioterapia2025, fisioterapia2026, clinicaevo2024, clinicaevo2024!, evofisioterapia, evofisioterapia1, drlucas123456, lucasdamasceno, coluna123456, brasil123456`
- **Testes obrigatórios**: barramento entrega só aos assinantes do tipo, na ordem; assinante que lança não impede o próximo e o log não contém dados do evento; `politicaDaConfiguracao` com config padrão retorna valores da SPEC §2 e congelados; config com `bloqueioProgressivoMin: [5,1]` lança `DadoInvalido`; `SENHAS_COMUNS.length === 42` e todas em minúsculas.
- **Requisitos de segurança**: logs sem payload de eventos.
- **Critérios de aceite**: [ ] testes passam · [ ] `grep -rn "new Date()" src/identidade-e-acesso | grep -v relogio-do-sistema.ts | grep -v "\.spec\.ts"` vazio
- **Comandos de verificação**: iguais aos da TASK-041 + o `grep` acima.
- **Fora de escopo**: assinantes concretos (nenhum neste contexto).
- **Convenção de commit**: `feat(TASK-044): add clock, in-process event bus, common passwords and policy mapping`

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

### TASK-045: `SmtpEnviadorDeEmail` e `EnviadorDeEmailDesabilitado`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: 455 testes, tsc e oxlint limpos)
- **Depende de**: TASK-044
- **Objetivo**: Enviar o e-mail de redefinição por SMTP genérico (D-007, DT-16) e ter um substituto seguro quando SMTP não estiver configurado (dev/teste).
- **Arquivos permitidos** (novos, em `infrastructure/adaptadores/`): `smtp-enviador-de-email.ts`, `enviador-de-email-desabilitado.ts` e seus `.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export type TransporteDeEmail = Pick<Transporter, 'sendMail'>;
  export class SmtpEnviadorDeEmail implements EnviadorDeEmail {
    constructor(config: ConfiguracaoSmtp, transporte?: TransporteDeEmail);
    // padrão: nodemailer.createTransport({ host, port, secure: seguro, requireTLS: !seguro, auth: { user: usuario, pass: senha } })
    enviarRedefinicaoDeSenha(para, { link, token, expiraEm }): Promise<void>;
  }
  export class EnviadorDeEmailDesabilitado implements EnviadorDeEmail {
    enviarRedefinicaoDeSenha(): Promise<void>;  // logger.warn('SMTP não configurado; e-mail de redefinição não enviado.') — sem destinatário nem token
  }
  ```
  E-mail (somente `text`, **sem** `html`): `from: config.remetente`, `to: para.valor`, `subject: 'Redefinição de senha — EVO Clínica'`, corpo exato:
  ```
  Recebemos um pedido para redefinir a senha da sua conta na EVO Clínica.

  Código de redefinição (cole no aplicativo):
  {token}

  Ou abra: {link}

  O código vale até {expiraEm formatado em pt-BR, America/Sao_Paulo, ex.: 13/10/2026 09:30} e só pode ser usado uma vez.
  Para concluir, você também precisará do código do seu aplicativo autenticador.

  Se você não pediu a redefinição, ignore este e-mail. Sua senha continua a mesma.
  ```
  Falha no `sendMail` → `logger.error('Falha ao enviar e-mail de redefinição.')` e lançar `Error('Falha ao enviar e-mail.')`.
- **Testes obrigatórios** (transporte falso `{ sendMail: vi.fn() }`): chamado com `to`, `from`, `subject` exatos; `text` contém token, link e a data formatada `13/10/2026 09:30` para `expiraEm = 2026-10-13T12:30:00.000Z`; não há `html`; falha do transporte → lança mensagem fixa e nem a mensagem nem o log (`vi.spyOn(Logger.prototype, 'error')`) contêm token ou e-mail; desabilitado resolve e loga só a mensagem fixa.
- **Requisitos de segurança**: TLS obrigatório (`requireTLS`); texto puro (sem injeção HTML); nada sensível em log.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-041.
- **Fora de escopo**: escolha do provedor (P-02).
- **Convenção de commit**: `feat(TASK-045): add SMTP email sender`

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

### TASK-046: Repositórios Drizzle de `Usuario`, `Dispositivo` e `SessaoDeLogin`
- **Status**: `[x] Aprovada` (verificada pelo Claude contra Postgres 17 real: 44 testes de integração + 455 unitários, tsc, oxlint e build limpos. Desvios: teste de payload de injeção usa strings sem espaço (Email já recusa espaços); idsExistentes/porId filtram ids não-UUID para evitar erro de cast)
- **Depende de**: TASK-040, TASK-021
- **Objetivo**: Persistir os agregados com controle otimista de versão e mapeamento fiel (SPEC §7.1).
- **Arquivos permitidos** (novos, em `infrastructure/persistencia/`): `executor.ts`, `erros-de-banco.ts`, `mapeadores.ts`, `repositorios/usuario-repositorio-drizzle.ts`, `repositorios/dispositivo-repositorio-drizzle.ts`, `repositorios/sessao-de-login-repositorio-drizzle.ts`; testes em `backend/test/identidade-e-acesso/int/repositorios-de-agregados.int-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // executor.ts — serve tanto para `db` quanto para a transação `tx`
  export type ExecutorDrizzle = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;
  // erros-de-banco.ts
  export function ehViolacaoDeUnicidade(e: unknown): boolean;   // code === '23505' no erro ou em e.cause (o Drizzle pode embrulhar)
  // mapeadores.ts — funções puras linha ↔ agregado
  export function paraUsuario(linha: typeof usuarios.$inferSelect, codigos: (typeof codigosDeRecuperacao.$inferSelect)[]): Usuario;
  export function paraDispositivo(linha): Dispositivo;
  export function paraSessaoDeLogin(linha): SessaoDeLogin;
  // repositórios: constructor(private readonly exec: ExecutorDrizzle); implementam as portas da TASK-020
  ```
  Regras de `salvar` (as três classes):
  - `versao === 0` → `INSERT ... versao = 1`; violação de unicidade → `ConflitoDeConcorrencia`.
  - senão → `UPDATE ... SET ..., versao = versao + 1 WHERE id = $id AND versao = $versaoAtual RETURNING versao`; 0 linhas → `ConflitoDeConcorrencia`.
  - ao final, `agregado.definirVersaoPersistida(novaVersao)`.
  - `Usuario`: também sincroniza `codigos_de_recuperacao`: apaga os do usuário cujo `id` não está mais na lista; para cada código, `INSERT ... ON CONFLICT (id) DO UPDATE SET usado_em = EXCLUDED.usado_em`.
  - `SessaoDeLogin.salvar`: violação do índice parcial → `ConflitoDeConcorrencia`.
  - `contarProprietariosAtivos`: `count(*)` com `situacao = 'ativo' AND 'proprietario' = ANY(papeis)`.
  - `porRefreshHash`: `refresh_atual_hash = $h OR refresh_anterior_hash = $h ORDER BY criada_em DESC LIMIT 1`.
  - Todas as consultas parametrizadas pelo Drizzle (proibido concatenar string em `sql`).
- **Testes obrigatórios** (`beforeEach(limparBanco)`):
  1. usuário com MFA confirmado, pendente e 10 códigos (1 usado) → salvar → `porId` e `porEmail` reconstituem **todos** os campos iguais (`segredo.bytes()` igual, `ultimoPasso` igual, código usado com `usadoEm`);
  2. concorrência: carregar a mesma linha duas vezes, salvar a primeira, salvar a segunda → `ConflitoDeConcorrencia`;
  3. e-mail duplicado → `ConflitoDeConcorrencia`;
  4. `contarProprietariosAtivos` ignora desativados;
  5. regenerar códigos remove os antigos do banco;
  6. dispositivo ida e volta; `ativosDoUsuario` exclui revogados; `todosDoUsuario` ordenado por `registradoEm`;
  7. segunda sessão ativa no mesmo dispositivo → `ConflitoDeConcorrencia`; após revogar a primeira e salvar, a nova entra;
  8. `porRefreshHash` encontra pelo hash anterior após rotação;
  9. entrada maliciosa: `porEmail(Email.criar("x'); drop table identidade.usuarios; --@a.com"))` retorna `null` e a tabela continua existindo.
- **Requisitos de segurança**: consultas parametrizadas (SQL injection); versão otimista contra *lost update*; nenhum log de linhas.
- **Critérios de aceite**: [ ] testes passam · [ ] `grep -rn "sql.raw" src/identidade-e-acesso` vazio
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm run test:int
  grep -rn "sql.raw" src/identidade-e-acesso ; echo "exit=$?"
  ```
- **Fora de escopo**: UoW e demais repositórios (TASK-047).
- **Convenção de commit**: `feat(TASK-046): add drizzle repositories for identity aggregates`

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

### TASK-047: Repositórios de desafio, token, auditoria encadeada e `DrizzleUnidadeDeTrabalho`
- **Status**: `[x] Aprovada` (verificada pelo Claude contra Postgres 17 real: 44 testes de integração + 455 unitários, tsc, oxlint e build limpos. Desvios: teste de payload de injeção usa strings sem espaço (Email já recusa espaços); idsExistentes/porId filtram ids não-UUID para evitar erro de cast)
- **Depende de**: TASK-046, TASK-041
- **Objetivo**: Completar a persistência com operações atômicas de uso único, auditoria do servidor encadeada por hash (RN-39, SPEC §9 Infra) e a unidade de trabalho transacional.
- **Arquivos permitidos** (novos, em `infrastructure/persistencia/`): `repositorios/desafio-de-login-repositorio-drizzle.ts`, `repositorios/token-de-redefinicao-repositorio-drizzle.ts`, `repositorios/auditoria-repositorio-drizzle.ts`, `fabrica-de-repositorios.ts`, `drizzle-unidade-de-trabalho.ts`; teste `backend/test/identidade-e-acesso/int/repositorios-de-suporte.int-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export function criarRepositorios(exec: ExecutorDrizzle, hash: CalculadoraDeHash): RepositoriosDaTransacao;
  export class DrizzleUnidadeDeTrabalho implements UnidadeDeTrabalho {
    constructor(db: NodePgDatabase<typeof schema>, hash: CalculadoraDeHash);
    executar(trabalho) { return db.transaction((tx) => trabalho(criarRepositorios(tx, hash))); }
  }
  ```
  - `marcarUsado` / `consumir`: `UPDATE ... SET usado_em = $agora WHERE <chave> = $x AND usado_em IS NULL AND expira_em > $agora RETURNING 1` → `true` se retornou linha.
  - `usuarioDoTokenValido`: `SELECT usuario_id ... WHERE hash = $h AND usado_em IS NULL AND expira_em > $agora`.
  - `AuditoriaRepositorioDrizzle.registrar`:
    - `origem: 'servidor'`: `SELECT pg_advisory_xact_lock(hashtext('identidade.auditoria.servidor'))`; `anterior` = `hash` do último registro `origem = 'servidor'` (`ORDER BY id DESC LIMIT 1`) ou `null`; `hash = sha256Hex(serializarCanonico({ id: reg.id, ocorridoEm, tipo, usuarioId, dispositivoId, detalhe, hashAnterior: anterior }))`; `INSERT` com `id_origem = reg.id`, `hash_anterior = anterior`, `hash`, `assinatura = null`.
    - `origem: 'app'`: `INSERT` com os campos recebidos (`id_origem = reg.id`, `hash_anterior`, `hash`, `assinatura`).
    - O *advisory lock* só funciona dentro de transação: documente com um comentário de uma linha que o repositório deve ser usado via `DrizzleUnidadeDeTrabalho`.
  - `ultimoHashDoApp(d)`: `hash` do último `origem = 'app' AND dispositivo_id = $d` (`ORDER BY id DESC LIMIT 1`).
  - `idsExistentes(ids)`: `SELECT id_origem WHERE id_origem = ANY($ids)`; lista vazia → `new Set()` sem consultar.
- **Testes obrigatórios** (`beforeEach(limparBanco)`):
  1. **desafio de uso único sob concorrência**: `Promise.all` de dois `marcarUsado` em **duas transações** diferentes → exatamente um `true`;
  2. desafio expirado → `false`; token de redefinição: válido → `usuarioDoTokenValido` retorna o id; `consumir` 2× → `true`, `false`; `invalidarDoUsuario` impede consumo;
  3. **auditoria com hash encadeado**: 3 registros do servidor → o 1º tem `hash_anterior` nulo e cada seguinte aponta para o `hash` anterior; recalcular `serializarCanonico` a partir das colunas gravadas reproduz cada `hash`;
  4. dois `uow.executar` concorrentes registrando auditoria → cadeia continua linear (nenhum par de registros com o mesmo `hash_anterior`);
  5. registro `app` com os vetores R1/R2 do D-009 → `ultimoHashDoApp` = hash de R2; `idsExistentes([idR1, uuidNovo])` = `{idR1}`;
  6. UoW: trabalho que salva usuário e lança → nada persistido; trabalho normal → persistido;
  7. `detalhe` gravado como `jsonb` igual ao enviado; `ip` gravado (`'127.0.0.1'`).
- **Requisitos de segurança**: uso único garantido no banco (não em memória); cadeia de auditoria serializada; append-only (TASK-040).
- **Critérios de aceite**: [ ] testes passam · [ ] todos os testes anteriores continuam passando
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test && pnpm run test:int && pnpm run build
  ```
- **Fora de escopo**: wiring Nest (TASK-053).
- **Convenção de commit**: `feat(TASK-047): add support repositories, chained audit log and unit of work`

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
