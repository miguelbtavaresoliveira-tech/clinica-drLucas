# 📋 03 — Backend: camada Application

> **Objetivo**: Implementar as portas e todos os casos de uso do servidor (UC-01 a UC-16 + redefinição administrativa), testados com repositórios e adaptadores em memória.
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: TypeScript 6 (ESM, imports com `.js`), Vitest 4.
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-006 a D-011, D-013), SPEC §3, §6 e §9.

## Regras desta camada (valem para todas as tarefas deste arquivo)
- Pasta: `backend/src/identidade-e-acesso/application/`. Pode importar de `../domain/index.js`. **Proibido** importar `@nestjs/*`, `drizzle-orm`, `pg`, `argon2`, `otplib`, `nodemailer` e qualquer coisa de `infrastructure/` ou `interface/`.
  Verificação (deve imprimir nada): `grep -rnE "from '(@nestjs|drizzle-orm|pg|argon2|otplib|nodemailer)|infrastructure/|interface/" src/identidade-e-acesso/application`
- Caso de uso = classe com `constructor(private readonly d: Dependencias<Nome>)` e um único método público `executar(entrada): Promise<Saida>`. Sem decorators.
- **Regra de transação (crítica)**: `uow.executar(fn)` faz *rollback* se `fn` lançar. Portanto, **dentro** de `fn`, depois de qualquer mudança que precise ser gravada (falha de login, desafio usado, código consumido, sessão revogada), **não lance**: retorne `falha(erro, eventos)`. O erro é lançado **fora** da transação. Lançar dentro de `fn` só é permitido **antes** de qualquer mudança de estado.
- Toda mudança de agregado é salva e seus eventos são puxados (`puxarEventos()`), auditados **dentro** da transação (`auditor.registrar`) e publicados no barramento **depois** do commit (inclusive nos caminhos de falha que persistem estado).
- O instante atual vem sempre de `d.relogio.agora()`, lido uma vez no início de `executar`.
- Testes: `<caso>.spec.ts` ao lado do caso de uso, usando **somente** os fakes de `backend/test/identidade-e-acesso/fakes/index.js` (TASK-021). Import a partir de `src/identidade-e-acesso/application/casos-de-uso/x.spec.ts`: `'../../../../test/identidade-e-acesso/fakes/index.js'`.

## Permissões exigidas por caso de uso (RN-31)
| Caso | Permissão |
|---|---|
| UC-08 ListarDispositivos | `identidade:ler` |
| UC-09 RevogarDispositivo, UC-15 DesativarUsuario | `identidade:administrar` |
| UC-10 TrocarSenha, UC-13 RegenerarCodigos, UC-16 ReconfigurarMfa | `identidade:escrever` |
| UC-07 EncerrarSessao, UC-14 ReceberAuditoriaDoApp | nenhuma além de estar autenticado |

## 🎯 Mapa de Arquivos

| Arquivo | Tarefa |
|---|---|
| `application/portas/*.ts`, `application/auditoria/{registro-de-auditoria,serializacao-canonica}.ts`, `application/comum/{constantes,resultado}.ts` | TASK-020 |
| `test/identidade-e-acesso/fakes/*.ts` | TASK-021 |
| `application/auditoria/auditor.ts` | TASK-022 |
| `application/comum/{validacao-de-desafio,verificador-de-mfa}.ts` | TASK-023 |
| `application/casos-de-uso/criar-primeiro-proprietario.ts` | TASK-024 |
| `application/casos-de-uso/iniciar-login.ts` | TASK-025 |
| `application/casos-de-uso/{gerar-segredo-de-mfa,confirmar-mfa}.ts` | TASK-026 |
| `application/casos-de-uso/concluir-login.ts` | TASK-027 |
| `application/casos-de-uso/{renovar-sessao,encerrar-sessao}.ts` | TASK-028 |
| `application/casos-de-uso/{listar-dispositivos,revogar-dispositivo}.ts` | TASK-029 |
| `application/casos-de-uso/trocar-senha.ts` | TASK-030 |
| `application/casos-de-uso/{solicitar-redefinicao-de-senha,concluir-redefinicao-de-senha}.ts` | TASK-031 |
| `application/casos-de-uso/{regenerar-codigos-de-recuperacao,iniciar-reconfiguracao-de-mfa,confirmar-reconfiguracao-de-mfa}.ts` | TASK-032 |
| `application/casos-de-uso/receber-auditoria-do-app.ts` | TASK-033 |
| `application/casos-de-uso/{desativar-usuario,redefinir-acesso-administrativo}.ts`, `application/index.ts` | TASK-034 |

---

