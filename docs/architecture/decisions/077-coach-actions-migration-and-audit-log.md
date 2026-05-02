# ADR-077: Migrar tabela `coach_actions` (do Sprint Coach-2A planejada mas nunca migrada) com schema final write-tool aware

## Status
Aceito

## Data
2026-05-02

## Contexto

A tabela `coach_actions` foi documentada nos ADRs 023 (tool registry) e 024 (tool result wrapping) do Sprint Coach-2A como destino do audit trail de tool calls. **Mas a tabela nunca foi migrada.** Verificacao 2026-05-02:

- `grep -r "coach_actions" server/ shared/ migrations/` → **zero matches em codigo de producao**.
- `shared/schema.ts` (~3760 linhas, 218 exports) → tabela ausente.
- `migrations/*.sql` (23 migrations existentes, ultima = `0023_biblioteca.sql`) → nenhuma referencia.
- 14 arquivos com a string `coach_actions` → todos sao docs (specs, ADRs, lessons-learned, sequence diagrams). Zero referencia em codigo executado.

Conclusao: a feature foi adiada pelo Sprint Coach-2A. Os ADRs 023/024 mencionam "linha em coach_actions" como contrato semantico que nunca virou migration. **Sprint Coach-2B agora precisa criar a tabela do zero**, ja com o shape final que suporta:

- **Read tools** (Coach-2A entregue) — log opcional (`auditLevel='log'` so console.log; `'persist'` grava row).
- **Write tools** (Coach-2B em curso) — fluxo de 3 estados (`pending` → `executing` → `completed | undone | expired | failed`) com `payload_before` + `payload_after` + janela de undo de 5min (ADR-083).

A pergunta central: **qual schema final?** Como evitamos que o sprint Coach-2B precise refazer migration depois (ex: adicionar `affected_entity_*` em sprint posterior)?

### Restricoes

- **Lesson #7 (deprecation gradual):** colunas novas devem ser Zod `optional + default`, nunca `required` puro. Zero quebra de retrocompat.
- **Lesson #194 (atomicidade tx):** rows de `coach_actions` para write tools sao escritas dentro da MESMA transaction da mutation no domain (wallet_transactions, grind_sessions, etc). Schema precisa permitir ownership da tx pelo `coachToolRunner`.
- **CASCADE em users.userPlatformId:** delete de user remove audit trail (LGPD-compatible) — consistente com 100% das tabelas atuais (`auth_tokens`, `chat_sessions`, `wallet_transactions`, etc).
- **`chat_sessions.id` e `chat_messages.id`:** FK soft (sem `references`) porque acoes podem persistir mesmo se a sessao for purgada (status='deleted'). Audit trail nao se perde.
- **`tool_use_id` (Anthropic Tool Use API):** retornado pela API como string opaca. Util para amarrar audit + Anthropic logs. Nao eh nosso ID.
- **JSONB para `input` / `result` / `payload_before` / `payload_after`:** consultavel + indexavel via `jsonb_path_ops` se virar gargalo. Sprint 2B nao indexa.
- **Tamanho de `result`:** ADR-024 trunca em 32KB. `coach_actions.result` armazena ja-wrapped JSON. Truncation flag `__truncated: true` quando aplicado.

## Opcoes Consideradas

### Opcao A: Migration unica em `0024_coach_2b_actions_leak_focus.sql` com schema final completo (ESCOLHIDA)

Schema final que suporta read + write tools em um INSERT, sem ALTER posterior:

