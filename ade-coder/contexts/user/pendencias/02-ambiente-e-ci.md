# Ambiente e CI

## Não deu certo
- **Windows deste computador não compila Rust:** o Controle de Aplicativo bloqueia os `build-script-build.exe` (`os error 4551`). Contornado com WSL2 (Ubuntu-24.04). Solução definitiva: exceção do Controle de Aplicativo para a pasta de build, ou usar só WSL/CI.
- **WebKit não abre no Windows** (dependências do sistema): o Playwright roda só no Chromium. O CI também roda só o chromium.
- **`gh auth login` não concluído:** o comando foi para segundo plano aguardando o código do dispositivo em https://github.com/login/device. Sem ele não consigo ler o resultado do CI.

## Falta realizar
1. Abrir a aba Actions e conferir a primeira execução de `.github/workflows/ci.yml` (commit 661c9e1). Riscos conhecidos:
   - `test:int` e `test:e2e` do backend podem exigir variáveis além de `DATABASE_URL_TESTE`;
   - o Keychain do macOS pode pedir autorização interativa num runner sem tela;
   - o job `rust` compila o frontend antes (o Tauri o embute); se o caminho `dist` mudar, ajustar.
2. Rodar o app completo para analisar a experiência (nunca foi executado de ponta a ponta):
   - Backend (Windows): `docker compose up -d postgres`, `pnpm db:migrar`, `pnpm build`, `pnpm cli:criar-proprietario`, `pnpm start:dev` em `backend/`.
   - Desktop (WSL2 Ubuntu-24.04): `pnpm install` no WSL, `gnome-keyring` + `dbus-launch`, `EVO_API_URL=http://<IP do Windows>:3000 pnpm tauri dev`. **Não validado**: a janela no WSLg e o alcance do backend a partir do WSL.
3. Release build exige `EVO_API_URL` em https no momento da compilação; sem ela o app não inicia.
4. Escopo: `opencode.json` continua modificado e sem commit (não faz parte do trabalho).