### TASK-020: Portas, tipos de auditoria, serialização canônica e utilitários
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-017
- **Objetivo**: Declarar todas as interfaces que a infraestrutura implementará (SPEC §6.1 com os ajustes de D-006/D-008/D-013), os tipos de auditoria e a serialização canônica (D-009).
- **Arquivos permitidos** (novos, em `backend/src/identidade-e-acesso/application/`):
  `portas/repositorios.ts`, `portas/servicos.ts`, `portas/unidade-de-trabalho.ts`, `portas/conflito-de-concorrencia.ts`, `portas/tokens.ts`, `portas/index.ts`, `auditoria/registro-de-auditoria.ts`, `auditoria/serializacao-canonica.ts`, `auditoria/serializacao-canonica.spec.ts`, `comum/constantes.ts`, `comum/resultado.ts`, `comum/resultado.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // portas/repositorios.ts
  export interface UsuarioRepositorio {
    porId(id: UsuarioId): Promise<Usuario | null>;
    porEmail(email: Email): Promise<Usuario | null>;
    contarProprietariosAtivos(): Promise<number>;
    salvar(u: Usuario): Promise<void>;             // versao 0 → INSERT; senão UPDATE otimista; conflito → ConflitoDeConcorrencia
  }
  export interface DispositivoRepositorio {
    porId(id: DispositivoId): Promise<Dispositivo | null>;
    ativosDoUsuario(id: UsuarioId): Promise<Dispositivo[]>;
    todosDoUsuario(id: UsuarioId): Promise<Dispositivo[]>;   // ordem: registradoEm ascendente
    salvar(d: Dispositivo): Promise<void>;
  }
  export interface SessaoDeLoginRepositorio {
    porId(id: SessaoDeLoginId): Promise<SessaoDeLogin | null>;
    ativaDoDispositivo(id: DispositivoId): Promise<SessaoDeLogin | null>;
    ativasDoUsuario(id: UsuarioId): Promise<SessaoDeLogin[]>;
    porRefreshHash(hash: string): Promise<SessaoDeLogin | null>;  // casa refresh_atual_hash OU refresh_anterior_hash; se houver mais de uma, a de criadaEm mais recente
    salvar(s: SessaoDeLogin): Promise<void>;
  }
  export interface DesafioDeLogin { readonly id: string; readonly usuarioId: UsuarioId; readonly expiraEm: Date; readonly usadoEm: Date | null; }
  export interface DesafioDeLoginRepositorio {
    criar(d: { id: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void>;
    porId(id: string): Promise<DesafioDeLogin | null>;
    marcarUsado(id: string, agora: Date): Promise<boolean>;    // true só se usado_em era NULL e agora < expira_em (atômico)
  }
  export interface TokenDeRedefinicaoRepositorio {
    criar(d: { hash: string; usuarioId: UsuarioId; expiraEm: Date }): Promise<void>;
    usuarioDoTokenValido(hash: string, agora: Date): Promise<UsuarioId | null>;  // só leitura
    consumir(hash: string, agora: Date): Promise<boolean>;                       // atômico, como marcarUsado
    invalidarDoUsuario(usuarioId: UsuarioId, agora: Date): Promise<void>;        // marca usado_em em todos os não usados
  }
  export interface RepositorioDeAuditoria {
    registrar(reg: RegistroDeAuditoria): Promise<void>;
    ultimoHashDoApp(dispositivoId: DispositivoId): Promise<string | null>;
    idsExistentes(ids: readonly string[]): Promise<Set<string>>;
  }

  // portas/servicos.ts
  export interface HasherDeSenha {
    gerar(senha: string): Promise<HashDeSenha>;
    conferir(senha: string, hash: HashDeSenha): Promise<boolean>;
    conferirFicticio(senha: string): Promise<void>;   // gasta o mesmo tempo de um conferir real (RN-12)
  }
  export interface ResultadoTotp { readonly valido: boolean; readonly passo: number; }
  export interface ServicoTotp {
    novoSegredo(): string;                                                          // base32
    urlDoAutenticador(segredo: string, email: string): string;                     // otpauth://totp/...
    verificar(segredo: string, codigo: string, ultimoPasso: number | null): ResultadoTotp; // janela ±1; passo <= ultimoPasso → valido=false
  }
  export interface CofreDeSegredos { cifrar(texto: string): Promise<Uint8Array>; decifrar(dados: Uint8Array): Promise<string>; }
  export interface DadosDoAccess { readonly usuarioId: string; readonly dispositivoId: string; readonly sessaoId: string; readonly papeis: readonly NomeDePapel[]; }
  export interface EmissorDeTokens {
    emitirAccess(dados: DadosDoAccess, expiraEm: Date): string;
    verificarAccess(token: string): DadosDoAccess;                      // inválido ou expirado → SessaoExpirada
    gerarTokenOpaco(): { token: string; hash: string };                // 32 bytes base64url + sha256 hex (D-013)
    hashDe(token: string): string;
    emitirDesafio(usuarioId: UsuarioId, expiraEm: Date): { id: string; token: string };
    verificarDesafio(token: string): { id: string; usuarioId: UsuarioId };  // inválido → DesafioInvalido
  }
  export interface EnviadorDeEmail { enviarRedefinicaoDeSenha(para: Email, dados: { link: string; token: string; expiraEm: Date }): Promise<void>; }
  export interface Relogio { agora(): Date; }
  export interface BarramentoDeEventos { publicar(eventos: readonly EventoDeDominio[]): Promise<void>; }
  export interface GeradorDeCodigosDeRecuperacao { gerar(quantidade: number): { codigo: string; hash: string }[]; hashDe(codigo: string): string; }
  export interface CalculadoraDeHash { sha256Hex(texto: string): string; }
  export interface VerificadorDeAssinatura { verificarEd25519(mensagem: string, assinaturaB64: string, chavePublicaB64: string): boolean; }

  // portas/unidade-de-trabalho.ts
  export interface RepositoriosDaTransacao {
    readonly usuarios: UsuarioRepositorio; readonly dispositivos: DispositivoRepositorio; readonly sessoes: SessaoDeLoginRepositorio;
    readonly desafios: DesafioDeLoginRepositorio; readonly tokensDeRedefinicao: TokenDeRedefinicaoRepositorio; readonly auditoria: RepositorioDeAuditoria;
  }
  export interface UnidadeDeTrabalho { executar<T>(trabalho: (r: RepositoriosDaTransacao) => Promise<T>): Promise<T>; }

  // portas/conflito-de-concorrencia.ts
  export class ConflitoDeConcorrencia extends Error { readonly codigo = 'CONFLITO_DE_CONCORRENCIA'; constructor() /* mensagem 'Registro alterado por outra operação.' */ }

  // portas/tokens.ts — símbolos de injeção (um por porta + configuração)
  export const UNIDADE_DE_TRABALHO = Symbol('UnidadeDeTrabalho');
  // ... HASHER_DE_SENHA, SERVICO_TOTP, COFRE_DE_SEGREDOS, EMISSOR_DE_TOKENS, ENVIADOR_DE_EMAIL, RELOGIO, BARRAMENTO_DE_EVENTOS,
  //     GERADOR_DE_CODIGOS_DE_RECUPERACAO, CALCULADORA_DE_HASH, VERIFICADOR_DE_ASSINATURA, POLITICA_DE_ACESSO, POLITICA_DE_SENHA, CONFIGURACAO

  // auditoria/registro-de-auditoria.ts
  export const TIPOS_DE_AUDITORIA = ['usuario-criado','usuario-desativado','acesso-redefinido-administrativamente','login-ok','login-falhou','usuario-bloqueado',
    'mfa-configurado','codigo-de-recuperacao-usado','codigos-de-recuperacao-regenerados','senha-alterada','redefinicao-de-senha-solicitada',
    'dispositivo-registrado','dispositivo-revogado','sessao-revogada','refresh-reutilizado','reautenticacao-sensivel',
    'desbloqueio-local-configurado','desbloqueio-local-ok','desbloqueio-local-falhou','senha-mestre-alterada','biometria-ativada','biometria-desativada',
    'app-bloqueado','desbloqueio-local-redefinido','modo-somente-leitura'] as const;
  export type TipoDeAuditoria = (typeof TIPOS_DE_AUDITORIA)[number];
  export const TIPOS_DE_AUDITORIA_DO_APP: readonly TipoDeAuditoria[] = ['desbloqueio-local-configurado','desbloqueio-local-ok','desbloqueio-local-falhou',
    'senha-mestre-alterada','biometria-ativada','biometria-desativada','app-bloqueado','desbloqueio-local-redefinido','modo-somente-leitura','reautenticacao-sensivel'];
  export type DetalheDeAuditoria = Readonly<Record<string, string | number | boolean | null>>;
  export interface RegistroDeAuditoriaDoServidor { readonly origem: 'servidor'; readonly id: string; readonly tipo: TipoDeAuditoria; readonly ocorridoEm: Date;
    readonly usuarioId: string | null; readonly dispositivoId: string | null; readonly ip: string | null; readonly detalhe: DetalheDeAuditoria; }
  export interface RegistroDeAuditoriaDoApp { readonly origem: 'app'; readonly id: string; readonly tipo: TipoDeAuditoria; readonly ocorridoEm: Date;
    readonly usuarioId: string; readonly dispositivoId: string; readonly ip: string | null; readonly detalhe: DetalheDeAuditoria;
    readonly hashAnterior: string | null; readonly hash: string; readonly assinatura: string; }
  export type RegistroDeAuditoria = RegistroDeAuditoriaDoServidor | RegistroDeAuditoriaDoApp;

  // auditoria/serializacao-canonica.ts (D-009)
  export interface DadosCanonicos { id: string; ocorridoEm: Date; tipo: string; usuarioId: string | null; dispositivoId: string | null; detalhe: DetalheDeAuditoria; hashAnterior: string | null; }
  export function serializarCanonico(d: DadosCanonicos): string;
  export function ehDetalheValido(valor: unknown): valor is DetalheDeAuditoria;
  // ehDetalheValido: objeto simples (não array, não null); ≤ 20 chaves; chaves casam /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
  // valores: string (≤ 200 caracteres, sem caracteres de controle U+0000–U+001F), inteiro seguro (Number.isSafeInteger), boolean ou null.

  // comum/constantes.ts
  export const VALIDADE_DESAFIO_MIN = 5;
  export const VALIDADE_TOKEN_REDEFINICAO_MIN = 30;
  export const MAX_REGISTROS_POR_LOTE_DE_AUDITORIA = 500;
  export const TOLERANCIA_DE_RELOGIO_DO_APP_MIN = 5;

  // comum/resultado.ts
  export type Resultado<T> =
    | { readonly ok: true; readonly valor: T; readonly eventos: readonly EventoDeDominio[] }
    | { readonly ok: false; readonly erro: Error; readonly eventos: readonly EventoDeDominio[] };
  export function sucesso<T>(valor: T, eventos?: readonly EventoDeDominio[]): Resultado<T>;
  export function falha<T>(erro: Error, eventos?: readonly EventoDeDominio[]): Resultado<T>;
  export function desembrulhar<T>(r: Resultado<T>): T;   // ok → valor; senão lança r.erro
  ```
- **Passo a passo**:
  1. Criar os arquivos com o contrato literal. `portas/index.ts` reexporta tudo de `portas/`.
  2. `serializarCanonico`: `['v1', id, ocorridoEm.toISOString(), tipo, usuarioId ?? '', dispositivoId ?? '', detalheCanonico, hashAnterior ?? ''].join('|')`, com `detalheCanonico = '{' + chavesOrdenadas.map(k => JSON.stringify(k) + ':' + JSON.stringify(detalhe[k])).join(',') + '}'`.
- **Testes obrigatórios**:
  - `serializacao-canonica.spec.ts` — **vetor D-009**: R1 produz exatamente
    `v1|7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c01|2026-10-13T12:00:00.000Z|desbloqueio-local-ok|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|{"metodo":"senha"}|`
    e R2 (detalhe passado como `{ tentativa: 3, metodo: 'senha' }`) produz exatamente
    `v1|7d444840-9dc0-4b8a-9f4e-2a1c0c0c0c02|2026-10-13T12:05:30.250Z|desbloqueio-local-falhou|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|{"metodo":"senha","tentativa":3}|b68a202facc255b14d9b5da433c9cfd2657d8d058e6ab17645016ac97c7b508a`;
    nulos viram string vazia; `ehDetalheValido` aceita `{}` e `{a:'x',b:1,c:true,d:null}`; rejeita `null`, `[]`, `{a:{}}`, `{a:1.5}`, `{a:'\n'}`, `{'1a':1}`, string de 201 caracteres e 21 chaves.
  - `resultado.spec.ts`: `desembrulhar(sucesso(1))` → 1; `desembrulhar(falha(new CredenciaisInvalidas()))` lança a mesma instância; eventos padrão `[]`.
