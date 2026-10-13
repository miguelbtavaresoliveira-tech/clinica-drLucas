# 📋 05 — Backend: camada Interface (HTTP, guards, CLI, E2E)

> **Objetivo**: Expor os casos de uso por HTTP (SPEC §7.1 Endpoints), com validação zod, tradução de erros de domínio (SPEC §6.6, D-011), autenticação/permissão, limite de taxa (DT-06), comandos administrativos (RN-01, RN-36) e testes E2E.
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: NestJS 12 (Express), @nestjs/throttler, zod 4, supertest, Vitest.
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-005, D-008, D-011, D-012), SPEC §6.5, §6.6, §7.1.

## Regras desta camada
- Pasta: `backend/src/identidade-e-acesso/interface/`. Controllers **só** validam entrada, montam a entrada do caso de uso e formatam a saída. Nenhuma regra de negócio aqui.
- Datas na resposta sempre em ISO 8601 (`toISOString()`).
- Toda resposta que contém token ou segredo envia `Cache-Control: no-store`.
- Nenhum `console.*`; o CLI escreve com `process.stdout.write` / `process.stderr.write`.

## Contrato HTTP (fonte única para as TASK-052 a TASK-057)

Formato de erro (todas as rotas): `{ "erro": { "codigo": string, "mensagem": string, "tentarApos"?: string, "motivos"?: string[], "campos"?: string[] } }`

| Rota | Auth | Limite (por IP) | Corpo | Sucesso |
|---|---|---|---|---|
| `POST /auth/login` | pública | 5/min | `{ email: string ≤254, senha: string 1–128 }` | `200 { desafio, mfa: 'configurar'\|'verificar', expiraEm }` |
| `POST /auth/mfa/segredo` | desafio no corpo | 5/min | `{ desafio: string ≤2048 }` | `200 { segredo, urlOtpauth }` |
| `POST /auth/mfa/confirmar` | desafio no corpo | 5/min | `{ desafio, codigo: /^\d{6}$/ }` | `200 { codigosDeRecuperacao: string[10] }` |
| `POST /auth/login/concluir` | desafio no corpo | 5/min | `{ desafio, codigo: CodigoInformado, dispositivo: { id: uuid\|null, apelido: 1–60, plataforma: 'macos'\|'windows', chavePublicaAuditoria: /^[A-Za-z0-9+/]{43}=$/ } }` | `200 { accessToken, accessExpiraEm, refreshToken, dispositivoId, politica, usuario: { id, nome, email, papeis }, usouCodigoDeRecuperacao, codigosRestantes }` |
| `POST /auth/refresh` | refresh no corpo | 30/min | `{ refreshToken: /^[A-Za-z0-9_-]{43}$/, dispositivoId: uuid }` | `200 { accessToken, accessExpiraEm, refreshToken, politica }` |
| `POST /auth/logout` | Bearer | global | — | `204` |
| `POST /auth/senha/trocar` | Bearer + `identidade:escrever` | 5/min | `{ senhaAtual: 1–128, novaSenha: 1–128 }` | `204` |
| `POST /auth/senha/esqueci` | pública | 5/min | `{ email: string ≤254 }` | `202 { aceito: true }` (sempre) |
| `POST /auth/senha/redefinir` | token no corpo | 5/min | `{ token: /^[A-Za-z0-9_-]{43}$/, novaSenha: 1–128, codigo: CodigoInformado }` | `204` |
| `POST /auth/mfa/codigos` | Bearer + `identidade:escrever` | 5/min | `{ codigoMfa: /^\d{6}$/ }` | `200 { codigosDeRecuperacao }` |
| `POST /auth/mfa/reconfigurar` | Bearer + `identidade:escrever` | 5/min | `{ senhaAtual: 1–128 }` | `200 { segredo, urlOtpauth }` |
| `POST /auth/mfa/reconfigurar/confirmar` | Bearer + `identidade:escrever` | 5/min | `{ codigo: /^\d{6}$/ }` | `200 { codigosDeRecuperacao }` |
| `GET /dispositivos` | Bearer + `identidade:ler` | global | — | `200 { dispositivos: ItemDeDispositivo[] }` |
| `POST /dispositivos/:id/revogar` | Bearer + `identidade:administrar` | 5/min | `{ motivo: 3–200, codigoMfa: /^\d{6}$/ }` | `204` |
| `POST /auditoria/lote` | Bearer | 30/min | `{ registros: RegistroRecebido[1–500] }` | `200 { aceitos, ignorados }` |
| `POST /usuarios/:id/desativar` | Bearer + `identidade:administrar` | 5/min | — | `204` |

