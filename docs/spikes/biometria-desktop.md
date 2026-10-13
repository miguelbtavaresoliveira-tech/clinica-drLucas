# Spike: biometria no desktop (DT-10)

- **Data**: 2026-10-13
- **Tarefa**: TASK-072
- **Status**: concluído como pesquisa documental. **Nenhuma opção foi testada em hardware** (ver seção 4).

## 1. Pergunta

O desktop (Tauri 2, macOS e Windows) pode desbloquear o banco local com Touch ID / Windows Hello **agora**, mantendo estas garantias?

1. A chave que abre o banco só é liberada depois da biometria, e quem a protege é o sistema operacional, não um booleano em memória.
2. Funciona sem internet.
3. A senha mestre continua sendo um caminho sempre disponível (RN-25).
4. Nenhum segredo passa pelo JavaScript (D-005).

Se não for viável com segurança, fica o plano B: só senha mestre.

## 2. Opções avaliadas

| # | Opção | O que é |
|---|---|---|
| 1 | `tauri-plugin-biometry` (comunitário, Choochmeque) | Plugin Tauri 2 com autenticação biométrica e armazenamento protegido por biometria em Android, iOS, macOS (Touch ID) e Windows (Windows Hello). |
| 2 | `tauri-plugin-biometric` (oficial Tauri) | Plugin oficial, **somente Android e iOS**. |
| 3 | `keyring` + controle de acesso nativo | O `keyring` (já usado na TASK-063) guarda segredos no Keychain / Credential Manager, mas **não** expõe exigência de biometria por item. |
| 4 | APIs nativas diretas | macOS: `LocalAuthentication` (`LAContext`) e `SecAccessControl` com `.biometryCurrentSet` via `security-framework` / `objc2-local-authentication`. Windows: `UserConsentVerifier` e `KeyCredentialManager` via crate `windows`. |

## 3. Critérios

Dados coletados em 2026-10-13 pela API pública do crates.io e pelo README do projeto. São fatos de metadados, não de comportamento.

| Critério | 1. `tauri-plugin-biometry` | 2. `tauri-plugin-biometric` | 3. `keyring` | 4. APIs nativas |
|---|---|---|---|---|
| Desktop (macOS e Windows) | Sim, declarado | **Não** (só mobile) | Cofre sim, biometria **não** | Sim, é a base das outras |
| Funciona offline | Sim (local) | n/a | Sim | Sim |
| Chave protegida pelo SO e liberada após biometria | Declarado ("secure data storage with biometric protection"); **não verificado** | n/a | Não (acesso por sessão do usuário) | Sim por construção (`SecAccessControl`; `KeyCredentialManager`), **não verificado aqui** |
| Manutenção | v0.3.0-rc.3 (release candidate), última atualização 2026-09-01, ~49 mil downloads | v2.4.2, 2026-10-10 | v4.2.0 ativo (o projeto usa v3) | `security-framework` 3.7.0 (2026-02), `objc2-local-authentication` 0.3.2 (2025-10), `windows` 0.62.2 (2025-10) |
| Licença | MIT | Apache-2.0 ou MIT | MIT ou Apache-2.0 | MIT / Apache-2.0 / Zlib |
| Tamanho | Não medido | n/a | Já no projeto | Não medido |
| Assinatura de código | Touch ID e itens de Keychain com controle de acesso exigem app **assinado** com entitlements adequados no macOS; o Windows Hello exige pacote/identidade para `KeyCredentialManager`. **Não verificado**; tratar como exigência provável | n/a | Não exige | Mesma observação do plugin |
| Segredo fora do JavaScript (D-005) | **Problema**: a API de armazenamento (`get_data`) é um comando exposto à webview, mesmo com escopo por `(domain, name)`. A chave da DEK passaria pelo JS, ou o plugin teria de ser usado apenas pelo lado Rust | n/a | Sim | Sim |

## 4. Resultado por plataforma

**Não executado.** Motivos reais, não estimativas:

| Plataforma | Testado? | Motivo |
|---|---|---|
| macOS (Touch ID) | Não | Não há máquina macOS disponível neste ambiente de trabalho. |
| Windows 11 (Windows Hello) | Não | Neste computador, o Controle de Aplicativo do Windows bloqueia a execução dos `build-script-build.exe` do cargo (`os error 4551`), então não é possível compilar nem rodar nada nativo. Além disso, não foi verificado se há leitor biométrico ou PIN do Hello configurado. |
| Linux (WSL2) | n/a | O produto não tem alvo Linux. A compilação do módulo `acesso_local` e seus 133 testes rodam no WSL2, sem relação com biometria. |