- **Requisitos de segurança**: tipos de auditoria fechados (lista); detalhe sem aninhamento nem controle (evita injeção em logs e divergência de hash).
- **Critérios de aceite**: [ ] contrato literal · [ ] vetores D-009 batem · [ ] verificação de camadas vazia
- **Comandos de verificação** (em `backend/`):
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/application
  grep -rnE "from '(@nestjs|drizzle-orm|pg|argon2|otplib|nodemailer)|infrastructure/|interface/" src/identidade-e-acesso/application ; echo "exit=$?"
  ```
- **Fora de escopo**: implementações (fakes na TASK-021, reais em 04).
- **Convenção de commit**: `feat(TASK-020): add application ports, audit types and canonical serialization`

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

### TASK-021: Fakes em memória (repositórios, UoW com rollback e adaptadores)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-020
- **Objetivo**: Prover implementações em memória fiéis às portas para testar os casos de uso sem banco (SPEC §9 — Aplicação).
- **Arquivos permitidos** (novos, em `backend/test/identidade-e-acesso/fakes/`): `repositorios-em-memoria.ts`, `unidade-de-trabalho-em-memoria.ts`, `relogio-fixo.ts`, `hasher-falso.ts`, `servico-totp-falso.ts`, `cofre-falso.ts`, `emissor-de-tokens-falso.ts`, `enviador-de-email-falso.ts`, `barramento-falso.ts`, `gerador-de-codigos-falso.ts`, `cripto-de-teste.ts`, `ambiente-de-teste.ts`, `index.ts`, `fakes.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - Repositórios guardam **cópias** (snapshot via `reconstituir` com os getters), nunca a instância recebida. `salvar` respeita versão: se `versao === 0` e id já existe → `ConflitoDeConcorrencia`; se `versao !== versão armazenada` → `ConflitoDeConcorrencia`; depois de salvar chama `definirVersaoPersistida(versao + 1)` na instância recebida.
  - `UsuarioRepositorioEmMemoria.salvar` lança `ConflitoDeConcorrencia` se outro usuário já tem o mesmo e-mail (simula `UNIQUE`).
  - `SessaoDeLoginRepositorioEmMemoria.salvar` lança `ConflitoDeConcorrencia` se já existe **outra** sessão ativa no mesmo dispositivo (simula o índice único parcial).
  - `RepositorioDeAuditoriaEmMemoria`: `registros: RegistroDeAuditoria[]` público (somente leitura para asserts); `ultimoHashDoApp` devolve o `hash` do último registro `origem:'app'` do dispositivo.
  - `UnidadeDeTrabalhoEmMemoria`: antes de executar tira snapshot profundo de todos os mapas; se o trabalho lançar, restaura o snapshot e relança (simula rollback). Expõe `repositorios` para os asserts.
  - `RelogioFixo { constructor(inicio: Date); agora(): Date /* cópia */; avancar(ms: number): void; definir(d: Date): void }`
  - `HasherFalso`: `gerar(s)` → `HashDeSenha.de('$argon2id$falso$' + sha256Hex(s))`; `conferir` compara; `conferirFicticio` incrementa `chamadasFicticias`.
  - `ServicoTotpFalso`: `codigosValidos = new Map<string, number>()` (código → passo); `verificar(seg, cod, ult)` → `{ valido: map.has(cod) && (ult === null || passo > ult), passo: map.get(cod) ?? -1 }`; `novoSegredo()` → `'SEGREDO' + contador`; `urlDoAutenticador` → `'otpauth://totp/teste?secret=' + seg`.
  - `CofreFalso`: `cifrar(t)` → `[0x01, ...12 zeros, ...utf8(t), ...16 zeros]`; `decifrar` inverte.
  - `EmissorDeTokensFalso`: `emitirAccess` → `'access.' + base64url(JSON)`; `verificarAccess` decodifica ou lança `SessaoExpirada`; `gerarTokenOpaco` → `{ token: 'opaco-' + n, hash: sha256Hex(token) }`; `hashDe` = sha256Hex; `emitirDesafio` → id `crypto.randomUUID()`, token `'desafio.' + id + '.' + usuarioId`; `verificarDesafio` faz o parse ou lança `DesafioInvalido`.
  - `EnviadorDeEmailFalso`: `enviados: { para: string; link: string; token: string }[]`; `falharProximo = false` (quando true, rejeita uma vez).
  - `BarramentoFalso`: `publicados: EventoDeDominio[]`.
  - `GeradorDeCodigosFalso`: contador `n` que **nunca reinicia** entre chamadas (começa em 1); cada código é `'TEST-' + grupos de 4 de String(n).padStart(12, '0')` (ex.: n=1 → `'TEST-0000-0000-0001'`, n=11 → `'TEST-0000-0000-0011'`), assim cada geração produz códigos novos; `hashDe` normaliza (D-013: maiúsculas, remove `-` e espaços, `O→0`, `I→1`, `L→1`) e aplica sha256Hex.
  - `cripto-de-teste.ts`: `sha256Hex(texto)` com `node:crypto`; `CalculadoraDeHashDeTeste`; `VerificadorDeAssinaturaDeTeste` (Ed25519 real via `crypto.verify(null, ...)` com chave SPKI montada a partir dos 32 bytes: prefixo DER `302a300506032b6570032100`).
  - `ambiente-de-teste.ts`:
    ```ts
    export interface AmbienteDeTeste { uow; repos: RepositoriosDaTransacao (os em memória); relogio; hasher; totp; cofre; emissor; email; barramento; codigos; hash; assinatura; politica: PoliticaDeAcesso; politicaDeSenha: PoliticaDeSenha; auditor: Auditor? }
    export function criarAmbienteDeTeste(): AmbienteDeTeste;  // relógio em 2026-10-13T12:00:00.000Z; POLITICA_PADRAO; PoliticaDeSenha(new Set(['fisioterapia123']))
    export async function semearUsuarioComMfa(amb, dados?: { email?: string; senha?: string }): Promise<{ usuario: Usuario; senha: string; codigoValido: string; codigosDeRecuperacao: string[] }>;
    // cria usuário proprietario (senha padrão 'senha-de-teste-forte-123'), MFA confirmado no passo 1000, 10 códigos de recuperação, registra '123456' → passo 1001 no ServicoTotpFalso
    export async function semearDispositivo(amb, usuarioId: UsuarioId): Promise<Dispositivo>; // chave pública 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ='
    ```
    Como `Auditor` só existe na TASK-022, deixe o campo `auditor` fora agora; a TASK-022 o adiciona (arquivo permitido lá).
- **Passo a passo**: implementar cada fake; `index.ts` reexporta tudo; escrever `fakes.spec.ts`.
- **Testes obrigatórios** (`fakes.spec.ts` — o arquivo fica em `test/`, mas casa com `**/*.spec.ts` e roda no `pnpm test`):
  1. salvar → mutar a instância original sem salvar → `porId` devolve o estado salvo (cópia);
  2. salvar duas vezes com versão desatualizada lança `ConflitoDeConcorrencia`;
  3. UoW: trabalho que salva e depois lança → estado restaurado (rollback);
  4. índice único de sessão ativa por dispositivo simulado;
  5. `marcarUsado` retorna `true` uma vez e `false` na segunda; `false` se expirado;
  6. `VerificadorDeAssinaturaDeTeste` valida a assinatura R1 do D-009 e rejeita com um byte alterado.
