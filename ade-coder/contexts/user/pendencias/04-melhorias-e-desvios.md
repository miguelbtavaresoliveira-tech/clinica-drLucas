# Desvios aceitos e melhorias adiadas

## Desvios do contrato (por necessidade)
- `serializar_canonico` devolve `Result<String, _>` (o projeto proíbe `unwrap`).
- `login_pendente` e `checkin_pendente` ficam no serviço, não na `SessaoRemota`, porque quem os aplica é `configurar`/`desbloquear`.
- `SessaoRemota` ganhou um campo de relógio, usado para calcular a validade do token de acesso.
- `ativar_biometria` confere a disponibilidade antes de contar uma tentativa de senha.
- Guard do roteador (`e2aa60e`): sem estado carregável (fora do Tauri) agora vai para o login; antes mostrava um início vazio.

## Melhorias adiadas
- Atualizar `keyring` v3 → v4.2.0 (tarefa própria).
- `cargo audit`: 2 avisos transitivos do Tauri (`proc-macro-error` sem manutenção, `glib` com unsoundness); acompanhar upgrades do Tauri.
- Biometria: implementação real via APIs nativas (opção 4 do spike), só depois da evidência de hardware.
- Rodar webkit no Playwright em CI (macOS) se o Safari for alvo de UX.
