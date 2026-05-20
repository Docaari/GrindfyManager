# ADR-165: Coach write tools de grade/estudo (AI-2A) — `bulk_propose_grade` strict + cap 20 + transação em massa + undo em lote; `schedule_study_block` em `study_sessions_v2` (status `planned`); `create_study_theme` com recusa por `theme_name_duplicate`; `mark_off_day` idempotente via UNIQUE em `user_off_days`; todas `requiresConfirmation:true` (ADR-146) + `auditLevel:'persist'` + reusam `coachToolRunner` (ADR-145)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2A (`Docs/specs/sprint-ai-2a.md`, RF-01, RF-02, RF-03, RF-04, RF-05)

## Decision owner
system-architect (founder locked 2026-05-20: Q-B `schedule_study_block` em `study_sessions_v2`; Q-C `create_study_theme` recusa duplicado; Q-D `user_off_days` tabela nova; Q-G cap N=20 em `bulk_propose_grade`).

## Related
- Depende de: ADR-145 (`coach_actions` + `coachToolRunner` — state machine preview→confirm→execute→undo, 5min window), ADR-146 (confirmação SEMPRE v1), ADR-077 (audit schema), ADR-090 (Tournament Series single source of truth — `bulk_propose_grade` propõe torneios standalone, não Series; Series ficam fora desta tool), ADR-126 (`study_sessions_v2` + status `planned` — Q-B reusa essa tabela com `scheduled_for`), ADR-127 (`study_themes.linked_stats`/`linked_lessons` jsonb — `create_study_theme` populates), ADR-141 (stats↔themes linking JSONB — `create_study_theme` sync bidirecional com `user_focus_stats.linked_themes`), ADR-147 (read tool service extraction — reusar `getTournamentSuggestions` em `bulk_propose_grade`, sem reimplementar scoring).
- Reusa: `server/coachTools/coachToolRunner.ts` (preview/confirm/execute/undo padrão), `server/coachTools/registry.ts` (`safeRegister`), `server/scoring/` + `storage.getTournamentSuggestions` (AI-0A — base do `get_tournament_suggestions`), `walletService.getConsolidatedBalance` (USD FX-aware — ADR-147), `db.transaction` com fallback gentil (lesson #32), `lessonEntitlement` (mesma checagem de `recommend_lesson` AI-0A), `user_focus_stats` sync helpers (Sprint stats-themes-linking-1).
- Sucessor de: nada — primeiro batch de write tools com cap absoluto + modo strict transacional.
- Diagramas: `Docs/architecture/diagrams/coach-ai-2a/write-tools-flow.mermaid`, `pool-intelligence-er.mermaid`.

---

## 1. Contexto

O AI-0A religou 6 write tools individuais (`registerTournamentInGrade`, `recordWalletTransaction`, `startGrindSession`, `logSessionCompleted`, `logLeakFocus`, `logStudySession`) — cada uma cria/altera 1 row, via `coachToolRunner` (preview → user confirma → execute → undo 5min). Funciona, mas o LLM consegue propor "8 torneios para a grade da semana" só fazendo 8 chamadas sequenciais de `register_tournament_in_grade` — 8 confirmações de usuário, 8 entradas em `coach_actions`, 8 tool roundtrips. Conversação ruim, custo alto, UX truncada.

A Fase 2 do plano de IA ("técnico de carreira") quer que o Coach **monte/edite a grade semanal e a rotina de estudo via conversa**. O sprint AI-2A entrega 4 write tools novas:

1. **`bulk_propose_grade`** — propõe N torneios (cap 20) para uma janela `weekStartDate × profile × daysOfWeek × hoursTargetPerDay × filters`. **1 preview, 1 confirmação, 1 execute em transação**. Modo `strict` recusa o pacote todo se houver qualquer conflito (já-em-grade, horário sobreposto, wallet abaixo do threshold). Modo `strict:false` registra os não-conflituosos e devolve `{ registered, skipped, skippedReasons }`.

2. **`schedule_study_block`** — agenda 1 bloco de estudo no calendário do user. **Decisão Q-B locked:** grava em `study_sessions_v2` com `status='planned'` + `scheduled_for` (NÃO em `calendar_events` — reusa a tabela canônica de estudo, FK opcional para `lesson_id`/`theme_id`).

3. **`create_study_theme`** — cria 1 row em `study_themes` com `linked_stats`/`linked_lessons` (JSONB). **Decisão Q-C locked:** `name` duplicado para o mesmo user → recusa com `theme_name_duplicate` (UNIQUE não — recusa no preview; user re-prompta com nome diferente).

4. **`mark_off_day`** — cria 1 row em `user_off_days`. **Decisão Q-D locked:** tabela nova (não `plannedTournaments` com flag nem `ai_structured_profile.offDays[]`). UNIQUE `(user_id, off_date)` garante idempotência (`ON CONFLICT DO NOTHING`). Efeito colateral: `bulk_propose_grade` consulta `listOffDaysForUser` e pula dias listados.

A pergunta central: **(a)** schema das 2 tabelas novas (já em ADR-167 — aqui só referenciado); **(b)** input/output shape das 4 tools, com Zod `.strict()` + cap 20 em `bulk_propose_grade`; **(c)** o algoritmo de geração do `bulk_propose_grade` (reusa scoring AI-0A, sem reimplementar); **(d)** detecção de conflitos (já-em-grade, time-overlap intra-pacote, wallet-below-threshold); **(e)** transação atômica do execute + undo em lote por IDs no `payloadAfter.createdIds`; **(f)** validações de ownership (`studyThemeId`/`lessonId`); **(g)** sync bidirecional de `linked_stats` com `user_focus_stats.linked_themes` no `create_study_theme` (reusa stats-themes-linking-1); **(h)** gating tier (todas via `isToolEligibleTier` — ADR-167); **(i)** kill switch — write tools **continuam** funcionando com `COACH_NUDGES_ENABLED=false` (não são proatividade, são pedidos explícitos do user).

### Restrições

- **Lesson #6 (USD):** `bulk_propose_grade` compara `sum(buyIn) * mult` (default `2`) com `walletService.getConsolidatedBalance` (já em USD); buy-ins em moeda nativa são convertidos via `getCurrencyForSite`/`convertToNativeCurrency` antes da soma.
- **Lesson #9 (logar antes de fallback):** erro de scoring para 1 `dayOfWeek` → `conflicts.push({ dayOfWeek, reason:'scoring_error' })` + `console.error`; outros dias seguem. Erro de DB em `db.transaction` → log + propaga para o frontend (não silenciar).
- **Lesson #10 (DRY):** o scoring continua em `server/scoring/` — `bulk_propose_grade` **chama** `getTournamentSuggestions(userId, dayOfWeek, profile, filters, hoursTarget)`, **não reimplementa**.
- **Lesson #11 (default mínimo em componentes):** `bulk_propose_grade` proposed array vem do scoring real — sem placeholders/"sugestões mockadas".
- **Lesson #17 (`grep "const X"` antes de declarar):** ao plugar o handler em `coachTools/index.ts` confirmar que não há colisão de nomes (`bulkProposeGradeTool`, `scheduleStudyBlockTool`, `createStudyThemeTool`, `markOffDayTool` — todos novos).
- **Lesson #32 (`db.transaction` com fallback gentil):** `bulk_propose_grade` execute envolve N `INSERT planned_tournaments` em transação; helper detecta `db && typeof db.transaction === "function"` e cai para runner sem tx em testes. Storage helpers aceitam `tx?` opcional, não passam quando undefined (preserva aridade que os testes inspecionam).
- **Lesson #33 (JSONB array remove):** o undo do `create_study_theme` (que populou `linkedStats` → propagou para `user_focus_stats.linked_themes`) precisa reverter o sync: `COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(linked_themes) elem WHERE elem <> $themeId), '[]'::jsonb)`.
- **Lesson #34 (`injectedStorage?`):** todos os 4 handlers aceitam `injectedStorage?` no terceiro arg para tests.
- **ADR-146 (confirm sempre v1):** todas as 4 tools têm `requiresConfirmation: true` no descritor. Não há flag `auto_apply` neste sprint.
- **ADR-145 (`coach_actions`):** `bulk_propose_grade` grava no `payloadAfter`: `{ createdIds: string[], summary, skipped }`. O undo lê esses IDs e faz `DELETE FROM planned_tournaments WHERE id = ANY($createdIds)`. Janela 5min do `undo_expires_at` aplica normalmente.

---

## 2. Decisões

### 2.1 `bulk_propose_grade` — input/output

**Handler:** `server/coachTools/handlers/bulkProposeGrade.ts`.
**Registry:** `coachTools/index.ts` `safeRegister(bulkProposeGradeTool)`.
**Descritor:**
```ts
{
  name: "bulk_propose_grade",
  description: "Propoe N torneios (cap 20) para uma semana, com confirmacao em massa. Modo strict recusa em conflito.",
  inputSchema: bulkProposeGradeInputSchema,
  requiresConfirmation: true,
  auditLevel: "persist",
  gateByTier: ["pro","premium","admin"],
  handler: runBulkProposeGrade,
  undo: undoBulkProposeGrade,
}
```

**Input (Zod `.strict()`):**
```ts
const bulkProposeGradeInputSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profile: z.enum(['A','B','C']),
  hoursTargetPerDay: z.number().min(1).max(16).optional().default(4),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional()
    .default([1,2,3,4,5,6]),
  filters: z.object({
    sites: z.array(z.string().max(32)).max(10).optional(),
    buyInMin: z.number().min(0).optional(),
    buyInMax: z.number().min(0).optional(),
    excludeTypes: z.array(z.enum(['Vanilla','PKO','Mystery','Satellite'])).optional(),
  }).strict().optional(),
  strict: z.boolean().optional().default(false),
  maxTournaments: z.number().int().min(1).max(20).optional().default(20),
}).strict();
```

**Cap 20 (Q-G locked):** Zod enforce `maxTournaments <= 20`; o algoritmo também respeita após dedup (mesmo que LLM peça mais via prompt). Acima → `validation_failed`.

**Preview output (`coachToolRunner.preview`):**
```ts
{
  proposed: Array<{
    dayOfWeek: number;
    site: string;
    name: string;
    time: string;             // 'HH:MM'
    type: string;
    speed: string;
    buyIn: number;
    guaranteed?: number;
    libraryTemplateId?: string;
    profile: 'A'|'B'|'C';
    prioridade: 1|2|3;
  }>,
  conflicts: Array<{
    dayOfWeek: number;
    time?: string;
    reason: 'time_overlap' | 'already_in_grade' | 'wallet_below_threshold' | 'off_day' | 'scoring_error';
    details?: any;
  }>,
  strictWouldReject: boolean,
  summary: { totalTournaments: number, totalBuyIn: number, estimatedHours: number },
}
```

**Algoritmo de geração:**
1. `listOffDaysForUser(userId, range:[weekStart, weekStart+6])` → `offDates: Set<string>`.
2. Para cada `dayOfWeek` em `daysOfWeek`:
   - Se a data correspondente está em `offDates` → `conflicts.push({ dayOfWeek, reason:'off_day' })`, skip.
   - Chama `storage.getTournamentSuggestions({ userId, dayOfWeek, profile, filters, hoursTarget })` → top N por score (já existe).
   - Aplica `excludeTypes` se houver.
   - Soma duração estimada; corta quando `>= hoursTargetPerDay`.
   - Em erro: `conflicts.push({ dayOfWeek, reason:'scoring_error', details })` + `console.error("coach.tool.bulk_propose_grade.scoring_error", ...)`.
3. Dedup intra-pacote: `(site, name, dayOfWeek, time)` único — segundo idêntico vira `conflicts.push({ reason:'time_overlap', details })`.
4. Detect já-em-grade: `storage.listPlannedTournaments({ userId, weekStartDate })` → cross-check `(site, name, dayOfWeek, time)` — match → `conflicts.push({ reason:'already_in_grade' })`.
5. Cap absoluto após dedup: se `proposed.length > maxTournaments` → trunca + log.
6. Wallet check: se `walletService.getConsolidatedBalance(userId)` < `sum(buyIn) * COACH_GRADE_BANKROLL_THRESHOLD_MULT` (default `2`) → `conflicts.push({ reason:'wallet_below_threshold', details:{ balanceUsd, totalBuyInUsd } })`.
7. `strictWouldReject = strict && conflicts.length > 0`.
8. Retorna `{ proposed, conflicts, strictWouldReject, summary }`.

**Execute (`coachToolRunner.confirm` → handler):**
- Se `strict && conflicts.length > 0` → recusa com `{ ok:false, error:'strict_conflict', conflicts }`. **Não** chega ao INSERT.
- Senão: `db.transaction(async (tx) => { for (p of proposed) await storage.createPlannedTournament(tx, { userId, weekStartDate, ...p }) })` — coleta IDs em `createdIds: string[]`.
- Fallback gentil (lesson #32): se `db.transaction` indisponível, runner sem tx.
- `payloadAfter`: `{ createdIds, summary, skipped: conflicts.length, skippedReasons: conflicts }`.
- Retorna `{ ok:true, registered: createdIds.length, skipped: conflicts.length, skippedReasons: conflicts }`.

**Undo (`undoBulkProposeGrade`):**
- Lê `coach_actions.payload_after.createdIds`.
- `db.transaction(async (tx) => storage.deletePlannedTournamentsByIds(tx, createdIds, userId))` — `WHERE id = ANY($ids) AND user_id = $userId` (defesa em profundidade contra cross-user).
- Janela 5min normal (ADR-145).

### 2.2 `schedule_study_block` — destino: `study_sessions_v2`

**Decisão Q-B locked:** grava em `study_sessions_v2` com `status='planned'`, `scheduled_for=startAt`, NÃO em `calendar_events`. Justificativa:
- `study_sessions_v2` é a tabela canônica do log de estudo (ADR-126); status `planned` já está no CHECK enum (Sprint Estudos-Habito-1).
- `calendar_events` mistura tipos (grind, estudo, eventos pessoais) — escopo maior, sem ganho.
- `FocusStatsCard` e `StudyWeeklyPlanCard` já leem de `study_sessions_v2` — bloco agendado aparece nativamente.

**Handler:** `server/coachTools/handlers/scheduleStudyBlock.ts`.

**Input (Zod `.strict()`):**
```ts
const scheduleStudyBlockInputSchema = z.object({
  topic: z.string().min(3).max(120),
  studyThemeId: z.string().max(21).optional(),
  lessonId: z.string().max(21).optional(),
  startAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(240),
  notes: z.string().max(500).optional(),
}).strict();
```

**Validações no preview:**
- `studyThemeId` presente → `storage.getStudyTheme(themeId)` deve existir + `user_id === userId` (ownership). Falha → `{ ok:false, error:'theme_not_accessible' }`.
- `lessonId` presente → `lessonEntitlement.hasAccess(userId, lessonId)` (reusa AI-0A `recommend_lesson`). Falha → `{ ok:false, error:'lesson_not_accessible' }`.
- Detect conflito de horário: `storage.listStudySessionsV2InRange(userId, startAt, startAt + durationMinutes)` — se overlap, `preview.warning='time_overlap_with_other_block'`. **Não bloqueia** execute (risco contido — user pode estudar 2x).

**Execute:** `INSERT INTO study_sessions_v2 (id, user_id, mode, source, status, scheduled_for, duration_minutes, theme_id, lesson_id, notes, ...)` — `mode='other'` se não houver lesson; `mode='lesson'` se `lessonId`; `source='manual_post_hoc'` (ou novo enum se Sprint 2A criar `'coach_planned'` — fora de escopo aqui).

**Undo:** `DELETE FROM study_sessions_v2 WHERE id = $createdId` (1 row).

### 2.3 `create_study_theme` — recusa por nome duplicado (Q-C locked)

**Decisão Q-C locked:** `name` duplicado para o mesmo user → recusa com `theme_name_duplicate`. User re-prompta com nome diferente. Justificativa:
- Idempotência silenciosa (retornar o tema existente) confunde o LLM (acha que criou, faz `setLinkedStats` em cima de tema existente do user que já tinha outras configurações).
- UNIQUE no DB não — `study_themes` pode ter duplicados (curated vs custom, casing diferentes). A recusa é no preview, via query case-insensitive.

**Handler:** `server/coachTools/handlers/createStudyTheme.ts`.

**Input (Zod `.strict()`):**
```ts
const createStudyThemeInputSchema = z.object({
  name: z.string().min(3).max(50),    // 50 = max da coluna study_themes.name
  description: z.string().max(500).optional(),
  linkedStats: z.array(z.string().max(64)).max(10).optional(),
  linkedSpots: z.array(z.string().max(21)).max(20).optional(),
  category: z.enum(['preflop','postflop','multiway']).optional(),  // ADR Themes-V2
}).strict();
```

**Validações no preview:**
- Duplicidade: `storage.findStudyThemeByName(userId, name.toLowerCase().trim())` — match → `{ ok:false, error:'theme_name_duplicate', existingId }`. Não chega ao execute.
- `linkedStats` codes válidos vs `HUD_STAT_CATALOG` (em código). Inválidos → `preview.warning='unknown_stats'` + lista no `details`; execute pula esses + registra os válidos.
- `linkedSpots` IDs válidos vs `starred_hands.id` do user — invalidos pulados (mesma lógica).

**Execute:**
1. `INSERT INTO study_themes (id, user_id, name, description, category, linked_stats, linked_lessons)` — `linked_lessons` vazio neste sprint.
2. Sync bidirecional `linked_stats → user_focus_stats.linked_themes` (reusa helpers stats-themes-linking-1): para cada `statCode` em `linkedStats`, `UPDATE user_focus_stats SET linked_themes = CASE WHEN linked_themes @> $themeId::jsonb THEN linked_themes ELSE linked_themes || $themeId::jsonb END WHERE user_id=$userId AND stat_id=$statCode`.

**Undo:**
1. Para cada `statCode` em `payloadAfter.linkedStats`: reverse sync via lesson #33 — `UPDATE user_focus_stats SET linked_themes = COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(linked_themes) elem WHERE elem <> $themeId), '[]'::jsonb)`.
2. `DELETE FROM study_themes WHERE id = $themeId AND user_id = $userId`.

### 2.4 `mark_off_day` — UNIQUE em `user_off_days` (Q-D locked)

**Decisão Q-D locked:** tabela nova `user_off_days` (não `plannedTournaments` com flag, não `ai_structured_profile.offDays[]`). Justificativa:
- `ai_structured_profile.offDays[]` JSONB: query `bulk_propose_grade` precisaria escanear todos os users e processar JSONB — caro e não-indexável.
- `plannedTournaments` com flag `isOffDay`: subverte semântica da tabela (planned = "pretendo jogar"; off-day = "não vou jogar nem planejar").
- Tabela dedicada: UNIQUE `(user_id, off_date)` idempotente + `INDEX (user_id, off_date)` para `listOffDaysForUser(userId, range)` O(log n).

**Schema:** ver ADR-167 §1 + migration 0070.

**Handler:** `server/coachTools/handlers/markOffDay.ts`.

**Input (Zod `.strict()`):**
```ts
const markOffDayInputSchema = z.object({
  offDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(200).optional(),
}).strict();
```

**Preview:** verifica se já há `planned_tournaments` no `offDate` para o user — `preview.warning='has_planned_tournaments', details:{ count }`. **Não bloqueia**, só avisa. **Não remove** — escopo de outra tool (`bulk_remove_grade_for_day` deferida).

**Execute:** `INSERT INTO user_off_days (id, user_id, off_date, reason, source) VALUES (...) ON CONFLICT (user_id, off_date) DO NOTHING`. Idempotente. Retorna `{ ok:true, created: boolean }` (true se INSERT aconteceu; false se já existia).

**Undo:** `DELETE FROM user_off_days WHERE id = $createdId AND user_id = $userId`.

---

## 3. Opções descartadas

### 3.1 `bulk_propose_grade` sem cap (ou cap maior, ex 50)
- **Prós:** flexibilidade; user pode pedir "monta tudo de uma vez".
- **Contras:** preview vira lista gigante difícil de revisar; user clica "confirmar" sem ler; LLM hallucina horários repetidos. Cap 20 (Q-G) força o LLM a iterar (2 chamadas para grade densa) — melhor controle de qualidade.
- **Decisão:** cap 20 absoluto. Acima → `validation_failed`.

### 3.2 `bulk_propose_grade` sem modo `strict`
- **Prós:** sempre tenta registrar o que dá; simples.
- **Contras:** se o user diz "monte 8 torneios na quinta strict" porque já confiou que tem horários livres, o tool pode registrar 3 e pular 5 silenciosamente. Strict permite "tudo ou nada" — UX mais limpa em casos onde o user já refinou os filtros.
- **Decisão:** suportar ambos via `strict?: boolean` (default `false`).

### 3.3 `schedule_study_block` em `calendar_events` (Q-B alternativa)
- **Prós:** unifica todos os eventos (grind, estudo, pessoal) numa tabela; integra com possível Google Calendar futuro.
- **Contras:** `calendar_events.category_id` exige categoria pré-criada; `study_sessions_v2` já é a tabela canônica do estudo + alimenta `FocusStatsCard` + `StudyStreak`; duplicar em `calendar_events` cria 2 fontes de verdade.
- **Decisão:** `study_sessions_v2` (Q-B locked).

### 3.4 `create_study_theme` idempotente (Q-C alternativa)
- **Prós:** "criar tema X" para tema já existente retorna o existente; LLM não precisa lidar com erro.
- **Contras:** LLM acredita que criou + faz subsequentes `linkLessonToTheme` / `setLinkedStats` sobrescrevendo configurações do tema antigo. Confusão silenciosa.
- **Decisão:** recusa explícita com `theme_name_duplicate` (Q-C locked). LLM re-prompta o user.

### 3.5 `mark_off_day` em `ai_structured_profile.offDays[]` JSONB (Q-D alternativa)
- **Prós:** sem tabela nova; consolida "perfil" em 1 lugar.
- **Contras:** query `WHERE offDays @> $date::jsonb` exige scan ou GIN index complexo; consulta por range `[start, end]` precisa de `jsonb_array_elements_text` + cast a date + filter — lento e verboso.
- **Decisão:** tabela `user_off_days` (Q-D locked).

### 3.6 Cap 20 enforced só no algoritmo (não no Zod)
- **Prós:** mensagem de erro mais descritiva ("gerei 25 candidatos, mantive top 20").
- **Contras:** LLM continua tentando passar `maxTournaments: 50` esperando que funcione → frustração + retry loop. Validação no Zod corta cedo.
- **Decisão:** Zod `.max(20)` + algoritmo também respeita (defesa em profundidade).

---

## 4. Consequências

### Positivas
- Conversational grid editing real — user diz "monta minha grade da semana com profile A nos seis dias" e em 1 confirmação registra 12 torneios.
- Undo em lote — se a sugestão saiu ruim, 1 clique reverte os 12 (janela 5min ADR-145).
- Padrão claro para futuras tools de batching — `bulk_*` template estabelecido.
- `study_sessions_v2` ganha novo `source` semântico (`'coach_planned'` — opcional, fora do escopo, deferred Sprint AI-2A polish ou AI-2B).
- `user_off_days` table abre caminho para "calendário do jogador" (vista mensal, integração futura com Google Calendar).

### Negativas
- Cap 20: usuários com grade densa (high-volume regs) precisam de 2 chamadas — mitigado pela mensagem "gerei top 20 deste dia; chame de novo para próximo dia".
- `bulk_propose_grade` é caro: scoring de N*K torneios candidatos pode levar ~1-3s. Mitigação: cache de scoring por `weekStart+profile` 5min em memória (opcional na implementação — não bloqueante).
- `create_study_theme` recusa por nome duplicado força LLM a perguntar "esse tema já existe, quer adicionar stats?". Trade-off aceito (Q-C locked).

### Neutras
- `coach_actions.payload_after.createdIds` cresce (array vs ID único) — mas é JSONB, sem custo significativo.
- `study_sessions_v2` ganha rows `status='planned'` antes do user efetivamente estudar — `FocusStatsCard` precisa filtrar (`status='completed'`) para minutos consolidados (já faz isso pelos métricas do habit sprint).

---

## 5. Notas de implementação

- **Ordem sugerida (test-writer → implementer):** 1) `mark_off_day` (mais simples, valida o pattern). 2) `create_study_theme` (sync bidirecional). 3) `schedule_study_block`. 4) `bulk_propose_grade` (mais complexo, depende de `listOffDaysForUser`).
- **Helpers compartilhados:** `server/coach/proposeGrade.ts` exporta `proposeGradeForWeek(userId, opts, ctx)` — encapsula a lógica de geração + dedup + conflict detection. `bulk_propose_grade` consome.
- **Storage layer:**
  - `storage.createPlannedTournament(tx?, data)` — já existe (AI-0A `register_tournament_in_grade`); aceitar `tx?` opcional.
  - `storage.deletePlannedTournamentsByIds(tx?, ids: string[], userId)` — **novo**, batch delete com defesa de cross-user.
  - `storage.listPlannedTournaments({ userId, weekStartDate })` — já existe.
  - `storage.listOffDaysForUser(userId, range: { start: Date, end: Date })` — **novo**, em `coachSignalsStorage.ts` (consistente com helpers AI-1B).
  - `storage.findStudyThemeByName(userId, normalizedName)` — **novo**, case-insensitive lookup.
  - `storage.listStudySessionsV2InRange(userId, startAt, endAt)` — **novo**, range query para detect time overlap.