- **Requisitos de segurança**: fakes só em `test/`; nenhum import de `test/` a partir de `src/` que não seja `*.spec.ts` (verificação abaixo).
- **Critérios de aceite**: [ ] testes passam · [ ] `grep -rln "test/identidade-e-acesso/fakes" src | grep -v "\.spec\.ts$"` vazio
- **Comandos de verificação**:
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- test/identidade-e-acesso/fakes
  grep -rln "test/identidade-e-acesso/fakes" src | grep -v "\.spec\.ts$" ; echo "exit=$?"
  ```
- **Fora de escopo**: casos de uso.
- **Convenção de commit**: `test(TASK-021): add in-memory fakes for identity application tests`

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

### TASK-022: `Auditor` — eventos de domínio → registros de auditoria
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-021
- **Objetivo**: Traduzir eventos em registros de auditoria do servidor (RN-37, RN-38) num único lugar.
- **Arquivos permitidos**: `application/auditoria/auditor.ts`, `application/auditoria/auditor.spec.ts` (novos); `test/identidade-e-acesso/fakes/ambiente-de-teste.ts` (adicionar o campo `auditor: new Auditor()`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface MetadadosDeAuditoria { readonly ip: string | null; readonly dispositivoId: DispositivoId | null; }
  export class Auditor {
    paraRegistros(eventos: readonly EventoDeDominio[], meta: MetadadosDeAuditoria): RegistroDeAuditoriaDoServidor[];
    avulso(tipo: TipoDeAuditoria, d: { ocorridoEm: Date; usuarioId: UsuarioId | null; dispositivoId: DispositivoId | null; ip: string | null; detalhe?: DetalheDeAuditoria }): RegistroDeAuditoriaDoServidor;
    async registrar(repo: RepositorioDeAuditoria, eventos: readonly EventoDeDominio[], meta: MetadadosDeAuditoria): Promise<void>;   // em sequência, na ordem dos eventos
  }
  ```
  Cada registro recebe `id: crypto.randomUUID()`, `origem: 'servidor'`, `ocorridoEm` do evento, `ip` de `meta.ip`, `dispositivoId` do evento quando houver, senão `meta.dispositivoId?.valor ?? null`.
  | Evento | `tipo` | `detalhe` |
  |---|---|---|
  | UsuarioCriado | `usuario-criado` | `{}` |
  | UsuarioDesativado | `usuario-desativado` | `{}` |
  | AcessoRedefinidoAdministrativamente | `acesso-redefinido-administrativamente` | `{}` |
  | MfaConfigurado | `mfa-configurado` | `{}` |
  | SenhaAlterada | `senha-alterada` | `{}` |
  | LoginRealizado | `login-ok` | `{}` |
  | LoginFalhou | `login-falhou` | `{ motivo }` |
  | UsuarioBloqueado | `usuario-bloqueado` | `{ bloqueadoAte: iso }` |
  | CodigoDeRecuperacaoUsado | `codigo-de-recuperacao-usado` | `{ restantes }` |
  | CodigosDeRecuperacaoRegenerados | `codigos-de-recuperacao-regenerados` | `{}` |
  | DispositivoRegistrado | `dispositivo-registrado` | `{ plataforma }` |
  | DispositivoRevogado | `dispositivo-revogado` | `{ motivo }` |
  | SessaoRevogada (motivo `reutilizacao-de-refresh`) | `refresh-reutilizado` | `{ motivo }` |
  | SessaoRevogada (demais) | `sessao-revogada` | `{ motivo }` |
  Evento desconhecido → lança `Error('Evento sem mapeamento de auditoria: <tipo>')` (falha alta durante o desenvolvimento).
- **Testes obrigatórios**: `it.each` cobrindo as 14 linhas; `dispositivoId` vem do evento quando existe e de `meta` quando não; `registrar` grava na ordem; nenhum `detalhe` contém chaves `senha`, `codigo`, `token`, `hash`, `segredo`, `email`.
- **Requisitos de segurança**: RN-38 — sem senha, código, token ou e-mail no `detalhe`.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: hash encadeado do servidor (infra, TASK-046).
- **Convenção de commit**: `feat(TASK-022): add domain event to audit record mapper`

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

### TASK-023: Utilitários de desafio e verificação de MFA
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-022
- **Objetivo**: Centralizar a validação do desafio de login (UC-03/04/05) e a verificação de código TOTP/recuperação (RN-09, RN-10), usadas por vários casos de uso.
- **Arquivos permitidos**: `application/comum/validacao-de-desafio.ts`, `application/comum/verificador-de-mfa.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // validacao-de-desafio.ts
  export async function carregarDesafioValido(token: string, emissor: EmissorDeTokens, r: RepositoriosDaTransacao, agora: Date): Promise<{ desafioId: string; usuario: Usuario }>;
  // 1) emissor.verificarDesafio(token) (propaga DesafioInvalido); 2) linha = r.desafios.porId(id): null, usadoEm !== null ou agora >= expiraEm → DesafioInvalido;
  // 3) linha.usuarioId deve ser igual ao do token → senão DesafioInvalido; 4) usuario = r.usuarios.porId → null → DesafioInvalido.
  // NÃO marca como usado.

  // verificador-de-mfa.ts
  export type CodigoInformado = { readonly tipo: 'totp'; readonly valor: string } | { readonly tipo: 'recuperacao'; readonly valor: string };
  export type ResultadoDeMfa = { readonly ok: true; readonly usouRecuperacao: boolean } | { readonly ok: false };
  export class VerificadorDeMfa {
    constructor(totp: ServicoTotp, cofre: CofreDeSegredos, codigos: GeradorDeCodigosDeRecuperacao);
    async verificar(usuario: Usuario, codigo: CodigoInformado, agora: Date): Promise<ResultadoDeMfa>;
    async verificarSegredo(segredo: SegredoTotpCifrado, codigo: string, ultimoPasso: number | null): Promise<{ ok: true; passo: number } | { ok: false }>;
  }
  ```
  `verificar` **nunca lança** por código errado (retorna `{ ok: false }`):
  - `totp`: `valor` deve casar `/^\d{6}$/`; decifra `usuario.segredoMfaConfirmado()`; `totp.verificar(segredo, valor, usuario.ultimoPassoTotp())`; válido → `usuario.aceitarPassoTotp(passo)` (se lançar `CodigoMfaInvalido` → `{ok:false}`) → `{ ok: true, usouRecuperacao: false }`.
  - `recuperacao`: `valor` com 16–19 caracteres; `hash = codigos.hashDe(valor)`; `usuario.consumirCodigoDeRecuperacao(hash, agora)` (se lançar `CodigoMfaInvalido` → `{ok:false}`) → `{ ok: true, usouRecuperacao: true }`.
  - Se o usuário não tiver MFA confirmado, deixe `MfaObrigatorio` propagar (os casos de uso checam isso antes).
- **Testes obrigatórios**: desafio válido carrega; token inválido, desafio usado, expirado (`agora === expiraEm`), de outro usuário e usuário inexistente → `DesafioInvalido`; TOTP válido aceita e grava o passo; mesmo código de novo → `{ok:false}` (RN-10); TOTP com 5 dígitos ou letras → `{ok:false}` sem chamar o serviço; código de recuperação válido → `usouRecuperacao: true` e 9 restantes; reutilizado → `{ok:false}`; com hífens e minúsculas (`'test-0000-0000-0001'`) é aceito.
- **Requisitos de segurança**: sem vazamento de qual etapa falhou (sempre `{ok:false}`).
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: contagem de falhas (feita pelo caso de uso).
- **Convenção de commit**: `feat(TASK-023): add login challenge validation and MFA verifier`

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

### TASK-024: UC-01 `CriarPrimeiroProprietario`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-023
- **Objetivo**: Criar o primeiro Proprietário por comando administrativo (RN-01, 02, 05, 06).
- **Arquivos permitidos**: `application/casos-de-uso/criar-primeiro-proprietario.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface DependenciasCriarPrimeiroProprietario { uow: UnidadeDeTrabalho; hasher: HasherDeSenha; politicaDeSenha: PoliticaDeSenha; politica: PoliticaDeAcesso; relogio: Relogio; auditor: Auditor; barramento: BarramentoDeEventos; }
  export interface EntradaCriarPrimeiroProprietario { nome: string; email: string; senha: string; }
  export interface SaidaCriarPrimeiroProprietario { usuarioId: string; }
  export class CriarPrimeiroProprietario { executar(e): Promise<SaidaCriarPrimeiroProprietario>; }
  ```
- **Passo a passo**:
  1. `email = Email.criar(e.email)` (propaga `EmailInvalido`).
  2. `politicaDeSenha.validar(e.senha, email, politica)` (propaga `SenhaFraca`).
  3. `hash = await hasher.gerar(e.senha)` (fora da transação).
  4. Na transação: `contarProprietariosAtivos() > 0` → lançar `ProprietarioJaExiste`; `porEmail(email)` existe → `EmailJaCadastrado`; `Usuario.criar({ ..., papeis: ['proprietario'] })`; salvar; auditar com `meta { ip: null, dispositivoId: null }`.
  5. Publicar eventos; retornar `{ usuarioId }`.
