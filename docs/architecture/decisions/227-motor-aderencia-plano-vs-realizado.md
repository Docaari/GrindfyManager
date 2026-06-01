# ADR-227: Motor de Aderência (plano-vs-realizado) — Fase A

## Status
Aceito

## Data
2026-06-01

## Contexto

O loop GRIND→ESTUDA→IMPORTA→RITUAL→METAS→EXECUTA→**ADERÊNCIA** está cortado no último elo. O EST-6 (`weeklyPlanningOrchestrator`) **persiste o plano intencionado** (`weekly_planning_sessions.steps`, `study_weekly_plans`, `planned_tournaments`, `coach_lesson_recommendations`) e o EST-5 (`weeklyReviewOrchestrator`) monta o recap de segunda — mas **nenhum código compara plano × realizado**. Hoje o `buildRecap` (`buildRecap.ts`) mostra apenas o **realizado** (volume/profit/ROI/estado mental/estudo da semana passada). O mentor recomenda; não cobra.

Esta é a fundação 4DX (doutrina A9: *você cai ao nível dos seus sistemas, não sobe ao nível das suas metas*). O motor mede o **sistema cumprido** (plano executado), não o resultado, e distingue **"pulado conscientemente"** de **"não feito"** (A4 — cobra comportamento, não culpa). É o **item keystone #7 do board ICE**: a Ferramenta de Metas (fatia 2) reusa este motor como `sourceMetric` rigorosa para `compliancePct` fino, e o recap de segunda (EST-5) o consome para a frase "semana passada você planejou X, realizou A".

A spec aprovada (`Docs/specs/sprint-fase-a-motor-aderencia-2026-06-01.md`) define o contrato `getPlannedVsActual` (DEC-A7) e deixa 8 decisões abertas (DEC-MA1..8) para o System-Architect. Este ADR resolve as 8, formaliza o contrato TS estável, e fixa o ponto de plugagem no EST-5.

### Achados de investigação do código real (lesson #3/C1 — validar shape, não idealizar)

| Fonte | Método storage | Assinatura real | Filtros nativos | Implicação para o motor |
|---|---|---|---|---|
| Plano (steps) | `getWeeklyPlanningSession(userId, weekStartDate: string)` | `weeklyPlanningStorage.ts:113` | `(user_id, week_start_date)` exato | retorna `steps` jsonb já normalizado (shape `shared/coach-planning.ts`) |
| Grade planejada | `getPlannedTournaments(userId, dayOfWeek?)` | `storage.ts:3980` | filtra `is_active=true` só quando `dayOfWeek` passado | **`planned_tournaments` é RECORRENTE** (`dayOfWeek` 0-6 + `time` HH:MM) — **NÃO tem `scheduledDate`** (spec assumia campo inexistente). Dias planejados = `distinct(dayOfWeek)` das rows ativas que caem na janela. |
| Plano de estudo | `getStudyWeeklyPlan(userId, weekStartDate?: Date)` | `storage.ts:15692` | `(user_id, week_start_date)` UTC | `dailyTargetMinutes` int notNull + `planJsonb.days[].activities[].estimatedMinutes` |
| Grind realizado | `getGrindSessions(userId, {limit?, offset?})` | `storage.ts:1779` | **SEM status, SEM range** (só limit/offset, ORDER BY `date`) | motor filtra `status='completed'` + `date ∈ janela` **in-memory** |
| Grind count | `countGrindSessions(userId, range?)` | `storage.ts:1809` | range por `date`, **SEM status** | não serve sozinho (precisa do status); preferimos `getGrindSessions` + filtro in-memory para 1 query rica |
| Estudo realizado | `getStudySessionsV2(userId, {mode?, from?, to?, limit?})` | `storage.ts:14904` | range por `registeredAt`, filtra `deletedAt IS NULL`, **SEM status** | motor filtra `status='completed'` in-memory; `mode='stat_analysis'` conta (não filtra mode); `durationMinutes` notNull int |
| Torneios da sessão | `getSessionTournaments(userId, sessionId?)` | `storage.ts:4145` | por sessão | realizado de `planned_tournaments_count` (§6.1 — volume de sessão) |
| Break feedbacks | `getBreakFeedbacksBySessionIds(userId, ids)` | `storage.ts:4116` | — | não usado no motor (é do EST-2); listado só por contexto |
| Leaks (temas) | `getStatsLeaks(userId, top)` | `storage.ts:9614` | **STUB — retorna `[]`** | `themes_focus_studied` degrada gracioso (RF-07) |
| Recs de aula | `getCoachRecommendationByUserAndWeek(userId, brtKey, source)` | `storage.ts:14215` | chave **BRT** | `lessons_recommended_done` converte UTC→BRT via `brtMondayYmd` (não unifica) |

