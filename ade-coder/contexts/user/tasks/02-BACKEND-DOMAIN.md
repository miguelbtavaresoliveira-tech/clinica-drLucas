# 📋 02 — Backend: camada Domain

> **Objetivo**: Implementar o domínio puro do contexto Identidade e Acesso (agregados `Usuario`, `Dispositivo`, `SessaoDeLogin`, value objects, permissões, política, eventos, erros e serviços de domínio) com testes, sem nenhuma dependência de framework.
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: TypeScript 6 (ESM, imports relativos com `.js`), Vitest 4.
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-004, D-006, D-010, D-011), SPEC §3, §5 e §9.

### Regras desta camada (valem para todas as tarefas deste arquivo)
- Pasta raiz: `backend/src/identidade-e-acesso/domain/`.
- **Proibido importar** `@nestjs/*`, `drizzle-orm`, `pg`, `argon2`, `otplib`, `zod` ou qualquer `node:*`. Única API global permitida: `crypto.randomUUID()`.
- Nada de `new Date()` sem argumento: o instante atual chega sempre por parâmetro `agora: Date`.
- Agregados têm construtor **privado**; criação por `static criar/registrar/iniciar(...)` (emite evento) e `static reconstituir(props)` (para repositórios; **não** emite evento).
- Valores sensíveis (`HashDeSenha`, `SegredoTotpCifrado`) sobrescrevem `toString()` e `toJSON()` para retornar `'[protegido]'`.
- Testes colocados ao lado do arquivo: `<arquivo>.spec.ts`.
- Verificação de pureza (deve imprimir nada):
  `grep -rnE "from '(@nestjs|drizzle-orm|pg|argon2|otplib|zod|node:)" src/identidade-e-acesso/domain`

## 🎯 Mapa de Arquivos

| Arquivo | Tarefa |
|---|---|
| `domain/comum/{agregado,evento-de-dominio,erro-de-dominio,identificador-uuid}.ts`, `domain/erros.ts`, `domain/{usuario/usuario-id,dispositivo/dispositivo-id,sessao-de-login/sessao-de-login-id}.ts` | TASK-010 |
| `domain/usuario/{email,hash-de-senha,codigo-de-recuperacao,segredo-totp-cifrado}.ts` | TASK-011 |
| `domain/acesso/{permissao,papel,contexto-de-acesso,politica-de-acesso}.ts` | TASK-012 |
| `domain/dispositivo/plataforma.ts`, `domain/eventos.ts` | TASK-013 |
| `domain/usuario/usuario.ts` | TASK-014 |
| `domain/dispositivo/dispositivo.ts` | TASK-015 |
| `domain/sessao-de-login/sessao-de-login.ts` | TASK-016 |
| `domain/servicos/*.ts`, `domain/index.ts` | TASK-017 |

---

