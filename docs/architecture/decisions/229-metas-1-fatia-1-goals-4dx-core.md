# ADR-229: Ferramenta de Metas 4DX — fatia-1 (core: schema + CRUD + placar + snapshots)

## Status
Aceito

## Data
2026-06-01

## Contexto

Sprint METAS-1 fatia-1 (core-first). Spec consumida: `Docs/specs/sprint-metas-1-fatia-1-2026-06-01.md`
(recorte do master `Docs/specs/metas-tool-2026-06-01.md`). Estratégia-mãe / roadmap:
`Docs/strategy/estrategia-sprints-finais-2026-06-01.md` §2.3 (board ICE, fatia 1 = ~70% do valor
sem o motor fino). Doutrina/curso: `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md`.

A Ferramenta de Metas é o sistema **4DX** (As 4 Disciplinas da Execução): Meta Global (WIG) → Medidas
de Direção → Placar Convincente → Cadência de Responsabilização. A fatia-1 entrega **D1+D2+D3** sem
D4 (cobrança A4 da segunda = METAS-1.1) e **sem LLM**: schema (3 tabelas), CRUD de metas com validação
de doutrina, placar read-only "onde estou × onde deveria estar" (pace line linear), snapshots semanais
idempotentes (UTC), UI React (`/metas` + `/metas/nova`). O "realizado" vem de **agregação direta
read-only** do dado já capturado — o motor de aderência fino (ADR-227) é **dependência OPCIONAL** aqui
(hard-dep da fatia-2).

Este ADR é a etapa mais consequente do pipeline: resolve as **7 decisões abertas** (DEC-A6-impl,
DEC-A1, DEC-A3, DEC-A8, + 3 menores) e congela os contratos para o test-writer escrever contra eles.

---

## Achados de recon do código real (lesson #3/C1 — validar shape, não idealizar)

Tudo abaixo verificado em 2026-06-01 lendo o código, não a spec.

