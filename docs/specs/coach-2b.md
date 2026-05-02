# Spec: Sprint Coach-2B — Write tools com confirmation/undo + nudges baixo-risco

## Status
Proposta

## Resumo
Coach passa de "consultor" (so leitura) a "agente" (registra acoes em nome do user, com
confirmation obrigatoria + undo 5min + audit persistente). Entrega 6 write tools cobrindo
4 dores principais (D4 bankroll, D5 grade, D6 leak, D7 estudo) e 3 nudges proativos
baixo-risco (B-SNAPSHOT, B-LEAK, B-STUDY) sob a infraestrutura anti-fadiga do Sprint 0.

Esforco estimado: 1.5-2 semanas.

## Contexto
- Coach v2 (Sprint Coach-2A) entregou 5 read tools (Coach-2A) + 1 read tool (Sprint F3) +
  3 read tools de Library (Sprint Biblioteca-1 — `recommendLesson`, `readThemeWithLinkedSpots`,
  `readCooldownHistory`).
- Sprint Coach-2A documentou em ADR-024 + tabela `coach_actions` campos `payload_before`
  + `requires_confirmation` mas NAO entregou: tabela `coach_actions` ainda NAO foi
  migrada — esta apenas planejada. Coach-2B IMPLEMENTA a tabela + flow completo.
- Sprint 0 entrega `user_coach_preferences` + `coach_nudge_log` + engine `shouldSendNudge`
  — pre-requisito obrigatorio para os 3 nudges deste sprint.
- Storage existente ja expoe `walletService.recordWalletTransaction` (com transacoes
  multi-service atomicas — lesson #atomicidade), `storage.createGrindSession`,
  `storage.createPlannedTournament`. Coach-2B reusa esses primitives, NAO duplica logica.

## Usuarios
- **Jogador (pro / premium / admin):** dispara write tool via chat; recebe diff visual;
  confirma; recebe nudge proativo. Free NAO recebe write tools (`tools: []` no payload
  Anthropic — manter ADR-019 de Coach-1).
- **Founder/admin:** monitora `coach_actions` via admin dashboard (RF-10).

## Requisitos Funcionais

### RF-01: Tabela `coach_actions` + infraestrutura confirmation/undo

**Descricao:** Cria tabela `coach_actions` documentada nos ADRs do Coach-2A, agora com
suporte real a write tools. Estende `coachToolRunner` para 3 estados:
1. **`pending`** — write tool detectada (`requiresConfirmation=true`); registra em
   coach_actions; emite SSE event `tool_pending_confirmation`; NAO executa handler.
2. **`completed`** — apos user clica "Confirmar"; backend executa handler dentro de
   transaction; INSERT/UPDATE de payload_before antes da escrita real.
3. **`undone`** — apos user clica "Desfazer" dentro da janela de 5min; reverte usando
   payload_before.

**Schema `coach_actions` (criar agora — Sprint Coach-2A apenas planejou):**
```ts
export const coachActions = pgTable("coach_actions", {
  id: varchar("id").primaryKey().notNull(),                               // nanoid
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  chatSessionId: varchar("chat_session_id"),                              // FK soft (chat_sessions.id)
  messageId: varchar("message_id"),                                       // chat_messages.id que disparou
  toolUseId: varchar("tool_use_id"),                                      // id Anthropic Tool Use
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),                    // pending | executing | completed | failed | undone | expired
  input: jsonb("input"),                                                  // params Zod-validados
  result: jsonb("result"),                                                // wrapped ToolResult; truncado 32KB; so se auditLevel='persist'
  errorMessage: text("error_message"),
  payloadBefore: jsonb("payload_before"),                                 // estado antes da mutacao (write tools)
  payloadAfter: jsonb("payload_after"),                                   // estado apos mutacao (auxilia diff visual)
  affectedEntityType: varchar("affected_entity_type", { length: 32 }),    // 'wallet_transaction' | 'grind_session' | etc
  affectedEntityId: varchar("affected_entity_id"),                        // id da row criada/atualizada
  requiresConfirmation: boolean("requires_confirmation").default(false).notNull(),
  confirmedAt: timestamp("confirmed_at"),                                 // user clicou Confirmar
  undoExpiresAt: timestamp("undo_expires_at"),                            // confirmedAt + 5min
  undoneAt: timestamp("undone_at"),                                       // user clicou Desfazer
  latencyMs: integer("latency_ms"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_coach_actions_user_status").on(table.userId, table.status, table.createdAt),
  index("idx_coach_actions_session").on(table.chatSessionId),
  index("idx_coach_actions_tool").on(table.toolName, table.status, table.createdAt),
  index("idx_coach_actions_undo_window").on(table.userId, table.undoExpiresAt),  // scan undoable acoes
]);
```

**Fluxo write tool:**
```
LLM emite tool_use (write)
  ↓
coachToolRunner detecta requiresConfirmation=true
  ↓
INSERT coach_actions (status='pending', input, payload_before=null, requires_confirmation=true)
  ↓
SSE: tool_pending_confirmation { actionId, toolName, input, diffPreview, undoWindowMs: 300000 }
  ↓
Frontend renderiza CoachActionConfirmCard com botao Confirmar / Cancelar
  ↓
USER clicou Confirmar?
  → POST /api/coach/actions/:id/confirm
    → BEGIN TRANSACTION
      → SELECT coach_actions WHERE id=$1 AND user_id=$2 FOR UPDATE
      → fetchPayloadBefore() (snapshot do estado afetado)
      → UPDATE coach_actions SET payload_before=..., status='executing'
      → handler.execute(input, ctx) (cria/atualiza row no domain)
      → UPDATE coach_actions SET payload_after=..., affected_entity_*=..., status='completed', confirmed_at=NOW(), undo_expires_at=NOW()+5min
    → COMMIT
    → SSE: tool_confirmed { actionId, payloadAfter, undoExpiresAt }
  → USER clicou Cancelar?
    → POST /api/coach/actions/:id/cancel
    → UPDATE coach_actions SET status='expired'
    → SSE: tool_cancelled { actionId }
  → User nao agiu em 30 min (timeout janela "pending")?
    → Cron cleanup: UPDATE coach_actions SET status='expired' WHERE status='pending' AND created_at < NOW()-30min
```

**Fluxo undo:**
```
USER clica Desfazer (dentro de undoExpiresAt)
  ↓
POST /api/coach/actions/:id/undo
  ↓
BEGIN TRANSACTION
  → SELECT coach_actions WHERE id=$1 AND user_id=$2 AND status='completed' AND undo_expires_at > NOW() FOR UPDATE
  → handler.undo(payloadBefore, payloadAfter, ctx)  (reverte mutacao)
  → UPDATE coach_actions SET status='undone', undoneAt=NOW()
COMMIT
  ↓
SSE (canal session ativo): tool_undone { actionId }
+ retorno HTTP 200
```

**Regras de negocio:**
- `requires_confirmation=true` em TODAS write tools. Sem opt-out neste sprint.
- Janela de undo: 5 minutos exatos a partir de `confirmedAt`. Apos expirar, undo retorna 410.
- Apos `confirmed_at`, mudancas em coach_actions mantem audit trail (NUNCA deleta row).
- Cancelar pending action eh equivalente a "nao confirmou" — nada eh executado no domain.
- Race condition: 2 confirms paralelos => `FOR UPDATE` segura linha; segundo retorna 409
  `already_confirmed`.
- Audit level persist em writes: `result` armazenado para reprodutibilidade. Truncar 32KB.
- Lesson #atomicidade (#194): handler.execute aceita `tx` opcional vindo do caller e NAO
  abre tx propria — ownership do commit/rollback fica em coachToolRunner.

**Endpoints:**

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | /api/coach/actions/:id/confirm | Executa write tool pending | JWT |
| POST | /api/coach/actions/:id/cancel | Cancela pending | JWT |
| POST | /api/coach/actions/:id/undo | Reverte completed dentro da janela 5min | JWT |
| GET | /api/coach/actions/:id | Le 1 action (alimenta diff visual) | JWT |

**Resposta POST /confirm (200):**
```ts
{
  id: string,
  status: 'completed',
  payloadAfter: object,
  affectedEntityType: string,
  affectedEntityId: string,
  undoExpiresAt: string,    // ISO
  diff: { added: object, removed: object, changed: object }, // pra UI
}
```

**Respostas erro:**

| Status | Quando | Body |
|---|---|---|
| 200 | OK | shape acima |
| 400 | id invalido | `{ message: 'invalid_id' }` |
| 401 | sem JWT | `{ message: 'Nao autenticado' }` |
| 403 | action de outro user | `{ message: 'Acesso negado' }` |
| 404 | action nao existe | `{ message: 'Action nao encontrada' }` |
| 409 | confirm em status != pending | `{ message: 'already_confirmed' \| 'expired' \| 'cancelled' }` |
| 410 | undo apos undoExpiresAt | `{ message: 'undo_window_expired' }` |
| 422 | handler validation pos-confirm | `{ message: 'execution_failed', details }` |
| 500 | erro interno | `{ message: 'internal_error' }` |

**Criterio de aceitacao:**
- [ ] Tabela coach_actions criada + indices.
- [ ] `coachToolRunner` detecta `requiresConfirmation=true` e NAO chama handler ate
  `/confirm`.
- [ ] SSE event `tool_pending_confirmation` emitido com `actionId` + `input` + diff
  preview (snapshot do estado atual da entidade que vai mudar).
- [ ] POST /confirm executa handler dentro de transaction; payload_before salvo ANTES de
  qualquer mutacao no domain.
- [ ] POST /undo dentro da janela 5min reverte com sucesso. Apos 5min: 410.
- [ ] POST /undo em action `status='undone'` => 409.
- [ ] Race: 2 /confirm paralelos => 1 OK + 1 retorna 409.
- [ ] Cron cleanup de pending > 30 min existe e roda 1x/min.
- [ ] Lesson #atomicidade: tests de regressao validam que falha em handler.execute reverte
  payload_before insertado na mesma tx.

**Edge cases:**
- User confirma apos 25 min (still pending, antes do cleanup). Funciona normal.
- User confirma apos 31 min (cleanup ja marcou expired). 409 expired.
- Anthropic fecha stream antes de SSE confirmar. action fica pending — cleanup roda
  normalmente.
- payload_before fica null quando `affectedEntityType` representa criacao nova
  (ex: novo wallet_transaction). Documentado: undo deleta a row criada.

---

### RF-02: `record_wallet_transaction` (write tool)

**Descricao:** Coach registra transacao em wallet do user (deposito, saque, rakeback,
ajuste). Casos cobrendo dor D4 (bankroll & FX). Reusa `walletService.recordWalletTransaction`
ja existente — NAO reescrever logica.

**Description (para LLM):**
> "Registra uma transacao financeira em uma das wallets do usuario (deposito, saque,
> rakeback recebido, ajuste manual). Use SEMPRE quando user mencionar movimentacao
> financeira que ainda nao registrou. Sempre confirme com o user antes."