`CodigoInformado` = `{ tipo: 'totp', valor: /^\d{6}$/ }` **ou** `{ tipo: 'recuperacao', valor: string 16–19 }`. Global: 100 requisições/min por IP. Todos os objetos de corpo usam `.strict()` (campos extras → 400).

## 🎯 Mapa de Arquivos

| Arquivo | Tarefa |
|---|---|
| `interface/http/pipes/validacao-zod.pipe.ts`, `interface/http/filtros/filtro-de-erros.ts`, `interface/http/filtros/tabela-de-erros.ts` | TASK-050 |
| `interface/http/guards/{autenticacao,permissao}.guard.ts`, `interface/http/decorators/{requer-permissao,contexto-atual,ip-da-requisicao}.ts` | TASK-051 |
| `interface/http/dtos/*.ts`, `interface/http/apresentadores.ts` | TASK-052 |
| `identidade-e-acesso.module.ts`, `app.module.ts`, `main.ts`, `vitest.config.e2e.ts`, `test/carregar-env.ts` | TASK-053 |
| `interface/http/controllers/auth.controller.ts` | TASK-054 |
| `interface/http/controllers/{dispositivos,auditoria,usuarios}.controller.ts` | TASK-055 |
| `interface/cli/*.ts` | TASK-056 |
| `test/identidade-e-acesso/e2e/*.e2e-spec.ts` | TASK-057 |

---

### TASK-050: Pipe de validação zod e filtro global de erros
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-047
- **Objetivo**: Validar entradas sem vazar valores e traduzir erros tipados para HTTP só na borda (DT-14, SPEC §6.6, D-011).
- **Arquivos permitidos** (novos, em `interface/http/`): `pipes/validacao-zod.pipe.ts`, `filtros/tabela-de-erros.ts`, `filtros/filtro-de-erros.ts` e `.spec.ts` para o pipe e o filtro
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export class ValidacaoZodPipe<T> implements PipeTransform<unknown, T> {
    constructor(schema: z.ZodType<T>);
    transform(valor: unknown): T;   // safeParse; falha → BadRequestException({ erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida.', campos: [paths únicos 'a.b.c'] } })
  }
  export interface RespostaDeErro { status: number; codigo: string; mensagem: string; }
  export function traduzirErro(erro: unknown): { status: number; corpo: { erro: Record<string, unknown> } };
  @Catch() export class FiltroDeErros implements ExceptionFilter { catch(erro: unknown, host: ArgumentsHost): void; }
  ```
  Tabela (`tabela-de-erros.ts`):
  | Erro | Status | `codigo` na resposta | `mensagem` | Extras |
  |---|---|---|---|---|
  | `CredenciaisInvalidas`, `ContaDesativada` | 401 | `CREDENCIAIS_INVALIDAS` | `E-mail ou senha incorretos.` | — |
  | `CodigoMfaInvalido` | 401 | `CODIGO_MFA_INVALIDO` | `Código de verificação inválido.` | — |
  | `SessaoExpirada`, `RefreshReutilizado` | 401 | `SESSAO_EXPIRADA` | `Sessão expirada. Entre novamente.` | — |
  | `DesafioInvalido` | 401 | `DESAFIO_INVALIDO` | mensagem do erro | — |
  | `TokenDeRedefinicaoInvalido` | 401 | `TOKEN_DE_REDEFINICAO_INVALIDO` | mensagem do erro | — |
  | `ContaBloqueada` | 423 | `CONTA_BLOQUEADA` | mensagem do erro | `tentarApos: ate.toISOString()` |
  | `DispositivoRevogado`, `SemPermissao`, `ReautenticacaoNecessaria` | 403 | `codigo` do erro | mensagem do erro | — |
  | `LimiteDeDispositivosAtingido`, `EmailJaCadastrado`, `MfaJaConfigurado`, `ProprietarioJaExiste`, `UltimoProprietario`, `ConflitoDeConcorrencia` | 409 | `codigo` do erro | mensagem do erro | — |
  | `SenhaFraca` | 422 | `SENHA_FRACA` | mensagem | `motivos` |
  | `MfaObrigatorio`, `EmailInvalido`, `IdentificadorInvalido` | 422 | `codigo` do erro | mensagem | — |
  | `DadoInvalido` | 422 | `DADO_INVALIDO` | `Dado inválido.` | `campos: [campo]` |
  | `AuditoriaInvalida` | 422 | `AUDITORIA_INVALIDA` | mensagem | `motivos: [motivo]` |
  | `UsuarioNaoEncontrado`, `DispositivoNaoEncontrado` | 404 | `codigo` do erro | mensagem | — |
  | `ThrottlerException` | 429 | `MUITAS_REQUISICOES` | `Muitas tentativas. Aguarde um minuto.` | — |
  | `HttpException` com corpo já no formato `{ erro }` | status dela | corpo dela | — | — |
  | outro `HttpException` | status dela | `ERRO_HTTP` | `Requisição não atendida.` | — |
  | qualquer outro | 500 | `ERRO_INTERNO` | `Erro interno.` | log `logger.error('Erro não tratado: ' + nomeDaClasse, stack)` |
- **Testes obrigatórios**: pipe aceita válido; inválido → 400 com `campos` contendo só caminhos e **não** o valor enviado (envie `senha: 'segredo-123'` com tipo errado e verifique que `'segredo-123'` não aparece no JSON); `it.each` sobre a tabela verificando status/código/extras; `ContaDesativada` e `CredenciaisInvalidas` produzem corpos idênticos (RN-12); erro genérico com mensagem `'senha=abc'` → corpo não contém `'abc'`.
- **Requisitos de segurança**: nenhuma mensagem interna, stack ou valor de entrada na resposta.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação** (em `backend/`):
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/interface
  ```