| # | Achado | file:line | Implicação |
|---|--------|-----------|-----------|
| R1 | `career_goals` **NÃO está no drizzle** `shared/schema.ts` | `grep careerGoals shared/schema.ts` → **0 matches** | DEC-A6-impl: estender `career_goals` no drizzle é trabalho novo, não "estender o que existe". |
| R2 | `careerGoalsStorage.getTable()` faz lazy `mod.careerGoals ?? mod.career_goals ?? null` e cai num **placeholder** `{ id:"career_goals.id", userId:"...", status:"...", createdAt:"..." }` | `server/storage/careerGoalsStorage.ts:22-42` | Em produção, `getTable()` retorna o placeholder (porque `mod.careerGoals` é `undefined`). |
| R3 | `createCareerGoal` faz `db.insert(tbl).values(row).returning()` com `tbl` = placeholder | `careerGoalsStorage.ts:63-84` | **Débito latente AI-2B:** `db.insert(<objeto-não-pgTable>)` NÃO escreve na tabela real `career_goals` — drizzle não tem metadados (nome de tabela/colunas) no placeholder. Em prod, a tool `define_career_goal` ou explode ou escreve lixo. **Documentado, NÃO consertado neste sprint** (fora de escopo; ver §Riscos). |
| R4 | A tabela física `career_goals` existe (migration raw 0071) com enums **incompatíveis** com 4DX | `migrations/0071_ai_2b_career_mental_email.sql:26-66` | `horizon CHECK ('mes','trimestre','ano','multi_ano')`; `target_metric CHECK ('profit_usd','tournaments_count','roi_pct','bankroll_usd','custom')`; `status CHECK ('active','achieved','abandoned','expired')`. A Metas usa `horizon ∈ {week,month,quarter,season}` e `sourceMetric` 4DX — **friction de enum direto na coluna** (mexer no CHECK = migration sobre tabela AI-2B viva). |
| R5 | `career_goals` **sem UNIQUE**; cap 5 ativas por código (`COACH_CAREER_GOALS_MAX_ACTIVE`) | `careerGoalsStorage.ts:184-201` + comment migration `:56` | Cap por contagem é o padrão da casa — a Metas segue (cap 2 WIG / 3 medidas por código). |
| R6 | `weekly_planning_sessions` (EST-6, migration 0088) **ESTÁ no drizzle** com pgTable completo + `db.insert(weeklyPlanningSessions)` real + UNIQUE `(user_id, week_start_date)` + attach pattern | `shared/schema.ts:5253-5295`; `server/storage/weeklyPlanningStorage.ts:1-185` | **Padrão de referência** para as tabelas novas: pgTable real + `createInsertSchema`/Zod + attach storage. Contraste com R2 prova que o caminho "tabela nova no drizzle" é o que de fato funciona em prod. |
| R7 | `getReportTier(user)` retorna `'free' | 'eligible'`; Trial→`eligible`, Free/expired→`free` | `server/coach/reportEligibility.ts:54-74` | Tier gating DEC-A2: `getReportTier !== 'free'` para criação/edição; read-only para todos. |
| R8 | `ymdUtc(d)` / `ymdToUtcDate(s)` UTC | `server/coach/planning/weekKeys.ts:13-24` | Chave de semana dos snapshots = UTC (alinha `weekly_planning_sessions`/`study_weekly_plans` — CLAUDE.md §10). |
| R9 | Motor ADR-227 expõe `getPlannedVsActual(userId, sourceMetric, period, injectedStorage?)` → `PlannedVsActual` (contrato CONGELADO, server-only) | `server/coach/adherence/{index,types,sourceMetricMap}.ts` (SHIPPED) | Dep OPCIONAL fatia-1: pode preencher `currentValue` onde a `sourceMetric` 4DX mapear; mas a fatia-1 NÃO depende dele (agregação direta). Útil para reduzir divergência futura na fatia-2. |
| R10 | EST-6 registra rotas estáticas via `registerCoachPlanningRoutes(app, requireAuth)` ANTES de `registerCoachAi1bRoutes`; prefixo disjunto + guard test de colisão | `server/routes/coachPlanning.ts:1-67` + ADR-224 #2 | Padrão para DEC-A8 (ordem de registro + guard test via app real). |
| R11 | `getPerformanceByPeriod(userId, period, filters?)` existe; `tournaments WHERE grind_session_id IS NULL` injetado por `buildPeriodCondition` (§6.1) | `server/storage.ts:561,3216` | Fonte de `roi_pct`/`abi`/`itm_pct` da agregação direta (RF-05) — histórico, nunca `session_tournaments`. |
| R12 | Rotas Wouter registradas (CTA targets — lesson #19) | `client/src/App.tsx:124-150` | Existem: `/estudos/registrar` (via `/estudos/:rest*`), `/coach` (grade), `/coach-ai/relatorio/:id`, `/bankroll`, `/dashboard`. `/metas` e `/metas/nova` **NÃO existem ainda** → adicionar. |

**Conclusão de schema:** as tabelas `goals` / `goal_links` / `goal_progress_snapshots` são **novas no drizzle**
(padrão R6, não R2). `career_goals` permanece **intocada** (não formaliza no drizzle, não muda o CHECK) —
ver DEC-A6-impl opção (b).

---

## Opções consideradas — DEC-A6-impl (a WIG estende `career_goals`, decisão travada)

A diretriz do founder (estratégia §2.2): a WIG **estende `career_goals`** (não criar universo paralelo de
carreira). O *como* é a decisão de schema que o master não previu (porque `career_goals` não está no drizzle — R1).

### Opção (a): ADD COLUMN em `career_goals` + formalizar `career_goals` no `shared/schema.ts`
A WIG vira uma `career_goal` com colunas 4DX extras (`baseline_value`, `wig_role`, `coach_tone_at_create`, `origin`).
- **Prós:** uma só tabela de WIG; "estende" no sentido literal.
- **Contras (decisivos):**
  - **Quebra o runtime do `careerGoalsStorage` (R2/R3).** Hoje `getTable()` cai no placeholder e o `db.insert`
    é um no-op latente. Ao adicionar `export const careerGoals = pgTable(...)` em `shared/schema.ts`,
    `mod.careerGoals` passa a resolver a tabela real → `careerGoalsStorage.createCareerGoal` **começa a escrever
    de verdade** numa tabela cujo schema drizzle eu acabei de inventar. Isso muda o comportamento do AI-2B
    (`define_career_goal`) **sem teste de regressão dedicado** e arrisca quebra silenciosa em prod. Consertar
    AI-2B está **fora do escopo deste sprint** (spec §CONFLITO: "documente o achado mas NÃO conserte AI-2B").
  - **Friction de enum (R4):** `horizon`/`target_metric`/`status` da `career_goals` têm CHECK incompatível com 4DX.
    Estender exige ALTER no CHECK de uma tabela AI-2B viva (migration destrutiva-de-constraint) **ou** mapeamento
    de valores (`quarter`→`trimestre`), criando ambiguidade de leitura entre AI-2B e Metas na mesma coluna.
  - **Toca `shared/schema.ts`** (working tree compartilhada — INCIDENT #24/#45) num arquivo de 5.000+ linhas, mais
    do que o necessário.
- **Veredito:** rejeitada. Honra a letra de DEC-A6 mas viola o limite de escopo (mexe no AI-2B) e cria risco de
  regressão em prod desproporcional ao ganho.

### Opção (b) — ESCOLHIDA: tabela-filha `goal_wig_meta` referenciando `career_goals.id` (FK)
A WIG **é** uma `career_goal` (continua sendo criada/contada pelo domínio de carreira); os **atributos 4DX da WIG**
(baseline X, role, tom no momento, origem) vivem numa filha 1:1 `goal_wig_meta(career_goal_id PK/FK)`. As **medidas
de direção** (D2) e os **links** ficam na tabela `goals` nova. Snapshots referenciam a WIG **via `career_goal_id`**
(coluna polimórfica leve discriminada por `goal_kind`).
- **Prós:**
  - **Honra DEC-A6 sem universo paralelo:** a WIG continua sendo uma `career_goal` (a Metas lê `career_goals` para a
    WIG; o `getAllUserGoals` AI-2B continua válido). Não duplico o domínio de carreira.
  - **`career_goals` 100% intocada (R3):** não formalizo no drizzle, não mexo no CHECK, **não toco o débito latente
    do AI-2B** — ele fica exatamente como está (documentado em §Riscos). Zero risco de regressão AI-2B.
  - **Friction de enum resolvida por isolamento:** os atributos 4DX que não cabem no enum `career_goals` (baseline,
    role, tom) ficam na filha com seus próprios tipos; o `horizon` 4DX da WIG é derivado/mapeado em código na leitura
    (`trimestre`→`quarter`, `ano`/`multi_ano`→`season`), nunca gravado num CHECK conflitante.
  - **Cap-2-WIG fica nítido:** conta só `career_goals` que **têm row em `goal_wig_meta`** (= marcadas WIG-4DX). Uma
    `career_goal` pré-AI-2B (sem filha) **NÃO** conta como WIG (recomendação da spec honrada — contar só as WIG-4DX).
- **Contras:** um JOIN extra para ler a WIG completa; a `goal_wig_meta` precisa ser populada na criação de WIG.
  Aceitável (volume baixíssimo: ≤2 WIG/user).
- **Veredito:** **escolhida.** Maximiza honra-a-DEC-A6 com mínima invasão (não toca AI-2B nem o drizzle de `career_goals`).

### Opção (c): tabela `goals` nova que **sincroniza** com `career_goals` (sync opt-in)
- **Prós:** mais perto do master original; nenhuma FK cross-tabela.
- **Contras:** mantém 2 domínios de WIG (a `goals.goal_type='result'` + a `career_goals`) com sync → exatamente o
  "universo paralelo" que DEC-A6 quis evitar; sync bidirecional é fonte clássica de drift. Rejeitada por contrariar
  o espírito de DEC-A6.

---

## Decisão

### DEC-A6-impl — Opção (b): WIG = `career_goal` + filha 1:1 `goal_wig_meta`; medidas/links em `goals` nova

**Schema final (3 tabelas novas no drizzle + `career_goals` intocada):**

1. **`goals`** (nova, drizzle) — guarda **só as medidas de direção** (D2) + metas que não são WIG. `goal_kind='measure'`
   nesta fatia (o discriminador `goal_kind` fica preparado, mas a WIG **não** vive aqui — vive em `career_goals`+`goal_wig_meta`).
2. **`goal_wig_meta`** (nova, drizzle) — filha 1:1 de `career_goals`: atributos 4DX da WIG (`baseline_value`, `wig_role`,
   `coach_tone_at_create`, `origin`, `target_value_4dx` opcional). PK = `career_goal_id` (FK CASCADE para `career_goals.id`).
   **A presença de uma row aqui = "esta `career_goal` é uma WIG-4DX"** → é isso que o cap-2-WIG conta.
3. **`goal_links`** (nova, drizzle) — N:N WIG↔medida. `wig_career_goal_id` (FK → `career_goals.id`, **sem CASCADE-drizzle**
   porque `career_goals` não está no drizzle; FK declarada na **migration SQL**, e a coluna no drizzle fica `varchar` sem
   `.references()` — ver §Nota FK) + `measure_id` (FK → `goals.id` CASCADE). UNIQUE `(wig_career_goal_id, measure_id)`.
4. **`goal_progress_snapshots`** (nova, drizzle) — placar histórico. Coluna **polimórfica** `goal_ref_id` + `goal_kind`
   (`'measure'` → FK lógica `goals.id`; `'wig'` → `career_goals.id`). UNIQUE `(goal_ref_id, week_start_date)`.

**Nota FK (decisiva — evita o erro da opção a):** como `career_goals` **não está no drizzle** (R1) e eu **não vou
formalizá-la**, as colunas que referenciam `career_goals.id` (`goal_wig_meta.career_goal_id`, `goal_links.wig_career_goal_id`,
`goal_progress_snapshots.goal_ref_id` quando `goal_kind='wig'`) são declaradas no drizzle como `varchar` **sem
`.references()`** (drizzle não consegue referenciar uma tabela que não conhece). A **integridade referencial real (FK +
ON DELETE CASCADE) é declarada na migration SQL** (`REFERENCES career_goals(id) ON DELETE CASCADE`). A ownership por
`user_id` é validada em código no storage (padrão da casa). Isto evita ter que importar `career_goals` no drizzle só
para satisfazer `.references()`.

**Cap-2-WIG (resolvido):** `countActiveWigs(userId)` = `COUNT(*)` de `career_goals` (status='active') que **têm row em
`goal_wig_meta`** (INNER JOIN). `career_goals` legadas (pré-Metas, sem filha) **não contam**. Cap 2 por contagem em
código (não UNIQUE — padrão R5).

### DEC-A1 — Snapshot: **lazy/on-read UPSERT da semana corrente no `GET /scoreboard`** (sem cron novo nesta fatia)

A fatia-1 **defere RF-09** (cobrança proativa de segunda). Sem D4, **não há leitor proativo** que exija um snapshot
fresco gerado por cron. Adicionar um tick (novo ou piggyback no `reportJobRunner`) agora seria infra ociosa.

**Decisão:** `GET /api/goals/scoreboard` gera/UPSERT **idempotentemente** o snapshot da **semana corrente** (`ymdUtc` da
segunda corrente) para cada meta ativa, no momento da leitura, dentro do próprio handler (read-write controlado, mas
idempotente por UNIQUE `(goal_ref_id, week_start_date)`). Justificativas:
- **Idempotência garantida** pela UNIQUE → reler 10× na mesma semana = 1 row (UPSERT `ON CONFLICT DO UPDATE`).
- **Sem cron, sem job, sem migration de fila** → barato, reversível, alinhado ao espírito ADR-227 ("a persistência de
  snapshot fica na Metas").
- **`COACH_NUDGES_ENABLED`:** como **não há tick proativo**, a flag **não gateia a geração on-read** (ela governa
  *proatividade*, e o `GET /scoreboard` é uma leitura iniciada pelo usuário, não proatividade). O placar read-only
  funciona com a flag off. **Quando a fatia-2/METAS-1.1 ligar um tick proativo de cobrança, AÍ ele respeita
  `COACH_NUDGES_ENABLED`** (documentado para o sprint futuro). Histórico de semanas passadas é congelado naturalmente
  (cada semana corrente vira passada e seu snapshot permanece).
- **Tier:** a geração on-read roda para qualquer tier (é leitura) — Free vê o placar read-only com snapshot fresco das
  metas que já tenha. Criar metas continua gated (DEC-A2).

> **Trade-off documentado:** snapshots de semanas em que o usuário **não abriu** `/scoreboard` ficam ausentes (sem cron
> que varre todos). O sparkline pode ter buracos. Aceitável na fatia-1 (o placar é o caso de uso primário; quem olha o
> placar gera o snapshot). METAS-1.1 (com a cadência de segunda) introduz o tick que preenche todos — e aí respeita o
> kill switch. Marcado como follow-up.

### DEC-A3 — Thresholds de `status` (números FIXOS para o guard das 4 faixas)

`ratio = actual / expectedNow` onde `expectedNow = baseline + (target - baseline) * clamp01((now - createdAt)/(deadline - createdAt))`.
Banda de tolerância A4 (evitar pânico). **Thresholds fixos:**

| Status | Condição (ratio = actual/expectedNow) | Âncora |
|--------|----------------------------------------|--------|
| `ahead` | `ratio > 1.10` | acima do pace |
| `on_track` | `0.90 <= ratio <= 1.10` | banda de tolerância A4 (±10%) |
| `behind` | `0.70 <= ratio < 0.90` | atrás, sem pânico |
| `at_risk` | `ratio < 0.70` | risco real |
| `achieved` | `actual >= target` (override, qualquer ratio) | meta batida |

**Direção da métrica:** o ratio acima assume métrica **"maior é melhor"** (sessões, minutos, ROI, bankroll). Para
métricas onde **menor é melhor** (futuro — ex: `consecutive_grind_days` como teto), inverter via flag `direction` no
spec da métrica. **Na fatia-1 todas as `sourceMetric` da allowlist são "maior é melhor"** → `direction='up'` default;
a coluna/flag fica preparada mas não exercitada.

**Divisão por zero / borda de criação (decisivo para o test-writer):**
- `expectedNow === 0` (caso: `baseline=0` E `now === createdAt`, ou `baseline=0` no dia da criação) → **`status='on_track'`,
  `ratio=null`** (não dá para julgar pace no dia zero — A4, não cravar). Guard test com `now === createdAt`.
- `expectedNow === 0` mas `actual > 0` → **`status='ahead'`** (fez algo antes do esperado ser >0).
- `deadline <= createdAt` (dado inconsistente) → `clamp01` retorna `1` (deadline no passado = 100% do tempo decorrido) →
  `expectedNow = target`; pace normal.
- `baseline === target` (meta degenerada) → `expectedNow = target` constante; `ratio = actual/target`; mesmas faixas.

### DEC-A8 — Colisão de rota (ordem EXATA de registro + guard test via app real)

Padrão EST-6 (R10): rotas **estáticas ANTES** das paramétricas, todas dentro de `registerGoalsRoutes(app, requireAuth)`,
registrado em `server/routes/index.ts` (ou onde as rotas de domínio são montadas). **Ordem exata:**

```
1. GET    /api/goals/scoreboard                 (estática — ANTES de /:id)
2. POST   /api/goals/templates/:profile/apply   (estática-prefixada — ANTES de /:id; "templates" ≠ um :id)
3. POST   /api/goals/:id/link-measure           (sub-path específico — ANTES de /:id puro)
4. GET    /api/goals/:id/snapshots              (sub-path específico — ANTES de /:id puro)
5. GET    /api/goals                            (coleção)
6. POST   /api/goals                            (coleção)
7. GET    /api/goals/:id                        (paramétrica — por último)
8. PATCH  /api/goals/:id
9. DELETE /api/goals/:id
```

Regra: `/scoreboard` e `/templates/...` registrados antes de `/:id` senão Express casa `scoreboard`/`templates` como
`:id`. **Guard test obrigatório via app real** (`registerGoalsRoutes` num app Express de teste + bater `GET /api/goals/scoreboard`
e confirmar que NÃO cai no handler de `/:id` — handler-direct é cego à colisão; lições EST-3/EST-6).

### Decisões menores

- **DEC-menor-1 — `PATCH` rejeita `baseline_value` (imutável, RF-01):** se o body do `PATCH /api/goals/:id` (medida) ou
  do PATCH da WIG contiver `baselineValue`/`baseline_value`, retorna **400 `baseline_immutable`** (não silenciosamente
  ignora — erro explícito; X de "de X para Y" é snapshot da criação). `targetValue`/`targetDeadline`/`title`/`status`
  são editáveis.
- **DEC-menor-2 — `link-measure` par duplicado = idempotente no-op (200):** `POST /api/goals/:id/link-measure` com par
  `(wig, measure)` já existente → **`INSERT ON CONFLICT DO NOTHING`** pela UNIQUE, retorna **200** com o estado atual do
  link (não 409). Razão: o endpoint é "garanta que esta medida está vinculada", semântica idempotente (igual ao
  `createWeeklyPlanningSession` R6). O test-writer cobre o ramo único (idempotente), não o erro.

### DEC-A2 (herdada da spec, confirmada) — tier gating
Placar/GET read-only para **todos** os tiers; `POST`/`PATCH`/`DELETE`/`link-measure`/`templates/:profile/apply` gated
`getReportTier(user) !== 'free'` (R7) — **defense in depth**: gate na entrada (middleware/handler) **+** revalidação no
handler antes de qualquer write (espelha EST-5/6).

---

## Contrato de storage (`server/storage/goalsStorage.ts` — padrão attach, lessons #34/#36)

Padrão idêntico a `weeklyPlanningStorage.ts` (R6): `attachGoalsStorage(storage)` chamado no fim de `server/storage.ts`;
tabelas lidas via import drizzle real; `career_goals` lida via **lazy import + placeholder fallback** (R2) — porque NÃO
está no drizzle. Todos os helpers aceitam `injectedDb?` como último arg.

```typescript
// server/storage/goalsStorage.ts
export function attachGoalsStorage(storage: any): void {
  // --- goals (medidas de direção) ---
  storage.createGoal(input: CreateGoalInput, injectedDb?): Promise<GoalRow>;            // goal_kind='measure'
  storage.getGoal(userId: string, goalId: string, injectedDb?): Promise<GoalRow|null>; // ownership
  storage.listGoals(userId: string, opts?: {status?: string}, injectedDb?): Promise<GoalRow[]>;
  storage.updateGoal(userId, goalId, patch: UpdateGoalInput, injectedDb?): Promise<GoalRow|null>; // rejeita baselineValue → throw BaselineImmutableError
  storage.archiveGoal(userId, goalId, injectedDb?): Promise<void>;                      // soft-delete: archived_at = now
  storage.countActiveMeasures(userId: string, injectedDb?): Promise<number>;            // cap 3 medidas (status='active')

  // --- WIG (career_goals + goal_wig_meta) — career_goals via lazy/placeholder (R2) ---
  storage.createWig(userId, input: CreateWigInput, injectedDb?): Promise<WigView>;      // insere career_goal + goal_wig_meta (1 tx); horizon 4DX→career_goals enum map
  storage.getWig(userId, careerGoalId, injectedDb?): Promise<WigView|null>;             // JOIN career_goals × goal_wig_meta (só WIG-4DX)
  storage.listActiveWigs(userId, injectedDb?): Promise<WigView[]>;                      // INNER JOIN: só career_goals com goal_wig_meta
  storage.countActiveWigs(userId, injectedDb?): Promise<number>;                        // cap 2 WIG (status='active' AND tem goal_wig_meta)
  storage.updateWig(userId, careerGoalId, patch: UpdateWigInput, injectedDb?): Promise<WigView|null>; // rejeita baselineValue

  // --- goal_links (N:N) ---
  storage.linkMeasure(userId, wigCareerGoalId, measureId, injectedDb?): Promise<GoalLinkRow>; // ON CONFLICT DO NOTHING (idempotente DEC-menor-2); seta WIG draft→active
  storage.getMeasuresForWig(userId, wigCareerGoalId, injectedDb?): Promise<GoalRow[]>;
  storage.getWigsForMeasure(userId, measureId, injectedDb?): Promise<WigView[]>;

  // --- snapshots ---
  storage.upsertGoalSnapshot(input: SnapshotInput, injectedDb?): Promise<GoalSnapshotRow>; // ON CONFLICT (goal_ref_id, week_start_date) DO UPDATE
  storage.getSnapshotsForGoal(userId, goalRefId, opts?: {limit?: number}, injectedDb?): Promise<GoalSnapshotRow[]>;
  storage.getLatestSnapshotsForUser(userId, weekStartDate: string, injectedDb?): Promise<GoalSnapshotRow[]>;
}
```

**Helpers puros (testáveis sem DB):**
- `server/coach/goals/computePace.ts` — `computeExpectedNow(baseline, target, createdAt, deadline, now): number|null` +
  `deriveStatus(actual, expectedNow, target, direction): GoalStatus` (thresholds DEC-A3, divisão-por-zero tratada).
- `server/coach/goals/aggregateCurrentValue.ts` — `aggregateCurrentValue(userId, sourceMetric, window, deps): Promise<{ value: number|null; dataSufficiency: 'ok'|'low'; note?: string }>`.
  Read-only; despacha por `sourceMetric` (mapa RF-05); financeira → FX→USD (#6); performance → `getPerformanceByPeriod`
  com `grind_session_id IS NULL` (§6.1, R11); `numeric` da coluna parseado via `coerceFiniteNumber(parseFloat(v))` na
  boundary (nunca `Number()` cego). **Pode opcionalmente** delegar a `getPlannedVsActual` (ADR-227, R9) onde a
  `sourceMetric` 4DX mapear para uma `SourceMetric` do motor — não é hard-dep.
- `server/coach/goals/sourceMetricMap.ts` — `GOALS_SOURCE_METRIC_MAP` (allowlist controlável RF-04 + fonte RF-05);
  guard test "sem entrada órfã" + "não-controláveis recusadas".

---

## Shape final das tabelas (DDL conceitual)

Ver `Docs/architecture/diagrams/metas-1-fatia-1/er-goals.mermaid` (ER completo) + snippet drizzle abaixo no
modelo de dados. Resumo:

- **`goals`** (medidas de direção): `id` PK, `user_id` FK→users CASCADE, `goal_kind` default `'measure'`, `goal_type`
  CHECK `{process,performance,result}`, `category` CHECK (7 valores), `title`, `source_metric` (allowlist RF-05),
  `target_value` numeric, `unit`, `cadence` `{weekly,daily}`, `direction` default `'up'`, `horizon` CHECK
  `{week,month,quarter,season}`, `status` default `'active'`, `origin` default `'manual'`, timestamps + `archived_at`.
  Índices `(user_id,status)`, `(user_id,goal_kind)`.
- **`goal_wig_meta`** (filha 1:1 da WIG): `career_goal_id` PK + FK→career_goals(id) CASCADE **(SQL-only)**, `user_id`
  FK→users CASCADE, `baseline_value` numeric **NOT NULL** (X imutável), `target_value_4dx` numeric, `source_metric`,
  `unit`, `horizon_4dx` CHECK `{quarter,season}` (WIG é lag longo), `wig_role`, `coach_tone_at_create`, `origin`,
  timestamps.
- **`goal_links`**: `id` PK, `user_id` FK CASCADE, `wig_career_goal_id` (FK→career_goals SQL-only), `measure_id`
  FK→goals CASCADE, `created_at`, **UNIQUE `(wig_career_goal_id, measure_id)`**.
- **`goal_progress_snapshots`**: `id` PK, `user_id` FK CASCADE, `goal_ref_id`, `goal_kind` `{measure,wig}`,
  `week_start_date` DATE UTC, `current_value`/`expected_value`/`compliance_pct` numeric nullable, `streak_days` int
  default 0, `status`, `data_sufficiency` default `'ok'`, `created_at`, **UNIQUE `(goal_ref_id, week_start_date)`**,
  índice `(user_id, week_start_date)`.

---

## Consequências

**Positivas:**
- Destrava o placar 4DX (D1+D2+D3) com ~70% do valor sem o motor fino (estratégia §2.3).
- `career_goals`/AI-2B **100% intocados** — zero risco de regressão no domínio de carreira; o débito latente R3 fica
  isolado e documentado, não ampliado.
- WIG **estende** `career_goals` (honra DEC-A6) sem universo paralelo: a Metas lê `career_goals` para a WIG; o cap-2
  conta só as WIG-4DX (com `goal_wig_meta`).
- Sem cron novo, sem fila, sem LLM (DEC-A1 on-read) → barato, reversível, idempotente.
- Contrato de storage + helpers puros congelados → test-writer escreve guard tests contra números fixos (DEC-A3) e
  rotas reais (DEC-A8).

**Negativas / riscos:**
- **Débito latente AI-2B (R3) NÃO consertado** — `careerGoalsStorage.createCareerGoal` ainda escreve contra placeholder
  em prod. **Risco MÉDIO, pré-existente.** Mitigação: a Metas **não usa** `careerGoalsStorage.createCareerGoal` para
  criar a WIG — usa `storage.createWig` (novo, que insere na `career_goals` real via SQL parametrizado/drizzle-or-raw
  no goalsStorage, **não** pelo placeholder). Follow-up grepável: formalizar `career_goals` no drizzle + fix AI-2B num
  sprint próprio (fora deste). **Documentar no resumo + CLAUDE.md.**
- **FK SQL-only para `career_goals`** (não no drizzle) — drizzle não valida a referência em type-level; a integridade é
  garantida pela migration SQL + ownership por código. **Risco BAIXO** (padrão aceitável; R2 já vive assim).
- **JOIN extra para ler a WIG** (`career_goals × goal_wig_meta`) — volume ≤2/user, irrelevante.
- **Snapshots com buracos** (DEC-A1 on-read, sem cron) — sparkline pode ter semanas ausentes se o user não abre o
  placar. **Risco BAIXO**, documentado; METAS-1.1 preenche via tick.
- **Outcome bias** — pressão para ver P&L no placar; D3/D9 escondem deliberadamente (RF-06 guard de ausência).
- **Working tree compartilhada** (#24/#45) — toca `shared/schema.ts` (3 tabelas novas), `server/storage.ts` (attach),
  `client/src/App.tsx` (2 rotas). Mitigação: `git add` explícito por arquivo, nunca `-A`.

**Neutras:**
- `goal_kind` discriminador em `goals` preparado mas só `'measure'` usado (WIG vive em career_goals+filha).
- `direction` flag preparada; só `'up'` exercitado na fatia-1.
- Templates RF-14: **FORA da fatia-1** (founder confirmou core-first — spec §ESCOPO). O endpoint
  `POST /api/goals/templates/:profile/apply` **não é construído** nesta fatia (a ordem de rota DEC-A8 já o prevê para
  METAS-1.1, sem custo de registrar agora). RF-09/10/13/15 e LLM = FORA.

## Confiança
**Alta** — DEC-A6-impl resolvida a partir do contraste verificado R2/R3 (career_goals quebrado no drizzle) vs R6
(weekly_planning_sessions funcional), que torna a opção (b) a única que honra DEC-A6 sem mexer no AI-2B. Thresholds
(DEC-A3) e ordem de rota (DEC-A8) derivados de padrões SHIPPED (EST-6). Incerteza residual: maturidade das fontes de
agregação (degrade gracioso já previsto) e o débito AI-2B (isolado, não ampliado).

---

## Apêndice — Diagramas
- `Docs/architecture/diagrams/metas-1-fatia-1/er-goals.mermaid` — ER das 3 tabelas novas + relação com `career_goals`.
- `Docs/architecture/diagrams/metas-1-fatia-1/scoreboard-sequence.mermaid` — `GET /scoreboard` (CRUD→agregação→pace→status→UPSERT snapshot).
- `Docs/architecture/diagrams/metas-1-fatia-1/create-goal-flow.mermaid` — fluxograma da validação de criação (WIG vs medida, erros nomeados).