### TASK-010: Base do domínio — agregado, eventos, erros e identificadores
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-002
- **Objetivo**: Criar as peças comuns usadas por todo o domínio: classe base de agregado com fila de eventos, contrato de evento, hierarquia de erros tipados (DT-14) e IDs UUID tipados.
- **Arquivos permitidos** (todos novos, em `backend/src/identidade-e-acesso/domain/`): `comum/agregado.ts`, `comum/evento-de-dominio.ts`, `comum/erro-de-dominio.ts`, `comum/identificador-uuid.ts`, `erros.ts`, `usuario/usuario-id.ts`, `dispositivo/dispositivo-id.ts`, `sessao-de-login/sessao-de-login-id.ts`, `comum/agregado.spec.ts`, `comum/identificador-uuid.spec.ts`, `erros.spec.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // comum/evento-de-dominio.ts
  export interface EventoDeDominio { readonly tipo: string; readonly ocorridoEm: Date; }

  // comum/agregado.ts
  export abstract class Agregado {
    #eventos: EventoDeDominio[] = [];
    protected registrar(evento: EventoDeDominio): void;          // empilha
    puxarEventos(): readonly EventoDeDominio[];                   // devolve cópia na ordem de registro e esvazia a fila
  }

  // comum/erro-de-dominio.ts
  export abstract class ErroDeDominio extends Error {
    abstract readonly codigo: string;
    protected constructor(mensagem: string);                      // define this.name = new.target.name
  }

  // comum/identificador-uuid.ts
  export abstract class IdentificadorUuid {
    protected constructor(readonly valor: string);
    protected static normalizar(valor: string): string;          // trim + toLowerCase; valida com a regex abaixo; senão lança IdentificadorInvalido
    igual(outro: IdentificadorUuid): boolean;                     // mesmo construtor E mesmo valor
    toString(): string;                                           // valor
  }
  export const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;  // exportada (usada na TASK-011)

  // usuario/usuario-id.ts (repita o padrão para DispositivoId e SessaoDeLoginId)
  export class UsuarioId extends IdentificadorUuid {
    private readonly marca = 'UsuarioId' as const;               // impede trocar UsuarioId por DispositivoId na tipagem
    private constructor(valor: string);
    static novo(): UsuarioId;                                     // crypto.randomUUID()
    static de(valor: string): UsuarioId;                          // normaliza e valida
  }
  ```
  `erros.ts` — uma classe por linha, todas `extends ErroDeDominio`, com `readonly codigo` literal e mensagem em português (texto exato):
  | Classe | `codigo` | Campos extras | Mensagem |
  |---|---|---|---|
  | `CredenciaisInvalidas` | `CREDENCIAIS_INVALIDAS` | — | `Credenciais inválidas.` |
  | `ContaBloqueada` | `CONTA_BLOQUEADA` | `readonly ate: Date` | `Conta temporariamente bloqueada.` |
  | `ContaDesativada` | `CONTA_DESATIVADA` | — | `Conta desativada.` |
  | `MfaObrigatorio` | `MFA_OBRIGATORIO` | — | `Configure a autenticação em dois fatores.` |
  | `CodigoMfaInvalido` | `CODIGO_MFA_INVALIDO` | — | `Código de verificação inválido.` |
  | `SenhaFraca` | `SENHA_FRACA` | `readonly motivos: readonly MotivoSenhaFraca[]` | `A senha não atende à política.` |
  | `EmailJaCadastrado` | `EMAIL_JA_CADASTRADO` | — | `E-mail já cadastrado.` |
  | `EmailInvalido` | `EMAIL_INVALIDO` | — | `E-mail inválido.` |
  | `UltimoProprietario` | `ULTIMO_PROPRIETARIO` | — | `Não é possível desativar o último proprietário.` |
  | `LimiteDeDispositivosAtingido` | `LIMITE_DE_DISPOSITIVOS_ATINGIDO` | `readonly maximo: number` | `Limite de dispositivos atingido.` |
  | `DispositivoRevogado` | `DISPOSITIVO_REVOGADO` | — | `Dispositivo revogado.` |
  | `DispositivoNaoEncontrado` | `DISPOSITIVO_NAO_ENCONTRADO` | — | `Dispositivo não encontrado.` |
  | `SessaoExpirada` | `SESSAO_EXPIRADA` | — | `Sessão expirada.` |
  | `RefreshReutilizado` | `REFRESH_REUTILIZADO` | — | `Sessão encerrada por segurança.` |
  | `ReautenticacaoNecessaria` | `REAUTENTICACAO_NECESSARIA` | — | `Confirme sua identidade para continuar.` |
  | `SemPermissao` | `SEM_PERMISSAO` | `readonly permissao: string` | `Sem permissão para esta ação.` |
  | `DesafioInvalido` | `DESAFIO_INVALIDO` | — | `Sessão de login expirada. Entre novamente.` |
  | `TokenDeRedefinicaoInvalido` | `TOKEN_DE_REDEFINICAO_INVALIDO` | — | `Link de redefinição inválido ou expirado.` |
  | `MfaJaConfigurado` | `MFA_JA_CONFIGURADO` | — | `A autenticação em dois fatores já está configurada.` |
  | `ProprietarioJaExiste` | `PROPRIETARIO_JA_EXISTE` | — | `Já existe um proprietário ativo.` |
  | `UsuarioNaoEncontrado` | `USUARIO_NAO_ENCONTRADO` | — | `Usuário não encontrado.` |
  | `AuditoriaInvalida` | `AUDITORIA_INVALIDA` | `readonly motivo: string` | `Lote de auditoria inválido.` |
  | `IdentificadorInvalido` | `IDENTIFICADOR_INVALIDO` | — | `Identificador inválido.` |
  | `DadoInvalido` | `DADO_INVALIDO` | `readonly campo: string` | `Dado inválido: <campo>.` |

  Também em `erros.ts`: `export type MotivoSenhaFraca = 'curta' | 'longa' | 'igual-ao-email' | 'comum' | 'igual-a-atual';`
- **Passo a passo**:
  1. Criar `comum/*` exatamente como no contrato (use campo privado `#eventos`).
  2. Criar `erros.ts` com as 24 classes. Os campos extras entram pelo construtor (ex.: `constructor(readonly ate: Date) { super('Conta temporariamente bloqueada.'); }`).
  3. Criar os três IDs seguindo o padrão de `UsuarioId`.
  4. Escrever os testes.
- **Testes obrigatórios**:
  - `agregado.spec.ts` (crie uma subclasse de teste dentro do arquivo de teste): eventos saem na ordem de registro; segunda chamada a `puxarEventos()` retorna `[]`; o array retornado é cópia (mutá-lo não afeta o agregado).
  - `identificador-uuid.spec.ts`: `novo()` gera valores diferentes e válidos; `de()` aceita UUID em maiúsculas e normaliza para minúsculas; rejeita `''`, `'abc'`, `'00000000-0000-0000-0000-000000000000'` (versão 0) e UUID com espaço interno lançando `IdentificadorInvalido`; `UsuarioId.de(x).igual(UsuarioId.de(x))` é `true`; `UsuarioId.de(x).igual(DispositivoId.de(x))` é `false`.
  - `erros.spec.ts`: para cada classe, `instanceof ErroDeDominio`, `instanceof Error`, `name` igual ao nome da classe e `codigo` igual ao da tabela (use `it.each`); `ContaBloqueada.ate`, `SenhaFraca.motivos`, `LimiteDeDispositivosAtingido.maximo`, `SemPermissao.permissao`, `DadoInvalido.campo` preservados.
- **Requisitos de segurança**: mensagens de erro genéricas, sem dados do usuário.
- **Critérios de aceite**:
  - [ ] 24 classes de erro com códigos exatos
  - [ ] IDs não são intercambiáveis na tipagem (o `marca` privado garante)
  - [ ] Verificação de pureza vazia
- **Comandos de verificação** (em `backend/`):
  ```bash
  pnpm run typecheck && pnpm run lint
  pnpm test -- src/identidade-e-acesso/domain
  grep -rnE "from '(@nestjs|drizzle-orm|pg|argon2|otplib|zod|node:)" src/identidade-e-acesso/domain ; echo "exit=$?"
  ```
