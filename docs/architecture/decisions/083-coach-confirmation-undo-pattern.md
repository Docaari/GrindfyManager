# ADR-083: Confirmation + undo pattern em Coach write tools (requires_confirmation + diff visual + undo 5min + payload_before)

## Status
Aceito

## Data
2026-05-02

## Contexto

O Sprint Coach-2B (`Docs/specs/coach-2b.md`, RF-01) introduz **write tools** — primeiras tools que mutam dado em nome do user (`record_wallet_transaction`, `start_grind_session`, `register_tournament_in_grade`, `log_leak_focus`, `log_session_completed`, `log_study_session`).

**Passar de "consultor" para "agente" muda o modelo de risco:**
- Read tools (Coach-2A): pior caso = LLM mostra dado errado. Reversivel via novo prompt do user.
- Write tools (Coach-2B): pior caso = LLM cria/atualiza row no banco que afeta bankroll, grade, sessao. **Irreversivel sem mecanismo de undo.**

R4 do research (`Docs/strategy/coach-ia-upgrade-research-2026-05-02.md`) classifica "Coach age sem permissao" como risco principal — quebra confianca em alpha. Mitigacao precisa ser **estrutural**, nao prosaica.

A pergunta central: **como toda write tool — sem excecao — passa por um gate humano antes de mutar dado, e como permite o user reverter dentro de uma janela curta?**

### Restricoes

- **Stream SSE existente:** chat manda chunks. Tool result hoje (Coach-2A) volta sincrono no fim do turn. Confirmation precisa interromper o flow sem quebrar o stream.
- **`coachToolRunner` ainda nao existe** (verificado 2026-05-02 em `server/coachTools/`). ADR-077 cria a tabela; este ADR define o flow.
- **Lesson #194 (atomicidade tx):** `payload_before` precisa ser snapshot DENTRO da mesma tx do `handler.execute`. Sem isso, race condition pode capturar estado pos-mutacao parcial.
- **Lesson #estado-persistente (#12):** UI do timer/badge precisa sobreviver a re-mount (TanStack Query cache, nao `useState` local).
- **Idempotencia em re-clicks:** user clica "Confirmar" 2x rapido (latencia de rede); segundo POST nao deve duplicar mutacao.
- **UX 5min:** janela de undo precisa ser longa o bastante para "ah, errei" mas curta o suficiente para nao gerar drift entre estado real e estado reversivel. 5min eh consenso de produtos similares (Gmail "undo send").

## Opcoes Consideradas

### Opcao A: 3 estados explicitos (`pending` → `completed` ⇋ `undone`) com diff visual + undo 5min via UPDATE em `coach_actions` + reverse-row no dominio (ESCOLHIDA)

**Fluxo:**

```
LLM emite tool_use (write)
  ↓
coachToolRunner detecta tool.requiresConfirmation === true
  ↓
INSERT coach_actions (status='pending', input, requires_confirmation=true)
  ↓
SSE event: tool_pending_confirmation { actionId, toolName, input, diffPreview, undoWindowMs: 300000 }
  ↓
Frontend renderiza CoachActionConfirmCard (botoes Confirmar / Cancelar)
  ↓
USER clicou Confirmar?
  ├── POST /api/coach/actions/:id/confirm
  │     ↓
  │   BEGIN TRANSACTION
  │     SELECT coach_actions WHERE id=$1 AND user_id=$2 FOR UPDATE
  │     IF status != 'pending' → ROLLBACK + return 409 (already_confirmed | expired | cancelled)
  │     UPDATE coach_actions SET status='executing'
  │     payloadBefore = await tool.fetchPayloadBefore(input, ctx, txClient)
  │     UPDATE coach_actions SET payload_before = $payloadBefore
  │     result = await tool.executeConfirmed(input, { ...ctx, txClient })
  │     UPDATE coach_actions SET payload_after, affected_entity_*, status='completed',
  │       confirmed_at=NOW(), undo_expires_at=NOW() + INTERVAL '5 minutes'
  │   COMMIT
  │     ↓
  │   SSE event (active session): tool_confirmed { actionId, payloadAfter, undoExpiresAt, diff }
  │   HTTP 200 com mesmo body
  │
  ├── POST /api/coach/actions/:id/cancel
  │     ↓
  │   UPDATE coach_actions SET status='expired' WHERE status='pending'
  │   SSE event: tool_cancelled { actionId }
  │
  └── User nao agiu em 30 min? Cron cleanup:
      UPDATE coach_actions SET status='expired'
      WHERE status='pending' AND created_at < NOW() - INTERVAL '30 minutes'
```

