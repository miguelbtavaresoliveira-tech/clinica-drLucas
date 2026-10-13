# 📋 06 — Desktop: módulo Rust `acesso_local` (Tauri 2)

> **Objetivo**: Implementar no processo Rust tudo o que protege os dados locais e fala com a API: hierarquia de chaves (DEK/KEK), senha mestre, SQLCipher, bloqueio por inatividade/suspensão, modo offline com marca d'água, auditoria local assinada, sessão remota (tokens fora do JS) e redefinições.
> **Branch Git**: `feature/identidade-e-acesso` · **Status Geral**: ⏳ Em Progresso
> **Stack**: Rust estável (edition 2024), Tauri 2, argon2, aes-gcm, zeroize, rand, keyring, rusqlite (SQLCipher), sha2, ed25519-dalek, reqwest (rustls), chrono, uuid.
> **Leitura obrigatória**: `00-INDICE.md` §4, `DECISIONS.md` (D-005, D-009), SPEC §3 (RN-19..29, 35, 37..39), §4 (DT-05, 07..13), §6.3, §6.4 (UL-02), §7.2.

## Regras deste módulo
- Pasta: `apps/desktop/desktop-first/src-tauri/src/acesso_local/`. Comandos executar em `apps/desktop/desktop-first/src-tauri/`.
- **A DEK nunca sai do Rust** (DT-08): nenhum comando retorna chave, DEK, KEK, token, refresh, segredo ou hash. Tudo que guarda segredo em memória usa `zeroize::Zeroizing`.
- Proibido `unwrap()`, `expect()` e `panic!` fora de `#[cfg(test)]`. Mutex envenenado → `ErroDeAcesso::Interno`.
- Proibido `println!`/`eprintln!`/`dbg!` em código de produção.
- A lógica fica em structs puras e testáveis (`ServicoDeAcessoLocal`, `SessaoRemota`); `comandos.rs` só adapta para `#[tauri::command]`.
- Operações pesadas (Argon2id, rede) rodam fora da thread da UI: comandos `async` + `tauri::async_runtime::spawn_blocking` para Argon2id.
- Testes `#[cfg(test)] mod testes` no próprio arquivo; usam `tempfile::tempdir()`, `CofreEmMemoria`, `RelogioFixo` e parâmetros Argon2 reduzidos (`m=8 MiB, t=1, p=1`) — **nunca** os de produção (lentos).

## Contrato de comandos Tauri (fonte única para o frontend — arquivo 07)

Argumentos chegam do JS em camelCase e o Tauri converte para snake_case. Erros sempre serializados como `ErroDoApp` `{ codigo, mensagem, segundosRestantes?, status?, tentarApos? }`.

| Comando | Argumentos (JS) | Retorno | Tarefa |
|---|---|---|---|
| `estado_do_acesso` | — | `EstadoDoAcesso` | 065 |
| `configurar_desbloqueio` | `{ senha }` | `EstadoDoAcesso` | 065 |
| `desbloquear_com_senha` | `{ senha }` | `EstadoDoAcesso` | 065 |
| `bloquear` | — | `EstadoDoAcesso` | 065 |
| `sinal_de_atividade` | — | `null` | 067 |
| `api_iniciar_login` | `{ email, senha }` | `{ desafio, mfa: 'configurar'\|'verificar', expiraEm }` | 069 |
| `api_gerar_segredo_mfa` | `{ desafio }` | `{ segredo, urlOtpauth }` | 069 |
| `api_confirmar_mfa` | `{ desafio, codigo }` | `{ codigosDeRecuperacao: string[] }` | 069 |
| `api_concluir_login` | `{ desafio, codigo: { tipo: 'totp'\|'recuperacao', valor } }` | `ResumoDoLogin` | 069 |
| `api_renovar_sessao` | — | `EstadoDoAcesso` | 069 |
| `api_encerrar_sessao` | — | `EstadoDoAcesso` | 069 |
| `api_solicitar_redefinicao` | `{ email }` | `null` | 069 |
| `api_concluir_redefinicao` | `{ token, novaSenha, codigo: { tipo, valor } }` | `null` | 069 |
| `api_requisicao_autenticada` | `{ metodo: 'GET'\|'POST', caminho, corpo: object\|null }` | JSON da API ou `null` (204) | 069 |
| `enviar_auditoria_pendente` | — | `{ enviados: number }` | 070 |
| `reautenticar` | `{ metodo: 'senha'\|'biometria', senha: string\|null }` | `null` | 071 |
| `alterar_senha_mestre` | `{ atual, nova }` | `null` | 071 |
| `previa_redefinicao_local` | — | `{ eventosPendentes: number }` | 072 |
| `redefinir_desbloqueio_local` | `{ confirmacao }` (deve ser `'DESCARTAR'`) | `EstadoDoAcesso` | 072 |
| `redefinir_computador_revogado` | `{ confirmacao }` (deve ser `'DESCARTAR'`) | `EstadoDoAcesso` | 072 |
| `desbloquear_com_biometria` | — | `EstadoDoAcesso` | 073 |
| `ativar_biometria` | `{ senha }` | `EstadoDoAcesso` | 073 |
| `desativar_biometria` | — | `EstadoDoAcesso` | 073 |

Evento emitido pelo Rust: **`acesso://estado-alterado`** com payload `EstadoDoAcesso`, sempre que a situação mudar.

```ts
// formatos serializados (serde rename_all = "camelCase"; enums em snake_case)
type Situacao = 'sem_configuracao' | 'bloqueado' | 'normal' | 'somente_leitura' | 'offline_expirado' | 'revogado';
interface EstadoDoAcesso { situacao: Situacao; exigeLoginCompleto: boolean; biometriaDisponivel: boolean; biometriaHabilitada: boolean;
  segundosAteNovaTentativa: number; sessaoOnline: boolean; usuario: { id: string; nome: string; email: string } | null; eventosPendentes: number; }
interface ResumoDoLogin { usuario: { id: string; nome: string; email: string }; usouCodigoDeRecuperacao: boolean; codigosRestantes: number;
  proximoPasso: 'configurar_desbloqueio' | 'desbloquear' | 'pronto'; }
```

Códigos de erro próprios do Rust (`ErroDoApp.codigo`): `SENHA_MESTRE_INCORRETA`, `AGUARDE_ANTES_DE_TENTAR` (+ `segundosRestantes`), `EXIGE_LOGIN_COMPLETO`, `NAO_CONFIGURADO`, `JA_CONFIGURADO`, `BLOQUEADO`, `SENHA_MESTRE_FRACA`, `REAUTENTICACAO_NECESSARIA`, `BIOMETRIA_INDISPONIVEL`, `DISPOSITIVO_REVOGADO`, `SEM_CONEXAO`, `SESSAO_EXPIRADA`, `SOMENTE_LEITURA`, `CAMINHO_NAO_PERMITIDO`, `CONFIRMACAO_INVALIDA`, `INTERNO`. Erros vindos da API repassam o `codigo` da API (ex.: `CREDENCIAIS_INVALIDAS`, `CONTA_BLOQUEADA` com `tentarApos`) e o `status` HTTP.

## Onde fica cada coisa (SPEC §7.2 + D-005)