- **Fora de escopo**: eventos concretos (TASK-013), agregados.
- **Convenção de commit**: `feat(TASK-010): add domain base classes, typed errors and ids`

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

### TASK-011: Value objects do usuário — Email, HashDeSenha, CodigoDeRecuperacao, SegredoTotpCifrado
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-010
- **Objetivo**: Encapsular as regras de formato de e-mail (RN-02), hash de senha (RN-06), códigos de recuperação de uso único (RN-08) e segredo TOTP cifrado (DT-03).
- **Arquivos permitidos** (novos, em `domain/usuario/`): `email.ts`, `hash-de-senha.ts`, `codigo-de-recuperacao.ts`, `segredo-totp-cifrado.ts` e um `.spec.ts` para cada um
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export class Email {
    private constructor(readonly valor: string);
    static criar(bruto: string): Email;   // trim + toLowerCase; regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/; tamanho ≤ 254; senão EmailInvalido
    parteLocal(): string;                  // texto antes do '@'
    igual(outro: Email): boolean;
  }
  export class HashDeSenha {
    private constructor(private readonly _valor: string);
    static de(valor: string): HashDeSenha; // deve começar com '$argon2id$'; senão DadoInvalido('hashDeSenha')
    get valor(): string;
    toString(): string;                    // '[protegido]'
    toJSON(): string;                      // '[protegido]'
  }
  export class CodigoDeRecuperacao {
    private constructor(readonly id: string, readonly hash: string, private _usadoEm: Date | null, readonly criadoEm: Date);
    static novo(id: string, hash: string, agora: Date): CodigoDeRecuperacao;            // hash: /^[0-9a-f]{64}$/ senão DadoInvalido('hash'); id: UUID (use a regex da TASK-010) senão DadoInvalido('id')
    static reconstituir(p: { id: string; hash: string; usadoEm: Date | null; criadoEm: Date }): CodigoDeRecuperacao;
    get usadoEm(): Date | null;
    estaDisponivel(): boolean;            // usadoEm === null
    usar(agora: Date): void;              // se já usado → CodigoMfaInvalido; senão usadoEm = agora
  }
  export class SegredoTotpCifrado {
    private constructor(private readonly _bytes: Uint8Array);
    static de(bytes: Uint8Array): SegredoTotpCifrado; // exige length ≥ 30 (1 versão + 12 iv + 1 dado + 16 tag); senão DadoInvalido('segredoTotp'); guarda CÓPIA
    bytes(): Uint8Array;                  // devolve CÓPIA
    toString(): string;                   // '[protegido]'
    toJSON(): string;                     // '[protegido]'
  }
  ```
  Para validar o `id` use `REGEX_UUID` importada de `../comum/identificador-uuid.js` (criada na TASK-010).
- **Passo a passo**: implementar cada classe; escrever os testes; rodar verificação.
- **Testes obrigatórios**:
  - Email: `'  Lucas@Exemplo.COM '` vira `'lucas@exemplo.com'`; rejeita `''`, `'semarroba'`, `'a@b'`, `'a b@c.com'`, string de 255 caracteres; `parteLocal()` de `lucas@x.com` é `lucas`; `igual` compara valor normalizado.
  - HashDeSenha: aceita `'$argon2id$v=19$m=19456,t=2,p=1$abc$def'`; rejeita `'$2b$10$...'` e `''`; `String(h)` e `JSON.stringify({h})` não contêm `argon2id`.
  - CodigoDeRecuperacao: novo está disponível; `usar` marca data; segundo `usar` lança `CodigoMfaInvalido`; hash com 63 caracteres ou maiúsculas lança `DadoInvalido`.
  - SegredoTotpCifrado: mutar o array de entrada depois de `de()` não altera `bytes()`; mutar o retorno de `bytes()` não altera o interno; 29 bytes lança; `JSON.stringify` retorna `'"[protegido]"'`.
- **Requisitos de segurança**: hash e segredo nunca serializam o conteúdo; cópias defensivas de `Uint8Array`.
- **Critérios de aceite**: [ ] todos os testes passam · [ ] verificação de pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: geração/verificação de hash (infra), agregado `Usuario`.
- **Convenção de commit**: `feat(TASK-011): add user value objects`

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

### TASK-012: Permissões, papéis, `ContextoDeAcesso` e `PoliticaDeAcesso`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-010
- **Objetivo**: Implementar o modelo de autorização `contexto:ação` (RN-30, RN-31, DT-15) e a política configurável (SPEC §2, §5.2).
- **Arquivos permitidos** (novos, em `domain/acesso/`): `permissao.ts`, `papel.ts`, `contexto-de-acesso.ts`, `politica-de-acesso.ts` e um `.spec.ts` para cada
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // permissao.ts
  export const CONTEXTOS = ['pacientes','clinico','agenda','cobranca','financeiro','recibos','contratos','equipamentos','comunicacao','identidade'] as const;
  export const ACOES = ['ler','escrever','administrar'] as const;
  export type Contexto = (typeof CONTEXTOS)[number];
  export type Acao = (typeof ACOES)[number];
  export type Permissao = `${Contexto}:${Acao}`;
  export function ehPermissao(valor: string): valor is Permissao;

  // papel.ts
  export type NomeDePapel = 'proprietario';
  export interface Papel { readonly nome: NomeDePapel; concede(p: Permissao): boolean; }
  export const PROPRIETARIO: Papel;                       // { nome: 'proprietario', concede: () => true }
  export const PAPEIS: Readonly<Record<NomeDePapel, Papel>>;
  export function papelPorNome(nome: string): Papel;      // desconhecido → DadoInvalido('papel')

  // contexto-de-acesso.ts
  export class ContextoDeAcesso {
    constructor(readonly usuarioId: UsuarioId, readonly dispositivoId: DispositivoId, private readonly papeis: readonly Papel[]);
    temPermissao(p: Permissao): boolean;                  // some(papel.concede(p))
    exigir(p: Permissao): void;                           // senão SemPermissao(p)
    nomesDosPapeis(): NomeDePapel[];
  }

  // politica-de-acesso.ts
  export interface PoliticaDeAcesso { /* exatamente os 11 campos readonly da SPEC §5.2, com bloqueioProgressivoMin: readonly number[] */ }
  export const POLITICA_PADRAO: PoliticaDeAcesso;          // 10, 5, true, 5, [1,5,15,60], 3, 12, 15, 30, 5, 10 — congelado com Object.freeze (inclusive o array)
  export function criarPoliticaDeAcesso(p: PoliticaDeAcesso): PoliticaDeAcesso;
  // valida: todo número inteiro ≥ 1 (senão DadoInvalido('<nomeDoCampo>')); tamanhoMinimoSenha ≥ 12; bloqueioProgressivoMin não vazio e estritamente crescente;
  // retorna CÓPIA congelada (Object.freeze no objeto e no array)
  ```
