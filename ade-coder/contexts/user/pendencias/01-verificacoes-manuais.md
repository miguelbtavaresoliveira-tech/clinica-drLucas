# Verificações manuais pendentes

| Tarefa | Status | O que falta | Como fechar |
|---|---|---|---|
| TASK-067 (inatividade) | 🔍 | Teste real da janela travando por inatividade. | `pnpm tauri dev` com `POLITICA_INATIVIDADE_MIN=1` no backend, login, ficar 1 min parado e conferir a tela de desbloqueio. |
| TASK-072 (spike biometria) | 🔍 | Nenhuma opção foi testada em hardware. | Executar a seção 4 de `docs/spikes/biometria-desktop.md` em macOS assinado (Touch ID) e Windows com Hello. Sem isso vale o plano B (só senha mestre). |
| TASK-095 (roteiro SPEC §10) | 🔍 | Roteiro manual com o app completo. | App completo via WSLg (ver `02-ambiente-e-ci.md`) com o backend rodando; seguir SPEC §10 e atualizar o status. |
| TASK-005 e seguintes de worker2 (01-FUNDACAO, 07-DESKTOP-FRONTEND) | 🔍 | Várias tarefas "Aguardando Revisão" da outra branch (c005c8e, b220000, 71c1725, a754c25). | Revisão do Claude/usuário; podem gerar conflito nas linhas de status ao mesclar. |

## Resolvidas
- TASK-063: verificada no CI em 2026-10-13 (Windows e macOS, 6/6 testes do cofre).