| Item | Local | Proteção |
|---|---|---|
| DEK em uso, access token | Memória do Rust (`Zeroizing`) | zerados ao bloquear / encerrar |
| `acesso_local.json` (DEK embrulhada, salt, parâmetros, contador de falhas, `dispositivo_id`, auditoria pré-desbloqueio) | `app_data_dir()` | AES-256-GCM (não é segredo em claro) |
| `dados.db` (estado, check-in, marca d'água, política, usuário, `auditoria_local`) | `app_data_dir()` | SQLCipher com a DEK |
| Refresh token, chave Ed25519 da auditoria, chave de biometria | Keychain / Credential Manager (`keyring`), serviço `br.com.fisioterapiaevo.clinica` | Sistema operacional |

## 🎯 Mapa de Arquivos (todos em `src-tauri/`)

| Arquivo | Tarefa |
|---|---|
| `Cargo.toml`, `Cargo.lock`, `src/lib.rs`, `src/acesso_local/{mod,erros,comandos}.rs` | TASK-060 |
| `src/acesso_local/cripto.rs` | TASK-061 |
| `src/acesso_local/armazenamento.rs` | TASK-062 |
| `src/acesso_local/cofre_so.rs` | TASK-063 |
| `src/acesso_local/banco_local.rs` | TASK-064 |
| `src/acesso_local/{estado,servico}.rs` | TASK-065 |
| `src/acesso_local/{relogio,modo_offline}.rs` | TASK-066 |
| `src/acesso_local/inatividade.rs` | TASK-067 |
| `src/acesso_local/auditoria.rs` | TASK-068 |
| `src/acesso_local/sessao_remota.rs` | TASK-069 |
| `src/acesso_local/envio_de_auditoria.rs` | TASK-070 |
| `src/acesso_local/servico.rs` (UL-06/07) | TASK-071 |
| `docs/spikes/biometria-desktop.md` | TASK-072 |
| `src/acesso_local/biometria.rs` + `servico.rs` (UL-03/05/10) | TASK-073 |

---

### TASK-060: Dependências Rust, esqueleto do módulo e tipo de erro
- **Status**: `[x] Aprovada` (fmt/clippy/test (6) e cargo audit sem vulnerabilidades, validados no WSL2)
- **Depende de**: TASK-006
- **Objetivo**: Preparar o crate com as bibliotecas da SPEC §7.2, remover o comando de exemplo `greet` e definir o erro serializável único.
- **Arquivos permitidos**: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `src-tauri/src/acesso_local/mod.rs`, `src-tauri/src/acesso_local/erros.rs`, `src-tauri/src/acesso_local/comandos.rs` (novos os três últimos)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  - `[dependencies]` a adicionar (majors exatos):
    ```toml
    argon2 = "0.5"
    aes-gcm = "0.10"
    zeroize = { version = "1", features = ["derive"] }
    rand = "0.8"
    keyring = { version = "3", features = ["apple-native", "windows-native"] }
    rusqlite = { version = "0.32", features = ["bundled-sqlcipher-vendored-openssl"] }
    sha2 = "0.10"
    ed25519-dalek = "2"
    base64 = "0.22"
    hex = "0.4"
    chrono = { version = "0.4", default-features = false, features = ["clock", "std", "serde"] }
    uuid = { version = "1", features = ["v4", "serde"] }
    reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
    thiserror = "2"
    url = "2"
    regex = "1"
    ```
    `[dev-dependencies]`: `tempfile = "3"`, `mockito = "1"`, `tokio = { version = "1", features = ["macros", "rt-multi-thread"] }`.
  - `erros.rs`:
    ```rust
    #[derive(Debug, thiserror::Error)]
    pub enum ErroDeAcesso {
        #[error("Senha mestre incorreta.")] SenhaMestreIncorreta,
        #[error("Aguarde antes de tentar novamente.")] AguardeAntesDeTentar { segundos_restantes: u64 },
        #[error("Entre novamente com e-mail, senha e código.")] ExigeLoginCompleto,
        #[error("O desbloqueio local ainda não foi configurado.")] NaoConfigurado,
        #[error("O desbloqueio local já está configurado.")] JaConfigurado,
        #[error("O aplicativo está bloqueado.")] Bloqueado,
        #[error("A senha mestre precisa ter entre 12 e 128 caracteres.")] SenhaMestreFraca,
        #[error("Confirme sua identidade para continuar.")] ReautenticacaoNecessaria,
        #[error("Biometria indisponível neste computador.")] BiometriaIndisponivel,
        #[error("Este computador foi desconectado da conta.")] DispositivoRevogado,
        #[error("Sem conexão com o servidor.")] SemConexao,
        #[error("Sessão expirada. Entre novamente.")] SessaoExpirada,
        #[error("Modo somente leitura.")] SomenteLeitura,
        #[error("Operação não permitida.")] CaminhoNaoPermitido,
        #[error("Confirmação inválida.")] ConfirmacaoInvalida,
        #[error("{mensagem}")] Api { status: u16, codigo: String, mensagem: String, tentar_apos: Option<String> },
        #[error("Erro interno.")] Interno,
    }
    impl ErroDeAcesso { pub fn codigo(&self) -> String; }   // SCREAMING_SNAKE_CASE da variante; para Api, o `codigo` recebido
    impl serde::Serialize for ErroDeAcesso { /* objeto { codigo, mensagem, segundosRestantes?, status?, tentarApos? } — campos opcionais omitidos quando ausentes */ }
    ```
  - `mod.rs`: `pub mod erros; pub mod comandos;` (as tarefas seguintes adicionam seus módulos aqui — `mod.rs` é permitido em todas as tarefas deste arquivo **apenas** para adicionar `pub mod x;`).
  - `comandos.rs`: vazio por enquanto, exceto `pub fn registrar() -> impl Fn(tauri::ipc::Invoke) -> bool` **ou** uma macro equivalente; se o `generate_handler!` exigir os comandos no `lib.rs`, mantenha a lista lá e registre em Desvios.
  - `lib.rs`: remover `greet`; declarar `mod acesso_local;`; manter `tauri_plugin_opener`.
- **Passo a passo**: instalar rustup (se faltar) e Strawberry Perl no Windows; editar `Cargo.toml`; `cargo build`; implementar `erros.rs` com testes.
- **Testes obrigatórios** (em `erros.rs`): `serde_json::to_value(ErroDeAcesso::AguardeAntesDeTentar { segundos_restantes: 30 })` == `{"codigo":"AGUARDE_ANTES_DE_TENTAR","mensagem":"Aguarde antes de tentar novamente.","segundosRestantes":30}`; `Api { status: 423, codigo: "CONTA_BLOQUEADA", .., tentar_apos: Some(..) }` serializa `codigo`, `status`, `tentarApos`; `Interno` serializa só `codigo` e `mensagem`.
- **Requisitos de segurança**: `Interno` nunca carrega detalhe; TLS via rustls (sem OpenSSL do sistema para HTTP).
- **Critérios de aceite**: [ ] `cargo build` ok · [ ] `grep -rn "greet" src` vazio · [ ] testes passam
- **Comandos de verificação** (em `src-tauri/`):
  ```bash
  cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
  cargo audit
  ```
- **Fora de escopo**: lógica de acesso.
- **Convenção de commit**: `chore(TASK-060): add rust dependencies and acesso_local error type`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Versões resolvidas** (`cargo tree --depth 1`): `[colar]`
- **Saída dos comandos de validação**: `[colar]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[...]`
- **Achados**: `[...]`
- **Correções exigidas**: `[...]`

---

### TASK-061: `cripto.rs` — DEK, Argon2id e embrulho AES-256-GCM
- **Status**: `[x] Aprovada` (fmt/clippy/test (10 novos) validados no WSL2)
- **Depende de**: TASK-060
- **Objetivo**: Implementar a hierarquia de chaves (DT-07) e a derivação calibrada (DT-09).
- **Arquivos permitidos**: `src-tauri/src/acesso_local/cripto.rs` (novo), `mod.rs` (só `pub mod cripto;`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub type Chave = Zeroizing<[u8; 32]>;
  #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
  pub struct ParametrosArgon2 { pub m_kib: u32, pub t: u32, pub p: u32 }
  pub const PARAMETROS_MINIMOS: ParametrosArgon2 = ParametrosArgon2 { m_kib: 65_536, t: 3, p: 1 }; // 64 MiB — mais forte que o servidor (DT-09)
  #[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
  pub struct DekEmbrulhada { pub nonce_b64: String, pub cifrado_b64: String }
  pub const AAD_DEK: &[u8] = b"evo-acesso-local-dek-v1";

  pub fn gerar_dek() -> Chave;                                         // OsRng
  pub fn gerar_salt() -> [u8; 16];
  pub fn derivar_kek(senha: &str, salt: &[u8], p: ParametrosArgon2) -> Result<Chave, ErroDeAcesso>;  // Argon2id v0x13, saída 32 bytes
  pub fn embrulhar(dek: &[u8; 32], kek: &[u8; 32]) -> Result<DekEmbrulhada, ErroDeAcesso>;         // nonce aleatório de 12 bytes, AAD_DEK
  pub fn desembrulhar(emb: &DekEmbrulhada, kek: &[u8; 32]) -> Option<Chave>;                         // falha de autenticação → None (= senha errada)
  pub fn calibrar(alvo_min_ms: u128, alvo_max_ms: u128) -> ParametrosArgon2;
  // calibrar: começa em PARAMETROS_MINIMOS; mede derivar_kek com senha/salt fixos; enquanto < alvo_min e t < 10 → t += 1;
  //           nunca retorna abaixo de PARAMETROS_MINIMOS (uso: calibrar(500, 1000))
  ```
- **Testes obrigatórios** (parâmetros de teste `m=8192, t=1, p=1`): `desembrulhar(embrulhar(dek, kek), kek)` devolve a mesma DEK; KEK de senha errada → `None`; alterar 1 byte do cifrado → `None`; duas embrulhadas da mesma DEK diferem (nonce); mesma senha + mesmo salt → mesma KEK; salts diferentes → KEKs diferentes; `calibrar` nunca retorna `m_kib < 65_536` (rode com alvo 0–1 ms para ser rápido).
- **Requisitos de segurança**: `OsRng`; `Zeroizing` em DEK/KEK; AAD fixo; nada de chave em `Debug` (não derive `Debug` em tipos com chave).
- **Critérios de aceite**: [ ] testes passam · [ ] `grep -n "derive(.*Debug" src/acesso_local/cripto.rs` só em `ParametrosArgon2` e `DekEmbrulhada`
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local::cripto`
- **Fora de escopo**: persistência.
- **Convenção de commit**: `feat(TASK-061): add local key hierarchy crypto`

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

### TASK-062: `armazenamento.rs` — `acesso_local.json` e política de atraso
- **Status**: `[x] Aprovada` (fmt/clippy/test (10 novos) validados no WSL2)
- **Depende de**: TASK-061
- **Objetivo**: Persistir fora do banco cifrado o que é preciso antes de desbloquear, inclusive o contador de falhas que **sobrevive a reinício** (RN-27).
- **Arquivos permitidos**: `src-tauri/src/acesso_local/armazenamento.rs` (novo), `mod.rs` (só `pub mod armazenamento;`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub const NOME_DO_ARQUIVO: &str = "acesso_local.json";
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
  pub struct RegistroPendente { pub tipo: String, pub ocorrido_em: DateTime<Utc>, pub detalhe: BTreeMap<String, serde_json::Value> }
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
  pub struct EstadoPersistido {
      pub versao: u32,                              // 1
      pub kdf: Option<Kdf>,                         // None até configurar o desbloqueio
      pub dek_por_senha: Option<DekEmbrulhada>,
      pub dek_por_biometria: Option<DekEmbrulhada>,
      pub falhas_consecutivas: u32,
      pub ultima_falha_em: Option<DateTime<Utc>>,
      pub exige_login_completo: bool,
      pub max_falhas_desbloqueio_local: u32,        // padrão 10; atualizado pela política do login
      pub dispositivo_id: Option<String>,
      pub revogado: bool,
      pub eventos_pendentes: u64,
      pub auditoria_pendente: Vec<RegistroPendente>, // registros gerados com o app bloqueado (ex.: falha de desbloqueio)
  }
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
  pub struct Kdf { pub algoritmo: String /* "argon2id" */, pub parametros: ParametrosArgon2, pub salt_b64: String }
  impl Default for EstadoPersistido { /* versao 1, tudo vazio/zero, max_falhas 10 */ }

  pub fn ler(diretorio: &Path) -> Result<EstadoPersistido, ErroDeAcesso>;     // arquivo ausente → Default; JSON inválido → Interno (NUNCA apagar o arquivo)
  pub fn salvar(diretorio: &Path, e: &EstadoPersistido) -> Result<(), ErroDeAcesso>;  // escreve em "acesso_local.json.tmp", fsync, rename atômico
  pub fn atraso_em_segundos(falhas: u32) -> u64;
  // 0..=2 → 0; 3 → 5; 4 → 15; 5 → 30; 6 → 60; 7 → 120; 8 → 300; ≥9 → 600
  pub fn segundos_restantes(e: &EstadoPersistido, agora: DateTime<Utc>) -> u64;
  // sem ultima_falha_em → 0; se agora < ultima_falha_em (relógio voltou) → atraso inteiro; senão max(0, atraso - (agora - ultima_falha_em))
  ```
- **Testes obrigatórios**: arquivo ausente → `Default`; salvar e ler de novo → igual; **contador persiste após "reinício"** (salvar com 4 falhas, criar nova leitura → 4); JSON corrompido → `Err(Interno)` e o arquivo continua no disco; tabela de atraso completa (`it`-like com array de pares); `segundos_restantes` com relógio retrocedido devolve o atraso inteiro; não sobra `.tmp` após salvar.
- **Requisitos de segurança**: escrita atômica (sem arquivo truncado após queda de energia); nunca apagar dados por falha (RN-28).
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local::armazenamento`
- **Fora de escopo**: uso do estado (TASK-065).
- **Convenção de commit**: `feat(TASK-062): add persisted local access state`

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

### TASK-063: `cofre_so.rs` — porta `CofreDeChavesDoSo` com Keychain/Credential Manager
- **Status**: `[🔍 Aguardando verificação manual]` (testes em memória, fmt e clippy OK no WSL2; falta rodar `EVO_TESTAR_KEYRING=1 cargo test acesso_local::cofre_so` no Windows/macOS)
- **Depende de**: TASK-060
- **Objetivo**: Guardar refresh token, chave de auditoria e chave de biometria no cofre do sistema (DT-05, DT-13, SPEC §6.1 porta `CofreDeChavesDoSo`).
- **Arquivos permitidos**: `src-tauri/src/acesso_local/cofre_so.rs` (novo), `mod.rs` (só `pub mod cofre_so;`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub const SERVICO: &str = "br.com.fisioterapiaevo.clinica";
  pub const CHAVE_REFRESH: &str = "refresh_token";
  pub const CHAVE_AUDITORIA: &str = "auditoria_ed25519";
  pub const CHAVE_BIOMETRIA: &str = "dek_biometria";
  pub trait CofreDeChavesDoSo: Send + Sync {
      fn guardar(&self, nome: &str, valor: &[u8]) -> Result<(), ErroDeAcesso>;
      fn ler(&self, nome: &str) -> Result<Option<Zeroizing<Vec<u8>>>, ErroDeAcesso>;   // ausente → Ok(None)
      fn remover(&self, nome: &str) -> Result<(), ErroDeAcesso>;                        // ausente → Ok(())
  }
  pub struct KeyringCofre;             // keyring::Entry::new(SERVICO, nome); guarda base64 do valor com set_password; NoEntry → None
  pub struct CofreEmMemoria { /* Mutex<HashMap<String, Vec<u8>>> */ }   // pub, usado em testes de todos os módulos
  ```
  (O parâmetro `exige_biometria` da SPEC fica para a TASK-073, conforme o resultado do spike.)
- **Testes obrigatórios** (somente `CofreEmMemoria`): guardar/ler/remover; ler ausente → `None`; remover ausente → `Ok`; sobrescrever. Para `KeyringCofre`, **teste manual**: no relatório, cole a saída de um binário de exemplo ou de `cargo test` rodado localmente com uma função de teste **não** ignorada que só execute quando a variável `EVO_TESTAR_KEYRING=1` estiver definida (sem a variável, o teste retorna cedo com `return;`).
- **Requisitos de segurança**: valores nunca logados; `Zeroizing` no retorno.
- **Critérios de aceite**: [ ] testes passam · [ ] teste manual do Keychain/Credential Manager documentado
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local::cofre_so` e `EVO_TESTAR_KEYRING=1 cargo test acesso_local::cofre_so`
- **Fora de escopo**: biometria.
- **Convenção de commit**: `feat(TASK-063): add OS keychain port`

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

### TASK-064: `banco_local.rs` — SQLCipher com a DEK
- **Status**: `[x] Aprovada` (fmt/clippy/test (6 novos) validados no WSL2)
- **Depende de**: TASK-061
- **Objetivo**: Abrir/fechar o banco local cifrado (porta `BancoLocal`) e criar as tabelas do contexto (`estado_de_acesso`, `auditoria_local`).
- **Arquivos permitidos**: `src-tauri/src/acesso_local/banco_local.rs` (novo), `mod.rs` (só `pub mod banco_local;`)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub const NOME_DO_BANCO: &str = "dados.db";
  pub struct BancoLocal { conexao: rusqlite::Connection }
  impl BancoLocal {
      pub fn abrir(diretorio: &Path, dek: &[u8; 32]) -> Result<BancoLocal, ErroDeAcesso>;
      // Connection::open; PRAGMA key = "x'<hex da dek>'" (string hex em Zeroizing); PRAGMA cipher_memory_security = ON;
      // valida com SELECT count(*) FROM sqlite_master (chave errada → Interno); PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; aplica migrações
      pub fn fechar(self) -> Result<(), ErroDeAcesso>;
      pub fn ler_valor(&self, chave: &str) -> Result<Option<String>, ErroDeAcesso>;
      pub fn gravar_valor(&self, chave: &str, valor: &str) -> Result<(), ErroDeAcesso>;   // UPSERT
      pub fn conexao(&self) -> &rusqlite::Connection;                                     // uso interno do módulo (auditoria)
  }
  ```
  Migração v1 (controle por `PRAGMA user_version`):
  ```sql
  CREATE TABLE estado_de_acesso (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  CREATE TABLE auditoria_local (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, ocorrido_em TEXT NOT NULL, tipo TEXT NOT NULL,
    usuario_id TEXT NOT NULL, dispositivo_id TEXT NOT NULL, detalhe TEXT NOT NULL, hash_anterior TEXT, hash TEXT NOT NULL,
    assinatura TEXT NOT NULL, enviado INTEGER NOT NULL DEFAULT 0);
  CREATE TRIGGER auditoria_local_sem_delete BEFORE DELETE ON auditoria_local BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  CREATE TRIGGER auditoria_local_imutavel BEFORE UPDATE OF id, ocorrido_em, tipo, usuario_id, dispositivo_id, detalhe, hash_anterior, hash, assinatura
    ON auditoria_local BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  PRAGMA user_version = 1;
  ```
  Chaves usadas em `estado_de_acesso`: `ultimo_checkin`, `marca_dagua`, `politica`, `usuario` (definidas nas tarefas seguintes).
- **Testes obrigatórios**: abrir, gravar, fechar, reabrir com a mesma DEK → valor lido; reabrir com outra DEK → `Err`; os primeiros 16 bytes do arquivo **não** são `"SQLite format 3\0"` (prova de cifra); `UPDATE` de `hash` e `DELETE` em `auditoria_local` falham; `UPDATE ... SET enviado = 1` funciona; migração idempotente (abrir 2× não falha).
- **Requisitos de segurança**: banco inteiro cifrado; chave hex zerada após uso; auditoria local imutável.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local::banco_local`
- **Fora de escopo**: tabelas de outros contextos.
- **Convenção de commit**: `feat(TASK-064): add SQLCipher local database`

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

### TASK-065: `ServicoDeAcessoLocal` — configurar, desbloquear com senha, bloquear, estado (UL-01, UL-02, UL-04)
- **Status**: `[x] Aprovada` (fmt/clippy/test (53 no módulo) e cargo build validados no WSL2)
- **Depende de**: TASK-062, TASK-063, TASK-064
- **Objetivo**: O app sempre abre bloqueado (RN-23); a senha mestre é definida no primeiro acesso e nunca vai ao servidor (RN-24); falhas com atraso persistido e login completo após 10 (RN-27); nunca apagar dados por falha (RN-28).
- **Arquivos permitidos**: `src-tauri/src/acesso_local/estado.rs`, `src-tauri/src/acesso_local/servico.rs` (novos); `comandos.rs`, `lib.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  // estado.rs
  #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)] #[serde(rename_all = "snake_case")]
  pub enum Situacao { SemConfiguracao, Bloqueado, Normal, SomenteLeitura, OfflineExpirado, Revogado }
  #[derive(Clone, Debug, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
  pub struct EstadoDoAcesso { pub situacao: Situacao, pub exige_login_completo: bool, pub biometria_disponivel: bool, pub biometria_habilitada: bool,
      pub segundos_ate_nova_tentativa: u64, pub sessao_online: bool, pub usuario: Option<UsuarioResumo>, pub eventos_pendentes: u64 }
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] #[serde(rename_all = "camelCase")]
  pub struct UsuarioResumo { pub id: String, pub nome: String, pub email: String }
  pub enum MotivoDeBloqueio { Manual, Inatividade, Suspensao, Revogacao }

  // servico.rs
  pub struct ServicoDeAcessoLocal {
      diretorio: PathBuf, cofre: Arc<dyn CofreDeChavesDoSo>, relogio: Arc<dyn Relogio>,   // Relogio: TASK-066 — até lá use um trait local mínimo `fn agora(&self) -> DateTime<Utc>` em servico.rs e mova na 066
      parametros_novos: ParametrosArgon2,
      dek: Option<Chave>, banco: Option<BancoLocal>, situacao_desbloqueada: Situacao,
      reautenticado_em: Option<DateTime<Utc>>, sessao_online: bool, usuario: Option<UsuarioResumo>,
  }
  impl ServicoDeAcessoLocal {
      pub fn novo(diretorio, cofre, relogio, parametros_novos) -> Self;
      pub fn estado(&self) -> Result<EstadoDoAcesso, ErroDeAcesso>;
      pub fn configurar(&mut self, senha: &str) -> Result<EstadoDoAcesso, ErroDeAcesso>;         // UL-01
      pub fn desbloquear_com_senha(&mut self, senha: &str) -> Result<EstadoDoAcesso, ErroDeAcesso>; // UL-02
      pub fn bloquear(&mut self, motivo: MotivoDeBloqueio) -> Result<EstadoDoAcesso, ErroDeAcesso>; // UL-04
      pub fn esta_desbloqueado(&self) -> bool;
      pub fn banco(&self) -> Result<&BancoLocal, ErroDeAcesso>;                                   // bloqueado → Err(Bloqueado)
      pub fn garantir_escrita(&self) -> Result<(), ErroDeAcesso>;                                 // SomenteLeitura/OfflineExpirado → Err(SomenteLeitura)
      pub fn garantir_reautenticacao_recente(&self, janela_min: i64) -> Result<(), ErroDeAcesso>; // sem reautenticação ou fora da janela → Err(ReautenticacaoNecessaria)
  }
  ```
  **Regras**:
  - `estado()`: `revogado` no JSON → `Revogado`; sem `kdf` → `SemConfiguracao`; DEK ausente → `Bloqueado`; senão a `situacao_desbloqueada` (`Normal` até a TASK-066). `segundos_ate_nova_tentativa` = `segundos_restantes(json, agora)`; `exige_login_completo` do JSON; `eventos_pendentes` do JSON.
  - `configurar(senha)`: já tem `kdf` → `JaConfigurado`; `senha` com < 12 ou > 128 caracteres (`chars().count()`) → `SenhaMestreFraca`; `gerar_dek`, `gerar_salt`, `derivar_kek(senha, salt, parametros_novos)`, `embrulhar`; grava `kdf` + `dek_por_senha` no JSON (escrita atômica) **antes** de criar o banco; `BancoLocal::abrir`; mantém DEK e banco em memória → `Normal`.
  - `desbloquear_com_senha(senha)` (SPEC §6.4 UL-02):
    1. sem `kdf` → `NaoConfigurado`; `revogado` → `DispositivoRevogado`; `exige_login_completo` → `ExigeLoginCompleto`;
    2. `segundos_restantes > 0` → `AguardeAntesDeTentar { segundos_restantes }`;
    3. **pré-incrementa** `falhas_consecutivas`, grava `ultima_falha_em = agora` e salva o JSON **antes** de derivar (impede burlar o contador matando o processo);
    4. deriva e tenta desembrulhar; `None` → se `falhas >= max_falhas_desbloqueio_local` → `exige_login_completo = true`; adiciona `RegistroPendente { tipo: "desbloqueio-local-falhou", detalhe: { "tentativa": falhas } }`; salva; retorna `SenhaMestreIncorreta` (ou `ExigeLoginCompleto` se acabou de atingir o limite);
    5. sucesso → `falhas = 0`, `ultima_falha_em = None`, salva; abre o banco; adiciona `RegistroPendente { tipo: "desbloqueio-local-ok", detalhe: { "metodo": "senha" } }` (gravado na auditoria pela TASK-068); retorna estado.
  - `bloquear(motivo)`: descarta banco (`fechar`) e DEK (`Zeroizing` zera no drop), `reautenticado_em = None` → `Bloqueado`. Idempotente.
  - **Nunca** apagar `dados.db` ou `acesso_local.json` em nenhum caminho desta tarefa.
  - Estado do app: `pub struct EstadoTauri { pub acesso: Arc<Mutex<ServicoDeAcessoLocal>> }` registrado com `.manage(...)` no `setup` do `lib.rs`, usando `app.path().app_data_dir()` (criar o diretório se faltar), `KeyringCofre`, relógio do sistema e `calibrar(500, 1000)` executado **uma vez** dentro do comando `configurar_desbloqueio` (não no startup).
  - `comandos.rs`: `estado_do_acesso`, `configurar_desbloqueio(senha: String)`, `desbloquear_com_senha(senha: String)`, `bloquear()` — `async`, usando `spawn_blocking` para Argon2id; após mudar a situação, `app.emit("acesso://estado-alterado", &estado)`. Converter `senha` para `Zeroizing<String>` na entrada.
- **Testes obrigatórios** (sobre `ServicoDeAcessoLocal`, `tempdir`, `CofreEmMemoria`, parâmetros pequenos):
  1. novo diretório → `SemConfiguracao`; `configurar` → `Normal`; novo serviço no mesmo diretório → `Bloqueado` (**sempre abre bloqueado**);
  2. senha certa desbloqueia e lê valor gravado antes; senha errada → `SenhaMestreIncorreta` e `falhas_consecutivas == 1` lido do disco;
  3. 3 falhas → próxima tentativa imediata → `AguardeAntesDeTentar { 5 }`; avançando o relógio 5 s permite tentar;
  4. **10 falhas** (avançando o relógio entre elas) → `ExigeLoginCompleto`; a 11ª, mesmo com a senha certa → `ExigeLoginCompleto`; `dados.db` **continua existindo** (RN-28);
  5. **contador persiste após reinício**: 2 falhas, novo serviço → `falhas_consecutivas == 2`;
  6. `bloquear` → `banco()` retorna `Err(Bloqueado)`; `esta_desbloqueado() == false`;
  7. `configurar` com 11 caracteres → `SenhaMestreFraca`; `configurar` duas vezes → `JaConfigurado`;
  8. sucesso zera o contador;
  9. `garantir_reautenticacao_recente(5)` sem reautenticação → `ReautenticacaoNecessaria`.
- **Requisitos de segurança**: RN-23, 24, 27, 28; DT-07, 08; senha em `Zeroizing`; nenhum comando devolve DEK.
- **Critérios de aceite**: [ ] testes passam · [ ] `cargo build` ok · [ ] `grep -rn "remove_file" src/acesso_local/servico.rs` vazio
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: biometria, modo offline, auditoria assinada, inatividade.
- **Convenção de commit**: `feat(TASK-065): add local unlock service with master password`

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

### TASK-066: Relógio com marca d'água e modo offline (UL-08, RN-21, DT-12)
- **Status**: `[x] Aprovada` (fmt/clippy/test (68 no módulo) validados no WSL2)
- **Depende de**: TASK-065
- **Objetivo**: Calcular `normal` / `somente_leitura` / `offline_expirado` pelo limite de dias e por relógio retrocedido.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/relogio.rs`, `src-tauri/src/acesso_local/modo_offline.rs` (novos); `servico.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  // relogio.rs
  pub trait Relogio: Send + Sync { fn agora(&self) -> DateTime<Utc>; }
  pub struct RelogioDoSistema;                 // Utc::now()
  pub struct RelogioFixo(Mutex<DateTime<Utc>>);  // novo(d), avancar(chrono::Duration), definir(d) — pub para testes de todos os módulos

  // modo_offline.rs
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] #[serde(rename_all = "camelCase")]
  pub struct PoliticaLocal { pub inatividade_min: i64, pub limite_dias_offline: i64, pub leitura_permitida_apos_limite: bool,
      pub janela_reautenticacao_min: i64, pub max_falhas_desbloqueio_local: u32 }   // subconjunto da PoliticaDeAcesso; Default = 10, 5, true, 5, 10
  pub fn avaliar(agora: DateTime<Utc>, ultimo_checkin: DateTime<Utc>, marca_dagua: Option<DateTime<Utc>>, p: &PoliticaLocal) -> Situacao;
  // restrito = marca_dagua.is_some_and(|m| agora < m) || (agora - ultimo_checkin) > Duration::days(p.limite_dias_offline)
  // restrito ? (p.leitura_permitida_apos_limite ? SomenteLeitura : OfflineExpirado) : Normal
  pub fn nova_marca_dagua(atual: Option<DateTime<Utc>>, agora: DateTime<Utc>) -> DateTime<Utc>;  // max
  ```
  No `ServicoDeAcessoLocal`: substituir o trait provisório pelo `Relogio`; novo método `pub fn reavaliar_modo(&mut self) -> Result<EstadoDoAcesso, ErroDeAcesso>` (só desbloqueado): lê `ultimo_checkin`, `marca_dagua` e `politica` (JSON de `PoliticaLocal`) do banco; **avalia primeiro, depois** grava `marca_dagua = nova_marca_dagua(..)`; atualiza `situacao_desbloqueada`; se entrou em restrição pela primeira vez, adiciona `RegistroPendente { tipo: "modo-somente-leitura" }`. Chamar `reavaliar_modo` ao final de `configurar` e `desbloquear_com_senha`. Sem `ultimo_checkin` gravado → trate como `agora` (primeiro acesso acabou de fazer login). Também `pub fn politica(&self) -> PoliticaLocal` (banco ou `Default`).
- **Testes obrigatórios** (`modo_offline` puro + serviço): dentro do limite → `Normal`; `5 dias + 1 s` → `SomenteLeitura`; com leitura proibida → `OfflineExpirado`; exatamente 5 dias → `Normal`; **relógio retrocedido vira somente leitura** (marca d'água em T, agora T − 1 min); marca d'água nunca diminui; serviço: desbloquear com `ultimo_checkin` antigo → `situacao == SomenteLeitura` e `garantir_escrita()` → `Err(SomenteLeitura)`.
- **Requisitos de segurança**: DT-12 (voltar o relógio não estende o prazo).
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: execução horária (TASK-067).
- **Convenção de commit**: `feat(TASK-066): add watermark clock and offline mode evaluation`

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

### TASK-067: Bloqueio por inatividade e suspensão (RN-26, DT-11)
- **Status**: `[🔍 Aguardando verificação manual]` (fmt/clippy/test (77 no módulo) e cargo build OK no WSL2; falta o teste manual com pnpm tauri dev e POLITICA_INATIVIDADE_MIN=1)
- **Depende de**: TASK-066
- **Objetivo**: Timer de inatividade **no Rust**; o Vue só envia sinais de atividade. Bloquear também ao suspender o computador e reavaliar o modo offline a cada hora.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/inatividade.rs` (novo); `servico.rs`, `comandos.rs`, `lib.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  #[derive(Debug, PartialEq, Eq)]
  pub enum AcaoDoMonitor { Nada, BloquearPorInatividade, BloquearPorSuspensao, ReavaliarModo }
  pub struct EntradaDoTick { pub desbloqueado: bool, pub ociosidade: Duration /* desde o último sinal */, pub salto_de_parede: Duration /* relógio de parede entre ticks */,
      pub desde_ultima_reavaliacao: Duration, pub limite_inatividade: Duration }
  pub const INTERVALO_DO_TICK: Duration = Duration::from_secs(5);
  pub const SALTO_QUE_INDICA_SUSPENSAO: Duration = Duration::from_secs(30);
  pub const INTERVALO_DE_REAVALIACAO: Duration = Duration::from_secs(3600);
  pub fn decidir(e: &EntradaDoTick) -> AcaoDoMonitor;
  // !desbloqueado → Nada; salto_de_parede >= 30 s → BloquearPorSuspensao; ociosidade >= limite → BloquearPorInatividade;
  // desde_ultima_reavaliacao >= 1 h → ReavaliarModo; senão Nada
  pub fn iniciar_monitor(app: tauri::AppHandle, acesso: Arc<Mutex<ServicoDeAcessoLocal>>);
  // thread dedicada (std::thread::spawn) em loop: sleep(INTERVALO_DO_TICK); mede salto com SystemTime; ociosidade com Instant;
  // executa a ação; ao bloquear, emite "acesso://estado-alterado"
  ```
  No serviço: `ultima_atividade: Instant` (atualizada ao desbloquear e por `registrar_atividade()`), `limite_inatividade()` a partir de `politica().inatividade_min`. Comando `sinal_de_atividade()` → `registrar_atividade()` (sem efeito se bloqueado). `lib.rs` chama `iniciar_monitor` no `setup`. Bloqueio por inatividade/suspensão adiciona `RegistroPendente { tipo: "app-bloqueado", detalhe: { "motivo": "inatividade" | "suspensao" | "manual" } }` antes de fechar o banco.
- **Testes obrigatórios** (só `decidir`, puro): bloqueado → `Nada`; ocioso 9 min59s com limite 10 → `Nada`; 10 min → `BloquearPorInatividade`; salto de 31 s → `BloquearPorSuspensao` (prioridade sobre inatividade); 1 h desde a reavaliação → `ReavaliarModo`; serviço: `registrar_atividade` com app bloqueado não desbloqueia.
- **Requisitos de segurança**: DT-11 — bloqueio não depende da interface; falha ao obter o mutex → bloqueia (fail-closed).
- **Critérios de aceite**: [ ] testes passam · [ ] teste manual: `pnpm tauri dev`, configurar `POLITICA_INATIVIDADE_MIN=1` no servidor, ficar 1 min parado → tela de desbloqueio (descrever no relatório)
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: listeners de atividade no Vue (TASK-091).
- **Convenção de commit**: `feat(TASK-067): add inactivity and suspend auto-lock`

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

### TASK-068: Auditoria local encadeada e assinada (UL-11, RN-37, RN-39, DT-13, D-009)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-066
- **Objetivo**: Gravar registros locais encadeados por hash e assinados com Ed25519, no formato canônico idêntico ao servidor.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/auditoria.rs` (novo); `servico.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] #[serde(untagged)]
  pub enum ValorDeDetalhe { Texto(String), Inteiro(i64), Booleano(bool), Nulo }
  pub type Detalhe = BTreeMap<String, ValorDeDetalhe>;
  #[derive(Clone, Debug, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
  pub struct RegistroLocal { pub id: String, pub ocorrido_em: String, pub tipo: String, pub usuario_id: String, pub dispositivo_id: String,
      pub detalhe: Detalhe, pub hash_anterior: Option<String>, pub hash: String, pub assinatura: String }   // formato exato do corpo de /auditoria/lote
  pub fn serializar_canonico(id: &str, ocorrido_em: &str, tipo: &str, usuario_id: &str, dispositivo_id: &str, detalhe: &Detalhe, hash_anterior: Option<&str>) -> String;
  // ["v1", id, ocorrido_em, tipo, usuario_id, dispositivo_id, serde_json::to_string(detalhe), hash_anterior.unwrap_or("")].join("|")
  pub fn formatar_instante(d: DateTime<Utc>) -> String;     // d.to_rfc3339_opts(SecondsFormat::Millis, true)
  pub fn chave_de_assinatura(cofre: &dyn CofreDeChavesDoSo) -> Result<SigningKey, ErroDeAcesso>;   // lê semente de 32 bytes de CHAVE_AUDITORIA; ausente → gera com OsRng e guarda
  pub fn chave_publica_b64(cofre: &dyn CofreDeChavesDoSo) -> Result<String, ErroDeAcesso>;
  pub fn registrar(banco: &BancoLocal, chave: &SigningKey, tipo: &str, detalhe: Detalhe, ocorrido_em: DateTime<Utc>, usuario_id: &str, dispositivo_id: &str) -> Result<RegistroLocal, ErroDeAcesso>;
  // hash_anterior = hash do último por seq; hash = hex(sha256(canonico)); assinatura = base64(sign(hash.as_bytes())); INSERT
  pub fn pendentes(banco: &BancoLocal, limite: usize) -> Result<Vec<RegistroLocal>, ErroDeAcesso>;   // enviado = 0, ordem seq ASC
  pub fn marcar_enviados(banco: &BancoLocal, ids: &[String]) -> Result<(), ErroDeAcesso>;
  pub fn contar_pendentes(banco: &BancoLocal) -> Result<u64, ErroDeAcesso>;
  ```
  No serviço: `pub fn auditar(&mut self, tipo: &str, detalhe: Detalhe)` — se desbloqueado **e** com `usuario` e `dispositivo_id` conhecidos, grava direto; senão empilha em `auditoria_pendente` do JSON. Ao desbloquear (depois de abrir o banco e conhecer usuário/dispositivo), **descarrega** `auditoria_pendente` na ordem e esvazia a lista no JSON. Ao bloquear, atualiza `eventos_pendentes` no JSON com `contar_pendentes`. Tipos permitidos = `TIPOS_DE_AUDITORIA_DO_APP` do servidor (TASK-020); tipo fora da lista → `Interno`.
- **Testes obrigatórios** — **vetores D-009** (semente `01 02 … 20` gravada no `CofreEmMemoria`):
  1. `chave_publica_b64` == `ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=`;
  2. canônico, hash e assinatura de R1 e R2 **idênticos** aos do `DECISIONS.md` (R2 com detalhe inserido como `tentativa` depois de `metodo` — o `BTreeMap` ordena);
  3. `registrar` 3× → cada `hash_anterior` é o `hash` do anterior; o primeiro é `None`;
  4. `pendentes` → 3; `marcar_enviados` dos 2 primeiros → `pendentes` → 1;
  5. registro gerado com o app bloqueado vai para o JSON e é gravado no banco ao desbloquear, preservando a ordem;
  6. detalhe nunca contém a senha (teste: desbloquear com senha `"senha-mestre-de-teste"` e procurar a string em todos os `detalhe`).
- **Requisitos de segurança**: RN-38 (sem senha/código no detalhe); chave privada só no cofre do SO; formato idêntico ao servidor.
- **Critérios de aceite**: [ ] vetores batem byte a byte · [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: envio ao servidor (TASK-070).
- **Convenção de commit**: `feat(TASK-068): add signed hash-chained local audit log`

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

### TASK-069: `SessaoRemota` — chamadas à API pelo Rust, tokens fora do JS (D-005, DT-05, UL-09, RN-20)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-068
- **Objetivo**: Implementar login, MFA, renovação, logout, redefinição e requisições autenticadas com o refresh no Keychain e o access só em memória; tratar revogação do dispositivo.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/sessao_remota.rs` (novo); `servico.rs`, `comandos.rs`, `lib.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub struct ConfiguracaoDaApi { pub base: Url }
  impl ConfiguracaoDaApi {
      pub fn do_ambiente() -> Result<Self, ErroDeAcesso>;
      // base = option_env!("EVO_API_URL") (definida no build); ausente: em debug "http://localhost:3000", em release → Err(Interno)
      // em release, esquema diferente de https → Err(Interno)
  }
  pub struct SessaoRemota { cliente: reqwest::Client, api: ConfiguracaoDaApi, cofre: Arc<dyn CofreDeChavesDoSo>,
      access: Option<Zeroizing<String>>, access_expira_em: Option<DateTime<Utc>>, login_pendente: Option<DadosDoLogin> }
  // cliente: timeout 15 s, connect_timeout 5 s, redirect::Policy::none(), https_only(!cfg!(debug_assertions)), user_agent "EVO-Clinica-Desktop/<versão>"
  pub struct DadosDoLogin { pub usuario: UsuarioResumo, pub politica: PoliticaLocal, pub dispositivo_id: String, pub ocorrido_em: DateTime<Utc> }
  ```
  | Método / comando | Chamada HTTP | Comportamento |
  |---|---|---|
  | `api_iniciar_login(email, senha)` | `POST /auth/login` | repassa resposta |
  | `api_gerar_segredo_mfa(desafio)` | `POST /auth/mfa/segredo` | repassa |
  | `api_confirmar_mfa(desafio, codigo)` | `POST /auth/mfa/confirmar` | repassa |
  | `api_concluir_login(desafio, codigo)` | `POST /auth/login/concluir` com `dispositivo { id: json.dispositivo_id, apelido, plataforma, chavePublicaAuditoria: chave_publica_b64 }` | guarda `refreshToken` em `CHAVE_REFRESH`; access em memória; `json.dispositivo_id = dispositivoId`; `json.falhas_consecutivas = 0`, `exige_login_completo = false`, `max_falhas_desbloqueio_local` da política; se desbloqueado grava `politica`, `usuario`, `ultimo_checkin = agora` no banco; senão guarda `login_pendente` (aplicado por `configurar`/`desbloquear`). **Retorna `ResumoDoLogin` sem nenhum token**; `proximoPasso`: sem `kdf` → `configurar_desbloqueio`; bloqueado → `desbloquear`; senão `pronto` |
  | `api_renovar_sessao()` | `POST /auth/refresh` `{ refreshToken (do cofre), dispositivoId }` | sem refresh → `SessaoExpirada`; 200 → troca refresh no cofre, access em memória, `ultimo_checkin = agora` (se desbloqueado; senão memória), `sessao_online = true`, `reavaliar_modo`; 401 → remove refresh, `SessaoExpirada`; 403 `DISPOSITIVO_REVOGADO` → **UL-09**; erro de rede → `SemConexao` (não mexe no refresh) |
  | `api_encerrar_sessao()` | `POST /auth/logout` (Bearer) | sempre remove refresh e access localmente, mesmo se a rede falhar |
  | `api_solicitar_redefinicao(email)` | `POST /auth/senha/esqueci` | `null` |
  | `api_concluir_redefinicao(token, nova_senha, codigo)` | `POST /auth/senha/redefinir` | `null` |
  | `api_requisicao_autenticada(metodo, caminho, corpo)` | Bearer | caminho validado pela **lista permitida** abaixo; app precisa estar desbloqueado; access ausente/expirado → renova antes; 401 → renova uma vez e repete; 204 → `null` |

  Lista permitida (`regex` ancorada; qualquer outro caminho → `CaminhoNaoPermitido`):
  | Método | Caminho | Exige reautenticação local recente (RN-29) |
  |---|---|---|
  | GET | `^/dispositivos$` | não |
  | POST | `^/dispositivos/[0-9a-f-]{36}/revogar$` | sim |
  | POST | `^/auth/senha/trocar$` | sim |
  | POST | `^/auth/mfa/codigos$` | sim |
  | POST | `^/auth/mfa/reconfigurar$` | sim |
  | POST | `^/auth/mfa/reconfigurar/confirmar$` | sim |
  | POST | `^/usuarios/[0-9a-f-]{36}/desativar$` | sim |
  "Sim" → `servico.garantir_reautenticacao_recente(politica.janela_reautenticacao_min)` antes de enviar.

  **UL-09 (`processar_revogacao`)**: `json.revogado = true` (salvo), remove refresh do cofre, zera access, `bloquear(Revogacao)`, emite `acesso://estado-alterado` com `Revogado`, retorna `DispositivoRevogado`. **Não** apaga dados.
  Erros HTTP: corpo `{ erro: { codigo, mensagem, tentarApos? } }` → `ErroDeAcesso::Api { status, codigo, mensagem, tentar_apos }`; corpo ilegível → `Api { status, codigo: "ERRO_HTTP", mensagem: "Não foi possível concluir." }`.
- **Testes obrigatórios** (`mockito::Server`, `#[tokio::test]`, `CofreEmMemoria`, base apontando para o servidor mock):
  1. `concluir_login` grava o refresh no cofre e o valor **não** aparece no `ResumoDoLogin` serializado; envia a chave pública correta e `dispositivo.id` nulo no primeiro login; grava `dispositivo_id` no JSON;
  2. `renovar` troca o refresh no cofre e envia o `dispositivoId` do JSON;
  3. 401 no refresh → refresh removido, `SessaoExpirada`;
  4. 403 `DISPOSITIVO_REVOGADO` → `json.revogado == true`, refresh removido, estado `Revogado`, `dados.db` ainda existe;
  5. erro de rede (servidor desligado) → `SemConexao` e refresh preservado;
  6. `api_requisicao_autenticada("POST", "/auth/refresh")`, `"/dispositivos/../auth/refresh"` e `"/dispositivos?x=1"` → `CaminhoNaoPermitido`;
  7. revogar sem reautenticação recente → `ReautenticacaoNecessaria` sem chamar o servidor (mock com `expect(0)`);
  8. 401 na requisição autenticada → renova e repete uma vez; segunda 401 → `SessaoExpirada`;
  9. resposta 423 com `tentarApos` → `Api { status: 423, codigo: "CONTA_BLOQUEADA", tentar_apos: Some(..) }`;
  10. o header `Authorization` nunca é enviado nas rotas públicas.
- **Requisitos de segurança**: tokens nunca no JS (D-005); HTTPS obrigatório em release; sem redirects; lista permitida contra uso do proxy para outras rotas; nada de corpo/token em log.
- **Critérios de aceite**: [ ] testes passam · [ ] `grep -rn "refresh_token\|accessToken" src/acesso_local/comandos.rs` não mostra retorno de token
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local && cargo audit`
- **Fora de escopo**: envio de auditoria (TASK-070).
- **Convenção de commit**: `feat(TASK-069): add rust-side API session with keychain refresh token`

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

### TASK-070: Envio da auditoria local com prioridade na reconexão (RN-39)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-069
- **Objetivo**: Enviar os registros locais pendentes ao `POST /auditoria/lote` logo após cada renovação/login bem-sucedido.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/envio_de_auditoria.rs` (novo); `sessao_remota.rs`, `comandos.rs`, `lib.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub const TAMANHO_DO_LOTE: usize = 500;
  pub async fn enviar_pendentes(sessao: &mut SessaoRemota, acesso: &Mutex<ServicoDeAcessoLocal>) -> Result<u64, ErroDeAcesso>;
  // enquanto houver pendentes (lotes de até 500, ordem seq): POST /auditoria/lote { registros };
  // 200 → marcar_enviados dos ids enviados; 422 → para e retorna Err(Api) SEM marcar (não descarta registros); rede → SemConexao
  // app bloqueado → Ok(0) sem chamar a API
  ```
  Comando `enviar_auditoria_pendente()` → `{ enviados }`. Em `api_renovar_sessao` e `api_concluir_login`, após sucesso e com app desbloqueado, chamar `enviar_pendentes` (erro dele **não** derruba a renovação). Atualizar `eventos_pendentes` no JSON ao final.
- **Testes obrigatórios** (mockito): 3 pendentes → 1 POST com 3 registros no formato `RegistroLocal` (camelCase) → marcados; 501 pendentes → 2 POSTs (500 + 1); 422 → nada marcado e erro retornado; app bloqueado → 0 chamadas; falha do envio não faz `api_renovar_sessao` falhar.
- **Requisitos de segurança**: registros nunca apagados localmente; ordem preservada (encadeamento).
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: sincronização de outros contextos.
- **Convenção de commit**: `feat(TASK-070): upload pending local audit on reconnect`

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

### TASK-071: Reautenticação local e troca da senha mestre (UL-06, UL-07, RN-29)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-068
- **Objetivo**: Abrir a janela de 5 min para ações sensíveis e trocar a senha mestre sem recifrar o banco (DT-07).
- **Arquivos permitidos**: `servico.rs`, `comandos.rs`, `lib.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub fn reautenticar_com_senha(&mut self, senha: &str) -> Result<(), ErroDeAcesso>;
  // exige desbloqueado (Bloqueado); aplica as MESMAS regras de atraso/contador do desbloqueio (pré-incremento persistido);
  // deriva KEK com kdf salvo; desembrulha; compara com a DEK em memória em tempo constante
  // (laço sobre os 32 bytes acumulando `diferenca |= a[i] ^ b[i]`; igual se `diferenca == 0`); ok → zera contador, reautenticado_em = agora, auditar("reautenticacao-sensivel", {"metodo":"senha"});
  // falha → SenhaMestreIncorreta; ao atingir o máximo → bloquear(Manual) + exige_login_completo + ExigeLoginCompleto
  pub fn alterar_senha_mestre(&mut self, atual: &str, nova: &str) -> Result<(), ErroDeAcesso>;
  // reautenticar_com_senha(atual)?; nova com 12–128 caracteres e diferente de atual (senão SenhaMestreFraca);
  // novo salt; parâmetros = calibrar(500, 1000) (spawn_blocking no comando); derivar; embrulhar a DEK EM MEMÓRIA; gravar kdf + dek_por_senha (escrita atômica);
  // auditar("senha-mestre-alterada", {}); o banco NÃO é recifrado
  ```
  Comandos: `reautenticar(metodo: String, senha: Option<String>)` (`"senha"` → acima; `"biometria"` → `BiometriaIndisponivel` até a TASK-073) e `alterar_senha_mestre(atual: String, nova: String)`.
- **Testes obrigatórios**: reautenticar certo → `garantir_reautenticacao_recente(5)` ok; após avançar o relógio 5 min + 1 s → `ReautenticacaoNecessaria`; reautenticar errado incrementa o contador persistido; bloqueado → `Bloqueado`; alterar senha: nova desbloqueia, antiga falha, **dados do banco intactos** (valor gravado antes continua legível) e o arquivo `dados.db` não foi reescrito por recifragem (compare `PRAGMA user_version` e um valor, não o hash do arquivo); nova igual à atual → `SenhaMestreFraca`.
- **Requisitos de segurança**: RN-29; comparação em tempo constante; mesma proteção contra força bruta do desbloqueio.
- **Critérios de aceite**: [ ] testes passam
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test acesso_local`
- **Fora de escopo**: biometria.
- **Convenção de commit**: `feat(TASK-071): add local re-authentication and master password change`

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

### TASK-072: Spike de biometria no desktop (DT-10) — somente documento
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-063
- **Objetivo**: Decidir com evidência se a biometria (Touch ID no macOS, Windows Hello no Windows) é viável agora ou se fica o plano B (só senha mestre). **Nenhum código de produção.**
- **Arquivos permitidos**: `docs/spikes/biometria-desktop.md` (novo). Código experimental só fora do repositório (ou numa branch descartável não enviada).
- **Arquivos proibidos**: todo o resto
- **Contrato** — o documento deve ter exatamente estas seções:
  1. **Pergunta**; 2. **Opções avaliadas** (no mínimo: `tauri-plugin-biometry` comunitário; `keyring` + controle de acesso nativo; APIs nativas diretas — `LocalAuthentication`/`SecAccessControl` no macOS e `Windows.Security.Credentials.UI.UserConsentVerifier`/`KeyCredentialManager` no Windows); 3. **Critérios** (funciona sem internet; a chave fica protegida pelo SO e só é liberada após biometria; manutenção do crate; licença; tamanho; assinatura de código exigida); 4. **Resultado por plataforma** (testado em qual máquina/OS, com evidência: comando, saída, captura); 5. **Recomendação** (A: integrar opção X; B: plano B); 6. **Contrato proposto** para a porta `BiometriaLocal` (`disponivel`, `autenticar(motivo)`, `guardar_protegido(nome, valor)`, `ler_protegido(nome)`); 7. **Riscos**.
- **Testes obrigatórios**: não se aplica (spike).
- **Requisitos de segurança**: a biometria **nunca** pode ser o único caminho (RN-25); a chave liberada pela biometria deve ser protegida pelo SO, não por um booleano em memória.
- **Critérios de aceite**: [ ] as 7 seções preenchidas com evidência · [ ] recomendação explícita A ou B
- **Comandos de verificação**: `test -s docs/spikes/biometria-desktop.md && grep -c "^## " docs/spikes/biometria-desktop.md` (≥ 7)
- **Fora de escopo**: implementação (TASK-073 e, se A, uma tarefa nova que o arquiteto criará).
- **Convenção de commit**: `docs(TASK-072): add desktop biometrics spike report`

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

### TASK-073: Porta `BiometriaLocal` (plano B), redefinição do desbloqueio local e do computador revogado (UL-03, UL-05, UL-10, RN-25, RN-35)
- **Status**: `[ ] Pendente`
- **Depende de**: TASK-070, TASK-071, TASK-072
- **Objetivo**: Deixar a biometria pronta atrás de uma porta (implementação "indisponível" até a decisão do spike) e implementar a redefinição do desbloqueio local quando a senha mestre for esquecida e a limpeza de um computador revogado.
- **Arquivos permitidos**: `src-tauri/src/acesso_local/biometria.rs` (novo); `servico.rs`, `comandos.rs`, `lib.rs`, `mod.rs` (editar)
- **Arquivos proibidos**: todo o resto
- **Contrato**:
  ```rust
  pub trait BiometriaLocal: Send + Sync {
      fn disponivel(&self) -> bool;
      fn autenticar(&self, motivo: &str) -> Result<bool, ErroDeAcesso>;
  }
  pub struct BiometriaIndisponivel;   // disponivel() = false; autenticar → Err(BiometriaIndisponivel)
  ```
  - Serviço recebe `Arc<dyn BiometriaLocal>`; `estado()` preenche `biometria_disponivel` e `biometria_habilitada = json.dek_por_biometria.is_some()`.
  - `ativar_biometria(senha)` (UL-05): exige desbloqueado, `reautenticar_com_senha(senha)`, `disponivel()` (senão `BiometriaIndisponivel`); gera chave aleatória de 32 bytes, guarda em `CHAVE_BIOMETRIA`, embrulha a DEK com ela → `json.dek_por_biometria`; auditar `biometria-ativada`.
  - `desativar_biometria()`: remove `CHAVE_BIOMETRIA` e `dek_por_biometria`; auditar `biometria-desativada`.
  - `desbloquear_com_biometria()` (UL-03): sem `dek_por_biometria` ou indisponível → `BiometriaIndisponivel` (a UI cai na senha mestre); `autenticar("Desbloquear a EVO Clínica")` falso/cancelado → `BiometriaIndisponivel`; ok → lê chave do cofre, desembrulha, abre banco, auditar `desbloqueio-local-ok` `{ "metodo": "biometria" }`.
  - `previa_redefinicao_local()` → `{ eventos_pendentes: json.eventos_pendentes }`.
  - `redefinir_desbloqueio_local(confirmacao)` (UL-10, RN-35): `confirmacao != "DESCARTAR"` → `ConfirmacaoInvalida`; exige `sessao_online == true` (login completo feito nesta execução; senão `ExigeLoginCompleto`); fecha banco; apaga `dados.db`, `dados.db-wal`, `dados.db-shm`; remove `CHAVE_BIOMETRIA`; reescreve o JSON mantendo **apenas** `dispositivo_id` e `max_falhas_desbloqueio_local` (refresh e chave de auditoria permanecem); empilha `RegistroPendente { tipo: "desbloqueio-local-redefinido" }`; estado → `SemConfiguracao`.
  - `redefinir_computador_revogado(confirmacao)`: só com `json.revogado == true` (senão `ConfirmacaoInvalida`); `"DESCARTAR"` obrigatório; apaga banco e JSON; remove `CHAVE_REFRESH`, `CHAVE_BIOMETRIA` e `CHAVE_AUDITORIA` (o próximo login registra um novo dispositivo com nova chave); estado → `SemConfiguracao`.
  - Comandos Tauri correspondentes (tabela do topo).
- **Testes obrigatórios** (com uma `BiometriaFalsa { disponivel, resposta }` local de teste): indisponível → `ativar` e `desbloquear_com_biometria` → `BiometriaIndisponivel`; disponível: ativar exige senha certa; depois de bloquear, `desbloquear_com_biometria` abre o mesmo banco; biometria cancelada → erro e a **senha mestre continua funcionando** (RN-25); desativar remove a chave; redefinir local sem `"DESCARTAR"` → erro e nada apagado; sem sessão online → `ExigeLoginCompleto`; com tudo certo → banco apagado, `dispositivo_id` mantido, estado `SemConfiguracao`; computador revogado → tudo apagado inclusive chaves; redefinir computador não revogado → `ConfirmacaoInvalida`.
- **Requisitos de segurança**: RN-25 (senha mestre sempre funciona), RN-28 (apagar só por ação explícita do usuário com confirmação digitada), RN-35.
- **Critérios de aceite**: [ ] testes passam · [ ] todos os comandos da tabela do topo registrados no `generate_handler!`
- **Comandos de verificação**: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test && cargo audit`
- **Fora de escopo**: implementação real da biometria (nova tarefa após aprovação do spike).
- **Convenção de commit**: `feat(TASK-073): add biometrics port and local reset flows`

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
