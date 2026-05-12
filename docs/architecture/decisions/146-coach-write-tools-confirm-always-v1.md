# ADR-146: Coach write tools — confirmação obrigatória na v1, sem auto-aprovação, sem `delete_*`, `confirm-strict` para operações financeiras

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-0A liga as 6 write tools cujos handlers já existiam em `server/coachTools/handlers/`
(`register_tournament_in_grade`, `record_wallet_transaction`, `start_grind_session`,
`log_session_completed`, `log_leak_focus`, `log_study_session`) ao registry. Pela primeira vez o LLM
do Coach pode executar mutações no estado do jogador: criar `planned_tournament`, registrar
`wallet_transaction`, abrir `grind_session`, fechar sessão, registrar foco de leak, registrar estudo.

A infra de confirm/undo já existe (ADR-077 `coach_actions` com `payload_before`, ADR-083 confirm/cancel/undo
+ janela de 5 min, `server/coachToolRunner.ts`, endpoints `POST /api/coach/actions/:id/{confirm,cancel,undo}`).
A pergunta deste ADR é a **política de aprovação** dessas tools na v1: o LLM pode executar direto? Quais
exigem confirmação? Pode haver `delete_*`?

O founder decidiu (questão 4 do plano de melhoria, 2026-05-11): **confirmação SEMPRE na v1**. A IA propõe →
mostra diff → usuário confirma → executa → undo em 5 min. Sem auto-aprovação. Sem `delete_*`. Operações que
mexem em dinheiro recebem um nível adicional de confirmação (`confirm-strict`).

### Restrições
- `coach_actions` hoje tem `requires_confirmation` (boolean), `status`, `payload_before`, `payload_after`,
  `affected_entity_*`, `undo_expires_at`, etc. **Não** tem coluna `confirmation_level`. Adicionar coluna =
  migração = irreversível-ish + custo. O founder pediu explicitamente para **não** adicionar essa coluna na v1.
- O frontend já tem `CoachActionConfirmCard` + `UndoBadge` (Coach-2B). Ele já sabe o `toolName` do action
  (via SSE `tool_pending` e via `GET /api/coach/actions/:id`).
- O `coachToolRunner` re-valida o `input` persistido via Zod antes de `executeConfirmed` (já implementado;
  ADR fechado/lesson da Sprint coach-launch-fix). Não mexer.
- Limite de 5 tool calls/turn (ADR-026) — mantido.

## Opções Consideradas

### Opção A: Confirmação sempre + `confirm-strict` como flag em memória no descriptor (ESCOLHIDA)

- Toda write tool tem `requiresConfirmation: true` no `CoachTool` descriptor. O `coachToolRunner` cria um
  `coach_action` `status='pending'` + o route handler emite SSE `tool_pending`. Nada executa até o usuário
  chamar `POST /api/coach/actions/:id/confirm`.
- `record_wallet_transaction` ganha um campo extra no descriptor: **`confirmationLevel: 'strict'`**. É um
  campo opcional na interface `CoachTool` (`'standard' | 'strict'`, default `'standard'`). **Não é persistido
  em `coach_actions`** — vive só no registry em memória. O frontend, ao renderizar o diff de um action
  pending, olha `getTool(action.toolName).confirmationLevel` (via uma rota de metadados de tools, OU
  simplesmente pelo `toolName` que já basta — `record_wallet_transaction` é a única `strict` na v1) e renderiza
  o diff financeiro detalhado (valor, moeda, wallet de origem/destino, saldo antes/depois) com uma confirmação
  explícita extra ("Tem certeza? Isto altera o saldo da sua banca.").
- `auditLevel: 'persist'` em todas as write tools (linha em `coach_actions` com `result`).
- Sem `delete_*` tools. Undo via `payload_before` (5 min). Undo de `record_wallet_transaction` cria
  reverse-row no ledger, **nunca hard-delete** (ADR-058 — ledger imutável).
- **Pros:** zero migração; o nível `strict` é uma decisão de UX/descriptor, não de schema; trivial de evoluir
  (se um dia houver `confirm-strict` para outras tools, adiciona o campo no descriptor); o frontend já tem o
  `toolName`, então não precisa de nada novo no contrato de API; reusa 100% da infra Coach-2B.
- **Contras:** o nível `strict` não fica registrado historicamente no `coach_actions` (se alguém auditar um
  action antigo, vê só `requires_confirmation: true`, não "era strict"). Aceito — o `toolName` no action já
  diz tudo (`record_wallet_transaction` ⇒ era strict); se um dia precisarmos do nível na auditoria, aí sim
  uma migração.

### Opção B: Adicionar coluna `confirmation_level` em `coach_actions`

- Persiste `confirmation_level ∈ {'standard', 'strict'}` no action.
- **Pros:** auditoria histórica completa; frontend lê do action direto.
- **Contras:** migração; o founder vetou explicitamente; sobre-engenharia para 1 tool. **Rejeitada.**

### Opção C: Auto-aprovação para tools "baratas" (ex: `log_study_session`) e confirmação só para as "caras"

- LLM executa `log_study_session` / `log_leak_focus` direto; só `register_tournament_in_grade` /
  `record_wallet_transaction` / `start_grind_session` / `log_session_completed` pedem confirmação.
