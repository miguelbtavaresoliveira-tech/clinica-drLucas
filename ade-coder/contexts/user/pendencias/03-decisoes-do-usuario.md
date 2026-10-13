# Dependem de você

| ID | Assunto | Efeito hoje |
|---|---|---|
| P-01 | Valores assumidos da SPEC §2 (10 min inatividade, 5 dias offline, leitura após o limite, 3 dispositivos) | Padrões em uso, todos configuráveis por env |
| P-02 | Provedor de e-mail / SMTP | Adaptador genérico; sem SMTP, a redefinição por e-mail não chega |
| P-03 | Cofre de segredos do servidor e hospedagem | Segredos por variáveis de ambiente |
| P-04 | Biometria (DT-10) | Plano B: só senha mestre; depende da TASK-072 em hardware |
| P-05 | Domínio de produção da API | `EVO_API_URL` (https) obrigatório em build de release |
| P-06 | Retenção dos logs de auditoria | Sem expurgo no MVP |
| P-08 | Textos institucionais (nome, CREFITO, especialidade, site) e link da Política de Privacidade | Textos do Figma como constantes; sem link de privacidade |
| P-09 | Usuário de banco de produção sem posse das tabelas (para o gatilho append-only não poder ser desligado) | Registrar no plano de hospedagem |

## Escolhas abertas
- Gerar o evento de auditoria `desbloqueio-local-configurado` ao configurar a senha mestre? Hoje não gera (a especificação não pedia).
- Fazer `git push` do restante e abrir o PR: a branch `feature/identidade-e-acesso` foi enviada; o PR não foi aberto.