```sql
CREATE TABLE coach_actions (
  id                       VARCHAR(21) PRIMARY KEY,
  user_id                  VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  chat_session_id          VARCHAR(21),                                  -- FK soft
  message_id               VARCHAR(21),                                  -- FK soft (chat_messages)
  tool_use_id              VARCHAR(64),                                  -- Anthropic Tool Use ID
  tool_name                VARCHAR(64) NOT NULL,
  status                   VARCHAR(16) NOT NULL,                         -- pending|executing|completed|failed|undone|expired
  input                    JSONB,
  result                   JSONB,                                        -- wrapped ToolResult; truncado 32KB
  error_message            TEXT,
  payload_before           JSONB,                                        -- snapshot pre-mutacao (write tools)
  payload_after            JSONB,                                        -- snapshot pos-mutacao
  affected_entity_type     VARCHAR(32),                                  -- 'wallet_transaction' | 'grind_session' | etc
  affected_entity_id       VARCHAR(21),                                  -- id da row criada/atualizada
  requires_confirmation    BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at             TIMESTAMP,
  undo_expires_at          TIMESTAMP,                                    -- confirmed_at + 5min (ADR-083)
  undone_at                TIMESTAMP,
  latency_ms               INTEGER,
  executed_at              TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coach_actions_user_status         ON coach_actions(user_id, status, created_at);
CREATE INDEX idx_coach_actions_session             ON coach_actions(chat_session_id);
CREATE INDEX idx_coach_actions_tool                ON coach_actions(tool_name, status, created_at);
CREATE INDEX idx_coach_actions_undo_window         ON coach_actions(user_id, undo_expires_at)
  WHERE status = 'completed' AND undo_expires_at IS NOT NULL;
CREATE INDEX idx_coach_actions_pending_cleanup     ON coach_actions(status, created_at)
  WHERE status = 'pending';
```

Drizzle (em `shared/schema.ts`):

```ts
export const coachActions = pgTable("coach_actions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  chatSessionId: varchar("chat_session_id"),
  messageId: varchar("message_id"),
  toolUseId: varchar("tool_use_id", { length: 64 }),
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  input: jsonb("input"),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  payloadBefore: jsonb("payload_before"),
  payloadAfter: jsonb("payload_after"),
  affectedEntityType: varchar("affected_entity_type", { length: 32 }),
  affectedEntityId: varchar("affected_entity_id"),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  undoExpiresAt: timestamp("undo_expires_at"),
  undoneAt: timestamp("undone_at"),
  latencyMs: integer("latency_ms"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_coach_actions_user_status").on(table.userId, table.status, table.createdAt),
  index("idx_coach_actions_session").on(table.chatSessionId),
  index("idx_coach_actions_tool").on(table.toolName, table.status, table.createdAt),
  index("idx_coach_actions_undo_window").on(table.userId, table.undoExpiresAt),
  index("idx_coach_actions_pending_cleanup").on(table.status, table.createdAt),
]);

export const insertCoachActionSchema = createInsertSchema(coachActions).omit({
  id: true,
  createdAt: true,
}).extend({
  // Lesson #7: optional + default em TODAS as colunas opcionais
  status: z.enum(['pending','executing','completed','failed','undone','expired']),
  toolName: z.string().min(1).max(64),
  input: z.unknown().optional(),
  result: z.unknown().optional(),
  payloadBefore: z.unknown().optional(),
  payloadAfter: z.unknown().optional(),
  requiresConfirmation: z.boolean().optional().default(false),
});
```

- **Pros:**
  - **Migration unica resolve schema final** — Sprint 2B nao precisa ALTER em sprint subsequente. Coach-3 (relatorios) e Coach-4 (mental) nao tocam essa tabela.
  - **Indices ja preparados:** `idx_coach_actions_undo_window` cobre query "scan acoes undoable" sem table scan; `idx_coach_actions_pending_cleanup` cobre cron de cleanup de pending > 30min.
  - **Mantem retrocompat:** todas as colunas write-tool-only (`requires_confirmation`, `payload_*`, `confirmed_at`, etc) sao nullable + default seguro. Read tools (Coach-2A) gravam apenas com `requires_confirmation=false` e null nos campos de undo.
  - **Lesson #7 honrada:** Zod `optional + default` em colunas que admitem null no banco.
  - **CASCADE em user:** delete de user remove audit (LGPD).
  - **FK soft em `chat_session_id` + `message_id`:** se sessao for hard-deleted (raro hoje, mas possivel), audit trail sobrevive — necessario para a Audit page (Sprint 0 RF-06).
  - **Indice parcial (`WHERE status='completed' AND undo_expires_at IS NOT NULL`):** otimiza scan de UI do "5min undo timer" sem inflar todos os reads.