Comandos que ainda precisam ser executados por quem tiver o hardware (cada um com a saída colada neste documento):

1. macOS assinado: protótipo fora do repositório que cria um item de Keychain com `SecAccessControlCreateWithFlags(.biometryCurrentSet)`, lê o item com Touch ID, cancela o prompt e confirma que a leitura falha.
2. Windows: `UserConsentVerifier::CheckAvailabilityAsync()` e `RequestVerificationAsync(...)`, mais `KeyCredentialManager::RequestCreateAsync(...)` e uma assinatura com a credencial criada.
3. Para a opção 1: `pnpm tauri dev` com o plugin num app descartável; registrar `checkStatus`, `authenticate` e `set_data` / `get_data` nas duas plataformas.

## 5. Recomendação

**B: plano B (somente senha mestre) por enquanto.**

Justificativa:

1. Não há evidência de teste em nenhuma plataforma. Aprovar a integração sem teste contraria a regra de só afirmar o que foi verificado.
2. A única opção pronta para desktop (1) está em release candidate e expõe o armazenamento protegido à webview, o que conflita com D-005.
3. O plano B já está implementado: a senha mestre sempre funciona (RN-25) e a porta `BiometriaLocal` da TASK-073 deixa o encaixe pronto.

Condição para reavaliar (opção A): alguém com macOS assinado e Windows com Hello executar a seção 4 e registrar as saídas. Se passar, o caminho recomendado é a **opção 4** (APIs nativas, chamadas só do Rust), porque mantém a chave fora do JavaScript. A opção 1 só serve se for usada exclusivamente pelo lado Rust, sem comandos de armazenamento expostos à webview.

## 6. Contrato proposto para a porta `BiometriaLocal`

A TASK-073 implementa apenas a parte `disponivel` / `autenticar`, com uma implementação "indisponível". As duas operações de armazenamento protegido ficam propostas para a tarefa de integração, caso a recomendação passe para A.

```rust
pub trait BiometriaLocal: Send + Sync {
    /// Há sensor/credencial biométrica utilizável e permitida neste computador?
    fn disponivel(&self) -> bool;
    /// Mostra o prompt do SO. `Ok(true)` só quando o usuário foi reconhecido.
    fn autenticar(&self, motivo: &str) -> Result<bool, ErroDeAcesso>;
    /// Proposta (tarefa futura): guarda o valor num item que o SO só libera após biometria.
    fn guardar_protegido(&self, nome: &str, valor: &[u8]) -> Result<(), ErroDeAcesso>;
    /// Proposta (tarefa futura): lê o item; o SO exige a biometria na leitura.
    fn ler_protegido(&self, nome: &str) -> Result<Option<Zeroizing<Vec<u8>>>, ErroDeAcesso>;
}
```

Regras do contrato:

- `ler_protegido` deve falhar se a biometria for cancelada ou se o conjunto de digitais mudar (`.biometryCurrentSet` no macOS).
- Nenhuma implementação pode devolver a chave sem passar pelo prompt do SO.
- O valor guardado é uma chave aleatória de 32 bytes que embrulha a DEK (`dek_por_biometria`); a DEK nunca é guardada diretamente.

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Implementar `autenticar` como "booleano" e liberar a chave guardada em claro no cofre comum | A biometria vira cosmética: qualquer processo do usuário lê a chave | Só liberar a chave por item protegido pelo SO (opção 4); revisar na TASK de integração |
| Plugin em release candidate muda de API | Retrabalho e risco de regressão | Não adotar a opção 1 antes de uma versão estável |
| App sem assinatura de código no macOS | Itens de Keychain com biometria falham ou pedem senha | Incluir assinatura e entitlements no pipeline de release antes da integração |
| Usuário troca/adiciona digitais e o item continua válido | Acesso por digital nova | Usar `.biometryCurrentSet` e tratar a invalidação pedindo a senha mestre e reativando |
| Biometria como único caminho | Perda de acesso aos dados | RN-25: a senha mestre sempre funciona; coberto por teste na TASK-073 |
| Versão do `keyring` defasada (v3, enquanto a v4.2.0 existe) | Correções de segurança perdidas | Avaliar a atualização em tarefa própria; fora do escopo do spike |