**Fluxo undo:**

```
USER clica Desfazer (dentro da janela de 5min)
  ↓
POST /api/coach/actions/:id/undo
  ↓
BEGIN TRANSACTION
  SELECT coach_actions WHERE id=$1 AND user_id=$2 FOR UPDATE
  IF status != 'completed' → ROLLBACK + return 409 (already_undone | failed | cancelled)
  IF undo_expires_at <= NOW() → ROLLBACK + return 410 (undo_window_expired)
  await tool.undo(payloadBefore, payloadAfter, { ...ctx, txClient })
    -- handler-specific reverse:
    -- record_wallet_transaction: cria reverse-row (delta inverso) com reason='manual_correction',
    --   reversedByActionId=actionId. NUNCA hard-delete (ledger imutavel ADR-058).
    -- start_grind_session (from_planned): UPDATE status='planned', startTime=null.
    -- start_grind_session (instant): DELETE row.
    -- register_tournament_in_grade: DELETE row planned_tournaments.
    -- log_leak_focus: UPDATE status='abandoned'.
    -- log_session_completed: UPDATE status='active', restaura volume/profit/end_time.
    -- log_study_session: DELETE row.
  UPDATE coach_actions SET status='undone', undone_at=NOW()
COMMIT
  ↓
SSE event (active session): tool_undone { actionId, reversedEntityId? }
HTTP 200
```

**4 metodos por write tool no registry** (extensao de ADR-023):

```ts
interface WriteCoachTool<I, O> extends CoachTool<I, O> {
  requiresConfirmation: true;
  auditLevel: 'persist';
  fetchPayloadBefore(input: I, ctx: ToolContext, tx: PoolClient): Promise<unknown>;
  executeConfirmed(input: I, ctx: ToolContext, tx: PoolClient): Promise<{
    payloadAfter: unknown;
    affectedEntityType: string;
    affectedEntityId: string;
    output: O; // shape do tool result wrapped
  }>;
  undo(payloadBefore: unknown, payloadAfter: unknown, ctx: ToolContext, tx: PoolClient): Promise<{
    reversedEntityType?: string;
    reversedEntityId?: string;
  }>;
  diffPreview?(input: I, currentSnapshot: unknown): Diff; // opcional; default = generic JSON merge
}

interface Diff {
  added?: Record<string, unknown>;
  removed?: Record<string, unknown>;
  changed?: Record<string, { from: unknown; to: unknown }>;
}
```