- **Contras:**
  - **Tabela "wide" para Sprint 2B baixa traction:** 18 colunas. Aceitavel — read tools usam ~6 delas, write tools usam todas. Zero NULL em colunas obrigatorias.
  - **Sem trigger DB para `undo_expires_at = confirmed_at + 5min`:** application-level (em `coachToolRunner.confirm`). Aceito — explicitamente queremos controle total no app, sem magic do DB. ADR-083 detalha.

### Opcao B: Migration minima agora + ALTER em sprint posterior

Criar tabela com ~6 colunas core (`id`, `user_id`, `tool_name`, `status`, `input`, `result`, `created_at`) e adicionar write-tool fields (`payload_before`, `confirmed_at`, etc) em migration `0025_coach_actions_write_support.sql` quando o flow de confirmation for implementado.

- **Pros:**
  - Migration menor, mais facil revisar.
  - Adesao gradual ao schema.

- **Contras:**
  - **Forca 2 migrations sequenciais para o mesmo sprint** (Coach-2B precisa write tools no escopo, nao deixa para depois).
  - **Indice parcial precisaria recriacao depois** quando colunas existirem.
  - **Risco de ficar "schema split-brain":** rows criadas pre-ALTER tem null em colunas write-tool — UI/storage tem que tratar.
  - **Nao agrega valor real:** Sprint 2B precisa do schema final ANTES de implementar write tools. ALTER no meio do sprint trava o pipeline.
  - **Rejeitada por overhead operacional sem ganho.**

### Opcao C: Reaproveitar tabela existente (ex: `chat_messages.metadata` jsonb)

Em vez de tabela dedicada, gravar tool calls como `metadata` da `chat_messages` que originou a chamada.

- **Pros:**
  - Zero migration nova.

- **Contras:**
  - **Quebra a auditoria:** `chat_messages.metadata` eh JSON livre, sem indices nem schema validavel.
  - **Sem CASCADE proprio:** delete de chat session apaga audit (perde rastro de write tools que talvez precisem ser desfeitas).
  - **Inviabiliza UI da Audit page** (Sprint 0 RF-06) que precisa filtrar por `tool_name`, `status`, `created_at` com indice.
  - **Confunde dois conceitos:** "mensagem do user/assistant" != "execucao de write tool". Acoplar destrutiva e a longo prazo bagunca de manutencao.
  - **Rejeitada por degradar audit + UI.**

### Opcao D: Tabela separada por tool (ex: `coach_wallet_actions`, `coach_session_actions`)

- **Pros:**
  - Schemas otimizados por dominio (sem JSONB livre).

- **Contras:**
  - **Explosao de tabelas:** 6 write tools = 6 tabelas. Coach-3/4 adicionam mais.
  - **Audit page precisa UNION 6+ queries.** Performance ruim.
  - **Lesson #atomicidade nao melhora:** ainda precisa rodar dentro da mesma tx do dominio.
  - **Rejeitada por complexidade.**

## Decisao

**Adotar Opcao A: migration unica `0024_coach_2b_actions_leak_focus.sql` cria `coach_actions` com schema final write-tool aware. Drizzle-Zod com `optional + default` em colunas write-tool. Indices preparados para todos os caminhos previsiveis.**

### Detalhes-chave do design

