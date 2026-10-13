# 📋 PLANO DE EXECUÇÃO DE TAREFAS (TASKS.md)

> **Objetivo**: [Uma frase: o que será entregue e para quê]
> **Branch Git**: `feature/nome-da-funcionalidade`
> **Commit base**: `[hash de onde a branch partiu]`
> **Status Geral**: ⏳ Em Progresso
> **Stack e versões**: [ex.: Node 20, TypeScript 5.x, Zod, Vitest]

### Comandos globais do projeto
```bash
npx tsc --noEmit        # tipagem
npm run lint            # lint
npm test                # testes
npm run build           # build
npm audit --omit=dev    # vulnerabilidades em dependências
```

---

## ⚙️ Diretrizes Universais para o Agente Executor (OpenCode)

Você tem pouco contexto e será revisado por um arquiteto que verifica tudo por comando e por diff. Siga o texto literalmente. Em caso de dúvida, pare e pergunte; não adivinhe.

### Fluxo
1. **Uma tarefa por vez.** Só inicie a próxima depois que a atual estiver em `🔍 Aguardando Revisão`, e respeite `Depende de`.
2. **Antes de codar**, leia a tarefa inteira, os arquivos listados e um arquivo vizinho para copiar o padrão do projeto.
3. **Um commit por tarefa**, no formato `feat(modulo): [TASK-ID] descrição sucinta`. Em correções após revisão: `fix(modulo): [TASK-ID] corrige F-001, F-003`.
4. **Ao concluir**, preencha o **Relatório do Agente** da tarefa (com saídas reais dos comandos) e mude o status para `🔍 Aguardando Revisão`.

### Escopo (violação = reprovação automática)
5. Altere **somente** os arquivos de `Arquivos permitidos`. Qualquer outro arquivo é proibido, inclusive config, CI, lockfiles e migrations existentes.
6. Não adicione dependências, não refatore código fora da tarefa, não renomeie nem apague nada que não esteja especificado.
7. Não edite este `TASKS.md`, exceto o status e o Relatório do Agente da sua tarefa.
8. Não use `git commit --amend`, `rebase`, `push --force` nem `git add .` às cegas. Confira o `git status` e adicione só os arquivos permitidos.

### Qualidade
9. Respeite os padrões do repositório. Proibido: `any` (implícito ou explícito), `@ts-ignore`, `eslint-disable`, `console.log` de depuração e código comentado.
10. **Nunca** enfraqueça, remova, pule (`skip`/`only`) ou altere testes existentes para fazê-los passar. Se um teste antigo quebrar, reporte no relatório.
11. Todo teste exigido na tarefa deve existir e ter asserts reais (nada de teste vazio ou só snapshot).
12. Nenhum segredo, chave, token ou dado sensível no código, em logs, testes ou commits. Use variáveis de ambiente.

### Honestidade
13. Uma tarefa só está concluída se **todos** os comandos de validação passaram com zero erros **e** a saída está colada no relatório. Dizer que passou sem mostrar a saída conta como não feito.
14. Se algo não puder ser feito como especificado, não improvise: mude o status para `⛔ Bloqueado`, descreva a dúvida em `Bloqueios` e pare.
15. Registre qualquer desvio da especificação em `Desvios` no relatório, mesmo que pequeno.

### Definição de Pronto (vale para toda tarefa)
- [ ] Critérios de aceite da tarefa atendidos
- [ ] Testes obrigatórios implementados e passando
- [ ] `tsc`, `lint`, `test` e `build` sem erros
- [ ] Requisitos de segurança atendidos
- [ ] Nenhum arquivo fora de `Arquivos permitidos` alterado
- [ ] Um commit no formato correto
- [ ] Relatório do Agente preenchido

### Legenda de status
`[ ] Pendente` · `[⌛ Em Andamento]` · `[⛔ Bloqueado]` · `[🔍 Aguardando Revisão]` · `[🔁 Reprovada]` · `[x] Aprovada`

---

## 🎯 Mapa de Arquivos