- **Passo a passo**: implementar; testar; rodar verificação.
- **Testes obrigatórios**:
  - `ehPermissao`: `'clinico:escrever'` true; `'clinico:apagar'`, `'xyz:ler'`, `'clinico'`, `''` false.
  - `papelPorNome('proprietario')` retorna `PROPRIETARIO`; `'admin'` lança `DadoInvalido`.
  - `ContextoDeAcesso` com `[PROPRIETARIO]`: `temPermissao('financeiro:administrar')` true; com `[]`: `exigir('clinico:escrever')` lança `SemPermissao` com `permissao === 'clinico:escrever'` (**permissão negada — SPEC §9**).
  - `criarPoliticaDeAcesso(POLITICA_PADRAO)` igual em valores; rejeita `maxTentativasLogin: 0`, `inatividadeMin: 1.5`, `tamanhoMinimoSenha: 11`, `bloqueioProgressivoMin: []`, `[5,1]`, `[1,1]`; o retorno é congelado (`Object.isFrozen` no objeto e no array).
- **Requisitos de segurança**: política imutável em tempo de execução.
- **Critérios de aceite**: [ ] testes passam · [ ] pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: guard HTTP (TASK-051), leitura da política de env (TASK-053).
- **Convenção de commit**: `feat(TASK-012): add permissions, roles, access context and access policy`

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

### TASK-013: Eventos de domínio e tipo `Plataforma`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-010
- **Objetivo**: Declarar todos os eventos do contexto (SPEC §5.3 + D-011) como classes imutáveis.
- **Arquivos permitidos**: `domain/dispositivo/plataforma.ts`, `domain/eventos.ts`, `domain/eventos.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  // dispositivo/plataforma.ts
  export const PLATAFORMAS = ['macos', 'windows'] as const;
  export type Plataforma = (typeof PLATAFORMAS)[number];

  // eventos.ts — cada classe: implements EventoDeDominio, `readonly tipo = '<Tipo>' as const`, campos readonly no construtor, ocorridoEm por último
  export type MotivoRevogacaoDeSessao = 'logout' | 'reutilizacao-de-refresh' | 'nova-sessao-no-dispositivo' | 'senha-alterada' | 'dispositivo-revogado' | 'usuario-desativado' | 'acesso-redefinido';
  UsuarioCriado(usuarioId: UsuarioId, ocorridoEm: Date)
  MfaConfigurado(usuarioId: UsuarioId, ocorridoEm: Date)
  SenhaAlterada(usuarioId: UsuarioId, ocorridoEm: Date)
  LoginRealizado(usuarioId: UsuarioId, dispositivoId: DispositivoId, ocorridoEm: Date)
  LoginFalhou(usuarioId: UsuarioId, motivo: 'senha' | 'mfa', ocorridoEm: Date)
  UsuarioBloqueado(usuarioId: UsuarioId, bloqueadoAte: Date, ocorridoEm: Date)
  CodigoDeRecuperacaoUsado(usuarioId: UsuarioId, restantes: number, ocorridoEm: Date)
  CodigosDeRecuperacaoRegenerados(usuarioId: UsuarioId, ocorridoEm: Date)
  UsuarioDesativado(usuarioId: UsuarioId, ocorridoEm: Date)
  AcessoRedefinidoAdministrativamente(usuarioId: UsuarioId, ocorridoEm: Date)
  DispositivoRegistrado(dispositivoId: DispositivoId, usuarioId: UsuarioId, plataforma: Plataforma, ocorridoEm: Date)
  DispositivoFoiRevogado(dispositivoId: DispositivoId, usuarioId: UsuarioId, motivo: string, ocorridoEm: Date)   // tipo = 'DispositivoRevogado'
  SessaoRevogada(sessaoId: SessaoDeLoginId, usuarioId: UsuarioId, dispositivoId: DispositivoId, motivo: MotivoRevogacaoDeSessao, ocorridoEm: Date)
  export type EventoDeIdentidade = UsuarioCriado | MfaConfigurado | ... (união das 13 classes);
  ```