**Conclusão de schema:** **ZERO coluna nova, ZERO tabela nova → SEM MIGRATION.** O motor é interface TS pura que lê tabelas existentes, análogo ao EST-2 (ADR-225). Todos os métodos de plano e de realizado já existem no storage. **Nenhum método novo de storage é necessário** para o escopo desta fase (RF-09 warmup deferido). O motor filtra `status` in-memory porque os getters existentes não o fazem — aceitável dado o volume (≤200 sessões/semana, lendo com `limit` razoável).

---

## Opções Consideradas

### Opção 1: Motor stateless, read-only, on-demand, importável (sem endpoint, sem persistência)
- **Prós:** zero migration; idempotência trivial (regra 4 do contrato); a persistência de snapshot fica na Metas (fatia-2) onde pertence; espelha o padrão `weeklyReportGenerator`/`buildRecap` (helpers puros já no repo); testável com `injectedStorage` (lessons #34/#36) sem `vi.mock('../storage')`.
- **Contras:** recomputa a cada chamada (sem cache) — mas custo é ≤3 queries/métrica e a Metas batcha por janela.

### Opção 2: Motor com tabela `adherence_snapshots` própria + cron de materialização
- **Prós:** placar instantâneo; histórico de aderência queryável.
- **Contras:** migration + cron + invalidação (lesson #21 — cache TTL + invalidator); **duplica** a responsabilidade da Metas (`goal_progress_snapshots` — RF-08 da metas-tool); acopla o motor a um job. Viola "fundação neutra". Reverter é caro.

### Opção 3: Endpoint HTTP `GET /api/coach/adherence` nesta fase
- **Prós:** o client poderia consultar direto.
- **Contras:** nenhum consumidor client nesta fase (a surface é o recap EST-5 server-side + import in-process pela Metas); endpoint exige guard de colisão de rota (lições EST-3/5/6) sem ganho. Fora de escopo.

### Decisão de local do tipo (DEC-MA1): `server/coach/adherence/types.ts` vs `shared/adherence.ts`
- **server-only agora:** a Metas fatia-2 é **server-side** (importa o motor in-process para preencher `goal_progress_snapshots`); o tipo não precisa cruzar para o client nesta fase. Promover para `shared/` quando/se um componente client consumir `PlannedVsActual` diretamente — barato (re-export).
- **shared imediato:** prematuro; nenhum consumidor client existe.

---

## Decisão

**Opção 1.** O motor vive em `server/coach/adherence/` (módulo importável, stateless, read-only, on-demand), espelhando o padrão de `server/coach/planning/`:

```
server/coach/adherence/
├── index.ts            # getPlannedVsActual + buildAdherenceRecap (exports públicos)
├── types.ts            # contrato estável (DEC-A7) — server-only por ora (DEC-MA1)
├── sourceMetricMap.ts  # SOURCE_METRIC_MAP + DIMENSION_KEY_BY_METRIC (guard test)
├── compute.ts          # computeCompliance + classificação de breakdown (puro)
├── recap.ts            # buildAdherenceRecap (RF-08) — batcha grind+study
└── adherenceRecapTone.ts # regras de tom A4 em arquivo único (lesson #10)
```

`resolveStorage(injected)` = `injected ?? (await import('../../storage')).storage` (idêntico ao orchestrator EST-5/6). Reusa `weekKeys.ts` (`ymdUtc`/`ymdToUtcDate`) — não recria lógica de semana. **Sem migration.**

### Resolução das decisões abertas (DEC-MA1..8)

**DEC-MA1 — Local do tipo:** `server/coach/adherence/types.ts` (server-only). A Metas fatia-2 (server-side) importa de lá. Promover a `shared/adherence.ts` só quando um consumidor client existir. **Decidido: server-only agora.**

**DEC-MA2 — Limites de `month`/`quarter`:** alinhar ao `period_start` dos reports existentes (AI-1C/2B): `month` = `[1º dia do mês UTC, +1 mês)`; `quarter` = `[1º dia do trimestre civil UTC, +3 meses)`. Reusar a mesma noção de `period_start` evita divergência com Monthly/Quarterly Report. **Nesta fase só `week` é exercitado** (o recap EST-5 e a Metas fatia-2 usam semana); `month`/`quarter` ficam implementados mas exercitados quando a Metas pedir. `week` = `[ymdToUtcDate(weekStartDate), +7 dias)`.

**DEC-MA3 — Realizado de `planned_tournaments_count`:** `session_tournaments` das sessões da janela (é **volume de sessão**, não performance histórica — §6.1). `tournaments WHERE grind_session_id IS NULL` é só para histórico/dashboard, **não** entra no motor de volume de janela. **Decidido: `getSessionTournaments` das `grind_sessions` da janela.**

**DEC-MA4 — Fonte canônica do `study_minutes` planejado:** soma dos blocos `steps.study` quando há `weekly_planning_sessions` (mais granular; é o que o jogador efetivamente comprometeu no EST-6). Fallback para `study_weekly_plans.dailyTargetMinutes × dias planejados` quando não há `steps.study` mas há `study_weekly_plans` (caso cron `coach_auto`). **Decidido: `steps.study` primário, `study_weekly_plans` fallback** — `note='plan_from_weekly_plan'` sinaliza o fallback. Como o EST-6 `syncStudyWeeklyPlan` deriva `dailyTargetMinutes` dos blocos, as duas fontes convergem quando ambas existem.

**DEC-MA5 — `compliancePct` quando `skipped`:** **`null` + `breakdown.skipped=true`**. Skip é decisão consciente — nem sucesso nem falha (A4). `100` mentiria ao placar da Metas ("cumpriu 100%" quando na verdade optou por não fazer). O consumidor trata `null` como "não pontua". **Decidido: `null`.**

**DEC-MA6 (BLOQUEADOR — RESOLVIDO) — Ponto de plugagem no EST-5:** o recap é montado em `createWeeklyReview` (`weeklyReviewOrchestrator.ts:220`) → `buildWeeklyRecapContent` (`:125`) → `buildRecap` (`buildRecap.ts:39`, chamado em `:179`). Hoje `buildRecap` recebe `RecapInput { periodStart, periodEnd, dashStats7d, mentalState, studyWeek }` e produz só **realizado**. O motor pluga assim:
  - `buildWeeklyRecapContent` (`:125`) chama o novo `buildAdherenceRecap(userId, periodStart /* segunda anterior */, storage)` **antes** de `buildRecap`, dentro de um `safe()` (lesson #9 — degrade se motor falhar).
  - `RecapInput` ganha um campo **opcional** `adherence?: { grind: PlannedVsActual; study: PlannedVsActual; summaryText: string }` (lesson #7 — opcional → back-compat byte-idêntico quando ausente).
  - `buildRecap` (`buildRecap.ts:75 buildMarkdown`) acrescenta uma seção "## Plano vs Realizado" **apenas quando** `adherence` presente e `dataSufficiency==='ok'`; quando `'low'`, emite "ainda sem plano/dado suficiente da semana passada" (D9).
  - `RecapContent.schemaVersion` sobe `1→2` quando `adherence` populado (paridade EST-2/ADR-225: campo opcional bumpando version; ausente → markdown idêntico ao atual).
  - O `weekStartDate` passado a `buildAdherenceRecap` é o `periodStart` (segunda **anterior**) já calculado por `prevWeekPeriod` (`:90`) — a janela comparada é a semana que passou, que é a que tem realizado. **Não inventa rota; não chama LLM** (a narrativa final do recap segue determinística — EST-5 DEC-1). **Decidido e fixado com file:line.**

**DEC-MA7 — Critério de "janela fechada":** janela fechada quando `Date.now() >= ymdToUtcDate(weekStartDate).getTime() + 7*86400000` (UTC). Janela aberta (semana corrente, ainda rolando) → `dataSufficiency='low'`, `note='window_open'` (D9 — não cravar veredito em janela incompleta). Como o recap compara sempre a **semana anterior**, na prática estará sempre fechada — mas a regra protege a Metas que pode pedir a semana corrente. **Decidido: `now >= start + 7d`.**

**DEC-MA8 — RF-09 (`warmup_compliance`):** **DEFERIDO.** Sai do escopo com TODO grepável em `sourceMetricMap.ts`:
```ts
// TODO(motor-aderencia): warmup_compliance — RF-09 stretch.
// Requer cooldown_logs/warm-up rituals 1:1 grind_sessions; degrade gracioso (RF-07).
```
O literal `"warmup_compliance"` **permanece no union `SourceMetric`** (contrato estável — a Metas pode referenciá-lo), mas **não tem entrada em `SOURCE_METRIC_MAP`** → chamar → `unknown_source_metric` até ser implementado. O guard test "sem entrada órfã" valida o **inverso** (toda entrada do MAP resolve fonte); o union pode ter membro sem entrada (documentado). **Decidido: deferir com TODO + nota no resumo.**

### Contrato formalizado (DEC-A7 — shape ESTÁVEL, a Metas fatia-2 importa)

`server/coach/adherence/types.ts`:

```typescript
// =============================================================================
// server/coach/adherence/types.ts — Motor de Aderência (ADR-227 / DEC-A7)
// Contrato ESTÁVEL. A Ferramenta de Metas (fatia-2) importa estes tipos.
// Mudança de shape exige ADR + bump documentado. Server-only por ora (DEC-MA1);
// promover a shared/adherence.ts quando um consumidor client surgir.
// =============================================================================

/** Allowlist de métricas que o motor sabe comparar (RF-02). Estável. */
export type SourceMetric =
  | "grind_sessions_count"
  | "grind_days"
  | "planned_tournaments_count"
  | "study_minutes"
  | "study_sessions_count"
  | "lessons_recommended_done"
  | "themes_focus_studied"
  | "warmup_compliance"; // RF-09 — no union, mas SEM entrada no MAP (DEC-MA8 deferido)

/** Dimensão EST-6 (steps.<key>) à qual a métrica pertence — skip detection (RF-06). */
export type DimensionKey = "grind" | "study" | "lessons" | "themes";

/** Janela de comparação. weekStartDate sempre UTC (ymdUtc) — CLAUDE.md §10. */
export interface AdherencePeriod {
  kind: "week" | "month" | "quarter";
  /** "YYYY-MM-DD" UTC (segunda da semana, ou 1º dia do mês/trimestre). */
  weekStartDate: string;
}

export type DataSufficiency = "ok" | "low";

/**
 * Notas livres do breakdown. Vocabulário fechado (estável) para o consumidor
 * ramificar sem reinterpretar dado cru:
 *   'planned_zero'           — planejou explicitamente 0 (descanso) — dado válido.
 *   'no_plan'                — sem weekly_planning_sessions na janela.
 *   'window_open'            — janela ainda em curso (DEC-MA7) — parcial.
 *   'source_stub'            — fonte é stub/[] (ex: getStatsLeaks) — RF-07.
 *   'source_error'           — fonte lançou; capturado e degradado (RF-07).
 *   'plan_from_weekly_plan'  — study_minutes planejado veio do fallback (DEC-MA4).
 */
export type AdherenceNote =
  | "planned_zero"
  | "no_plan"
  | "window_open"
  | "source_stub"
  | "source_error"
  | "plan_from_weekly_plan"
  | null;

export interface AdherenceBreakdown {
  /** dimensão pulada conscientemente no EST-6 (steps.status='skipped') — A4 (DEC-MA5). */
  skipped: boolean;
  /** planned - actual quando não-feito (>0); null quando skipped/sem plano/overachieved. */
  shortfall: number | null;
  /** realizado > planejado (clampa compliance em 100, mas sinaliza superação). */
  overachieved: boolean;
  /** nota do vocabulário fechado acima; null quando nada a sinalizar. */
  note: AdherenceNote;
}

export interface PlannedVsActual {
  sourceMetric: SourceMetric;
  period: AdherencePeriod;
  /** valor planejado; null quando NÃO há plano na janela (≠ planned=0). */
  planned: number | null;
  /** valor realizado na janela (sempre numérico; 0 = nada feito). */
  actual: number;
  /** min(100, round(actual/planned*100)); null quando planned null/0 ou skipped. */
  compliancePct: number | null;
  /** 'ok' quando plano + janela fechada + dado; 'low' caso contrário (D9). */
  dataSufficiency: DataSufficiency;
  /** detalhamento p/ o consumidor montar a frase A4 sem reinterpretar dado cru. */
  breakdown: AdherenceBreakdown;
}

/** Resultado do helper de recap (RF-08) consumido pelo EST-5. */
export interface AdherenceRecap {
  grind: PlannedVsActual;
  study: PlannedVsActual;
  /** texto A4 pronto, sem culpa (lesson #10 — regras em adherenceRecapTone.ts). */
  summaryText: string;
}

/** Erro nomeado quando sourceMetric fora da allowlist (RF-01) — não 500 genérico. */
export class UnknownSourceMetricError extends Error {
  code = "unknown_source_metric" as const;
  constructor(public readonly sourceMetric: string) {
    super(`unknown_source_metric: ${sourceMetric}`);
    this.name = "UnknownSourceMetricError";
  }
}
```

`server/coach/adherence/index.ts` (assinaturas — o test-writer escreve contra elas):

```typescript
/** RF-01 — serviço puro, read-only, on-demand. injectedStorage é o 3º arg (#34/#36). */
export function getPlannedVsActual(
  userId: string,
  sourceMetric: SourceMetric,
  period: AdherencePeriod,
  injectedStorage?: unknown,
): Promise<PlannedVsActual>;

/** RF-08 — batcha grind+estudo da semana passada p/ o recap EST-5. */
export function buildAdherenceRecap(
  userId: string,
  weekStartDate: string, // semana passada, UTC (= prevWeekPeriod.periodStart do EST-5)
  injectedStorage?: unknown,
): Promise<AdherenceRecap>;
```

`server/coach/adherence/sourceMetricMap.ts` (mapa = fonte única; guard test "sem entrada órfã"):

```typescript
export interface SourceMetricSpec {
  dimensionKey: DimensionKey;
  unit: "sessões" | "dias" | "torneios" | "minutos" | "aulas" | "%";
  /** identificadores das fontes (validados pelo guard test contra o storage). */
  plannedSource: string; // ex: "weekly_planning_sessions.steps.grind" | "getStudyWeeklyPlan"
  actualSource: string;  // ex: "getGrindSessions" | "getStudySessionsV2" | "getSessionTournaments"
}

// warmup_compliance OMITIDO de propósito (DEC-MA8 deferido). O union SourceMetric
// o contém; o MAP não — chamar → unknown_source_metric. Guard test valida que
// toda CHAVE do MAP resolve fontes (não o inverso).
export const SOURCE_METRIC_MAP: Record<
  Exclude<SourceMetric, "warmup_compliance">,
  SourceMetricSpec
> = { /* grind_sessions_count, grind_days, planned_tournaments_count,
        study_minutes, study_sessions_count, lessons_recommended_done,
        themes_focus_studied */ };

/** RF-06 — dimensão EST-6 por métrica (skip detection). Exportado p/ guard test. */
export const DIMENSION_KEY_BY_METRIC: Record<
  Exclude<SourceMetric, "warmup_compliance">,
  DimensionKey
>;
```

**Regra de compliance (compute.ts, pura):**
- `planned > 0` → `compliancePct = min(100, round(actual/planned*100))`.
- `planned === 0` → `compliancePct=null`, `note='planned_zero'`, `dataSufficiency='ok'` (dado válido).
- `planned === null` → `compliancePct=null`, `dataSufficiency='low'`, `note='no_plan'`.
- `actual > planned > 0` → `compliancePct=100`, `breakdown.overachieved=true`.
- `skipped` → `compliancePct=null`, `breakdown.skipped=true` (DEC-MA5).
- Lesson #6 (FX→USD): **N/A nesta fase** — todas as métricas são contagem/minutos. FX só entraria se o motor comparasse P&L (fora de escopo); fica documentado para quem estender.

## Consequências

**Positivas:**
- Fecha o último elo do loop 4DX: o recap de segunda passa a cobrar comportamento (A4), não só recomendar.
- Contrato estável e congelado → a Metas fatia-2 importa sem risco de re-design (mudança exige ADR + bump).
- Zero migration, zero endpoint, zero LLM → barato, reversível, idempotente.
- Reusa 100% dos storage methods existentes (nenhum método novo) — sem dívida de schema.
- Degrada gracioso (RF-07): `weekly_planning_sessions` ausente na maioria dos users (EST-6 recém-shipado, `PlanningWizard` não montado) → `planned=null`/`low` — comportamento **correto** (D9: o motor só "morde" quando há plano).

**Negativas / riscos:**
- **Acoplamento de shape com a Metas** — mitigado congelando o contrato neste ADR; a Metas importa o tipo, não redefine. **Risco médio.**
- **`getStatsLeaks` stub** → `themes_focus_studied` nasce fraco (`source_stub`/`low`); vira real na Fase C (#3). **Risco baixo, documentado.**
- **Filtro de status in-memory** — `getGrindSessions`/`getStudySessionsV2` não filtram `status` no SQL; o motor lê com `limit` e filtra `status='completed'` em memória. Aceitável no volume atual; se um heavy user tiver 1000s de sessões, considerar `getGrindSessions` com filtro de status no storage num sprint futuro (não nesta fase). **Risco baixo.**
- **Chave UTC vs BRT** — `lessons_recommended_done` lê `coach_lesson_recommendations` (BRT); o motor converte explicitamente via `brtMondayYmd` (não unifica — CLAUDE.md §10). Guard test obrigatório. **Risco médio.**
- **Tom A4 escorregar para culpa** no `summaryText` — mitigado por `adherenceRecapTone.ts` (lesson #10, arquivo único) + guard test de tom; o motor entrega só números, a narrativa final do recap é determinística (EST-5). **Risco médio.**
- **Working tree compartilhada** (INCIDENT #24/#45) — o motor toca arquivos novos + `buildRecap.ts`/`weeklyReviewOrchestrator.ts` (EST-5). Mitigação: `git add` explícito por arquivo, nunca `-A`. **Risco operacional.**

**Neutras:**
- `month`/`quarter` implementados mas só exercitados quando a Metas pedir.
- `warmup_compliance` permanece no union (referenciável) mas inativo até RF-09 (Fase futura).

### Dívida de contrato documentada (reviewer APPROVED-WITH-NITS — endereçar na Metas fatia-2)

TODOs grepáveis em `server/coach/adherence/index.ts` (prefixo `TODO(adherence/MEDIUM-N`):

- **MEDIUM-1 — `planned` recorrente ignora a janela em month/quarter.** `computeGrind`/`computePlannedTournaments` contam dias-de-grade distintos / torneios ativos UMA vez. Correto só para `week` (cada `dayOfWeek` aparece ≤1×/semana). Para `month`/`quarter` é preciso expandir as ocorrências recorrentes dentro de `[startMs, endMs)` antes de a Metas consumir, senão `planned` subestima → `compliancePct` inflado. **Não afeta esta fase (só `week`).**
- **MEDIUM-2 — `lessons_recommended_done` é estruturalmente binário.** `actual` é 0 (sem `consumedAt`) OU todas-as-recomendadas (`consumedAt` setado conta `inputSummary.lessonIds`), porque `consumedAt` indica consumo do CARD, não conclusão por-aula. Pode emitir `compliancePct:100` falso (viola D9/lesson #11). Quando existir fonte de conclusão real por aula, tratar como `themes` (`dataSufficiency:'low'` + note enquanto a fonte não existir).
- **MEDIUM-4 (perf) — re-leitura por dimensão.** `buildAdherenceRecap`/cada `getPlannedVsActual` re-lê `getWeeklyPlanningSession` + sessions da mesma janela; `computePlannedTournaments` faz N+1 de `getSessionTournaments`. Aceitável no volume atual (recap 1×/semana/user). Se a Metas batchar N dimensões/janela, extrair um loader único de plano+sessions.

## Confiança
**Alta** — contrato derivado da spec aprovada + shapes validados contra o código real (storage signatures, schema, EST-5 plug point com file:line). A única incerteza residual é a maturidade das fontes (leaks stub, plano ausente para maioria), tratada por design via degradação graciosa.

---

## Apêndice — Diagramas
- `Docs/architecture/diagrams/motor-aderencia/getPlannedVsActual-sequence.mermaid` — sequência do cálculo.
- `Docs/architecture/diagrams/motor-aderencia/est5-recap-plug.mermaid` — ponto de plugagem no recap EST-5 (DEC-MA6).