**Input schema (Zod):**
```ts
z.object({
  walletId: z.string(),                          // FK wallets.id (do user)
  amount: z.number().positive(),                 // Sempre positivo; type define direcao
  currency: z.enum(['USD','BRL','EUR','CNY']),   // Moeda nativa da wallet
  type: z.enum(['deposit','withdrawal','rakeback','manual_adjustment']),
  reason: z.enum([
    'deposit', 'withdrawal', 'rakeback',
    'transfer_in', 'transfer_out',
    'manual_correction'
  ]),                                            // Subset de WALLET_TX_REASONS_P0
  occurredAt: z.string().optional(),             // ISO; default = now
  notes: z.string().max(500).optional(),
})
```

**Validacoes adicionais (`superRefine`):**
- `walletId` deve pertencer ao `ctx.userId` (storage check).
- `currency` deve bater com `wallet.currency` (sem conversao automatica neste tool — se
  user quer registrar em moeda diferente, deve criar transfer).
- `type='withdrawal'` requer wallet.balance native >= amount (storage check; sem ir
  negativo pelo Coach).

**Output:**
```ts
{
  walletId: string,
  walletName: string,
  transactionId: string,         // wallet_transactions.id criado
  amountNative: number,
  currency: string,
  newBalanceNative: number,
  newBalanceUSD: number,         // pos-conversao (FX rate snapshot)
  fxRateUsed: number | null,     // null para USD wallet
  occurredAt: string,
  message: string                // pt-BR confirmacao humana
}
```

**Diff visual no card de confirmation:**
```
Antes: PokerStars USD wallet — Saldo $1.450,00
Apos:  PokerStars USD wallet — Saldo $1.500,00
       Transacao: deposito $50,00 em 2026-05-02 14:30
```

**Undo:**
- Marca `wallet_transactions.id` com `reversedByActionId=action.id` + cria row reverse
  (delta inverso) usando o mesmo `walletService` com `reason='manual_correction'` e
  `notes='Desfeito via Coach action <id>'`. NAO faz hard delete (audit ledger imutavel
  — ADR-058).