- **Passo a passo**: criar arquivos; testar.
- **Testes obrigatórios** (`eventos.spec.ts`): para cada evento, `tipo` correto (atenção: `DispositivoFoiRevogado.tipo === 'DispositivoRevogado'`) e campos preservados (`it.each`); nenhum evento tem campo chamado `senha`, `codigo`, `hash`, `segredo` ou `token` (teste com `Object.keys`).
- **Requisitos de segurança**: eventos não carregam senha, código, hash ou segredo (RN-38).
- **Critérios de aceite**: [ ] 13 eventos · [ ] testes passam · [ ] pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: publicação de eventos (application).
- **Convenção de commit**: `feat(TASK-013): add identity domain events`

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

### TASK-014: Agregado `Usuario`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-011, TASK-012, TASK-013
- **Objetivo**: Implementar o agregado raiz com as regras RN-02, 04, 07, 08, 10, 13 e a reconfiguração de MFA (D-010).
- **Arquivos permitidos**: `domain/usuario/usuario.ts`, `domain/usuario/usuario.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export type SituacaoDoUsuario = 'ativo' | 'desativado';
  export interface ConfiguracaoMfa { readonly segredo: SegredoTotpCifrado; readonly confirmadoEm: Date | null; readonly ultimoPasso: number | null; }
  export interface NovoCodigo { readonly id: string; readonly hash: string; }
  export interface PropsUsuario {
    id: UsuarioId; nome: string; email: Email; situacao: SituacaoDoUsuario; papeis: NomeDePapel[];
    hashDeSenha: HashDeSenha; senhaAlteradaEm: Date; mfa: ConfiguracaoMfa | null; mfaPendente: SegredoTotpCifrado | null;
    codigosDeRecuperacao: CodigoDeRecuperacao[]; tentativasFalhas: number; bloqueadoAte: Date | null; criadoEm: Date; versao: number;
  }
  export const QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO = 10;

  export class Usuario extends Agregado {
    private constructor(private readonly props: PropsUsuario);
    static criar(d: { nome: string; email: Email; hashDeSenha: HashDeSenha; papeis: NomeDePapel[]; agora: Date }): Usuario;
    static reconstituir(props: PropsUsuario): Usuario;
    // getters: id, nome, email, situacao, papeis (cópia), hashDeSenha, senhaAlteradaEm, mfa, mfaPendente,
    //          codigosDeRecuperacao (cópia readonly), tentativasFalhas, bloqueadoAte, criadoEm, versao
    definirVersaoPersistida(versao: number): void;   // uso exclusivo de repositórios
    garantirQuePodeAutenticar(agora: Date): void;
    registrarFalhaDeLogin(agora: Date, politica: PoliticaDeAcesso, motivo: 'senha' | 'mfa'): void;
    registrarLoginCompleto(agora: Date, dispositivoId: DispositivoId): void;
    exigeConfigurarMfa(): boolean;
    prepararMfa(segredo: SegredoTotpCifrado): void;
    segredoMfaPendenteDeConfirmacao(): SegredoTotpCifrado;
    confirmarMfa(passo: number, codigos: readonly NovoCodigo[], agora: Date): void;
    segredoMfaConfirmado(): SegredoTotpCifrado;
    ultimoPassoTotp(): number | null;
    aceitarPassoTotp(passo: number): void;
    consumirCodigoDeRecuperacao(hash: string, agora: Date): void;
    codigosDisponiveis(): number;
    substituirCodigosDeRecuperacao(codigos: readonly NovoCodigo[], agora: Date): void;
    iniciarReconfiguracaoMfa(segredo: SegredoTotpCifrado): void;
    confirmarReconfiguracaoMfa(passo: number, codigos: readonly NovoCodigo[], agora: Date): void;
    trocarSenha(novoHash: HashDeSenha, agora: Date): void;
    desativar(agora: Date): void;
    redefinirAcessoAdministrativamente(novoHash: HashDeSenha, agora: Date): void;
    ehProprietarioAtivo(): boolean;
  }
  ```
  **Comportamento exato**:
  | Método | Regra |
  |---|---|
  | `criar` | `nome.trim()` com 1–120 caracteres (senão `DadoInvalido('nome')`); `papeis` não vazio (senão `DadoInvalido('papeis')`); `situacao='ativo'`, `mfa=null`, `mfaPendente=null`, `codigos=[]`, `tentativasFalhas=0`, `bloqueadoAte=null`, `senhaAlteradaEm=criadoEm=agora`, `versao=0`; emite `UsuarioCriado` |
  | `garantirQuePodeAutenticar` | `desativado` → `ContaDesativada`; `bloqueadoAte && agora < bloqueadoAte` → `ContaBloqueada(bloqueadoAte)` |
  | `registrarFalhaDeLogin` | copiar **exatamente** a lógica da SPEC §5.2 (`degrau = min(tentativas - max, len - 1)`); emite `UsuarioBloqueado(id, bloqueadoAte, agora)` quando bloqueia e sempre `LoginFalhou(id, motivo, agora)` (nessa ordem) |
  | `registrarLoginCompleto` | zera tentativas e `bloqueadoAte`; emite `LoginRealizado` |
  | `exigeConfigurarMfa` | `mfa === null \|\| mfa.confirmadoEm === null` |
  | `prepararMfa` | se `mfa?.confirmadoEm` → `MfaJaConfigurado`; senão `mfa = { segredo, confirmadoEm: null, ultimoPasso: null }` |
  | `segredoMfaPendenteDeConfirmacao` | `mfa === null` → `MfaObrigatorio`; confirmado → `MfaJaConfigurado`; senão `mfa.segredo` |
  | `confirmarMfa` | mesmas guardas acima; `codigos.length !== 10` → `DadoInvalido('codigosDeRecuperacao')`; `mfa = { segredo, confirmadoEm: agora, ultimoPasso: passo }`; substitui códigos por `CodigoDeRecuperacao.novo(...)`; emite `MfaConfigurado` |
  | `segredoMfaConfirmado` | `exigeConfigurarMfa()` → `MfaObrigatorio`; senão `mfa.segredo` |
  | `aceitarPassoTotp` | `ultimoPasso !== null && passo <= ultimoPasso` → `CodigoMfaInvalido` (RN-10); senão grava `ultimoPasso = passo` |
  | `consumirCodigoDeRecuperacao` | busca código **disponível** com `hash` igual; não achou → `CodigoMfaInvalido`; `usar(agora)`; emite `CodigoDeRecuperacaoUsado(id, codigosDisponiveis(), agora)` |
  | `substituirCodigosDeRecuperacao` | exige MFA confirmado (`MfaObrigatorio`); 10 códigos; substitui; emite `CodigosDeRecuperacaoRegenerados` |
  | `iniciarReconfiguracaoMfa` | exige MFA confirmado (`MfaObrigatorio`); `mfaPendente = segredo` (sobrescreve pendente anterior) |
  | `confirmarReconfiguracaoMfa` | `mfaPendente === null` → `MfaObrigatorio`; 10 códigos; `mfa = { segredo: mfaPendente, confirmadoEm: agora, ultimoPasso: passo }`; `mfaPendente = null`; substitui códigos; emite `MfaConfigurado` |
  | `trocarSenha` | troca hash, `senhaAlteradaEm = agora`; emite `SenhaAlterada` |
  | `desativar` | já desativado → não faz nada; senão `situacao='desativado'`; emite `UsuarioDesativado` (RN-04: nunca exclui) |
  | `redefinirAcessoAdministrativamente` | troca hash; `mfa=null`; `mfaPendente=null`; `codigos=[]`; zera tentativas e bloqueio; emite `AcessoRedefinidoAdministrativamente` e depois `SenhaAlterada` |
  | `ehProprietarioAtivo` | `situacao==='ativo' && papeis.includes('proprietario')` |