1. **Statuses (enum string em VARCHAR(16)):**
   - `pending` — write tool detectada (`requiresConfirmation=true`); INSERT antes de SSE `tool_pending_confirmation`. Read tools NUNCA usam este status (vao direto para `completed` ou `failed`).
   - `executing` — UPDATE durante a tx do `confirm`, depois de `fetchPayloadBefore` mas antes de `handler.execute`. Janela curta (~ms). Util para diagnosticar transacoes mortas.
   - `completed` — UPDATE pos `handler.execute`; preenche `payload_after`, `affected_entity_*`, `confirmed_at`, `undo_expires_at = confirmed_at + 5min`.
   - `failed` — UPDATE em qualquer falha (Zod, handler error, tx rollback). Preenche `error_message`. Termina ciclo (sem undo possivel).
   - `undone` — UPDATE apos `/undo` dentro da janela. Preenche `undone_at`. Audit trail mostra "X foi feito e desfeito".
   - `expired` — UPDATE pelo cron de cleanup quando `pending > 30min` sem confirm. Diferente de `failed` — explicitamente "user nao agiu".

2. **`auditLevel` da tool registry (ADR-023):**
   - `'none'` — nao grava row. Reservado para tools internas/triviais (nao usado em tools publicas hoje).
   - `'log'` — INSERT row com `result=null` (so `input` + `tool_name` + status). Read tools low-volume usam este.
   - `'persist'` — INSERT row com `result` wrapped completo (truncado 32KB). Read tools criticas + TODAS write tools usam este.

3. **`requires_confirmation` boolean:** redundante com a check `tool.requiresConfirmation` no registry, mas armazenado na row para auditoria forense. Se a regra mudar (ex: tool deixar de exigir confirm), audit historico mostra o estado da row no momento da execucao.

4. **`undo_expires_at`:** sempre `confirmed_at + 5min` (ADR-083). NUNCA configuravel por tool nesta sprint. Sprint Coach-3 pode propor janelas variaveis (ex: undo de relatorio = 0min porque relatorio nao se desfaz).

5. **`tool_use_id`:** ID retornado pela API Anthropic. Util para correlacao com logs externos (Anthropic dashboard, debug). Sem unique constraint — em raros casos de retry, mesmo `tool_use_id` pode aparecer 2x; segundo INSERT vence (sem perda de dado).

6. **Indice `idx_coach_actions_undo_window`:** indice parcial (`WHERE status='completed' AND undo_expires_at IS NOT NULL`). Cobre query "tem alguma acao undoable agora?" do `CoachActionUndoBadge`. Tabela cresce (3 acoes/user/dia em alpha) mas indice parcial fica magro (so undo window ativos).

7. **Cron cleanup de pending:**
   - `UPDATE coach_actions SET status='expired' WHERE status='pending' AND created_at < NOW() - INTERVAL '30 minutes'`
   - Roda 1x/min via mesmo runner do Sprint 0 (usa node-cron — ADR-087).
   - Idempotente. Nao toca rows ja `completed/undone/failed`.