**Criterio de aceitacao:**
- [ ] Tool registrada em `server/coachTools/handlers/recordWalletTransaction.ts`.
- [ ] `requiresConfirmation: true`, `auditLevel: 'persist'`, `gateByTier: ['pro','premium','admin']`.
- [ ] Walletid de outro user => Zod custom error `wallet_not_owned`.
- [ ] Currency mismatch => Zod custom error `currency_mismatch`.
- [ ] withdrawal > balance => Zod custom error `insufficient_balance`.
- [ ] Diff card mostra "Antes/Apos" + "Transacao: tipo R$ X,YZ em {data}".
- [ ] Undo reverso cria nova row com delta oposto + amarrado a action via `reversedByActionId`.
- [ ] Undo apos 5min => 410.
- [ ] Cobertura por moeda BRL + USD + EUR (3 cenarios).
- [ ] Test integration: confirma em transaction; rollback se snapshot falhar (lesson #atomicidade).

**Edge cases:**
- Wallet inativa (`wallet.isActive=false`) => Zod error `wallet_inactive`.
- amount < 0 — Zod rejeita (positive).
- Idempotencia: 2 chamadas identicas em < 1s pelo Coach (LLM se repete) — sem proteccao
  hard. Aceitar registro duplicado; user ve 2 confirmation cards e cancela 1. Documentar
  como acceptable risk.

**Telemetria:**
- `coach.tool.record_wallet_transaction.confirmed`
- `coach.tool.record_wallet_transaction.cancelled`
- `coach.tool.record_wallet_transaction.undone`

---

### RF-03: `start_grind_session` + `log_session_completed` (write tools)

**Descricao:** Duas tools para o ciclo de sessao — Coach pode iniciar sessao planejada
(transitar `planned -> active`) e marcar como completada (transitar `active -> completed`
com metricas opcionais). Cobre dor D2 (debrief pos-sessao) e D3 (volume tracking).

#### `start_grind_session`

**Description (LLM):**
> "Inicia uma sessao de grind para o user. Aceita uma `grindSessionId` ja planejada (status
> 'planned') OU cria sessao instant. Sempre confirme antes de iniciar."

**Input schema:**
```ts
z.object({
  mode: z.enum(['from_planned','instant']),
  plannedSessionId: z.string().optional(),       // requerido se mode='from_planned'
  startTime: z.string().optional(),              // ISO; default = now (instant)
  notes: z.string().max(500).optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'from_planned' && !val.plannedSessionId) {
    ctx.addIssue({ code: 'custom', message: 'plannedSessionId obrigatorio em mode=from_planned' });
  }
})
```

**Output:**
```ts
{
  sessionId: string,
  status: 'active',
  startedAt: string,
  message: string
}
```

**Diff:** Antes "Sessao planejada 2026-05-02 19:00 (status=planned)" → Apos "Sessao ativa
desde 2026-05-02 19:05".

**Undo:** Reverte `status` para `planned` (se mode=from_planned) ou DELETE row (se
mode=instant). Limpa `start_time`.

**Criterio:**
- [ ] mode=from_planned com `plannedSessionId` de outro user => 403/Zod error.
- [ ] mode=from_planned com `plannedSessionId.status != 'planned'` => Zod error
  `session_not_planned`.
- [ ] mode=instant cria row com `status='active'` + `date=now`.
- [ ] Undo de from_planned: status volta para 'planned', startTime=null.
- [ ] Undo de instant: row deletada (cascade em filhos limpos).

#### `log_session_completed`

**Description (LLM):**
> "Marca sessao como completed e registra metricas finais (volume, profit, ITM, etc).
> Use ao final da sessao quando user fizer debrief."

**Input schema:**
```ts
z.object({
  sessionId: z.string(),
  endTime: z.string().optional(),
  volume: z.number().int().nonnegative().optional(),
  profit: z.number().optional(),
  fts: z.number().int().nonnegative().optional(),
  cravadas: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
})
```

**Output:**
```ts
{
  sessionId: string,
  status: 'completed',
  durationMinutes: number,
  message: string
}
```

**Undo:** Reverte status para `'active'` + restaura `end_time`, `volume`, `profit`, etc.
para os valores em payload_before.

**Criterio:**
- [ ] Session de outro user => 403.
- [ ] Session com status != 'active' => 409.
- [ ] Metricas opcionais: tool aceita logging parcial (so volume + profit). Nao zera
  outros.
- [ ] Undo restaura status='active' + valores anteriores integralmente.

**Edge cases compartilhados:**
- session com `bankrollManagementEnabled=true` precisa rodar reconcile apos completed.
  Coach NAO faz reconcile (eh fluxo aparte UX). Documentar: deixa sessao em completed
  sem reconcile, user faz manual depois.
- session ja tem `end_time` antes do tool — NAO sobrescreve a menos que `endTime` venha
  no input. Documentar.

---

### RF-04: `register_tournament_in_grade` (write tool)

**Descricao:** Coach adiciona torneio ao grade-planner. Cobre dor D5 (selection — Coach
sugere via `get_tournament_suggestions`, depois user confirma e Coach adiciona).

**Description (LLM):**
> "Adiciona um torneio ao grade do user. Use APOS sugerir via get_tournament_suggestions
> e ouvir interesse explicito. Sempre confirme."

**Input schema:**
```ts
z.object({
  templateId: z.string().optional(),             // libraryTemplateId (preferido)
  manualEntry: z.object({
    site: z.string(),
    name: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    type: z.enum(['Vanilla','PKO','Mystery','Satellite']),
    speed: z.enum(['Normal','Turbo','Hyper']),
    buyIn: z.number().positive(),
    guaranteed: z.number().nonnegative().optional(),
  }).optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  profile: z.enum(['A','B','C']).default('A'),
  prioridade: z.number().int().min(1).max(3).default(2),
}).superRefine((val, ctx) => {
  if (!val.templateId && !val.manualEntry) {
    ctx.addIssue({ code: 'custom', message: 'templateId OU manualEntry requerido' });
  }
  if (val.templateId && val.manualEntry) {
    ctx.addIssue({ code: 'custom', message: 'Apenas um — templateId XOR manualEntry' });
  }
})
```

**Output:**
```ts
{
  plannedTournamentId: string,
  name: string,
  site: string,
  dayOfWeek: number,
  time: string,
  message: string                // ex: "Adicionado ao grade segunda 19:00 — Big $22"
}
```

**Diff:**
```
Antes: 8 torneios na grade (segunda)
Apos:  9 torneios na grade (segunda) — novo: Big $22 (PokerStars, 19:00, perfil A)
```

**Undo:** DELETE row planned_tournaments (CASCADE em filhos como session_tournaments
deveria estar vazia para tournament novo).

**Criterio:**
- [ ] templateId valido + dayOfWeek + profile cria row em `planned_tournaments`.
- [ ] Auto-fill de campos opcionais: `name`, `site`, `buyIn`, `guaranteed`, `lateRegMinutes`,
  `startingStack`, `gameType`, `allowsAddOn`, `allowsReentry` puxados de
  `tournament_library` quando templateId presente.