- **Fora de escopo**: registrar o filtro globalmente (TASK-053).
- **Convenção de commit**: `feat(TASK-050): add zod validation pipe and domain error filter`

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

### TASK-051: Guards de autenticação/permissão e decorators
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-050
- **Objetivo**: Montar o `ContextoDeAcesso` a partir do access token e exigir permissões por rota (RN-31, SPEC §6.5).
- **Arquivos permitidos** (novos, em `interface/http/`): `guards/autenticacao.guard.ts`, `guards/permissao.guard.ts`, `decorators/requer-permissao.ts`, `decorators/contexto-atual.ts`, `decorators/ip-da-requisicao.ts`, `requisicao-autenticada.ts` e `.spec.ts` para os dois guards
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface RequisicaoAutenticada extends Request { contextoDeAcesso?: ContextoDeAcesso; }
  @Injectable() export class AutenticacaoGuard implements CanActivate {
    constructor(@Inject(EMISSOR_DE_TOKENS) emissor: EmissorDeTokens);
    canActivate(ctx): boolean;  // header 'authorization' = 'Bearer <token>' (case-insensitive no esquema); ausente/malformado → lança SessaoExpirada;
                                // dados = emissor.verificarAccess(token); req.contextoDeAcesso = new ContextoDeAcesso(UsuarioId.de(sub), DispositivoId.de(did), papeis.map(papelPorNome))
  }
  export const CHAVE_PERMISSAO = 'identidade:permissao';
  export const RequerPermissao = (p: Permissao) => SetMetadata(CHAVE_PERMISSAO, p);
  @Injectable() export class PermissaoGuard implements CanActivate {
    constructor(reflector: Reflector);
    canActivate(ctx): boolean;  // sem metadado → true; senão req.contextoDeAcesso obrigatório (ausente → SessaoExpirada) e ctx.exigir(p)
  }
  export const ContextoAtual = createParamDecorator((_d, ctx) => /* req.contextoDeAcesso ou lança SessaoExpirada */);
  export const IpDaRequisicao = createParamDecorator((_d, ctx) => /* req.ip ?? null */);
  ```
  Uso nos controllers: `@UseGuards(AutenticacaoGuard, PermissaoGuard)` + `@RequerPermissao('identidade:ler')`.
- **Testes obrigatórios** (com `ExecutionContext` falso): sem header → `SessaoExpirada`; `Basic xxx` → `SessaoExpirada`; token válido → contexto montado com ids e papéis; emissor lança → propaga `SessaoExpirada`; papel desconhecido no token → erro (não concede acesso); permissão ausente no contexto → `SemPermissao`; rota sem metadado → passa.
- **Requisitos de segurança**: autorização no servidor por rota; nenhum fallback permissivo.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-050.
- **Fora de escopo**: limite de taxa (TASK-053).
- **Convenção de commit**: `feat(TASK-051): add authentication and permission guards`

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

### TASK-052: DTOs (schemas zod) e apresentadores de resposta
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-051
- **Objetivo**: Um schema zod por corpo de requisição e funções puras que formatam as saídas, conforme o **Contrato HTTP** no topo deste arquivo.
- **Arquivos permitidos** (novos, em `interface/http/`): `dtos/auth.dtos.ts`, `dtos/dispositivos.dtos.ts`, `dtos/auditoria.dtos.ts`, `dtos/comuns.ts`, `apresentadores.ts` e `dtos/dtos.spec.ts`, `apresentadores.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - `comuns.ts`: `esquemaUuid`, `esquemaCodigoTotp` (`/^\d{6}$/`), `esquemaCodigoInformado` (união discriminada por `tipo`), `esquemaTokenOpaco` (`/^[A-Za-z0-9_-]{43}$/`), `esquemaSenha` (`z.string().min(1).max(128)`), `esquemaEmailBruto` (`z.string().max(254)` — a validação de formato é do domínio para manter RN-12).
  - `auth.dtos.ts`: `esquemaIniciarLogin`, `esquemaGerarSegredo`, `esquemaConfirmarMfa`, `esquemaConcluirLogin`, `esquemaRenovarSessao`, `esquemaTrocarSenha`, `esquemaSolicitarRedefinicao`, `esquemaConcluirRedefinicao`, `esquemaRegenerarCodigos`, `esquemaIniciarReconfiguracao`, `esquemaConfirmarReconfiguracao` — todos `.strict()`, exatamente como a tabela.
  - `dispositivos.dtos.ts`: `esquemaRevogarDispositivo`; `auditoria.dtos.ts`: `esquemaRegistroRecebido` (`id` uuid, `ocorridoEm` string ≤ 30, `tipo` string ≤ 60, `usuarioId`/`dispositivoId` uuid, `detalhe` `z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))`, `hashAnterior` `/^[0-9a-f]{64}$/` ou `null`, `hash` `/^[0-9a-f]{64}$/`, `assinatura` base64 ≤ 100) e `esquemaLoteDeAuditoria` (`registros` array 1–500).
  - `apresentadores.ts`: `apresentarConcluirLogin(s: SaidaConcluirLogin)`, `apresentarRenovarSessao`, `apresentarIniciarLogin`, `apresentarDispositivos(itens)`, `apresentarPolitica(p)` — convertem `Date` em ISO e copiam só os campos do contrato.