- **Pros:**
  - **Defesa em camadas estrutural:** LLM nao pode mutar dado; sempre passa por user click. Prompt injection que diga "ignore confirmation" nao funciona porque o gate eh server-side.
  - **`payload_before` snapshot dentro da tx** garante ausencia de drift (lesson #194). Reverse usa snapshot, nao re-fetch.
  - **Audit completo em `coach_actions`** — toda escrita rastreavel pelo user em `/settings/coach-actions` (Sprint 0 RF-06).
  - **Undo 5min cobre a janela "errei o numero":** consenso de produtos Gmail/Stripe.
  - **Idempotencia via `FOR UPDATE`:** segundo `/confirm` paralelo retorna 409. Lesson #vi.spyOn nao se aplica (sem mock global).
  - **Reverse via row inversa (nao hard-delete) em wallet:** mantem ledger imutavel (ADR-058 ja exige isso para `wallet_transactions`).
  - **SSE preserva UX:** stream continua, evento `tool_pending_confirmation` chega como qualquer outro chunk; frontend renderiza CARD inline na conversa.
  - **Diff visual reusavel:** componente `CoachActionConfirmCard` renderiza qualquer tool com `Diff` shape padronizado.
  - **Lesson #estado-persistente:** UI usa `useQuery({queryKey: ['coach-action', actionId], enabled: false})` + `setQueryData` em transicao optimista. Sobrevive re-mount.

- **Contras:**
  - **Latencia +1 round trip:** user precisa clicar entre LLM emit e mutation. Aceito — explicitamente queremos human-in-the-loop.
  - **6 write tools precisam implementar 3 metodos cada** (`fetchPayloadBefore`, `executeConfirmed`, `undo`). 18 implementacoes minimas. Aceito — mecanico, padroes claros.
  - **Reverse complexa em `record_wallet_transaction` cross-currency:** `payload_before.balance + payload_after.balance` capturados; reverse via row delta inverso. Snapshots ja existem (Bankroll-3). Tests integration validam (lesson #3 — shape real).

### Opcao B: Auto-confirm com undo so + sem `pending`

Toda write tool executa imediatamente quando LLM emite tool_use. UI mostra UndoBadge 5min direto.

- **Pros:**
  - Menos clicks para o user (gente experiente prefere "ja fez").
  - Codigo simpler (sem pending state).

- **Contras:**
  - **Janela de erro maior:** LLM "alucina" parametros (ex: walletId errado), mutation acontece, user precisa undoar. UX hostil em alpha.
  - **Seguranca degrada:** prompt injection que persuada LLM a chamar `record_wallet_transaction` com payload malicioso ja roda em < 100ms. Audit trail soh aparece depois.
  - **Reverse complexa em wallet cross-currency:** se entre execute e undo houver outro tx no mesmo wallet, snapshot drift quebra reverse.
  - **Confianca do user em alpha quebra:** "Coach mexeu na minha banca sem perguntar." R4 do research vira realidade.
  - **Rejeitada por R4 + UX agressiva.**

### Opcao C: Confirmation por categoria (write tools criticas confirmam, "soft" auto-executam)

Categorizar write tools em "criticas" (afeta bankroll, sessao ativa) e "soft" (study log, leak focus). So as criticas pedem confirm.

- **Pros:**
  - UX mais fluida em writes triviais.

- **Contras:**
  - **Categorizacao subjetiva:** quem decide se `log_leak_focus` eh critico? Eh, se for usado em relatorio mensal.
  - **Bug futuro:** Sprint Coach-3 adiciona uma "soft" tool, depois esquece ela em algum review e ela roda sem confirm em prod.
  - **Inconsistencia mental para o user:** "porque essa precisou confirmar e a outra nao?" — quebra modelo mental.
  - **Confidence audit** depois fica "quais tools foram confirmadas vs auto-executadas?" — categoria virou variavel.
  - **Rejeitada por incoerencia + risco de feature creep.**

### Opcao D: Confirmation via 2-step LLM ("confirma essa acao? sim/nao")

LLM nao chama tool. Pergunta no chat "vou registrar transacao X, confirma?". Apos user dizer "sim", LLM emite tool_use real.

- **Pros:**
  - Zero codigo backend novo (so prompt engineering).

- **Contras:**
  - **LLM esquece confirmacao** entre turnos — quebra contrato.
  - **Sem audit estruturado:** confirmacao "sim" eh string num chat_message.content, nao tem schema.
  - **Sem undo:** apos LLM executar, nao tem janela.
  - **Atrasa tudo:** 2-3 turns para 1 acao. UX terrivel.
  - **Rejeitada por fragilidade (LLM-only) + UX.**

## Decisao

**Adotar Opcao A: confirmation explicita via tabela `coach_actions` (status state machine `pending` → `completed` ⇋ `undone`) + undo 5min via reverse-row no dominio + diff visual padronizado.**

### Detalhes-chave do design

1. **Janela de undo: 5 minutos.** Hardcoded em `coachToolRunner` (NAO env var no Sprint 2B). Sprint Coach-3 pode propor janelas variaveis (ex: relatorio = 0min porque nao se desfaz; transferencia = 10min porque saldo demora).

2. **`fetchPayloadBefore` dentro da tx:**
   ```ts
   await txClient.query('BEGIN');
   await storage.updateCoachAction(actionId, { status: 'executing' }, { tx: txClient });
   const payloadBefore = await tool.fetchPayloadBefore(input, ctx, txClient);
   await storage.updateCoachAction(actionId, { payloadBefore }, { tx: txClient });
   const { payloadAfter, affectedEntityType, affectedEntityId, output } =
     await tool.executeConfirmed(input, ctx, txClient);
   await storage.updateCoachAction(actionId, {
     payloadAfter, affectedEntityType, affectedEntityId,
     status: 'completed', confirmedAt: new Date(),
     undoExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
   }, { tx: txClient });
   await txClient.query('COMMIT');
   ```

3. **Race condition (2 confirms paralelos):** `SELECT FOR UPDATE` na linha. Segundo confirm vai aguardar primeiro commit, ler `status='completed'`, retornar 409 `already_confirmed`. Lesson #vi.useFakeTimers — testes simulam via `Promise.all`.

4. **Diff visual (`Diff` shape):** standard:
   ```json
   {
     "added": { "transactionId": "X" },
     "changed": { "balanceUSD": { "from": 1450, "to": 1500 } }
   }
   ```
   Cada tool implementa `diffPreview(input, currentSnapshot): Diff` — opcional. Default: deep-merge JSON com diff via `fast-json-patch` (instalado via Spec — ja existe se nao, adicionar). Frontend renderiza linhas vermelhas (removed/changed-from) + verdes (added/changed-to).

5. **Reverse-row em wallet (lesson #atomicidade):**
   - `tool.undo(payloadBefore, payloadAfter, ctx, tx)` em `recordWalletTransaction.ts` chama `walletService.recordWalletTransaction(tx, { wallet_id, amount: -payload_after.delta, reason: 'manual_correction', notes: 'Desfeito via Coach action <id>', reversedByActionId: ctx.actionId })`.
   - **Nunca hard-delete** — ledger imutavel (ADR-058).
   - Outros write tools podem hard-delete (DELETE FROM planned_tournaments WHERE id=...) porque dominio nao exige imutabilidade.

6. **Frontend:**
   - `CoachActionConfirmCard` (Sprint 2B RF-10) — recebe `tool_pending_confirmation`, renderiza com `data-testid="coach-action-confirm-<actionId>"`. Click "Confirmar" faz POST + transicao optimista para "Confirmando...". Em caso de 200, troca para `CoachActionUndoBadge`.
   - `CoachActionUndoBadge` — timer regressivo `useInterval(1000)` lendo `undoExpiresAt`. Quando atinge 0, botao desabilita com texto "Janela expirada". Click "Desfazer" faz POST `/undo`. Em 200, troca para "Desfeito" com fundo cinza.
   - **Lesson #11 (default minimo):** componente NAO tem hover/click default fora dos botoes. Cursor-pointer so nos botoes.
   - **Lesson #1 (hooks first):** all hooks before any return.
   - **Lesson #estado-persistente:** `useQuery({ queryKey: ['coach-action', id], enabled: false })` + `queryClient.setQueryData` em transicoes. Sobrevive re-mount entre confirm e undo.
   - **Lesson #2 (data-testid):** todos elementos com testid estavel.

7. **SSE eventos novos:**
   - `tool_pending_confirmation` { actionId, toolName, input, diffPreview, undoWindowMs }
   - `tool_confirmed` { actionId, payloadAfter, undoExpiresAt, diff }
   - `tool_cancelled` { actionId }
   - `tool_undone` { actionId, reversedEntityId? }

8. **REST endpoints novos** (em `server/routes/coach.ts`):
   - `POST /api/coach/actions/:id/confirm` — JWT, ownership, FOR UPDATE.
   - `POST /api/coach/actions/:id/cancel` — JWT, ownership.
   - `POST /api/coach/actions/:id/undo` — JWT, ownership, FOR UPDATE, valida `undo_expires_at > NOW()`.
   - `GET /api/coach/actions/:id` — JWT, ownership (carrega para diff visual).

9. **Cron cleanup de pending > 30min** roda 1x/min (ADR-087) — UPDATE para status='expired'. Idempotente.

10. **Endpoints retornam HTTP statuses claros:**
    - 200 OK
    - 400 invalid_id
    - 401 not authenticated
    - 403 acao de outro user
    - 404 action nao existe
    - 409 status != pending (`already_confirmed | expired | cancelled` no body) ou status != completed em undo (`already_undone | failed`)
    - 410 undo_window_expired (apos `undo_expires_at`)
    - 422 execution_failed (handler error, com `details`)
    - 500 internal_error

## Consequencias

### Positivas
- **R4 mitigado estruturalmente:** Coach NUNCA muta sem click humano. Auditavel.
- **Undo 5min cobre 95% dos arrependimentos** (consenso produtos similares).
- **`coach_actions` audit trail completo:** Sprint 0 RF-06 ja sabe ler dele.
- **Idempotencia via FOR UPDATE:** race conditions previstas e testadas.
- **Padrao reusavel** para Coach-3 (relatorio actions) e Coach-4 (mental tracking confirmacoes).
- **Lesson #194 honrada:** payload_before snapshot dentro da tx. Sem drift.
- **Reverse-row em wallet preserva ledger imutavel** (ADR-058 fica integro).

### Negativas
- **6 write tools = 18 metodos** (3 por tool). Aceito; padrao mecanico.
- **+1 click por write:** UX trade-off por seguranca. Aceito (alpha valida; beta pode propor "ja confirmei, nao pergunte mais nesta sessao").
- **Cron cleanup adiciona 1 conn/min.** Aceito (mesmo runner que outros crons).
- **Sem multi-step undo (chained):** se user confirma A, depois B (que depende de A), depois desfaz A — B fica orfa. Sprint 2B documenta como "out of scope". Coach-3 pode propor undo en cascade.

### Neutras
- **Janela 5min hardcoded:** revisar em Coach-3 com data real. Se < 1% usa, encurtar; se > 30%, alongar.
- **Reverse-row vs hard-delete:** decisao por dominio. Wallet = reverse; tournament/study = delete (ja documentado).
- **Frontend cards podem empilhar:** 2 tools pending no mesmo turn renderizam 2 cards. UX aceita (raro).

## Confianca

**Alta.** Padrao consolidado em produtos como Gmail (undo send), Stripe (refund window), Notion (versioning + undo). Idempotencia via `FOR UPDATE` e prática classica de Postgres. Risco principal — drift entre `payload_before` capturado e estado real do dominio durante undo — mitigado por estarem na mesma tx + tests integration.

## Code references

- `server/coachToolRunner.ts` (NOVO) — orquestra confirm/undo/cancel.
- `server/coachTools/registry.ts` (existing) — extender `CoachTool` interface com `WriteCoachTool` opcional.
- `server/coachTools/handlers/recordWalletTransaction.ts` (NOVO) — exemplo de write tool implementando 3 metodos.
- `server/coachTools/handlers/startGrindSession.ts` (NOVO).
- `server/coachTools/handlers/registerTournamentInGrade.ts` (NOVO).
- `server/coachTools/handlers/logLeakFocus.ts` (NOVO).
- `server/coachTools/handlers/logSessionCompleted.ts` (NOVO).
- `server/coachTools/handlers/logStudySession.ts` (NOVO).
- `server/routes/coach.ts` — adiciona 4 endpoints `/api/coach/actions/:id/{confirm,cancel,undo,GET}`.
- `client/src/components/coach/CoachActionConfirmCard.tsx` (NOVO) — UI confirm.
- `client/src/components/coach/CoachActionUndoBadge.tsx` (NOVO) — UI undo timer.
- `client/src/lib/coachActionDiff.ts` (NOVO) — utility de diff (fast-json-patch wrapper).

## Related ADRs

- [ADR-023](023-coach-tool-registry-pattern.md) — Tool registry — **estendido** com `WriteCoachTool`.
- [ADR-024](024-coach-tool-result-wrapping.md) — Result wrapping — **se aplica** a `tool_result` que volta apos `executeConfirmed`.
- [ADR-026](026-coach-continuation-loop-limit.md) — Limit 5/turn — **conta** confirmacoes pendentes como tool calls.
- [ADR-058](058-auto-snapshot-cooldown.md) — Wallet ledger imutavel — **forca** reverse-row em vez de hard-delete em recordWalletTransaction.undo.
- [ADR-077](077-coach-actions-migration-and-audit-log.md) — Schema da tabela usada por este flow.
- [ADR-087](087-job-runner-timezone-aware.md) — Cron cleanup de pending > 30min.

## Lessons learned aplicadas
- **#1** (hooks first) — `CoachActionConfirmCard` early returns DEPOIS dos hooks.
- **#2** (data-testid estavel) — todos elementos UI com testid `coach-action-{confirm,undo,canceled}-<actionId>`.
- **#3** (mocks idealizados) — tests integration validam shape real de `payloadBefore/After` por tool.
- **#7** (deprecation gradual) — colunas write-tool aceitam null em rows criadas por read tools.
- **#11** (default minimo em componentes) — Confirm card sem hover/click default.
- **#12** (estado persistente) — `setQueryData` para state da action.
- **#194** (atomicidade tx multi-service) — `fetchPayloadBefore` + `executeConfirmed` na mesma tx; tx ownership em `coachToolRunner`, NUNCA em handler.