- **Passo a passo**: implementar método a método, escrevendo o teste correspondente logo em seguida; use um helper de teste `fabricarUsuario(overrides)` dentro do `.spec.ts` que chama `reconstituir`.
- **Testes obrigatórios** (SPEC §9 — Domínio):
  1. 4 falhas não bloqueiam; a 5ª bloqueia por 1 min (`bloqueadoAte = agora + 60_000`) e emite `UsuarioBloqueado` + `LoginFalhou`;
  2. **degrau sobe**: 6ª falha (após o bloqueio expirar) → 5 min; 7ª → 15 min; 8ª → 60 min; 9ª → continua 60 min;
  3. dentro do bloqueio `garantirQuePodeAutenticar` lança `ContaBloqueada` com `ate` correto; exatamente em `bloqueadoAte` não lança;
  4. `registrarLoginCompleto` zera o contador (próxima falha não bloqueia);
  5. desativado lança `ContaDesativada`;
  6. `criar` com nome vazio ou só espaços lança; emite `UsuarioCriado`; `versao === 0`;
  7. fluxo MFA: `exigeConfigurarMfa()` true → `prepararMfa` → `confirmarMfa(100, 10 códigos)` → false; `prepararMfa` de novo lança `MfaJaConfigurado`;
  8. `confirmarMfa` com 9 códigos lança `DadoInvalido`;
  9. RN-10: `aceitarPassoTotp(100)` após confirmar em 100 lança `CodigoMfaInvalido`; `101` aceita; `99` lança;
  10. código de recuperação: consumir hash válido reduz `codigosDisponiveis()` para 9 e emite evento com `restantes: 9`; consumir o mesmo hash de novo lança `CodigoMfaInvalido`; hash inexistente lança;
  11. reconfiguração: `iniciarReconfiguracaoMfa` não altera `mfa` atual (`segredoMfaConfirmado()` ainda o antigo); `confirmarReconfiguracaoMfa` troca o segredo, zera pendente e gera 10 códigos novos; sem pendente lança `MfaObrigatorio`;
  12. `redefinirAcessoAdministrativamente` deixa `exigeConfigurarMfa() === true`, sem códigos e sem bloqueio;
  13. `desativar` duas vezes emite um único evento;
  14. `puxarEventos()` após `reconstituir` é vazio.
- **Requisitos de segurança**: getters de coleções devolvem cópias; nenhum método aceita senha em texto puro.
- **Critérios de aceite**: [ ] 14 grupos de teste passam · [ ] pureza vazia · [ ] nenhum `new Date()` no arquivo (`grep -n "new Date()" src/identidade-e-acesso/domain/usuario/usuario.ts` vazio)
- **Comandos de verificação**: os mesmos da TASK-010 + o `grep` acima.
- **Fora de escopo**: unicidade de e-mail (repositório), RN-03 (TASK-017), política de senha (TASK-017).
- **Convenção de commit**: `feat(TASK-014): add Usuario aggregate`

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