- **Testes obrigatórios**: para cada schema, 1 caso válido e casos inválidos (campo extra, tamanho máximo +1, regex quebrada); `esquemaCodigoInformado` rejeita `{ tipo: 'sms', valor: '123456' }`; `esquemaLoteDeAuditoria` rejeita 501 registros e `[]`; apresentadores geram datas ISO e não incluem campos extras (ex.: `apresentarConcluirLogin` não expõe nada além do contrato).
- **Requisitos de segurança**: limites de tamanho em todas as strings (evita DoS no Argon2 e no parser); `.strict()` contra *mass assignment*.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-050.
- **Fora de escopo**: controllers.
- **Convenção de commit**: `feat(TASK-052): add request schemas and response presenters`

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

### TASK-053: Módulo Nest `IdentidadeEAcessoModule`, `AppModule` e endurecimento do `main.ts`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-052
- **Objetivo**: Ligar portas a adaptadores via injeção de dependência, registrar limite de taxa e filtro global, e endurecer o servidor HTTP.
- **Arquivos permitidos**:
  - `backend/src/identidade-e-acesso/identidade-e-acesso.module.ts` (novo)
  - `backend/src/identidade-e-acesso/infrastructure/persistencia/ciclo-de-vida-do-banco.ts` (novo)
  - `backend/src/app.module.ts`, `backend/src/main.ts` (editar)
  - `backend/vitest.config.e2e.ts` (editar), `backend/test/carregar-env.ts` (novo)
  - `backend/test/identidade-e-acesso/e2e/modulo.e2e-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto (inclusive `test/app.e2e-spec.ts` — não altere)
- **Contrato**:
  - `identidade-e-acesso.module.ts`: `@Module({ imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])], controllers: [], providers: [...], exports: [EMISSOR_DE_TOKENS] })`. Providers (todos via `useFactory` + `inject` com os símbolos de `portas/tokens.ts`):
    | Token | Fábrica |
    |---|---|
    | `CONFIGURACAO` | `() => carregarConfiguracao(process.env)` |
    | `POLITICA_DE_ACESSO` | `politicaDaConfiguracao(config)` |
    | `CONEXAO_DO_BANCO` (símbolo novo, exportado do próprio módulo) | `criarConexao(config.databaseUrl)` |
    | `RELOGIO` | `new RelogioDoSistema()` |
    | `HASHER_DE_SENHA` | `new Argon2idHasher()` |
    | `SERVICO_TOTP` | `new OtplibServicoTotp(relogio)` |
    | `COFRE_DE_SEGREDOS` | `new AesGcmCofreDeSegredos(config.totpChaveCifra)` |
    | `EMISSOR_DE_TOKENS` | `new JwtEmissorDeTokens({ accessSegredo, desafioSegredo }, relogio)` |
    | `ENVIADOR_DE_EMAIL` | `config.smtp ? new SmtpEnviadorDeEmail(config.smtp) : new EnviadorDeEmailDesabilitado()` |
    | `BARRAMENTO_DE_EVENTOS` | `new BarramentoEmProcesso()` |
    | `GERADOR_DE_CODIGOS_DE_RECUPERACAO` | `new GeradorDeCodigosCrockford()` |
    | `CALCULADORA_DE_HASH` | `new Sha256CalculadoraDeHash()` |
    | `VERIFICADOR_DE_ASSINATURA` | `new Ed25519VerificadorDeAssinatura()` |
    | `UNIDADE_DE_TRABALHO` | `new DrizzleUnidadeDeTrabalho(conexao.db, hash)` |
    | `POLITICA_DE_SENHA` | `new PoliticaDeSenha(new Set(SENHAS_COMUNS))` |
    | `Auditor`, `VerificadorDeMfa`, `PoliticaDeProprietario`, `PoliticaDeLimiteDeDispositivos` | `new ...()` com suas dependências |
    | cada caso de uso (a própria classe como token) | `new CasoDeUso({ ...dependências })` |
    | `CicloDeVidaDoBanco` | classe `implements OnApplicationShutdown` que chama `conexao.encerrar()` |
    | `APP_GUARD` | `ThrottlerGuard` |
    | `APP_FILTER` | `FiltroDeErros` |
  - `app.module.ts`: adicionar `IdentidadeEAcessoModule` em `imports` (manter `AppController`/`AppService`).
  - `main.ts`: depois de criar o app (`NestFactory.create<NestExpressApplication>`): `app.disable('x-powered-by')`; `app.set('trust proxy', config.trustProxy ? 1 : false)` (leia via `app.get(CONFIGURACAO)`); `app.useBodyParser('json', { limit: '1mb' })`; `app.enableShutdownHooks()`; middleware que define em toda resposta `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` e, se `production`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`. **Não** chamar `enableCors` (D-005).
  - `test/carregar-env.ts`: carrega `.env` se existir e define `process.env.DATABASE_URL = urlDoBancoDeTeste()`.
  - `vitest.config.e2e.ts`: adicionar `setupFiles: ['./test/carregar-env.ts']`, `globalSetup: ['./test/identidade-e-acesso/int/global-setup.ts']`, `fileParallelism: false`, `testTimeout: 30_000`.