| Arquivo | Ação | Tarefa |
|---|---|---|
| `src/types/payment.ts` | Criar | TASK-001 |
| `src/services/payment.ts` | Criar | TASK-002 |
| `src/app.ts` | Editar (somente o ponto indicado) | TASK-003 |
| `tests/payment.test.ts` | Criar/Editar | TASK-001..003 |

**Arquivos proibidos em todo o plano**: `.env*`, `package.json`, lockfiles, `.github/**`, migrations existentes, qualquer arquivo não listado acima.

---

## 📝 Lista de Tarefas Atômicas

### TASK-001: Criar tipos, enum e schemas de validação
- **Status**: `[ ] Pendente`
- **Depende de**: nenhuma
- **Objetivo**: Definir o contrato de dados de pagamento, que será usado pelas tarefas seguintes.
- **Arquivos permitidos**: `src/types/payment.ts`, `tests/payment.test.ts`
- **Arquivos proibidos**: todos os demais
- **Contrato** (use exatamente estes nomes e formatos):
  - `enum PaymentStatus { PENDING = 'PENDING', APPROVED = 'APPROVED', REJECTED = 'REJECTED' }`
  - `PaymentPayload`: `{ orderId: string (uuid); amountInCents: number (inteiro > 0); currency: 'BRL' | 'USD'; method: 'pix' | 'card' }`
  - `PaymentResponse`: `{ id: string (uuid); status: PaymentStatus; createdAt: string (ISO 8601) }`
  - Exportar também `paymentPayloadSchema` e `paymentResponseSchema` (Zod) e os tipos inferidos com `z.infer`. Não duplicar tipos manualmente.
- **Passo a passo**:
  1. Criar `src/types/payment.ts` com o enum.
  2. Criar os schemas Zod conforme o contrato.
  3. Derivar `PaymentPayload` e `PaymentResponse` dos schemas.
  4. Exportar tudo com export nomeado (sem `export default`).
  5. Escrever os testes abaixo em `tests/payment.test.ts`.
- **Testes obrigatórios**:
  - payload válido é aceito;
  - rejeita `amountInCents` = 0, negativo, decimal (`10.5`) e string;
  - rejeita `orderId` que não seja uuid;
  - rejeita `currency` e `method` fora da lista;
  - rejeita campos ausentes;
  - `paymentResponseSchema` rejeita `status` fora do enum;
  - os 3 valores do enum existem e são aceitos.
- **Requisitos de segurança**:
  - valores monetários sempre em centavos (inteiro), nunca `float`;
  - schema não deve aceitar campos extras (`.strict()`);
  - nenhum campo para número de cartão, CVV ou dado sensível neste contrato.
- **Critérios de aceite**:
  - [ ] Todos os nomes e formatos idênticos ao contrato
  - [ ] Tipos derivados dos schemas
  - [ ] Todos os testes obrigatórios presentes e passando
- **Fora de escopo**: serviço de pagamento, rotas, integração com gateway, mudanças em `src/app.ts`.
- **Comandos de validação** (todos devem passar):
```bash
  npx tsc --noEmit
  npm run lint
  npm test -- tests/payment.test.ts
```
- **Commit**: `feat(payment): [TASK-001] adiciona tipos e schemas de pagamento`

#### 📄 Relatório do Agente (preencher ao concluir)
- **Commit**: `[hash]`
- **Arquivos alterados** (`git diff --stat`): `[colar]`
- **Saída dos comandos de validação**: `[colar a saída real de cada comando]`
- **Desvios da especificação**: `[nenhum | descrever]`
- **Bloqueios / dúvidas**: `[nenhum | descrever]`

#### 🔎 Registro de Revisão (preenchido pelo Arquiteto)
- **Veredito**: `[APROVADA | APROVADA COM RESSALVAS | REPROVADA]`
- **Achados**: `[ver REVIEW.md, IDs F-001...]`
- **Correções exigidas**: `[lista numerada; o agente corrige todas de uma vez]`

---

### TASK-00X: [Título]
*(copie o bloco da TASK-001 e preencha todos os campos; nenhum campo pode ficar vazio ou com "se aplicável")*