### TASK-015: Agregado `Dispositivo`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-013
- **Objetivo**: Implementar o dispositivo com check-in, limite offline e revogação (RN-17, 19, 20, 21; D-006 chave pública de auditoria).
- **Arquivos permitidos**: `domain/dispositivo/dispositivo.ts`, `domain/dispositivo/dispositivo.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export type SituacaoDoDispositivo = 'ativo' | 'revogado';
  export interface PropsDispositivo {
    id: DispositivoId; usuarioId: UsuarioId; apelido: string; plataforma: Plataforma; registradoEm: Date; ultimoCheckIn: Date;
    biometriaHabilitada: boolean; situacao: SituacaoDoDispositivo; revogadoEm: Date | null; motivoRevogacao: string | null;
    chavePublicaAuditoria: string; versao: number;
  }
  export class Dispositivo extends Agregado {
    static registrar(d: { usuarioId: UsuarioId; apelido: string; plataforma: string; chavePublicaAuditoria: string; agora: Date }): Dispositivo;
    static reconstituir(props: PropsDispositivo): Dispositivo;
    // getters de todos os campos
    definirVersaoPersistida(versao: number): void;
    registrarCheckIn(agora: Date): void;
    revogar(motivo: string, agora: Date): void;
    estaForaDoLimiteOffline(agora: Date, politica: PoliticaDeAcesso): boolean;
    estaAtivo(): boolean;
    podeSincronizar(): boolean;
    pertenceA(usuarioId: UsuarioId): boolean;
    garantirAtivo(): void;
  }
  ```
  | Método | Regra |
  |---|---|
  | `registrar` | `apelido.trim()` 1–60 (`DadoInvalido('apelido')`); `plataforma` ∈ `PLATAFORMAS` (`DadoInvalido('plataforma')`); `chavePublicaAuditoria` casa `/^[A-Za-z0-9+/]{43}=$/` (32 bytes em base64; `DadoInvalido('chavePublicaAuditoria')`); `ultimoCheckIn = registradoEm = agora`; `situacao='ativo'`; `biometriaHabilitada=false`; `versao=0`; emite `DispositivoRegistrado` |
  | `registrarCheckIn` | `garantirAtivo()`; só atualiza se `agora > ultimoCheckIn` (nunca retrocede) |
  | `revogar` | `motivo.trim()` 3–200 (`DadoInvalido('motivo')`); se já revogado → não faz nada; senão `situacao='revogado'`, `revogadoEm=agora`, `motivoRevogacao=motivo.trim()`; emite `DispositivoFoiRevogado` |
  | `estaForaDoLimiteOffline` | `agora - ultimoCheckIn > limiteDiasOffline * 86_400_000` (estritamente maior — SPEC §5.2) |
  | `podeSincronizar` / `estaAtivo` | `situacao === 'ativo'` |
  | `garantirAtivo` | revogado → `DispositivoRevogado` |
- **Testes obrigatórios**:
  1. **limite offline no instante exato** (SPEC §9): com limite 5 dias, `ultimoCheckIn + 5d` → `false`; `+ 5d + 1ms` → `true`;
  2. check-in atualiza; check-in com data anterior não retrocede; check-in em revogado lança `DispositivoRevogado`;
  3. revogar emite evento com `tipo 'DispositivoRevogado'` e motivo; revogar de novo não emite; `podeSincronizar()` false;
  4. validações de apelido (vazio, 61 caracteres), plataforma (`'linux'`), chave (`'abc'`, 44 caracteres sem `=`), motivo (`'ab'`).
- **Requisitos de segurança**: chave pública validada no formato antes de persistir.
- **Critérios de aceite**: [ ] testes passam · [ ] pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: limite de 3 dispositivos (TASK-017).
- **Convenção de commit**: `feat(TASK-015): add Dispositivo aggregate`

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

