# ADR-234: METAS-2 (fatia-2) — Ponte de sourceMetric para o motor de aderência + categoria `leak_focus`

## Status
Aceito

## Data
2026-06-02

## Contexto

A **fatia-1** da Ferramenta de Metas 4DX (ADR-229) entregou o core: 4 tabelas (`goals`, `goal_wig_meta`, `goal_links`, `goal_progress_snapshots`), CRUD, placar `GET /api/goals/scoreboard` e snapshot semanal on-read (chave UTC). Nessa fatia o `compliancePct` é **proxy**: o scoreboard nunca escreve a coluna `compliance_pct` do snapshot e grava `dataSufficiency: "ok"` **hardcoded**; o `current` vem de `aggregateCurrentValue` (agregação direta) e o `status` só de `deriveStatus` (pace).

Duas dependências amadureceram desde então:

- **Motor de aderência** (ADR-227): `getPlannedVsActual(userId, sourceMetric, period, injectedStorage?) → PlannedVsActual` compara **plano EST-6 (intencionado) × realizado** por janela UTC. Distingue `skipped` (A4 — `compliancePct=null`) de `shortfall>0` (não feito). Contrato em `server/coach/adherence/types.ts`.
- **getStatsLeaks** (ADR-231): `storage.getStatsLeaks(userId, top) → StatLeak[]`, ordenado por `severity` (sintético `>0`), com `value`/`delta` **sempre `null`** (não há HUD number) e `benchmark` do catálogo ou `null`. `coach_leak_focus.status='resolved'` é o sinal de resolução.

Dois problemas concretos a resolver na fatia-2:

1. **Vocabulário divergente de `sourceMetric` (gap real, não bug).** A fatia-1 nomeia `sessions_per_week`, `study_minutes_week`, …; o motor nomeia `grind_sessions_count`, `study_minutes`, …. Para uma meta de processo ser medida pelo motor, é preciso uma **ponte de vocabulário**. Métricas de performance/financeira **não têm plano semanal** → continuam agregação direta.
2. **Categoria `leak_focus` é recusada hoje** (`createMeasureHandler` retorna `lead_no_data_source` porque não há `sourceMetric` mapeada). Habilitá-la exige (a) uma `sourceMetric` controlável + fonte, (b) um lugar para o `statId` alvo **sem migration**, e (c) uma medição de progresso **honesta** (o `getStatsLeaks` não dá delta-de-mão; só severity sintético + sinal de resolução).