- [ ] manualEntry sem templateId cria row sem `libraryTemplateId`.
- [ ] templateId de outro user nao-public => Zod error `template_not_accessible`.
- [ ] Sequencia "tres torneios em 1 turn" testa que tool runner respeita ADR-026 (limit
  5/turn) — todos confirmam ok.
- [ ] Undo apaga row e libera chat_session.

**Edge cases:**
- templateId aponta para entry deletada da library => Zod error.
- dayOfWeek=7 => Zod rejeita.
- Conflict de horario: 2 torneios mesmo time, mesmo profile, mesmo day => permite (no
  validation hard de conflict no schema atual). Documentar.

---

### RF-05: `log_leak_focus` + `verify_leak_progress` (write tools)

**Descricao:** Tools para gerenciar foco do mes em leak. Cobre dor D6 (identificacao +
acompanhamento de leak).

#### `log_leak_focus`

**Description (LLM):**
> "Define ou atualiza o foco de leak do mes do user (ex: '3bet preflop', 'turn cbet').
> Apos detectar leak via find_top_leaks, pergunte se user quer focar; entao registre."

**Input schema:**
```ts
z.object({
  leakCode: z.string(),                          // ex: 'low_itm_turbos', 'negative_roi_pko'
  description: z.string().max(200),              // pt-BR humano
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  baselineStat: z.object({
    statKey: z.string(),                         // ex: 'roi.category=PKO'
    currentValue: z.number(),
    sampleSize: z.number().int().positive(),
  }),
  studyPlanNotes: z.string().max(1000).optional(),
})
```

**Output:**
```ts
{
  leakFocusId: string,
  leakCode: string,
  targetMonth: string,
  message: string
}
```

**Schema novo `coach_leak_focus`:**
```ts
export const coachLeakFocus = pgTable("coach_leak_focus", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  leakCode: varchar("leak_code", { length: 64 }).notNull(),
  description: text("description").notNull(),
  targetMonth: varchar("target_month", { length: 7 }).notNull(),         // YYYY-MM
  baselineStatKey: varchar("baseline_stat_key", { length: 128 }).notNull(),
  baselineValue: decimal("baseline_value").notNull(),
  baselineSampleSize: integer("baseline_sample_size").notNull(),
  studyPlanNotes: text("study_plan_notes"),
  status: varchar("status", { length: 16 }).default("active"),            // active | resolved | abandoned
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_coach_leak_focus_user_month").on(table.userId, table.targetMonth),
  uniqueIndex("uniq_coach_leak_focus_user_code_month").on(table.userId, table.leakCode, table.targetMonth),
]);
```

**Undo:** UPDATE status='abandoned' + restaura row anterior se sobrescrita.

**Criterio:**
- [ ] Cria row em coach_leak_focus.
- [ ] UNIQUE evita duplicar foco mesmo leakCode + month — Coach orientado a UPDATE.
- [ ] Conflict (UNIQUE violation) => 409 + sugestao "ja existe foco ativo nesse leak.
  quer atualizar?".
- [ ] Test integration que valida lookup `find_top_leaks` returnou `code`, depois Coach
  registra com mesmo `leakCode`.

#### `verify_leak_progress`

**Description (LLM):**
> "Verifica progresso do foco de leak ativo do user, comparando stat atual vs baseline."

**Input schema:**
```ts
z.object({
  leakFocusId: z.string().optional(),            // se omitido, retorna o ativo do mes atual
})
```

**Output:**
```ts
{
  leakFocusId: string,
  leakCode: string,
  description: string,
  baseline: { value: number, sampleSize: number, statKey: string },
  current: { value: number, sampleSize: number, statKey: string },
  delta: number,                                  // current - baseline
  improvementPct: number,                         // (delta / |baseline|) * 100
  status: 'improving' | 'stable' | 'regressing' | 'insufficient_sample',
  message: string,
}
```

**Note:** verify_leak_progress NAO eh write tool — eh READ. NAO requer confirmation.
`requiresConfirmation: false`, `auditLevel: 'log'`. Listed aqui pra agrupar com leak focus.

**Criterio:**
- [ ] Sem `leakFocusId`: retorna o foco com status='active' e targetMonth=mes atual.
- [ ] Sem foco ativo: retorna `{ note: 'no_active_focus', message: '...' }`.
- [ ] Calcula `current` re-rodando query do `baselineStatKey` no storage atual.
- [ ] sampleSize current < 30 => `status='insufficient_sample'`.
- [ ] improvement > 10% relativo => `improving`. < -10% => `regressing`. Entre =>
  `stable`.