- **Env vars:** `COACH_GRADE_BANKROLL_THRESHOLD_MULT` (default `2`) — multiplicador do bankroll check no `bulk_propose_grade`.
- **Telemetria:** cada `confirm` grava em `coach_actions` (já) — adicional `console.log("coach.tool.bulk_propose_grade.confirmed", { userId, registered, skipped, totalBuyInUsd })` para dashboards.

---

## 6. Plano de Verificação

- [ ] `bulk_propose_grade` `daysOfWeek=[1,2,3]`, `profile='A'`, `hoursTarget=4` → preview retorna `proposed.length <= 12`, `conflicts` lista colisões intra-pacote, `summary` correto.
- [ ] `strict:true` + 1 conflito → `strictWouldReject:true`; `confirm` retorna `strict_conflict`, **nenhum** `planned_tournaments` criado.
- [ ] `strict:false` + 2 conflitos → confirm registra `proposed - 2`, undo deleta os criados.
- [ ] Cap 20: input `maxTournaments:25` → `validation_failed`.
- [ ] `mark_off_day` sábado + `bulk_propose_grade` semana → `conflicts.push({ dayOfWeek:6, reason:'off_day' })`.
- [ ] `mark_off_day` 2x mesmo dia → 2o execute retorna `{ ok:true, created:false }` (ON CONFLICT DO NOTHING).
- [ ] `create_study_theme` nome dup → `theme_name_duplicate`; nome novo + `linkedStats:['3bet']` → tema criado + `user_focus_stats.linked_themes` atualizado; undo reverte sync (lesson #33).
- [ ] `schedule_study_block` `studyThemeId` de outro user → `theme_not_accessible`.
- [ ] Free → `listToolsForUser` não inclui as 4 tools (`isToolEligibleTier` filtra — ADR-167).
- [ ] `COACH_NUDGES_ENABLED=false` → 4 tools **continuam funcionando** (não são proatividade).
- [ ] `db.transaction` indef. em testes → fallback gentil (lesson #32); aridade dos storage helpers preservada.

---

## Migration SQL (referência rápida — versão completa em `migrations/0070_ai_2a_offdays_pool_intel.sql`)

```sql
CREATE TABLE user_off_days (
    id VARCHAR(21) PRIMARY KEY,
    user_id VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    off_date DATE NOT NULL,
    reason TEXT,
    source VARCHAR(32) NOT NULL DEFAULT 'coach_tool',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT user_off_days_user_date_unique UNIQUE (user_id, off_date)
);
CREATE INDEX idx_user_off_days_user_date ON user_off_days(user_id, off_date);
```

`tournament_pool_intelligence` schema em ADR-167 §1.