- **Testes obrigatórios**: caminho feliz (usuário salvo, `ehProprietarioAtivo()`, auditoria `usuario-criado`, evento publicado, hash ≠ senha); segundo proprietário → `ProprietarioJaExiste`; e-mail inválido → `EmailInvalido`; senha `'curta'` → `SenhaFraca` e nada salvo; senha nunca aparece em `JSON.stringify(repos.usuarios)` nem nos registros de auditoria.
- **Requisitos de segurança**: RN-06 — só o hash é salvo; senha não vai para auditoria/eventos.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: CLI (TASK-056).
- **Convenção de commit**: `feat(TASK-024): add CriarPrimeiroProprietario use case`

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

### TASK-025: UC-02 `IniciarLogin`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-023
- **Objetivo**: Primeiro passo do login: e-mail + senha → desafio de uso único (RN-11, 12, 13; SPEC §6.4).
- **Arquivos permitidos**: `application/casos-de-uso/iniciar-login.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface DependenciasIniciarLogin { uow; hasher; emissor: EmissorDeTokens; relogio; politica; auditor; barramento; }
  export interface EntradaIniciarLogin { email: string; senha: string; ip: string | null; }
  export interface SaidaIniciarLogin { desafio: string; mfa: 'configurar' | 'verificar'; expiraEm: Date; }
  ```
- **Passo a passo** (SPEC §6.4 UC-02):
  1. `agora`. Se `Email.criar` lançar → `await hasher.conferirFicticio(senha)` e lançar `CredenciaisInvalidas`.
  2. Na transação, retornando `Resultado<SaidaIniciarLogin>`:
     a. `usuario = porEmail`. Se `null` → `conferirFicticio(senha)` → `falha(new CredenciaisInvalidas())`.
     b. `garantirQuePodeAutenticar(agora)`: se lançar `ContaBloqueada`/`ContaDesativada` → registrar `auditor.avulso('login-falhou', { ..., detalhe: { motivo: 'conta-bloqueada' | 'conta-desativada' } })` e retornar `falha(erro)`. **Sem conferir a senha.**
     c. `hasher.conferir(senha, usuario.hashDeSenha)` falso → `registrarFalhaDeLogin(agora, politica, 'senha')`, salvar, auditar eventos, `falha(new CredenciaisInvalidas(), eventos)`.
     d. Correto: `expiraEm = agora + VALIDADE_DESAFIO_MIN`; `emissor.emitirDesafio(usuario.id, expiraEm)`; `desafios.criar(...)`; **não** zera o contador; `sucesso({ desafio: token, mfa: usuario.exigeConfigurarMfa() ? 'configurar' : 'verificar', expiraEm })`.
  3. Publicar eventos; `desembrulhar`.
- **Testes obrigatórios** (SPEC §9):
  1. feliz com MFA confirmado → `mfa: 'verificar'`; desafio salvo com validade de 5 min;
  2. **primeiro login exige configurar MFA** → usuário sem MFA retorna `mfa: 'configurar'`;
  3. **e-mail inexistente e senha errada dão a mesma resposta**: ambos lançam `CredenciaisInvalidas` com a mesma `message`; no inexistente `hasher.chamadasFicticias === 1`;
  4. e-mail malformado → `CredenciaisInvalidas` (não `EmailInvalido`) e conferência fictícia feita;
  5. 5 senhas erradas → `tentativasFalhas === 5` persistido (prova que a falha **sobrevive** ao erro — rollback não pode desfazer) e a 6ª tentativa lança `ContaBloqueada`;
  6. senha correta não zera `tentativasFalhas` (zera só no `ConcluirLogin`);
  7. conta desativada → `ContaDesativada` + auditoria `login-falhou` com `motivo: 'conta-desativada'`;
  8. auditoria de falha não contém a senha.
- **Requisitos de segurança**: RN-12 (resposta e tempo iguais), RN-13; senha nunca em log/auditoria.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: limite de taxa por IP (TASK-051).
- **Convenção de commit**: `feat(TASK-025): add IniciarLogin use case`

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

### TASK-026: UC-03 `GerarSegredoDeMfa` e UC-04 `ConfirmarMfa`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-025
- **Objetivo**: Configuração obrigatória do TOTP no primeiro login e geração dos 10 códigos de recuperação (RN-07, 08, 10).
- **Arquivos permitidos**: `application/casos-de-uso/gerar-segredo-de-mfa.ts`, `application/casos-de-uso/confirmar-mfa.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // UC-03
  export interface DependenciasGerarSegredoDeMfa { uow; emissor; totp: ServicoTotp; cofre: CofreDeSegredos; relogio; }
  export interface EntradaGerarSegredoDeMfa { desafio: string; }
  export interface SaidaGerarSegredoDeMfa { segredo: string; urlOtpauth: string; }
  // UC-04
  export interface DependenciasConfirmarMfa { uow; emissor; totp; cofre; codigos: GeradorDeCodigosDeRecuperacao; verificadorDeMfa: VerificadorDeMfa; relogio; politica; auditor; barramento; }
  export interface EntradaConfirmarMfa { desafio: string; codigo: string; ip: string | null; }
  export interface SaidaConfirmarMfa { codigosDeRecuperacao: string[]; }   // 10, exibidos uma única vez
  ```
- **Passo a passo**:
  - UC-03 (transação): `carregarDesafioValido`; se `!usuario.exigeConfigurarMfa()` → lançar `MfaJaConfigurado`; `segredo = totp.novoSegredo()`; `usuario.prepararMfa(SegredoTotpCifrado.de(await cofre.cifrar(segredo)))`; salvar; retornar `{ segredo, urlOtpauth: totp.urlDoAutenticador(segredo, usuario.email.valor) }`. Chamar de novo substitui o segredo pendente.
  - UC-04 (transação): `carregarDesafioValido`; `cifrado = usuario.segredoMfaPendenteDeConfirmacao()` (pode lançar antes de mudar estado); `r = await verificadorDeMfa.verificarSegredo(cifrado, codigo, null)`; inválido → `registrarFalhaDeLogin(agora, politica, 'mfa')`, salvar, auditar, `falha(CodigoMfaInvalido)`; válido → `gerados = codigos.gerar(10)`; `usuario.confirmarMfa(r.passo, gerados.map(g => ({ id: crypto.randomUUID(), hash: g.hash })), agora)`; salvar; auditar; `sucesso({ codigosDeRecuperacao: gerados.map(g => g.codigo) })`. **Não** marca o desafio como usado (o `ConcluirLogin` usa o mesmo desafio).
- **Testes obrigatórios**: UC-03 grava segredo cifrado (bytes ≠ texto) e retorna URL; UC-03 com MFA já confirmado → `MfaJaConfigurado`; UC-03 com desafio inválido → `DesafioInvalido`; UC-04 feliz → 10 códigos distintos, só hashes no repositório, `exigeConfigurarMfa() === false`, auditoria `mfa-configurado`; UC-04 código errado → `CodigoMfaInvalido` **e** `tentativasFalhas` incrementado persistido; UC-04 sem UC-03 antes → `MfaObrigatorio`; após UC-04, o mesmo código usado no `ConcluirLogin` seria rejeitado (assert `ultimoPassoTotp() === passo`).
- **Requisitos de segurança**: segredo TOTP só cifrado em repouso (DT-03); códigos de recuperação só como hash (RN-08); falhas de MFA contam para o bloqueio.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: QR code (frontend).
- **Convenção de commit**: `feat(TASK-026): add MFA setup use cases`

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

### TASK-027: UC-05 `ConcluirLogin`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-026
- **Objetivo**: Segundo passo do login: código TOTP/recuperação → sessão, tokens e dispositivo (RN-07, 09, 10, 13, 15, 17, 18, 20; SPEC §6.4).
- **Arquivos permitidos**: `application/casos-de-uso/concluir-login.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface DependenciasConcluirLogin { uow; emissor; verificadorDeMfa; relogio; politica; limiteDeDispositivos: PoliticaDeLimiteDeDispositivos; auditor; barramento; }
  export interface DadosDoDispositivoInformado { id: string | null; apelido: string; plataforma: string; chavePublicaAuditoria: string; }
  export interface EntradaConcluirLogin { desafio: string; codigo: CodigoInformado; dispositivo: DadosDoDispositivoInformado; ip: string | null; }
  export interface SaidaConcluirLogin {
    accessToken: string; accessExpiraEm: Date; refreshToken: string; dispositivoId: string; politica: PoliticaDeAcesso;
    usuario: { id: string; nome: string; email: string; papeis: NomeDePapel[] };
    usouCodigoDeRecuperacao: boolean; codigosRestantes: number;
  }
  ```