**Edge cases:**
- `baselineSampleSize` pequena (n=15) ja era frageis; comparativo nao eh confiavel.
  Coach output eh orientado a confidence tag (lesson #11) — incluir `[confianca: baixa]`
  inline.
- statKey nao mais suportado (refactor de storage entre month start e verify) — retorna
  `note: 'stat_key_unsupported'`. Documentar.

---

### RF-06: `log_study_session` (write tool)

**Descricao:** Coach registra sessao de estudo do user (cobre dor D7 — estudo). Reusa
tabela `study_sessions` existente.

**Description (LLM):**
> "Registra que o user fez uma sessao de estudo. Use quando user mencionar que estudou
> (solver, hand review, video, library, mental). Confirme antes."

**Input schema:**
```ts
z.object({
  topic: z.enum(['solver','hand_review','video','library','mental','other']),
  durationMinutes: z.number().int().min(5).max(480),
  date: z.string().optional(),                    // ISO; default = now
  studyCardId: z.string().optional(),             // FK study_cards
  insights: z.string().max(2000).optional(),
  focusScore: z.number().int().min(0).max(10).optional(),
  productivityScore: z.number().int().min(0).max(10).optional(),
})
```

**Output:**
```ts
{
  studySessionId: string,
  topic: string,
  durationMinutes: number,
  date: string,
  message: string
}
```

**Diff:**
```
Antes: 0 sessoes registradas hoje
Apos:  1 sessao registrada — solver, 45min, foco=8
```

**Undo:** DELETE row study_sessions.

**Criterio:**
- [ ] Cria row em study_sessions com `activities=[topic]`.
- [ ] studyCardId de outro user => Zod error.
- [ ] Aceita logging sem studyCardId (estudo livre).
- [ ] Undo deleta row.

**Edge cases:**
- duration < 5min — Zod rejeita (provavelmente erro de digitacao do user).
- duration > 480min (8h) — Zod rejeita (suspicious).

---

### RF-07: B-SNAPSHOT proativo (dia 28 — fechamento bankroll)

**Descricao:** Cron job mensal dispara conversa proativa no dia 28 (timezone do user)
cobrando snapshot de bankroll do mes. Cobre dor D4.

**Trigger:**
- Cron `0 9 28 * *` rodando 1x/h (resilient — re-run se day already processed eh idempotente).
- Para cada user com `users.timezone`, calcular hora local; disparar quando hora local
  for 9h.

**Fluxo:**
1. Cron acorda. Itera users com `subscriptionPlan IN ('pro','premium')` (free nao recebe
   B-SNAPSHOT — feature gate).
2. Para cada user:
   - `shouldSendNudge(userId, { category: 'B-SNAPSHOT', cycleKey: '<YYYY-MM>' })` (engine
     RF-03 do Sprint 0).
   - Se ALLOW: gap-check `hasSnapshotThisMonth(userId, cycleKey)` (R5 — valida estado
     real, nao confia em flag stale).
   - Se ja tem snapshot do mes: SKIP + log "skip_already_snapshotted".
   - Senao:
     - Cria chatSession do tipo `tournament` (categoria default — nao mental).
     - Insere primeira chatMessage do assistant com texto template ja preenchido.
     - INSERT coach_nudge_log com status='sent', cycleKey, chatSessionId.
     - SSE/email notification (canal definido em prefs).

**Mensagem template (parametrizavel):**
```
Mes acaba em 3 dias. Bora fechar o snapshot da banca?

Vi aqui que voce tem {N} wallets ativas:
{lista de wallets com saldo native + USD}

Posso registrar o snapshot do mes ou voce prefere puxar saldos atualizados primeiro?

[Botoes inline: "Registrar snapshot agora" | "Atualizar saldos" | "Lembrar amanha"]

[fonte: storage:bankroll_snapshots:current_month]
```

**Acao "Registrar snapshot agora":** dispara write tool (futuro Sprint Coach-3) ou simplesmente
ja chama `walletService.createBankrollSnapshot(userId, { reason: 'monthly', notes: 'auto-coach' })`.

**Sprint 2B entrega:**
- Cron + idempotencia gap-check.
- Geracao de chatSession + first message.
- Botoes "Lembrar amanha" => UPDATE coach_nudge_log SET snoozeUntil=now+24h, status='snoozed'.
  Engine respeita: rerun no dia 29 verifica ALLOW novamente.

**Sprint 2B NAO entrega:**
- Tool nova `create_bankroll_snapshot` — Coach-3.
- Email com snapshot pre-rendered — Coach-3.

**Criterio:**
- [ ] Cron registrado em servidor (node-cron ou agenda).
- [ ] Gap-check `hasSnapshotThisMonth(userId, cycleKey)` retorna true se ja tem snapshot
  com `reason='monthly'` ou `origin='manual'` no mes corrente.
- [ ] User com `users.timezone='America/Los_Angeles'` recebe nudge as 9h LA, nao 9h BRT.
- [ ] Idempotencia: cron rodando 24x no dia 28 nao gera 24 nudges (engine bloqueia via
  `already_sent_this_cycle`).
- [ ] User free nao recebe B-SNAPSHOT (gate por plano).
- [ ] Botao "Lembrar amanha" updates snoozeUntil; rerun no dia 29 dispara novamente.
- [ ] Test: simulacao com `vi.useFakeTimers` avancando para dia 28 9am, valida 1 nudge
  enviado por user. Avancando para dia 29, valida 1 segundo nudge para users que clicaram
  snooze.
- [ ] Telemetria: `coach.nudge.b_snapshot.sent`, `.dismissed`, `.engaged`.

**Edge cases:**
- User criou conta em 27/05; cron roda em 28/05. ALLOW (sem cycleKey anterior). Documentar
  como aceitavel.
- Mes com 28 dias (fevereiro nao-bissexto). Cron roda em 28 (ultimo dia do mes). Funciona.
- User com `bankrollManagementEnabled=false` => SKIP (gate por feature flag).
- DB falha em meio do iterate users => log error + continua proximo user. NAO crasha cron.

---

### RF-08: B-LEAK proativo (apos upload CSV)

**Descricao:** Apos upload de CSV ser processado com sucesso, rodar `detectLeaks` em
background; se detectar leak NOVO (nao mencionado em ultimas 30d), disparar conversa
proativa. Cobre dor D6.

**Trigger:**
- Hook em `routes/upload.ts` apos commit dos novos torneios. Async (nao bloqueia HTTP
  response do upload).
- Para o user que fez upload: rodar `detectLeaks(userId)` (filtro: minSeverity='medium').

**Fluxo:**
1. Apos upload commit:
   - Background job `processCoachLeakDetection({ userId, uploadId })`.
   - Roda `detectLeaks(userId, { minSeverity: 'medium', limit: 5 })`.
   - Para cada leak detectado:
     - Verifica se ja foi mencionado em chat_messages de assistant nas ultimas 30 dias
       (busca por `leak.code` em content). Se sim => SKIP.
     - Se nao mencionado: encara como "leak novo" — coleta para nudge.
   - Se >= 1 leak novo:
     - `shouldSendNudge(userId, { category: 'B-LEAK', cycleKey: '<YYYY-WW>' })`.
     - Se ALLOW: cria chatSession + first message com lista dos leaks novos.
     - INSERT coach_nudge_log.

**Mensagem template:**
```
Acabei de processar seus {N} torneios novos.

Detectei {M} leak(s) que nao discutimos antes:
{lista de leaks com severidade + evidencia + sample}

Quer revisar agora ou prefere mais tarde?

[Botoes: "Vamos discutir" | "Mais tarde"]
```

**Sprint 2B NAO entrega:**
- Tool inline pra registrar foco direto do nudge — user precisa abrir conversa e Coach
  invoca `log_leak_focus` na resposta. Documentar limitacao.

**Criterio:**
- [ ] Hook em `routes/upload.ts` apos commit dispara job (queue ou async direto).
- [ ] Job roda `detectLeaks` + filtra por "ja mencionado em 30d" via grep simples em
  chat_messages.content.
- [ ] Se 0 leaks novos => SKIP sem nudge.
- [ ] Se >= 1 leak novo => 1 nudge (mesmo se 5 leaks; agrupa em uma mensagem).
- [ ] cycleKey semanal (`YYYY-WW`) — engine garante max 1/semana mesmo se user fizer 3
  uploads na semana.
- [ ] Test E2E: upload de CSV mock com torneios PKO de ROI=-15% => leak `negative_roi_pko`
  novo => nudge enviado.
- [ ] Test: 2o upload na mesma semana com mesmos leaks => SKIP (cycleKey).
- [ ] Test: 2o upload com leak DIFERENTE da 1a vez na mesma semana => DENY por cycleKey
  (decisao consciente: 1 nudge B-LEAK por semana, mesmo se leaks diferentes; user pode
  abrir conversa manualmente).

**Edge cases:**
- Upload com 0 torneios novos => 0 leaks novos => SKIP.
- detectLeaks falha (storage error) => log error, NAO dispara nudge. Upload nao eh
  afetado.
- User opt-out B-LEAK (prefs.nudges.bLeak=false) => engine DENY. Nenhum job extra rodado.
- Background queue NAO existe ainda no projeto. Sprint 2B usa `setImmediate` async no
  request handler; documentar como follow-up "queue real (BullMQ ou similar) em Coach-3".

---

### RF-09: B-STUDY proativo (foco escolhido sem update 7d)

**Descricao:** Cron diario verifica focos de leak ativos sem `study_session` registrada
nos ultimos 7 dias. Dispara nudge cobrando estudo. Cobre dor D7.

**Trigger:**
- Cron `0 19 * * *` (1x/dia 19h timezone do user).
- Itera users com plan in (pro, premium).
- Para cada user:
  - `getActiveLeakFocus(userId, currentMonth)` (RF-05 query).
  - Se sem foco ativo => SKIP.
  - Para cada foco ativo:
    - Conta study_sessions do user nos ultimos 7d com `studyCardId` linked OR insights
      mencionando `leakCode`. Heuristica simples: NULL studyCardId mas insights match
      `like %{leakCode}%`.
    - Se 0 sessoes => candidato a nudge.
  - Se candidato:
    - `shouldSendNudge(userId, { category: 'B-STUDY', cycleKey: '<YYYY-WW>' })`.
    - Se ALLOW: cria chatSession + message.

**Mensagem:**
```
Voce escolheu focar em "{description}" no inicio do mes.

Faz 7 dias que nao registro estudo nesse foco.

Quer agendar 30 min hoje? Posso ate registrar agora se voce quiser fazer rapido.

[Botoes: "Bora estudar agora" | "Agendar amanha" | "Pular essa semana"]
```

**Criterio:**
- [ ] Cron 19h timezone-aware.
- [ ] Gap-check: 0 study_sessions em 7d.
- [ ] cycleKey semanal — max 1 nudge B-STUDY por semana mesmo se user tem 3 focos ativos
  (agrupa em 1 nudge ou pega o primeiro? Decisao: pega o foco com baselineSampleSize maior
  — mais estatistico).
- [ ] User sem foco => SKIP.
- [ ] User com 1+ study_session no foco em 7d => SKIP.
- [ ] Botao "Pular essa semana" => snoozeUntil = +7d.

**Edge cases:**
- User registrou study no dia 7 exato (boundary). Sprint usa `>= now() - INTERVAL '7 days'`
  (inclusive). Documentar.
- 2 focos ativos com mesmo baselineSampleSize — pega o mais antigo (createdAt asc).
- User criou foco ha 3 dias mas ainda nao estudou — boundary: nudge so apos 7 dias do
  createdAt do foco MAIS RECENTE. Documentar para evitar alarme prematuro.

---

### RF-10: Coach actions UI — diff visual + undo 5min + audit integration

**Descricao:** UI para o user interagir com write tools no chat. 3 componentes:

1. **`CoachActionConfirmCard`** — renderiza no chat quando SSE event
   `tool_pending_confirmation` chega. Mostra:
   - Titulo: nome amigavel da tool (ex: "Registrar transacao na PokerStars wallet").
   - Diff visual: 2 colunas (Antes / Apos) com fields que mudam.
   - Input expandido: parametros que vao ser usados.
   - Botoes: `Confirmar` (primary) / `Cancelar` (secondary).
   - Loading state durante POST /confirm.
   - data-testid: `coach-action-confirm-<actionId>`.

2. **`CoachActionUndoBadge`** — renderiza apos confirm, com timer regressivo 5min:
   - Texto "Confirmado. Desfazer em 4:32" — atualiza 1x/seg.
   - Botao `Desfazer` desabilita apos 5min com texto "Janela expirada".
   - data-testid: `coach-action-undo-<actionId>`.

3. **`CoachActionsAuditTimeline`** — pagina /settings/coach-actions ja entregue no Sprint
   0. Sprint 2B EXTENDE para mostrar tipos `tool` (writes). Adapta filtro `type` para
   incluir `tool`. Quando item eh tool com payload_after, mostrar diff inline. Botao
   `Desfazer` se `undoExpiresAt > now`.

**Criterio:**
- [ ] CoachActionConfirmCard recebe `tool_pending_confirmation` e renderiza com botoes
  funcionais.
- [ ] POST /confirm em sucesso:
  - Substitui card por CoachActionUndoBadge.
  - Timer regressivo conta de 5:00 a 0:00.
  - Apos 0:00, botao Desfazer desabilitado.
- [ ] POST /confirm em falha (422/500): card mostra erro, botoes voltam habilitados.
- [ ] POST /undo dentro da janela: badge muda para "Desfeito" + restaura visualmente
  (preto e branco).
- [ ] Audit timeline (Sprint 0 + extension) mostra tools com diff expandido.
- [ ] Lesson #1 (hooks first): early returns vem APOS hooks.
- [ ] Lesson #2 (testid): TODOS os elementos com data-testid estavel.
- [ ] Test integration: stream SSE simulado emit `tool_pending_confirmation`, render card,
  click Confirm, mock fetch /confirm, valida transition.

**Edge cases:**
- 2 tools pending no mesmo turn — render multiplos cards empilhados.
- User refresh entre confirm e undo — useQuery cache em `['coach-actions', actionId]`
  recarrega state. (Lesson #estado-persistente).
- WebSocket/SSE drops mid-stream — POST /confirm ainda funciona via REST (nao depende de
  SSE estar vivo).
- User clicou Confirm 2 vezes rapido — POST idempotente: backend retorna 409 no segundo;
  UI exibe estado correto via re-fetch.

**UI patterns sugeridos:**
- Diff: tabela 2 colunas, linhas vermelhas/verdes para campos changed (CSS `bg-red-50`,
  `bg-green-50`).
- Timer: `react-use` `useInterval` 1000ms.
- Confirmation card cor amber border-l (visual distintivo "needs action").
- Undo badge cor green border-l (positivo, mas reversivel).

---

## Requisitos Nao-Funcionais

- **Performance:**
  - POST /confirm < 500ms P95 (transaction commit + storage write).
  - POST /undo < 500ms P95.
  - Cron B-SNAPSHOT: total runtime < 60s para 1k users.
- **Seguranca:** ownership rigoroso em TODOS endpoints + tools (ja convencao Grindfy).
- **Observabilidade:** todas write tools logam `coach.tool.<name>.<event>` e gravam
  coach_actions row (audit trail imutavel).
- **Disponibilidade:** falha em 1 user durante cron NAO crasha cron — log + continue.
- **Custo Anthropic:** alvo `<$50/semana` para alpha 10 users (mantem prompt caching ja
  ativo Coach-1).
- **Rate limit Coach (ADR-026):** 5 tools/turn — mantido. Write tools contam.

## Endpoints Previstos (resumo)

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | /api/coach/actions/:id/confirm | Executa write pending | JWT |
| POST | /api/coach/actions/:id/cancel | Cancela pending | JWT |
| POST | /api/coach/actions/:id/undo | Reverte completed (<5min) | JWT |
| GET | /api/coach/actions/:id | Le action individual | JWT |

## Modelos de Dados Afetados

### `coach_actions` (NOVA — finalmente migra)
RF-01.

### `coach_leak_focus` (NOVA)
RF-05.

### `users` / `wallets` / `wallet_transactions` / `grind_sessions` /
### `planned_tournaments` / `study_sessions` (sem alteracao)
Reuso direto. Toolings escrevem via storage existing.

### `coach_nudge_log` (Sprint 0; este sprint apenas USA)

## Integracoes Externas
- Anthropic API (continua Sonnet + caching).
- Nenhuma nova integracao externa.

## Cenarios de Teste Derivados

### Happy Path
- [ ] User pro chats: "registra um deposito de $50 na PokerStars". Coach invoca
  `record_wallet_transaction`; card de confirmacao aparece; user clica Confirmar; row em
  wallet_transactions criada; balance atualizado; UndoBadge aparece com timer 5:00; user
  faz outra coisa, timer expira.
- [ ] B-SNAPSHOT dia 28 9am: user pro recebe chat session aberta com prompt de snapshot;
  abre, conversa, registra snapshot via fluxo do bankroll module.
- [ ] B-LEAK pos-upload: user faz upload com torneios novos; 30s depois, abre app e ve
  notification de "Coach detectou leak novo".

### Validacao de Input
- [ ] record_wallet_transaction com walletId de outro user => Zod custom error
  `wallet_not_owned`.
- [ ] register_tournament_in_grade com dayOfWeek=8 => Zod rejeita.
- [ ] log_study_session com durationMinutes=2 => Zod rejeita.
- [ ] log_leak_focus com targetMonth=`2026-13` => Zod rejeita.

### Regras de Negocio
- [ ] Race condition: 2 POST /confirm da mesma action em paralelo => 1 OK + 1 retorna
  409 `already_confirmed`.
- [ ] Undo apos undoExpiresAt expirar (mock relogio +6min) => 410 `undo_window_expired`.
- [ ] register_tournament_in_grade XOR templateId/manualEntry — fornecer ambos => Zod
  error.
- [ ] B-STUDY: user com foco criado ha 3 dias e 0 study_sessions => SKIP (boundary 7 dias).
- [ ] Frequency cap (Sprint 0 engine): user recebeu 3 nudges hoje (max=3); 4o eh DENY.

### Edge Cases (lessons-learned aware)
- [ ] **Lesson #atomicidade (#194):** record_wallet_transaction confirm dentro de tx;
  forcar erro em createSnapshot pos-recordWalletTransaction => rollback de coach_actions
  + wallet_transactions juntos.
- [ ] **Lesson #3 (mocks idealizados):** test integration adicional valida shape REAL de
  `walletService.recordWalletTransaction` retornando `transactionId` + `newBalanceNative`
  + `newBalanceUSD` + `fxRateUsed` (NAO assumir baseado em test mock).
- [ ] **Lesson #vi.spyOn (#37):** tests de cron B-SNAPSHOT usam `vi.spyOn(console,'info')`
  com `clearMocks: true` na config — verificar que ja esta no vitest.config.ts da raiz.
- [ ] **Lesson #11 (default minimo):** UndoBadge NAO faz nada por default em hover/click
  fora dos botoes Confirmar/Desfazer. Cursor-help nos textos informativos, cursor-pointer
  so nos botoes.
- [ ] **Lesson #estado-persistente (#12):** state da action (timer, status) usa
  `useQuery({queryKey: ['coach-action', id], enabled: false})` + `setQueryData` em
  optimistic, NAO `useState` local — sobrevive a re-mount.
- [ ] **Lesson #atomicidade tx (#194):** se snapshot pos-recordWalletTransaction falhar,
  toda tx revertida. coach_actions volta para `pending`.
- [ ] Cron concorrente: 2 instancias do server rodando o mesmo cron 9am dia 28 => engine
  `shouldSendNudge` com `cycleKey` evita duplicacao (1 INSERT vence FOR UPDATE; segundo ja
  recebe `already_sent_this_cycle`).
- [ ] User deletado entre cron iterando e disparando: FK CASCADE + log skip.
- [ ] Anthropic API down (5xx) durante write tool execution: tool nem chega a coach_actions
  (LLM nao emite tool_use). Sem nudge gerado por falha de LLM.

## Fora de Escopo
- Tools `start_grind_session` em modo "instant com criar planejamento retroativo" (so 2
  modes: from_planned + instant criando row imediata).
- Tool `cancel_grind_session` (sem demanda forte; user tem UI direta).
- Email HTML para nudges B-* — Coach-3.
- Push notifications real para nudges — Coach-3.
- Background queue real (BullMQ/etc) — Coach-3.
- Daily/Weekly/Monthly Reports — Coach-3.
- B-VOLUME, B-GRADE, B-DOWNSWING nudges — Coach-3.
- C-game tracker, Mental Hand History, B-LIFE — Coach-4.
- Career goal tools — Coach-3.
- Tool nova `create_bankroll_snapshot` (Coach-3 entrega; Sprint 2B B-SNAPSHOT usa fluxo
  manual atual).

## Dependencias

### Sprint 0 (obrigatorio)
- `user_coach_preferences` table.
- `coach_nudge_log` table.
- `shouldSendNudge` engine.
- Audit page base UI.
- Citations + confidence rules in safety prompts.

### Features ja existentes (reuso)
- `walletService.recordWalletTransaction` (com `externalTx` parameter — lesson #194).
- `storage.createGrindSession`, `storage.updateGrindSession`.
- `storage.createPlannedTournament`.
- `storage.createStudySession`.
- `coachLeakDetection.detectLeaks`.
- `coachToolRunner` (Sprint 2A).
- ADR-023 tool registry, ADR-024 wrapping, ADR-026 limit.

### Coach-2A
- 6 read tools (`query_dimension`, `find_top_leaks`, `get_tournament_suggestions`,
  `explain_tournament_score`, `simulate_bankroll_scenario`, `read_user_hud_stats`) +
  Library 3 tools.

## Notas de Implementacao

- **`coachToolRunner`:** estender para detectar `requiresConfirmation` antes de chamar
  `handler.execute`. Se true, INSERT pending row, emit SSE, NAO executa.
- **Confirm flow:** novo endpoint `/api/coach/actions/:id/confirm` chama
  `runner.executeConfirmedAction(actionId, ctx)`. Runner abre tx, chama
  `handler.executeConfirmed(input, txCtx)`.
- **Tool registry pattern (ADR-023):** cada write tool tem 4 metodos novos:
  - `validate(input)` — Zod.
  - `executeConfirmed(input, ctx)` — comita mudanca e retorna `{payloadAfter,
    affectedEntityType, affectedEntityId}`.
  - `fetchPayloadBefore(input, ctx)` — snapshot do estado antes (chamado dentro da tx).
  - `undo(payloadBefore, payloadAfter, ctx)` — reverte mudanca.
- **diffPreview:** funcao utilitaria que compara payloadBefore vs payloadAfter e gera
  `{added, removed, changed}`. Pode ser custom por tool ou generico via JSON merge.
- **Idempotencia cron:** usar `coach_nudge_log` UNIQUE em `(user_id, category, cycleKey)`
  ou validacao no engine. Sprint 0 ja garante.
- **Schema migration drizzle-kit:** uma migration nova `0024_coach_2b_actions_leak_focus.sql`
  cria `coach_actions` + `coach_leak_focus`.

## Riscos

| Risco | Mitigacao |
|---|---|
| Lesson #194 (atomicidade tx multi-service) — undo de wallet tx pode dessincronizar com snapshots | Reusar `walletService` com parametro `externalTx`; coachToolRunner abre tx unica |
| Cron disparando duplicado em 2 instancias do server | UNIQUE coach_nudge_log + engine first-write wins |
| User confirma write tool acidentalmente (clicou Enter) | UndoBadge 5min + audit timeline persistente |
| Custo Anthropic estoura por LLM repetir tool calls em loop | ADR-026 limit 5/turn ja existe; testar com adversarial conversation |
| B-LEAK gera nudges em rajada apos backfill historico de uploads | Hook so dispara em uploads novos; backfill manual NAO triggar nudges |

## Pista para Test-Writer

1. **Tests integration de write tools devem usar transactions reais (not mocked)** —
   lesson #atomicidade. Tabela em DB de teste; rollback explicito apos.
2. **Mocks de storage validados contra shape real** (lesson #3): rodar test contra
   `walletService.recordWalletTransaction` real (com test DB), nao mock que retorna
   `{success: true}`.
3. **Cron tests com `vi.useFakeTimers`** (lesson #vi.useFakeTimers):
   - `setSystemTime(Date('2026-05-28T09:00:00-03:00'))` (timezone-aware).
   - Itera advance 1h e valida 1 nudge enviado.
   - `clearMocks: true` na config.
4. **Race conditions explicitas:** test que dispara 2 POST /confirm em paralelo via
   `Promise.all` e valida exatamente 1 sucesso + 1 409.
5. **Undo timer testing:** mock `Date.now` ou usar `vi.advanceTimersByTime(5*60*1000)`,
   verificar que POST /undo apos 5:01 retorna 410.
6. **B-LEAK gap-check:** test cobre 2 uploads same week com mesmos leaks (1 nudge so), 2
   uploads same week leaks DIFERENTES (1 nudge so — cycleKey blocks), uploads em semanas
   diferentes (2 nudges).
7. **Diff visual rendering:** test snapshot do `<CoachActionConfirmCard>` com input mock,
   garantir testid presente + texto renderizado.
8. **Sequence-aware tests:** simular stream SSE completo `tool_pending_confirmation`
   `tool_confirmed` `tool_undone` em ordem.

## Telemetria

| Evento | Campos |
|---|---|
| `coach.tool.<name>.pending` | userId, actionId, toolName |
| `coach.tool.<name>.confirmed` | userId, actionId, latencyMs |
| `coach.tool.<name>.cancelled` | userId, actionId |
| `coach.tool.<name>.undone` | userId, actionId, secondsAfterConfirm |
| `coach.tool.<name>.failed` | userId, actionId, errorCode |
| `coach.nudge.b_snapshot.{sent,engaged,dismissed,snoozed}` | userId, cycleKey |
| `coach.nudge.b_leak.{sent,engaged,dismissed,snoozed}` | userId, cycleKey, leakCodes |
| `coach.nudge.b_study.{sent,engaged,dismissed,snoozed}` | userId, cycleKey, focusCodes |
| `coach.cron.b_snapshot.tick` | usersProcessed, sent, skipped |
| `coach.cron.b_study.tick` | usersProcessed, sent, skipped |

Aggregations admin dashboard ficam preparadas para Coach-3 (que precisa delas para tier
gating telemetry). Sprint 2B persiste eventos via console.log (parsed por log
infrastructure) + coach_nudge_log/coach_actions.

## Risco Principal + Mitigacao

**Risco:** Sprint 2B mistura 6 write tools + 3 nudges + UI nova + cron — escopo grande.
Pode estourar 2 semanas.

**Mitigacao:** Ordem de execucao das RFs com fallback de corte:

**Ordem critica (entrega obrigatoria):**
1. RF-01 (infra confirmation/undo) — bloqueia tudo.
2. RF-02 (record_wallet_transaction) — primeira write tool (validation completa do flow).
3. RF-10 (UI cards) — paralelo com RF-02 (frontend pode mockar SSE).

**Ordem expansao (em ordem de prioridade ICE):**
4. RF-04 (register_tournament_in_grade) — alta freq de uso.
5. RF-05 (log_leak_focus + verify_leak_progress) — pre-req de RF-09.
6. RF-06 (log_study_session) — simples.
7. RF-03 (start/log_session_completed) — bigger surface area, deixar por ultimo entre as
   tools.

**Nudges (ordem):**
8. RF-08 (B-LEAK) — depende RF-05 minimo.
9. RF-07 (B-SNAPSHOT) — independente, ja tem dependencia em prefs do Sprint 0.
10. RF-09 (B-STUDY) — depende RF-05 + RF-06.

**Cortes saudaveis se prazo apertar:**
- Cortar RF-03 (`start_grind_session` + `log_session_completed`) — UI atual ja faz.
  Coach pode "guiar via chat" sem tool. Move pra Coach-3.
- Cortar RF-09 (B-STUDY) — vai pra Coach-3 junto com B-VOLUME e B-GRADE (ja planejados
  Coach-3).
- Manter SEMPRE: RF-01, RF-02, RF-04, RF-05, RF-08, RF-10. Esses entregam o "agente que
  age + 1 nudge proativo" — minimum viable Sprint 2B.