- **Testes obrigatórios** (`modulo.e2e-spec.ts`): o app sobe com `AppModule`; `GET /` continua `Hello World!`; respostas têm `X-Content-Type-Options: nosniff` e não têm `X-Powered-By`; `app.get(UNIDADE_DE_TRABALHO)` é `DrizzleUnidadeDeTrabalho`; `app.get(IniciarLogin)` resolve; resposta com `Origin: http://evil.example` **não** tem `Access-Control-Allow-Origin`; `test/app.e2e-spec.ts` original passa sem alterações.
- **Requisitos de segurança**: sem CORS; cabeçalhos de segurança; limite de corpo; segredos só via configuração validada; conexão encerrada no shutdown.
- **Critérios de aceite**: [ ] testes passam · [ ] `git diff --stat test/app.e2e-spec.ts` vazio
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test && pnpm run test:int && pnpm run test:e2e && pnpm run build
  git diff --stat f47862e -- test/app.e2e-spec.ts
  ```
- **Fora de escopo**: controllers (TASK-054/055).
- **Convenção de commit**: `feat(TASK-053): wire identity module, throttling and HTTP hardening`

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

### TASK-054: `AuthController` (rotas `/auth/*`)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-053
- **Objetivo**: Expor UC-02 a UC-07, UC-10 a UC-13 e UC-16 conforme o **Contrato HTTP**.
- **Arquivos permitidos**: `interface/http/controllers/auth.controller.ts` (novo), `identidade-e-acesso.module.ts` (editar: só adicionar o controller), `test/identidade-e-acesso/e2e/auth.e2e-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato**: `@Controller('auth') export class AuthController`, um método por rota `/auth/*` da tabela. Para cada método:
  - corpo com `@Body(new ValidacaoZodPipe(esquemaX))`; IP com `@IpDaRequisicao()`;
  - `@HttpCode(200)` (ou `202`/`204` conforme a tabela);
  - `@Throttle({ default: { limit: 5, ttl: 60_000 } })` nas rotas de 5/min; `{ limit: 30, ttl: 60_000 }` em `refresh`;
  - rotas Bearer: `@UseGuards(AutenticacaoGuard, PermissaoGuard)` e `@RequerPermissao(...)` quando a tabela exige; `@ContextoAtual() ctx`;
  - respostas com token/segredo/códigos: `@Header('Cache-Control', 'no-store')`;
  - `email` vai para o caso de uso como string bruta (o domínio valida).
- **Testes obrigatórios** (`auth.e2e-spec.ts`, novo app por teste com `overrideProvider(RELOGIO).useValue(new RelogioFixo(...))`; gere TOTP no teste com `authenticator.clone({ epoch: relogio.agora().getTime() }).generate(segredo)` do `otplib`; semeie o usuário com `app.get(CriarPrimeiroProprietario)`):
  1. primeiro acesso: login → `mfa: 'configurar'` → `mfa/segredo` → `mfa/confirmar` (10 códigos) → avançar o relógio 30 s → `login/concluir` → 200 com tokens e `Cache-Control: no-store`;
  2. senha errada e e-mail inexistente → mesmo status 401 e **mesmo corpo**;
  3. 5 senhas erradas → 6ª tentativa 423 com `tentarApos`;
  4. 6 chamadas a `/auth/login` no mesmo app → a 6ª é 429 `MUITAS_REQUISICOES`;
  5. corpo com campo extra → 400 `REQUISICAO_INVALIDA`;
  6. `refresh` feliz; reutilizar o refresh antigo → 401 `SESSAO_EXPIRADA`; o novo também passa a falhar;
  7. `logout` sem Bearer → 401; com Bearer → 204;
  8. `senha/esqueci` com e-mail existente e inexistente → ambos 202 `{ aceito: true }`;
  9. `senha/trocar` com Bearer revoga a sessão de outro dispositivo (refresh do outro → 401);
  10. `mfa/codigos` com TOTP errado → 403 `REAUTENTICACAO_NECESSARIA`.
- **Requisitos de segurança**: limites de taxa nas rotas públicas; `no-store` em respostas sensíveis; erros genéricos.
- **Critérios de aceite**: [ ] todas as rotas `/auth/*` da tabela existem · [ ] testes passam
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test && pnpm run test:e2e && pnpm run build
  ```
- **Fora de escopo**: dispositivos/auditoria/usuários.
- **Convenção de commit**: `feat(TASK-054): add auth HTTP controller`

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

### TASK-055: Controllers de dispositivos, auditoria e usuários
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-054
- **Objetivo**: Expor UC-08, UC-09, UC-14 e UC-15.
- **Arquivos permitidos**: `interface/http/controllers/dispositivos.controller.ts`, `interface/http/controllers/auditoria.controller.ts`, `interface/http/controllers/usuarios.controller.ts` (novos); `identidade-e-acesso.module.ts` (editar: só adicionar controllers); `test/identidade-e-acesso/e2e/dispositivos-e-auditoria.e2e-spec.ts` (novo)
- **Arquivos proibidos**: todo o resto
- **Contrato**: rotas `GET /dispositivos`, `POST /dispositivos/:id/revogar`, `POST /auditoria/lote`, `POST /usuarios/:id/desativar` exatamente como a tabela. `:id` validado com `new ValidacaoZodPipe(esquemaUuid)` em `@Param('id')`.
- **Testes obrigatórios**:
  1. `GET /dispositivos` lista o dispositivo atual com `atual: true`;
  2. revogar outro dispositivo com TOTP certo → 204; o `refresh` daquele dispositivo → 403 `DISPOSITIVO_REVOGADO` (**E2E SPEC §9: login, renovação, revogação e nova renovação falhando**);
  3. revogar id de dispositivo inexistente → 404; id malformado → 400;
  4. auditoria: gerar no teste 2 registros encadeados e assinados com a chave Ed25519 da semente do D-009 (a mesma chave pública enviada no `login/concluir`), usando `serializarCanonico` e `crypto.sign` → 200 `{ aceitos: 2, ignorados: 0 }`; reenviar → `{ aceitos: 0, ignorados: 2 }`; assinatura adulterada → 422 `AUDITORIA_INVALIDA`;
  5. `POST /usuarios/:id/desativar` no único proprietário → 409 `ULTIMO_PROPRIETARIO`; com UUID inexistente → 404 `USUARIO_NAO_ENCONTRADO`; sem Bearer → 401.
- **Requisitos de segurança**: IDOR coberto (dispositivo de outro usuário → 404); lote de auditoria validado por assinatura.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: iguais aos da TASK-054.
- **Fora de escopo**: telas.
- **Convenção de commit**: `feat(TASK-055): add devices, audit and users HTTP controllers`

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

### TASK-056: Comandos administrativos (CLI) — criar proprietário e redefinir acesso
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-053
- **Objetivo**: RN-01 (primeiro proprietário só por comando no servidor) e RN-36 (último recurso), sem senha em argumentos de linha de comando.
- **Arquivos permitidos** (novos, em `interface/cli/`): `terminal.ts`, `criar-primeiro-proprietario.ts`, `redefinir-acesso.ts`, `executar-criacao.ts`, `executar-redefinicao.ts`, `executar-criacao.spec.ts`, `executar-redefinicao.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface Terminal { perguntar(texto: string): Promise<string>; perguntarSenha(texto: string): Promise<string>; escrever(texto: string): void; erro(texto: string): void; }
  export function criarTerminalDoProcesso(): Terminal;   // node:readline/promises; perguntarSenha não ecoa o que é digitado
  export async function executarCriacao(uc: CriarPrimeiroProprietario, t: Terminal): Promise<number>;    // código de saída
  export async function executarRedefinicao(uc: RedefinirAcessoAdministrativo, t: Terminal): Promise<number>;
  ```
  - `executarCriacao`: pergunta `Nome: `, `E-mail: `, `Senha: ` e `Confirme a senha: `; senhas diferentes → `t.erro('As senhas não conferem.')`, retorna 1; chama o caso de uso; sucesso → `t.escrever('Proprietário criado: <usuarioId>\n')`, retorna 0; `ErroDeDominio` → `t.erro(erro.message)` (e, se `SenhaFraca`, os motivos), retorna 1; outro erro → `t.erro('Falha inesperada.')`, retorna 1.
  - `executarRedefinicao`: pergunta e-mail, nova senha 2×, e exige digitar `REDEFINIR` para confirmar; avisa antes: `'Isto apaga o MFA, os códigos de recuperação e encerra todas as sessões.'`.
  - `criar-primeiro-proprietario.ts` / `redefinir-acesso.ts`: carregam `.env` se existir, `NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })`, obtêm o caso de uso, chamam `executarX`, fecham o app e `process.exitCode = codigo`.
- **Testes obrigatórios** (terminal falso com respostas enfileiradas e saída capturada): criação feliz → 0 e id impresso; senhas diferentes → 1 e caso de uso **não** chamado; `ProprietarioJaExiste` → 1 com a mensagem; `SenhaFraca` → 1 com motivos; redefinição sem digitar `REDEFINIR` → 1 e não chama; feliz → 0; nenhuma saída contém a senha digitada.
- **Requisitos de segurança**: senha só por prompt oculto (nunca `argv`/env); confirmação explícita para ação destrutiva; mensagens sem dados sensíveis.
- **Critérios de aceite**: [ ] testes passam · [ ] `pnpm run build && pnpm run cli:criar-proprietario` executa contra o banco local (cole a sessão no relatório, mascarando a senha)
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/interface/cli
  pnpm run build
  ```
- **Fora de escopo**: convite de novos usuários (multiusuário futuro).
- **Convenção de commit**: `feat(TASK-056): add administrative CLI commands`

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

### TASK-057: E2E de ponta a ponta do servidor e recuperação
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-055, TASK-056
- **Objetivo**: Garantir os fluxos completos de recuperação (RN-33, RN-34) e o roteiro "Pronto quando" do lado servidor (SPEC §10).
- **Arquivos permitidos**: `backend/test/identidade-e-acesso/e2e/recuperacao.e2e-spec.ts` (novo), `backend/test/identidade-e-acesso/e2e/apoio.ts` (novo: helpers `criarApp(relogio)`, `semearProprietario(app)`, `primeiroAcesso(app, relogio)`, `gerarTotp(segredo, relogio)`)
- **Arquivos proibidos**: todo o resto
- **Contrato**: o `ENVIADOR_DE_EMAIL` é sobrescrito no teste por um enviador que guarda `{ link, token }` em memória (`overrideProvider(ENVIADOR_DE_EMAIL)`).
- **Testes obrigatórios**:
  1. esqueci a senha → token capturado → `senha/redefinir` com TOTP → 204; login com a senha antiga → 401; com a nova → ok; todas as sessões antigas → 401;
  2. reutilizar o token de redefinição → 401 `TOKEN_DE_REDEFINICAO_INVALIDO`;
  3. redefinir com código de recuperação em vez de TOTP → 204;
  4. perdeu o autenticador: `login/concluir` com código de recuperação → 200 `usouCodigoDeRecuperacao: true`; `mfa/reconfigurar` (senha) → `mfa/reconfigurar/confirmar` (TOTP do novo segredo) → 200; TOTP do segredo antigo passa a falhar;
  5. dispositivo nº 4 → 409 `LIMITE_DE_DISPOSITIVOS_ATINGIDO`;
  6. a tabela `identidade.auditoria_de_acesso` contém `login-ok`, `login-falhou`, `senha-alterada`, `dispositivo-revogado` e nenhum valor de `detalhe` contém a senha usada no teste (consulta SQL direta).
- **Requisitos de segurança**: verificação real de que senha/token não vão para a auditoria.
- **Critérios de aceite**: [ ] testes passam · [ ] suíte completa verde
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test && pnpm run test:int && pnpm run test:e2e && pnpm run build
  pnpm audit --prod
  ```
- **Fora de escopo**: app desktop.
- **Convenção de commit**: `test(TASK-057): add end-to-end recovery and audit tests`

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