### TASK-016: Agregado `SessaoDeLogin`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-013, TASK-012
- **Objetivo**: Implementar a sessão com refresh rotativo e detecção de reutilização (RN-14, RN-15, DT-04, D-014).
- **Arquivos permitidos**: `domain/sessao-de-login/sessao-de-login.ts`, `domain/sessao-de-login/sessao-de-login.spec.ts` (novos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export type SituacaoDaSessao = 'ativa' | 'revogada';
  export type ResultadoDaRotacao = 'rotacionada' | 'reutilizacao-detectada' | 'invalida';
  export interface PropsSessaoDeLogin {
    id: SessaoDeLoginId; usuarioId: UsuarioId; dispositivoId: DispositivoId; refreshAtualHash: string; refreshAnteriorHash: string | null;
    criadaEm: Date; expiraEm: Date; situacao: SituacaoDaSessao; revogadaEm: Date | null; motivoRevogacao: MotivoRevogacaoDeSessao | null; versao: number;
  }
  export class SessaoDeLogin extends Agregado {
    static iniciar(d: { usuarioId: UsuarioId; dispositivoId: DispositivoId; refreshHash: string; agora: Date; politica: PoliticaDeAcesso }): SessaoDeLogin;
    static reconstituir(props: PropsSessaoDeLogin): SessaoDeLogin;
    // getters de todos os campos
    definirVersaoPersistida(versao: number): void;
    rotacionar(apresentadoHash: string, novoHash: string, agora: Date): ResultadoDaRotacao;  // código da SPEC §5.2, sem alterações
    revogar(motivo: MotivoRevogacaoDeSessao, agora: Date): void;
    estaAtiva(agora: Date): boolean;   // situacao === 'ativa' && agora < expiraEm
  }
  ```
  - `iniciar`: id novo; `refreshHash` casa `/^[0-9a-f]{64}$/` (senão `DadoInvalido('refreshHash')`); `expiraEm = agora + validadeRefreshDias * 86_400_000`; `refreshAnteriorHash = null`; `situacao='ativa'`; `versao=0`. Não emite evento.
  - `rotacionar`: exatamente como a SPEC; quando detecta reutilização chama `this.revogar('reutilizacao-de-refresh', agora)`. **Não** altera `expiraEm` (D-014). `novoHash` também validado pelo regex.
  - `revogar`: se já revogada não faz nada; senão `situacao='revogada'`, `revogadaEm`, `motivoRevogacao`; emite `SessaoRevogada`.
- **Testes obrigatórios** (SPEC §9):
  1. rotação feliz: apresentar o atual → `'rotacionada'`; `refreshAnteriorHash` = antigo atual; `refreshAtualHash` = novo;
  2. **reutilização revoga**: após rotacionar A→B, apresentar A → `'reutilizacao-detectada'`, sessão revogada, evento `SessaoRevogada` com motivo `'reutilizacao-de-refresh'`; em seguida apresentar B → `'invalida'`;
  3. **token desconhecido é inválido** e não revoga;
  4. sessão expirada (`agora === expiraEm`) → `'invalida'`;
  5. `expiraEm` não muda após rotação;
  6. `revogar` duas vezes emite um evento; `estaAtiva` false após revogar.
- **Requisitos de segurança**: só hashes (nunca o token) entram no agregado.
- **Critérios de aceite**: [ ] testes passam · [ ] pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: geração do token (infra).
- **Convenção de commit**: `feat(TASK-016): add SessaoDeLogin aggregate with refresh rotation`

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

### TASK-017: Serviços de domínio e barrel `index.ts`
- **Status**: `[x] Aprovada` (implementada e verificada pelo Claude: testes, tsc e oxlint do domínio limpos; pureza vazia)
- **Depende de**: TASK-014, TASK-015, TASK-016
- **Objetivo**: Implementar `PoliticaDeSenha` (RN-05), `PoliticaDeProprietario` (RN-03), `PoliticaDeLimiteDeDispositivos` (RN-18), `AvaliadorDeModoOffline` (RN-21, DT-12) e expor todo o domínio por um único ponto de importação.
- **Arquivos permitidos** (novos): `domain/servicos/politica-de-senha.ts`, `domain/servicos/politica-de-proprietario.ts`, `domain/servicos/politica-de-limite-de-dispositivos.ts`, `domain/servicos/avaliador-de-modo-offline.ts`, um `.spec.ts` para cada, `domain/index.ts`
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```ts
  export class PoliticaDeSenha {
    constructor(senhasComuns: ReadonlySet<string>);              // guarda versão em minúsculas
    validar(senha: string, email: Email, politica: PoliticaDeAcesso): void;
  }
  // motivos acumulados (todos que se aplicarem, nesta ordem), depois lança SenhaFraca(motivos) se houver algum:
  //  'curta'          → [...senha].length < politica.tamanhoMinimoSenha   (conta code points, não UTF-16)
  //  'longa'          → [...senha].length > 128
  //  'igual-ao-email' → senha.trim().toLowerCase() === email.valor  ||  === email.parteLocal()
  //  'comum'          → senhasComuns contém senha.toLowerCase()

  export class PoliticaDeProprietario {
    garantirQuePodeDesativar(usuario: Usuario, proprietariosAtivos: number): void; // se usuario.ehProprietarioAtivo() && proprietariosAtivos <= 1 → UltimoProprietario
  }
  export class PoliticaDeLimiteDeDispositivos {
    garantirQuePodeRegistrar(dispositivosAtivos: number, politica: PoliticaDeAcesso): void; // >= maxDispositivosAtivos → LimiteDeDispositivosAtingido(max)
  }
  export type ModoDeOperacao = 'normal' | 'somente-leitura' | 'bloqueado';
  export class AvaliadorDeModoOffline {
    avaliar(d: { agora: Date; ultimoCheckIn: Date; marcaDagua: Date | null; politica: PoliticaDeAcesso }): ModoDeOperacao;
  }
  // restrito = (marcaDagua !== null && agora < marcaDagua)            // relógio retrocedeu (DT-12)
  //         || (agora - ultimoCheckIn > limiteDiasOffline * 86_400_000)
  // restrito ? (politica.leituraPermitidaAposLimite ? 'somente-leitura' : 'bloqueado') : 'normal'
  ```
  `domain/index.ts`: `export *` de todos os arquivos do domínio (comum, erros, eventos, ids, VOs, acesso, agregados, serviços).
- **Testes obrigatórios**:
  - PoliticaDeSenha: 11 caracteres → `['curta']`; 12 ok; 129 → `['longa']`; `'lucas@x.com.br'`-like igual ao e-mail → contém `'igual-ao-email'`; parte local com 12+ caracteres → `'igual-ao-email'`; senha da lista (`'fisioterapia123'`) → `['comum']`; senha curta **e** comum → `['curta','comum']`; emoji conta como 1 caractere (`'😀'.repeat(12)` passa no tamanho).
  - PoliticaDeProprietario: **último proprietário não pode ser desativado** (count 1 → lança); count 2 → ok; usuário desativado com count 1 → ok.
  - Limite: 2 ativos ok; 3 lança com `maximo === 3`.
  - AvaliadorDeModoOffline: dentro do limite → normal; 5d+1ms → somente-leitura; com `leituraPermitidaAposLimite=false` → bloqueado; `agora < marcaDagua` → somente-leitura mesmo com check-in recente; `marcaDagua === agora` → normal.
- **Requisitos de segurança**: comparação de senha comum feita em minúsculas; nenhuma senha em mensagens.
- **Critérios de aceite**: [ ] testes passam · [ ] `import { Usuario, PoliticaDeSenha } from '.../domain/index.js'` funciona · [ ] pureza vazia
- **Comandos de verificação**: os mesmos da TASK-010.
- **Fora de escopo**: lista de senhas comuns (TASK-044 cria o arquivo de dados).
- **Convenção de commit**: `feat(TASK-017): add identity domain services and barrel`

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