- **Passo a passo** (tudo numa transação, devolvendo `Resultado`):
  1. `carregarDesafioValido` (pode lançar — nada mudou ainda).
  2. `desafios.marcarUsado(id, agora)` falso → `falha(DesafioInvalido)`.
  3. `garantirQuePodeAutenticar(agora)`: erro → `falha(erro)` (desafio continua usado).
  4. `exigeConfigurarMfa()` → `falha(MfaObrigatorio)`.
  5. `verificadorDeMfa.verificar(usuario, codigo, agora)`; `{ok:false}` → `registrarFalhaDeLogin(agora, politica, 'mfa')`, salvar, auditar, `falha(CodigoMfaInvalido)`.
  6. Dispositivo: se `dispositivo.id` é UUID válido e `porId` encontra um dispositivo **do mesmo usuário**: ativo → reutiliza; revogado → salvar usuário (passo/código consumido), auditar, `falha(DispositivoRevogado)`. Em qualquer outro caso (id nulo, inválido, inexistente ou de outro usuário) → **novo**: `ativos = ativosDoUsuario`; `limiteDeDispositivos.garantirQuePodeRegistrar(ativos.length, politica)` — se lançar, salvar usuário, auditar e `falha(erro)`; `Dispositivo.registrar(...)` — `DadoInvalido` → salvar usuário e `falha(erro)`.
  7. `anterior = sessoes.ativaDoDispositivo(disp.id)` → `anterior.revogar('nova-sessao-no-dispositivo', agora)` e salvar **antes** de criar a nova.
  8. `{ token: refresh, hash } = emissor.gerarTokenOpaco()`; `sessao = SessaoDeLogin.iniciar(...)`.
  9. `usuario.registrarLoginCompleto(agora, disp.id)`; `disp.registrarCheckIn(agora)`.
  10. Salvar na ordem: usuário, dispositivo, sessão. Auditar eventos de usuário, dispositivo, sessão anterior (com `meta.dispositivoId = disp.id`).
  11. `accessExpiraEm = agora + validadeAccessMin`; `accessToken = emissor.emitirAccess({ usuarioId, dispositivoId, sessaoId, papeis }, accessExpiraEm)`.
  12. `sucesso(saida)`; fora da transação publicar e `desembrulhar`.
- **Testes obrigatórios** (SPEC §9):
  1. **login completo feliz**: tokens, dispositivo novo registrado (evento + auditoria `dispositivo-registrado`), sessão ativa com `hash` do refresh (não o refresh), `tentativasFalhas === 0`, auditoria `login-ok`;
  2. **desafio de uso único**: segunda chamada com o mesmo desafio → `DesafioInvalido`;
  3. código errado → `CodigoMfaInvalido`, desafio usado e falha contada (persistidos);
  4. código de recuperação → `usouCodigoDeRecuperacao: true`, `codigosRestantes: 9`, auditoria `codigo-de-recuperacao-usado`;
  5. dispositivo existente ativo é reutilizado (mesmo id) e a sessão anterior do dispositivo é revogada com motivo `nova-sessao-no-dispositivo`;
  6. dispositivo revogado → `DispositivoRevogado`, sem sessão criada;
  7. **dispositivo novo acima do limite** (3 ativos) → `LimiteDeDispositivosAtingido`;
  8. `dispositivo.id` de outro usuário → registra novo (não reutiliza);
  9. usuário sem MFA → `MfaObrigatorio`;
  10. `politica` retornada igual à configurada.
- **Requisitos de segurança**: refresh só como hash; um dispositivo = uma sessão ativa; resposta de erro genérica.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: entrega do refresh ao Keychain (Rust).
- **Convenção de commit**: `feat(TASK-027): add ConcluirLogin use case`

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

### TASK-028: UC-06 `RenovarSessao` e UC-07 `EncerrarSessao`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-027
- **Objetivo**: Rotação do refresh com detecção de reutilização (RN-14, 15, 19, 20; fluxograma SPEC §6.4) e logout.
- **Arquivos permitidos**: `application/casos-de-uso/renovar-sessao.ts`, `application/casos-de-uso/encerrar-sessao.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface EntradaRenovarSessao { refreshToken: string; dispositivoId: string; ip: string | null; }
  export interface SaidaRenovarSessao { accessToken: string; accessExpiraEm: Date; refreshToken: string; politica: PoliticaDeAcesso; }
  export interface EntradaEncerrarSessao { ctx: ContextoDeAcesso; ip: string | null; }
  ```
  Dependências: `uow, emissor, relogio, politica, auditor, barramento`.
- **Passo a passo — UC-06** (transação, `Resultado`):
  1. `hash = emissor.hashDe(refreshToken)`; `s = sessoes.porRefreshHash(hash)`; nula → `falha(SessaoExpirada)`.
  2. `dispositivoId` inválido ou diferente de `s.dispositivoId` → `falha(SessaoExpirada)`.
  3. `d = dispositivos.porId(s.dispositivoId)`; ausente ou revogado → `s.revogar('dispositivo-revogado')`, salvar, auditar, `falha(DispositivoRevogado)`.
  4. `u = usuarios.porId(s.usuarioId)`; ausente ou desativado → `s.revogar('usuario-desativado')`, salvar, auditar, `falha(SessaoExpirada)`.
  5. `novo = gerarTokenOpaco()`; `res = s.rotacionar(hash, novo.hash, agora)`:
     `'invalida'` → `falha(SessaoExpirada)`; `'reutilizacao-detectada'` → salvar `s`, auditar (`refresh-reutilizado`), `falha(RefreshReutilizado)`; `'rotacionada'` → `d.registrarCheckIn(agora)`, salvar `s` e `d`, emitir access, `sucesso`.
- **Passo a passo — UC-07**: transação: `s = sessoes.ativaDoDispositivo(ctx.dispositivoId)`; se existir e pertencer a `ctx.usuarioId` → `revogar('logout')`, salvar, auditar. Idempotente (sem sessão → não faz nada, não lança).
- **Testes obrigatórios**: rotação feliz (novo refresh funciona, check-in atualizado); **reutilização** (apresentar o refresh antigo depois de rotacionar → `RefreshReutilizado`, sessão revogada persistida, e o refresh novo também passa a falhar com `SessaoExpirada`); token desconhecido → `SessaoExpirada`; **dispositivo revogado não renova** → `DispositivoRevogado` e sessão revogada; `dispositivoId` divergente → `SessaoExpirada`; sessão expirada (relógio + 30 dias) → `SessaoExpirada`; usuário desativado → `SessaoExpirada`; logout revoga e segunda chamada não lança; após logout, renovar → `SessaoExpirada`.
- **Requisitos de segurança**: reutilização revoga a sessão inteira e é auditada; respostas genéricas.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: HTTP.
- **Convenção de commit**: `feat(TASK-028): add session refresh and logout use cases`

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

### TASK-029: UC-08 `ListarDispositivos` e UC-09 `RevogarDispositivo`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-028
- **Objetivo**: Listar e revogar dispositivos com reautenticação (RN-19, 22, 29, 31; D-008).
- **Arquivos permitidos**: `application/casos-de-uso/listar-dispositivos.ts`, `application/casos-de-uso/revogar-dispositivo.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface ItemDeDispositivo { id: string; apelido: string; plataforma: Plataforma; registradoEm: Date; ultimoCheckIn: Date; situacao: SituacaoDoDispositivo; revogadoEm: Date | null; atual: boolean; }
  export interface EntradaListarDispositivos { ctx: ContextoDeAcesso; }          // saída: ItemDeDispositivo[]
  export interface EntradaRevogarDispositivo { ctx: ContextoDeAcesso; dispositivoId: string; motivo: string; codigoMfa: string; ip: string | null; }
  ```
  Dependências UC-08: `uow`. UC-09: `uow, verificadorDeMfa, relogio, auditor, barramento`.