**Restrições travadas pela spec** (`Docs/specs/sprint-metas-2-fatia-2-2026-06-02.md`): SEM migration (colunas `compliance_pct`/`streak_days`/`data_sufficiency` já existem e `upsertGoalSnapshot` já as aceita); integração **estritamente aditiva** ao contrato do scoreboard (lesson #7); degradação graciosa (lessons #9/#11 — log antes do fallback, nunca fabricar dado); motor chamado **só** com `kind:'week'` (DEF-1, dívida do motor em `month`/`quarter`); tier gate inalterado (DEC-7).

**Verificado no worktree (2026-06-02):**
- `GOALS_SOURCE_METRIC_MAP` (`server/coach/goals/sourceMetricMap.ts`) tem 8 chaves; `leak_focus` NÃO está nele e `createMeasureHandler` recusa o que falta nele.
- `SOURCE_METRIC_MAP` do motor (`server/coach/adherence/sourceMetricMap.ts`) cobre `grind_sessions_count`, `grind_days`, `planned_tournaments_count`, `study_minutes`, `study_sessions_count`, `lessons_recommended_done`, `themes_focus_studied` (NÃO `warmup_compliance`).
- `upsertGoalSnapshot` (`server/storage/goalsStorage.ts:464`) já lê `compliancePct`/`streakDays`/`dataSufficiency` do input (UPSERT idempotente `UNIQUE(goal_ref_id, week_start_date)`). O scoreboard só não os passa.
- `coach_leak_focus` é keyed por `leakCode`/`baselineStatKey` + `targetMonth` (não por statId direto); tem `status` (`active`/`resolved`/…) + `resolvedAt`. `StatLeak.statId` é catalog id, `custom_*` ou `leak:<leakCode>` (órfão sem catálogo) — derivado de `baselineStatKey` em `detectLeaks.ts`.
- `isValidStatId` em `server/coach/statId.ts`.

---

## Decisão

Introduzir uma **ponte de vocabulário** (módulo puro) que decide, por `sourceMetric` de meta, se ela resolve via motor (e qual `SourceMetric` do motor usar) ou via agregação direta; habilitar a categoria `leak_focus` com `statId` alvo via **convenção de sufixo no `sourceMetric`** (sem coluna nova) e progresso medido por um **helper puro** que combina resolução + saída do radar + esforço; enriquecer o scoreboard de forma **aditiva** isolando cada meta em try/catch; e propagar `compliancePct`/`dataSufficiency` reais ao snapshot.

As 7 decisões (D-1..D-7) abaixo respondem às questões do architect.

### D-1 — Onde mora a ponte de vocabulário e como decide motor vs direto

**Novo módulo puro `server/coach/goals/adherenceBridge.ts`** (NÃO estender `sourceMetricMap.ts` da fatia-1, que é a allowlist de agregação direta — manter as duas tabelas com responsabilidades distintas; lesson #10, fonte única por decisão). Exporta:

```ts
import type { SourceMetric } from "../adherence/types";

/** Ponte fatia-1 sourceMetric -> motor SourceMetric. Fonte ÚNICA da decisão. */
export const GOAL_METRIC_TO_ADHERENCE: Record<string, SourceMetric> = {
  sessions_per_week: "grind_sessions_count",
  grind_days: "grind_days",
  study_minutes_week: "study_minutes",
  study_sessions_count: "study_sessions_count",
};

/** true quando a meta resolve via getPlannedVsActual (tem entrada na ponte). */
export function resolvesViaAdherence(sourceMetric: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOAL_METRIC_TO_ADHERENCE, sourceMetric);
}

/** O SourceMetric do motor para essa meta, ou null (agregação direta). */
export function bridgedSourceMetric(sourceMetric: string): SourceMetric | null {
  return GOAL_METRIC_TO_ADHERENCE[sourceMetric] ?? null;
}
```

Decisão "motor vs direto" = **presença na ponte** (`resolvesViaAdherence`). `leak_focus_progress[:statId]` (D-4) **não** entra nesta ponte simples — tem resolução dedicada (D-3). `roi_pct`/`abi`/`itm_pct`/`bankroll_usd` ficam fora → agregação direta da fatia-1 (rota intocada — back-compat).

**Não quebra fatia-1:** a ponte é aditiva; metas sem entrada caem exatamente no caminho atual. Guard test obrigatório: (a) `GOAL_METRIC_TO_ADHERENCE` tem exatamente as 4 chaves de volume/estudo (validar presença individual — lesson #8, não length); (b) cada valor ∈ `SOURCE_METRIC_MAP` do motor (sem órfão); (c) `roi_pct`/`bankroll_usd` NÃO têm entrada.

### D-2 — Como o scoreboard chama o motor sem N+1 ruim

**1 chamada `getPlannedVsActual` por medida-via-motor**, dentro do `Promise.all` já existente sobre as medidas (cada `buildScoreboardEntry` resolve sua meta). O motor faz suas próprias leituras (grind sessions com `{limit:200}`, study sessions, weekly planning) **por chamada**. Cap de metas ativas = **3 medidas + 2 WIGs** (enforçado em `createMeasureHandler`/`createWigHandler`). WIGs NÃO passam pelo motor (lag, sem plano). Logo o pior caso é **≤3 chamadas ao motor** por scoreboard, cada uma fazendo ~2–4 leituras de storage → **≤12 leituras adicionais/scoreboard**, em paralelo.

**Custo aceitável e documentado:** o scoreboard não está em hot-path de alta frequência (placar lido sob demanda no `/metas`). NÃO se introduz cache nem batching nesta fatia (over-engineering para ≤3 metas). Mitigação de redundância: dentro de uma mesma chamada de scoreboard, metas distintas que mapeiem para a **mesma dimensão grind** (ex.: `sessions_per_week`→`grind_sessions_count` e `grind_days`→`grind_days`) recarregam grind sessions — aceito (≤2 recargas de até 200 rows). Se virar problema (improvável com cap 3), follow-up: memoizar `getGrindSessions`/`getStudySessionsV2` por (userId, janela) num cache de request. **Documentado como dívida leve** (não nesta fatia).

### D-3 — Onde mora a lógica de progresso do leak_focus + contrato

**Novo helper puro `server/coach/goals/leakFocusProgress.ts`** (paridade com `detectLeaks`/`mentalResultInsights`: puro, sem DB, sem `new Date()` interno — recebe tudo pronto por composição, lesson #34). Contrato:

```ts
import type { GoalStatus } from "@shared/goals";
import type { StatLeak } from "../leaks/types";

export interface LeakFocusInputs {
  /** statId alvo da meta (já parseado/validado pelo caller — D-4). */
  targetStatId: string;
  /** alvo de esforço da meta (goals.targetValue) — nº de stat_analysis na janela. */
  targetValue: number;
  /** getStatsLeaks(userId, N) já resolvido (top N). [] = stub/sem leaks. */
  leaks: StatLeak[] | null;
  /** true se getStatsLeaks lançou (caller capturou) — degrade source_error. */
  leaksErrored?: boolean;
  /**
   * resolução: status do coach_leak_focus cujo statId casa com targetStatId
   * (match por StatLeak.statId / baselineStatKey / leak:<code>). undefined = nenhum.
   */
  leakFocusStatus?: string;
  /** nº de study_sessions_v2 mode='stat_analysis' do statId na janela (esforço). */
  statAnalysisCountInWindow: number;
}

export interface LeakFocusProgress {
  status: GoalStatus;             // contrato fatia-1 — NÃO inventa enum (lesson #7/#8)
  compliancePct: number | null;   // esforço (count/target) clampado 100; null se degradado
  dataSufficiency: "ok" | "low";
  note: "resolved" | "left_radar" | "attacking" | "no_attack" | "source_stub" | "source_error";
}

export function evaluateLeakFocusProgress(input: LeakFocusInputs): LeakFocusProgress;
```

Lógica (DEC-4 travada na spec):

```
1. leakFocusStatus === 'resolved'                 -> { achieved, 100, ok, 'resolved' }
2. leaksErrored                                    -> { (preserva via caller/at_risk neutro), null, low, 'source_error' }  + log antes
3. leaks == null || leaks.length === 0            -> { (preserva), null, low, 'source_stub' }                            + log antes
4. targetStatId NÃO está em leaks (saiu do radar) -> esforço>0 ? 'ahead' : 'on_track'; compliancePct via esforço; ok; 'left_radar'
5. targetStatId AINDA em leaks:
     statAnalysisCountInWindow > 0                 -> 'behind' (atacando); compliancePct via esforço; ok; 'attacking'
     senão                                         -> 'at_risk' (no radar, sem ataque); compliancePct=null; ok; 'no_attack'
```

`compliancePct` via esforço = `min(100, round(statAnalysisCountInWindow / targetValue * 100))` quando `targetValue > 0`; **`null`** quando `targetValue<=0` ou degradado ou caso 5b (sem ataque) — **nunca** fabrica severity/delta (DEC-A4 → `null` quando não há sinal de esforço). **Log antes do fallback** nos casos 2/3 (lessons #9/#11).

O caller (scoreboard handler) faz a composição: chama `getStatsLeaks` (try/catch → `leaksErrored`), busca `coach_leak_focus` do user e casa o `statId`, conta `study_sessions_v2 mode='stat_analysis'` do statId na janela, e passa tudo ao helper.

### D-4 — statId alvo do leak_focus sem coluna nova (DEC-A1)

**Convenção de sufixo no `sourceMetric`**: `sourceMetric = "leak_focus_progress:<statId>"` (padrão `leak:<code>` do `detectLeaks`), **sem coluna nova / sem migration**. Parser único em `adherenceBridge.ts` (ou módulo dedicado `leakFocusSourceMetric.ts`):

```ts
export const LEAK_FOCUS_PREFIX = "leak_focus_progress";
/** "leak_focus_progress:<statId>" -> statId | null (sem statId -> null). */
export function parseLeakFocusStatId(sourceMetric: string): string | null;
/** true se sourceMetric começa com "leak_focus_progress" (com ou sem statId). */
export function isLeakFocusMetric(sourceMetric: string): boolean;
```

Validação na criação (`createMeasureHandler`): se `isLeakFocusMetric(sourceMetric)`, extrair statId e validar com `isValidStatId` — statId ausente/inválido → **`lead_no_data_source`** (não persiste lixo). A `sourceMetric` "raiz" `leak_focus_progress` entra na **allowlist** (`CONTROLLABLE_SOURCE_METRICS` em `shared/goals.ts`) **e** no `GOALS_SOURCE_METRIC_MAP` com `kind` novo `"leak"` — assim `createMeasureHandler` não recusa em `lead_not_controllable` nem `lead_no_data_source`. O parser ignora o sufixo `:statId` ao consultar a allowlist (compara só a raiz).

**Não colide com sourceMetrics existentes:** nenhum sourceMetric da fatia-1 usa `:` nem começa com `leak_focus_progress`. `aggregateCurrentValue` ganha um early-return para `kind:'leak'` (não cai em volume/study/financial/performance — o leak não tem agregação direta; o scoreboard o resolve via helper antes de chamar `aggregateCurrentValue`).

### D-5 — Contrato exato do scoreboard (aditivo, back-compat)

`GET /api/goals/scoreboard` **adiciona** por entry de medida; **não remove nem renomeia** (`current/target/expectedNow/status` intactos):

```jsonc
"measures": [{
  "id": "...", "title": "...", "sourceMetric": "...",
  "current": "number|null",       // metas via motor: = adherence.actual (D-?/DEC-3)
  "target": "number",
  "expectedNow": "number|null",   // pace (inalterado)
  "status": "ahead|on_track|behind|at_risk|achieved",
  // ---- ADIÇÕES fatia-2 (opcionais; ausentes/null em metas diretas) ----
  "compliancePct": "number|null", // motor ou leak; null p/ performance/financeira/degradado
  "dataSufficiency": "ok|low",    // real (deixa de ser hardcoded 'ok')
  "adherence": {                  // presente só em metas via motor
    "planned": "number|null", "actual": "number",
    "skipped": "boolean", "shortfall": "number|null",
    "overachieved": "boolean", "note": "AdherenceNote"
  } // | null
}]
```

WIGs: **sem mudança** (não passam pelo motor). `snapshotsWeek` inalterado. Consumidores da fatia-1 (testes ADR-229 + UI legada) continuam verdes: os campos novos são adições opcionais. Para meta **via motor**: `current = adherence.actual` (evita dois "realizados" divergentes na tela — DEC-3); `status` continua via `deriveStatus(current, expectedNow, target, dir)` (o motor enriquece, não substitui o status), **exceto** `skipped` (D-7 abaixo). Para meta **leak_focus**: `current = statAnalysisCountInWindow`, `status`/`compliancePct`/`dataSufficiency` do helper, `adherence = null`.

### D-6 — dataSufficiency: do motor → measure → snapshot

O scoreboard hoje grava `dataSufficiency: "ok"` hardcoded e nunca grava `compliancePct`. Fatia-2:
- `dataSufficiency` por entry = real (`PlannedVsActual.dataSufficiency` p/ motor; `AggregateResult.dataSufficiency` p/ direta; `LeakFocusProgress.dataSufficiency` p/ leak).
- `compliancePct` por entry = real (`PlannedVsActual.compliancePct` | `LeakFocusProgress.compliancePct` | `null` p/ direta).
- O `upsertGoalSnapshot` on-read passa a receber `{ compliancePct, dataSufficiency }` reais por entry (já suportado — `goalsStorage.ts:464`). `streakDays` permanece `0`/default (cálculo de streak fora de escopo — documentado). Idempotência preservada (UNIQUE `(goal_ref_id, week_start_date)`).

### D-7 — Isolamento de falha (lesson #9) + `skipped` neutro (DEC-A2)

**Isolamento:** cada entry já roda em try/catch dentro do `Promise.all`. Fatia-2 mantém: motor lança / retorna degradado (`no_plan`/`source_error`/`window_open`) ou `getStatsLeaks` lança → **log antes do fallback**, a meta degrada (`compliancePct=null`, `dataSufficiency='low'`, `current` cai no `aggregateCurrentValue` da fatia-1 como fallback — DEC-A5), e o **scoreboard responde 200** (outras metas intactas). Nunca 500 por uma meta degradada.

**`skipped` (A4):** quando `breakdown.skipped=true`, `compliancePct=null` e o `status` **não** vira `at_risk` por isso. **Reusar `on_track` + flag `adherence.skipped=true`** (NÃO inventar enum novo — `GoalStatus` é contrato fatia-1, lesson #7/#8). A UI rotula "pulado conscientemente" via o flag.

---

## Opções Consideradas

### Ponte de vocabulário (D-1)
- **Opção A — módulo novo `adherenceBridge.ts` (escolhida).** Prós: separa "agregação direta" (fatia-1) de "resolve via motor" (fatia-2); fonte única por decisão; guard test isolado. Contras: mais um arquivo.
- **Opção B — estender `GOALS_SOURCE_METRIC_MAP` com um campo `adherenceMetric?`.** Prós: um só mapa. Contras: mistura duas responsabilidades (agregação direta × ponte) num record já consumido por `aggregateCurrentValue`; risco de o guard test e os consumers da fatia-1 quebrarem; viola "fonte única por decisão".

### statId alvo do leak_focus (D-4)
- **Opção A — sufixo `leak_focus_progress:<statId>` no `sourceMetric` (escolhida).** Prós: sem migration; padrão já usado (`leak:<code>`); parser único + `isValidStatId`. Contras: sourceMetric carrega dois conceitos (tipo + alvo) — mitigado por parser único.
- **Opção B — nova coluna `target_stat_id` em `goals`.** Prós: limpo semanticamente. Contras: **migration** (a spec proíbe); over-engineering para um único uso.
- **Opção C — reusar `title`.** Contras: frágil, title é texto livre PT-BR do usuário.

### Progresso do leak_focus (D-3)
- **Opção A — esforço + resolução + saída do radar (escolhida, DEC-4).** Prós: honesto; `getStatsLeaks` não dá delta-de-mão, então medir "delta caiu" seria fabricar dado (lesson #11). Contras: `compliancePct` de leak é "esforço", não "resultado" — documentado explicitamente.
- **Opção B — derivar progresso de `severity`.** Contras: severity é sintético; queda de severity não significa melhora real → dado fabricado.

---

## Consequências

**Positivas**
- Metas de processo ganham `compliancePct` rigoroso que distingue "pulado conscientemente" (A4, `null`) de "abaixo do plano" (shortfall) — alinhado ao curso mental (cobra comportamento, não culpa).
- `leak_focus` deixa de ser recusada; jogador rastreia se ataca/resolve o leak, com medição honesta.
- `compliance_pct`/`data_sufficiency` reais passam a ser persistidos (histórico de snapshot deixa de mentir `ok`).
- Zero migration; contrato HTTP estritamente aditivo (testes fatia-1 verdes).

**Negativas / dívida**
- `compliancePct` de leak_focus é proxy de **esforço** (sessões de stat_analysis), não de resultado — documentado; um sinal de resultado fino só existirá se um delta-de-mão real surgir.
- `streakDays` continua `0` (cálculo de hábito A9 deferido).
- Motor chamado só com `kind:'week'` (DEF-1); metas `month`/`quarter` continuam status via pace + agregação direta até o motor expandir recorrências (TODO `adherence/MEDIUM-1`).
- `lessons_recommended_done` via motor NÃO mapeado (DEF-2 — `actual` binário pode emitir `compliancePct:100` falso).
- Possível recarga redundante de grind/study sessions quando 2 metas mapeiam a mesma dimensão (≤2x, cap 3 metas) — memoização por request é follow-up leve.

**Neutras**
- Sem endpoint novo; muda comportamento interno de `GET /api/goals/scoreboard` + gate de `POST /api/goals`.
- Tier gate inalterado (DEC-7): leitura todos os tiers, escrita `getReportTier !== 'free'`.

## Confiança
Alta. Todas as dependências (motor ADR-227, leaks ADR-231, fatia-1 ADR-229) estão prontas e verificadas no worktree; o desenho é aditivo e isolado por entry.

## Referências
- ADR-227 — Motor de aderência plano-vs-realizado (`getPlannedVsActual`, `PlannedVsActual`).
- ADR-229 — Metas 4DX fatia-1 (core: tabelas, scoreboard, snapshot on-read).
- ADR-231 — Fase C #3, getStatsLeaks síntese comportamental (`StatLeak`).
- Spec: `Docs/specs/sprint-metas-2-fatia-2-2026-06-02.md`.
- Lessons #3 (mock = shape real), #7/#8 (aditivo / enum), #9/#11 (log antes / nunca fabricar), #10 (fonte única), #34 (injectedStorage 3º arg).