- **Pros:** menos atrito.
- **Contras:** o founder vetou ("confirmação sempre na v1"); um LLM que alucina e cria 5 `study_session`
  fantasma sem confirmação é exatamente o tipo de coisa que destrói confiança no produto durante o alpha;
  uniformidade é mais fácil de testar e explicar. **Rejeitada.**

### Opção D: `delete_*` tools com confirmação

- `delete_planned_tournament`, `delete_study_session`, etc.
- **Pros:** completa o CRUD.
- **Contras:** o founder vetou na v1; undo via `payload_before` já cobre o caso "errei, desfaz"; `delete`
  explícito é um vetor de dano maior (LLM alucina o ID errado, deleta dado real). **Rejeitada na v1.**

## Decisão

**Adotar Opção A.**

### Detalhes-chave

1. **Interface `CoachTool` ganha um campo opcional** (`server/coachTools/registry.ts`):
   ```ts
   confirmationLevel?: 'standard' | 'strict';  // default 'standard' quando requiresConfirmation === true
   ```
   Só `record_wallet_transaction` seta `confirmationLevel: 'strict'` na v1.

2. **`coach_actions` NÃO muda.** Nenhuma migração neste sprint. O nível `strict` vive só no descriptor.

3. **Toda write tool:** `requiresConfirmation: true`, `auditLevel: 'persist'`,
   `gateByTier: ['pro', 'premium', 'admin']`. (Decisão do founder: write tools = Pro+, mesmo tier dos read
   tools — sem restrição nova.) Os descriptors dos handlers já estão assim — este sprint só os importa e
   chama `safeRegister`.

4. **Fluxo (inalterado — ADR-083):** LLM emite `tool_use` (write) → `coachToolRunner` detecta
   `requiresConfirmation` → cria `coach_action` `pending` (com `input` Zod-validado, `requires_confirmation:true`) →
   route emite SSE `tool_pending {actionId, toolName, input}` → frontend renderiza diff (financeiro detalhado
   se `confirmationLevel === 'strict'`) → `POST /confirm` → `confirmCoachAction` re-valida input via Zod → TX:
   `UPDATE status=executing` → `fetchPayloadBefore` → `executeConfirmed` → `UPDATE payload_after, affected_entity_*,
   status=completed, confirmed_at, undo_expires_at=NOW()+5min` → COMMIT → SSE `tool_confirmed` → frontend troca
   por `UndoBadge` (timer 5:00). `POST /undo` dentro da janela → `tool.undo(payloadBefore, payloadAfter, tx)` →
   `status=undone`. Após 5 min → `410 undo_window_expired`. `POST /cancel` num pending → `status=expired`.

5. **Undo de `record_wallet_transaction` = reverse-row** (delta inverso, `reason: 'manual_adjustment'`,
   ligado por `reversedByActionId`), **nunca hard-delete** (ADR-058, ledger imutável). Já implementado no handler.

6. **Sem `delete_*` tools na v1.** Documentado como não-objetivo.

7. **Evolução futura (fora da v1, só anotada):** "trusted tools" — usuário pode marcar certas tools como
   "executa direto sem confirmar". Quando isso entrar, provavelmente vira a coluna `confirmation_level` +
   uma tabela `user_tool_trust`. Fora deste ADR.

## Consequências

### Positivas
- Zero migração. Risco zero de schema. Reusa toda a infra Coach-2B (runner, endpoints, frontend, tabela).
- Uniformidade testável: "toda write tool tem `requiresConfirmation === true`" é um critério de teste
  trivial e não-quebrável.
- Confiança do usuário durante o alpha: nada acontece sem clique. Se a IA alucina, o pior caso é "um diff
  estranho aparece e o usuário não confirma".
- `confirm-strict` para dinheiro dá a fricção extra exatamente onde dói (saldo da banca).

### Negativas
- O nível `strict` não fica na auditoria histórica do `coach_actions` (só o `toolName`). Aceito.
- Atrito de confirmação em toda ação. Aceito — é a v1; "trusted tools" é uma evolução futura.

### Neutras
- O frontend pode descobrir `confirmationLevel` via uma rota de metadados de tools OU simplesmente pelo
  `toolName` (decisão de implementação do implementer; o `toolName` já basta na v1 já que só
  `record_wallet_transaction` é strict).

## Confiança

**Alta.** É a infra Coach-2B já construída + uma decisão explícita do founder + um campo de descriptor em
memória. Sem schema novo, sem endpoint novo.

## Referências
- Spec: `Docs/specs/sprint-ai-0a.md` (RF-06..11, Requisitos Não-Funcionais)
- Plano de melhoria: `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (questão 4 do founder)
- ADR-077 (coach_actions migration + audit log), ADR-083 (confirm/undo pattern), ADR-058 (wallet ledger
  imutável — undo via reverse-row), ADR-145 (estado canônico do registry)
- `server/coachToolRunner.ts`, `server/coachTools/handlers/*.ts`
- Diagrama: `Docs/architecture/diagrams/coach-ai-0a/seq-write-tool-confirm-undo.mermaid`