- **Passo a passo**:
  - UC-08: `ctx.exigir('identidade:ler')` (antes da transação); `todosDoUsuario(ctx.usuarioId)`; mapear; `atual = id === ctx.dispositivoId`.
  - UC-09: `ctx.exigir('identidade:administrar')`; transação: `u = usuarios.porId(ctx.usuarioId)` (nulo → `falha(SessaoExpirada)`); `verificadorDeMfa.verificar(u, { tipo: 'totp', valor: codigoMfa }, agora)` falso → `falha(ReautenticacaoNecessaria)` (**não** conta falha de login); `d = porId(...)`; ausente, id inválido ou de outro usuário → salvar `u` (passo aceito) e `falha(DispositivoNaoEncontrado)`; `d.revogar(motivo, agora)`; sessão ativa do dispositivo → `revogar('dispositivo-revogado')`; salvar `u`, `d`, sessão; auditar eventos + `auditor.avulso('reautenticacao-sensivel', { detalhe: { acao: 'revogar-dispositivo' } })`.
- **Testes obrigatórios**: lista inclui revogados e marca `atual`; sem permissão → `SemPermissao` (use `new ContextoDeAcesso(..., [])`); revogação feliz (dispositivo revogado, sessão revogada, 2 auditorias); código MFA errado → `ReautenticacaoNecessaria` e nada revogado; dispositivo de outro usuário → `DispositivoNaoEncontrado` (IDOR); depois da revogação, `RenovarSessao` daquele dispositivo → `DispositivoRevogado`; motivo com 2 caracteres → `DadoInvalido`.
- **Requisitos de segurança**: checagem de posse por recurso (IDOR); reautenticação obrigatória; motivo auditado.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: reautenticação local (Rust/Vue).
- **Convenção de commit**: `feat(TASK-029): add device listing and revocation use cases`

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