8. **Storage layer (`server/storage.ts`) ganha:**
   - `createCoachAction(input)` — INSERT.
   - `updateCoachAction(id, delta, opts?: { tx?: PoolClient })` — UPDATE; aceita `tx` external (lesson #194 — caller controla tx).
   - `getCoachAction(id, userId)` — SELECT + ownership.
   - `listCoachActions(userId, filters)` — para Audit page.
   - `markPendingExpired()` — usado pelo cron.

9. **Lesson #9 (try/catch generico engole erros):** TODOS os helpers acima logam `console.error` com payload mascarado antes de re-throw. Distinguem "no rows" (returna `undefined`) de "DB explodiu" (throw + log).

10. **Aplicacao da migration:**
    - Local dev: `npm run db:push` (drizzle-kit push direto — convencao Grindfy).
    - Producao Neon: `db:push` apos approval do founder (irreversivel; documentado em CLAUDE.md secao 13).

## Consequencias

### Positivas
- **Resolve risco transversal:** Sprint Coach-2B finalmente migra a tabela documentada nos ADRs 023/024.
- **Schema final em uma migration:** Coach-3/4 nao precisam ALTER table.
- **Indices preparados** para queries previsiveis (Audit page, undo window scan, cron cleanup).
- **Lesson #7 honrada** — Zod `optional + default` permite back-fill silencioso.
- **CASCADE em user** — LGPD-clean.
- **Audit completo:** read tools criticas + write tools 100% rastreaveis.
- **`affected_entity_*` permite linkar audit ↔ dominio:** UI pode exibir "voce desfez transacao X feita pelo Coach as 14:30" linkando para wallet UI.

### Negativas
- **18 colunas na tabela** — wide schema. Aceito (write-tool fields exigem isso). Zero NULL em colunas obrigatorias por design.
- **`payload_before` + `payload_after` JSONB sem validacao formal de shape:** Cada tool define seu shape. Risco: divergencia entre `fetchPayloadBefore` e `undo` quebra reversibilidade. Mitigacao: tests integration em ADR-083 (lesson #3 — mocks idealizados forcam validar shape real).
- **Sem trigger DB para enforcing `undo_expires_at = confirmed_at + 5min`:** application-level. Tradeoff: complexidade DB vs flexibilidade app. Aceito.

### Neutras
- **Cron de cleanup de pending consome 1 conexao/min.** Aceito — mesmo runner que Sprint 0.
- **Volume estimado:** 5-10 acoes/user/dia em alpha (10 users) = ~3000 rows/mes. Crescimento linear. Sem partition por enquanto.
- **Retencao:** sprint 2B NAO trata. Documentar follow-up para Coach-3: archive de rows > 90 dias com `status IN ('completed', 'undone', 'expired')`.

## Confianca

**Alta.** Schema baseado nos ADRs 023/024 ja revisados pelo founder e em uso conceitual ha 1 sprint. Zero match em codigo confirma ausencia de conflito real. Migrations Coach-1 (`chat_messages` com 4 colunas adicionadas) provam que padrao funciona.

## Code references

- `shared/schema.ts` — adiciona `coachActions` table + `insertCoachActionSchema` (Zod).
- `migrations/0024_coach_2b_actions_leak_focus.sql` — DDL.
- `server/storage.ts` — adiciona helpers (`createCoachAction`, `updateCoachAction`, `getCoachAction`, `listCoachActions`, `markPendingExpired`).
- `server/coachToolRunner.ts` — NOVO arquivo. Detecta `requiresConfirmation`, escreve em `coach_actions`. Detalhado em ADR-083.
- `server/coachTools/registry.ts` — ja existe (Coach-2A). Sprint 2B NAO altera.
- `Docs/architecture/data-model-index.md` — atualizar secao "Coach AI" com nova tabela.

## Related ADRs

- [ADR-023](023-coach-tool-registry-pattern.md) — Tool registry pattern (Coach-2A) — **defines** `auditLevel` que esta tabela consome.
- [ADR-024](024-coach-tool-result-wrapping.md) — Tool result wrapping — **define** que `result` e ja-wrapped JSON.
- [ADR-026](026-coach-continuation-loop-limit.md) — Limit 5 tools/turn — **constrange** quantidade de rows por turn.
- [ADR-083](083-coach-confirmation-undo-pattern.md) — Confirmation + undo pattern — **consumidor** desta tabela (write tools).
- [ADR-084](084-user-coach-preferences.md) — Preferences (Sprint 0) — coabita audit page (RF-06 do Sprint 0 le `coach_actions`).
- [ADR-087](087-job-runner-timezone-aware.md) — Job runner — **executa** cron cleanup de pending > 30min.

## Lessons learned aplicadas
- **#7** (deprecation gradual) — Zod `optional + default` em colunas write-tool only.
- **#9** (try/catch generico engole erros) — storage helpers com `console.error` antes de re-throw.
- **#194** (atomicidade tx multi-service) — `updateCoachAction` aceita `tx` external; coachToolRunner controla commit/rollback.
- **#3** (mocks idealizados) — tests integration validam shape real de `payload_before/after` por tool.