### TASK-030: UC-10 `TrocarSenha`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-029
- **Objetivo**: Trocar a senha de login revogando as **outras** sessões (RN-05, 16, 29).
- **Arquivos permitidos**: `application/casos-de-uso/trocar-senha.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**: `EntradaTrocarSenha { ctx: ContextoDeAcesso; senhaAtual: string; novaSenha: string; ip: string | null }` → `void`. Dependências: `uow, hasher, politicaDeSenha, politica, relogio, auditor, barramento`.
- **Passo a passo**: `ctx.exigir('identidade:escrever')`; transação: `u = porId(ctx.usuarioId)`; `hasher.conferir(senhaAtual)` falso → `registrarFalhaDeLogin(agora, politica, 'senha')`, salvar, auditar, `falha(CredenciaisInvalidas)`; `novaSenha === senhaAtual` → `falha(new SenhaFraca(['igual-a-atual']))`; `politicaDeSenha.validar(novaSenha, u.email, politica)` (pode lançar — nenhum estado alterado ainda **se** a senha atual estava certa: não há mudança persistível); `hash = hasher.gerar(novaSenha)`; `u.trocarSenha(hash, agora)`; para cada `ativasDoUsuario` com `dispositivoId` **diferente** de `ctx.dispositivoId` → `revogar('senha-alterada')` e salvar; salvar `u`; auditar.
- **Testes obrigatórios**: troca feliz (`conferir(nova)` true; auditoria `senha-alterada`); **troca de senha revoga as outras sessões** (2 dispositivos: sessão do outro revogada, a atual continua ativa); senha atual errada → `CredenciaisInvalidas` e falha contada; nova igual à atual → `SenhaFraca` com `['igual-a-atual']`; nova fraca → `SenhaFraca` e hash inalterado.
- **Requisitos de segurança**: RN-16; senhas fora de logs/auditoria.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: senha mestre local.
- **Convenção de commit**: `feat(TASK-030): add TrocarSenha use case`

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

### TASK-031: UC-11 `SolicitarRedefinicaoDeSenha` e UC-12 `ConcluirRedefinicaoDeSenha`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-030
- **Objetivo**: "Esqueci a senha" por e-mail com token de uso único de 30 min e exigência de MFA para concluir (RN-12, 16, 33; D-007).
- **Arquivos permitidos**: `application/casos-de-uso/solicitar-redefinicao-de-senha.ts`, `application/casos-de-uso/concluir-redefinicao-de-senha.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface DependenciasSolicitarRedefinicao { uow; emissor; enviador: EnviadorDeEmail; relogio; auditor; urlRedefinicaoSenha: string; }
  export interface EntradaSolicitarRedefinicao { email: string; ip: string | null; }   // saída: void (sempre)
  export interface DependenciasConcluirRedefinicao { uow; emissor; hasher; politicaDeSenha; politica; verificadorDeMfa; relogio; auditor; barramento; }
  export interface EntradaConcluirRedefinicao { token: string; novaSenha: string; codigo: CodigoInformado; ip: string | null; }  // saída: void
  ```
- **Passo a passo**:
  - UC-11: `Email.criar` lançou → retorna sem fazer nada. Transação: `u = porEmail`; ausente ou desativado → retorna `null`; `tokensDeRedefinicao.invalidarDoUsuario`; `{ token, hash } = gerarTokenOpaco()`; `criar({ hash, usuarioId, expiraEm: agora + 30 min })`; registrar `auditor.avulso('redefinicao-de-senha-solicitada', ...)`; retorna `{ email, token, expiraEm }`. Fora da transação, se houve retorno: `link = urlRedefinicaoSenha + '?token=' + encodeURIComponent(token)`; disparar `void d.enviador.enviarRedefinicaoDeSenha(email, { link, token, expiraEm }).catch(() => undefined)` (**sem await**: o tempo de resposta não pode revelar se o e-mail existe; o adaptador registra a falha). Nunca lança.
  - UC-12 (transação): `hash = emissor.hashDe(token)`; `usuarioId = usuarioDoTokenValido(hash, agora)` nulo → lançar `TokenDeRedefinicaoInvalido`; `u = porId` ausente/desativado → lançar `TokenDeRedefinicaoInvalido`; `exigeConfigurarMfa()` → lançar `MfaObrigatorio`; `politicaDeSenha.validar(novaSenha, u.email, politica)` (lança antes de consumir — o token continua válido para nova tentativa); `consumir(hash, agora)` falso → `falha(TokenDeRedefinicaoInvalido)`; `verificar(u, codigo)` falso → `registrarFalhaDeLogin('mfa')`, salvar, auditar, `falha(CodigoMfaInvalido)`; `u.trocarSenha(await hasher.gerar(novaSenha), agora)`; revogar **todas** as sessões ativas (`'senha-alterada'`); salvar; auditar.
- **Testes obrigatórios**: UC-11 com e-mail existente envia 1 e-mail com link contendo o token e grava só o hash; inexistente, desativado e malformado → nenhum e-mail, sem erro; nova solicitação invalida o token anterior; falha do enviador (`falharProximo`) não lança. UC-12 feliz (senha trocada, todas as sessões revogadas, token não reutilizável); token expirado (+31 min) → `TokenDeRedefinicaoInvalido`; **redefinição exige MFA**: código errado → `CodigoMfaInvalido` e token consumido; senha fraca → `SenhaFraca` e token **ainda** válido; código de recuperação funciona.
- **Requisitos de segurança**: RN-12 (resposta idêntica); token só como hash; uso único; e-mail enviado fora do caminho síncrono.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: template de e-mail (TASK-045).
- **Convenção de commit**: `feat(TASK-031): add password reset use cases`

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

### TASK-032: UC-13 `RegenerarCodigosDeRecuperacao` e UC-16 `ReconfigurarMfa` (iniciar/confirmar)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-031
- **Objetivo**: Regenerar códigos com reautenticação por TOTP (RN-08, 09; D-008) e reconfigurar o autenticador perdido (RN-34; D-010).
- **Arquivos permitidos**: `application/casos-de-uso/regenerar-codigos-de-recuperacao.ts`, `application/casos-de-uso/iniciar-reconfiguracao-de-mfa.ts`, `application/casos-de-uso/confirmar-reconfiguracao-de-mfa.ts` e seus `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface EntradaRegenerarCodigos { ctx: ContextoDeAcesso; codigoMfa: string; ip: string | null; }           // saída { codigosDeRecuperacao: string[] }
  export interface EntradaIniciarReconfiguracaoDeMfa { ctx: ContextoDeAcesso; senhaAtual: string; ip: string | null; } // saída { segredo: string; urlOtpauth: string }
  export interface EntradaConfirmarReconfiguracaoDeMfa { ctx: ContextoDeAcesso; codigo: string; ip: string | null; }   // saída { codigosDeRecuperacao: string[] }
  ```
- **Passo a passo**:
  - UC-13: `ctx.exigir('identidade:escrever')`; transação: `u`; `verificar(u, {tipo:'totp', valor: codigoMfa})` falso → `falha(ReautenticacaoNecessaria)`; `gerados = codigos.gerar(10)`; `u.substituirCodigosDeRecuperacao(...)`; salvar; auditar eventos + avulso `reautenticacao-sensivel` `{ acao: 'regenerar-codigos' }`.
  - UC-16 iniciar: `ctx.exigir('identidade:escrever')`; transação: `u`; `hasher.conferir(senhaAtual)` falso → `registrarFalhaDeLogin('senha')`, salvar, auditar, `falha(ReautenticacaoNecessaria)`; `segredo = totp.novoSegredo()`; `u.iniciarReconfiguracaoMfa(SegredoTotpCifrado.de(await cofre.cifrar(segredo)))`; salvar; retornar segredo e URL.
  - UC-16 confirmar: `ctx.exigir('identidade:escrever')`; transação: `u`; `pendente = u.mfaPendente` nulo → lançar `MfaObrigatorio`; `r = verificadorDeMfa.verificarSegredo(pendente, codigo, null)` falso → `falha(CodigoMfaInvalido)`; `gerados = codigos.gerar(10)`; `u.confirmarReconfiguracaoMfa(r.passo, ..., agora)`; salvar; auditar.
- **Testes obrigatórios**: UC-13 feliz (códigos antigos deixam de funcionar no `VerificadorDeMfa`, novos funcionam); UC-13 com TOTP errado → `ReautenticacaoNecessaria` e códigos antigos intactos; UC-16 iniciar com senha errada → `ReautenticacaoNecessaria` e falha contada; UC-16 iniciar não derruba o MFA atual (login com o segredo antigo continua funcionando); UC-16 confirmar troca o segredo e gera 10 códigos; confirmar sem iniciar → `MfaObrigatorio`; sem permissão → `SemPermissao`.
- **Requisitos de segurança**: reautenticação obrigatória; MFA atual preservado até confirmar.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: HTTP.
- **Convenção de commit**: `feat(TASK-032): add recovery code regeneration and MFA reconfiguration`

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

### TASK-033: UC-14 `ReceberAuditoriaDoApp`
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-032
- **Objetivo**: Receber lotes de auditoria do app, validando encadeamento, hash e assinatura Ed25519 antes de gravar (RN-37, 38, 39; D-006, D-009).
- **Arquivos permitidos**: `application/casos-de-uso/receber-auditoria-do-app.ts` e `.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface RegistroRecebido { id: string; ocorridoEm: string; tipo: string; usuarioId: string; dispositivoId: string; detalhe: unknown; hashAnterior: string | null; hash: string; assinatura: string; }
  export interface EntradaReceberAuditoria { ctx: ContextoDeAcesso; registros: RegistroRecebido[]; ip: string | null; }
  export interface SaidaReceberAuditoria { aceitos: number; ignorados: number; }
  // Dependências: uow, relogio, hash: CalculadoraDeHash, assinatura: VerificadorDeAssinatura
  ```
- **Passo a passo**:
  1. `registros.length` entre 1 e `MAX_REGISTROS_POR_LOTE_DE_AUDITORIA` → senão `AuditoriaInvalida('tamanho-do-lote')`.
  2. Transação: `d = dispositivos.porId(ctx.dispositivoId)`; ausente ou revogado → lançar `DispositivoRevogado`.
  3. `existentes = auditoria.idsExistentes(ids)`. Os existentes devem formar um **prefixo** do lote (retransmissão); se algum existente aparecer depois de um novo → `AuditoriaInvalida('ordem')`. `novos` = o restante.
  4. `anterior = auditoria.ultimoHashDoApp(d.id)`. Para cada novo, **validar tudo antes de gravar qualquer um**:
     - `id` UUID (`REGEX_UUID`); `tipo` ∈ `TIPOS_DE_AUDITORIA_DO_APP`; `usuarioId === ctx.usuarioId.valor`; `dispositivoId === ctx.dispositivoId.valor`;
     - `ocorridoEm` casa `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` e `new Date(ocorridoEm).toISOString() === ocorridoEm`; não pode estar mais de `TOLERANCIA_DE_RELOGIO_DO_APP_MIN` no futuro;
     - `ehDetalheValido(detalhe)`;
     - `hashAnterior === anterior` (encadeamento);
     - `hash.sha256Hex(serializarCanonico(...)) === hash`;
     - `assinatura.verificarEd25519(hash, assinatura, d.chavePublicaAuditoria)`;
     - qualquer falha → lançar `AuditoriaInvalida('<motivo>')` com motivo em `{'id','tipo','usuario','dispositivo','data','detalhe','encadeamento','hash','assinatura'}`; `anterior = hash`.
  5. Gravar cada novo como `RegistroDeAuditoriaDoApp` (com `ip`), na ordem.
  6. Retornar `{ aceitos: novos.length, ignorados: existentes.size }`.
- **Testes obrigatórios** (use os vetores R1/R2 do D-009, dispositivo com a chave pública do vetor, relógio em `2026-10-13T12:10:00.000Z`): lote [R1, R2] aceito (2); reenviar [R1, R2] → `{aceitos:0, ignorados:2}`; enviar [R2] sem R1 → `encadeamento`; R2 com detalhe alterado → `hash`; assinatura trocada → `assinatura`; `usuarioId` de outro usuário → `usuario`; tipo `login-ok` → `tipo`; data 1 hora no futuro → `data`; lote vazio e com 501 → `tamanho-do-lote`; dispositivo revogado → `DispositivoRevogado`; em qualquer erro, **nada** gravado.
- **Requisitos de segurança**: RN-39 (integridade verificável), validação estrita de entrada, nenhum registro parcial.
- **Critérios de aceite**: [ ] testes passam · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020.
- **Fora de escopo**: geração no app (Rust TASK-068).
- **Convenção de commit**: `feat(TASK-033): add app audit batch ingestion use case`

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

### TASK-034: UC-15 `DesativarUsuario`, `RedefinirAcessoAdministrativo` (RN-36) e barrel da application
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-033
- **Objetivo**: Desativação com proteção do último proprietário (RN-03, 04) e o "último recurso" administrativo (RN-36).
- **Arquivos permitidos**: `application/casos-de-uso/desativar-usuario.ts`, `application/casos-de-uso/redefinir-acesso-administrativo.ts`, seus `.spec.ts`, `application/index.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export interface EntradaDesativarUsuario { ctx: ContextoDeAcesso; usuarioId: string; ip: string | null; }               // void
  export interface EntradaRedefinirAcessoAdministrativo { email: string; novaSenha: string; }                             // void
  // Dependências Desativar: uow, relogio, politicaDeProprietario, auditor, barramento
  // Dependências Redefinir: uow, hasher, politicaDeSenha, politica, relogio, auditor, barramento
  ```
- **Passo a passo**:
  - Desativar: `ctx.exigir('identidade:administrar')`; transação: `alvo = porId` (id inválido ou ausente → lançar `UsuarioNaoEncontrado`); `politicaDeProprietario.garantirQuePodeDesativar(alvo, await contarProprietariosAtivos())`; `alvo.desativar(agora)`; revogar todas as sessões ativas do alvo (`'usuario-desativado'`); salvar; auditar.
  - Redefinir: `email = Email.criar`; `politicaDeSenha.validar`; `hash = hasher.gerar`; transação: `u = porEmail` (ausente → `UsuarioNaoEncontrado`); `u.redefinirAcessoAdministrativamente(hash, agora)`; revogar todas as sessões (`'acesso-redefinido'`); `tokensDeRedefinicao.invalidarDoUsuario`; salvar; auditar.
  - `application/index.ts`: reexporta portas, auditoria, comum e todos os casos de uso.
- **Testes obrigatórios**: desativar o único proprietário → `UltimoProprietario`; com dois proprietários → desativa e revoga sessões; sem permissão → `SemPermissao`; id inexistente → `UsuarioNaoEncontrado`; redefinir deixa o usuário exigindo configurar MFA, sem códigos, sem sessões ativas e com a nova senha válida; e-mail inexistente → `UsuarioNaoEncontrado`.
- **Requisitos de segurança**: RN-03/04; redefinição administrativa auditada e revoga tudo.
- **Critérios de aceite**: [ ] testes passam · [ ] `pnpm test -- src/identidade-e-acesso` 100% verde · [ ] verificação de camadas vazia
- **Comandos de verificação**: os mesmos da TASK-020, mais `pnpm test` completo.
- **Fora de escopo**: CLI (TASK-056).
- **Convenção de commit**: `feat(TASK-034): add user deactivation and administrative access reset`

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
