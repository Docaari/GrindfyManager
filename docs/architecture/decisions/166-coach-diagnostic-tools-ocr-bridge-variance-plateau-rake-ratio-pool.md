# ADR-166: Coach diagnostic tools de AI-2A — 5 read tools (`analyze_variance` reusa heurística do Monthly Report extraída para `varianceAnalysis.ts`; `diagnose_plateau` combina ROI flat + study minutes + leaks ativos + selection drift; `compute_grind_study_ratio` benchmark 5:1–10:1; `calculate_effective_rake` agrupa por site + rakeback de `wallet_transactions`; `query_pool_intelligence` LIKE em `tournament_pattern` com fallback `not_seeded`) + tool-bridge OCR (sinal `## Upload Recente` no page-context DINÂMICO + quick suggestion contextual, sem tool nova) — todas `requiresConfirmation:false`, `auditLevel:'log'`

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2A (`Docs/specs/sprint-ai-2a.md`, RF-06, RF-07)

## Decision owner
system-architect (founder locked 2026-05-20: Q-F seed 12 rows BR em `tournament_pool_intelligence`; demais decisões de diagnóstico delegadas ao architect).

## Related
- Depende de: ADR-145 (registry de tools), ADR-147 (read tool service extraction — `tournamentScoringService` precedente; aqui extraímos `varianceAnalysis` como o equivalente), ADR-149 (page context plugado no `/api/coach/chat` — RF-07 estende com novo bloco), ADR-158 (`/api/coach/suggestions` quick suggestions — RF-07 adiciona uma sugestão contextual), ADR-159 (heurística de variância do Monthly Report — extraída aqui), ADR-064/067 (OCR de stats existente — `hud_stats_uploads` consumido sem mudança), ADR-039 (rakeback como `reason='rakeback'` em `wallet_transactions` — fonte de `calculate_effective_rake`).
- Reusa: `storage.getPerformanceByPeriod`, `storage.getVarianceVsExpected` (retorna `null` hoje — fallback heurístico igual ao Monthly Report AI-1C), `storage.getDashboardStats`, `storage.getAnalyticsBy*`, `storage.getGrindSessions`, `storage.getStudySessionsV2`, `storage.listWalletTransactionsByUser` (filtra `reason='rakeback'`), `storage.detectLeaks` (`server/coachLeakDetection.ts`), `storage.findActiveLeakFocusList` (AI-0A), `shared/primedopeDefaults.ts`, `server/services/fxResolver.ts` (FX cascade canônica ADR-163), `server/coach/quickSuggestions.ts` (mapa estático por rota), `server/coachContext.ts` (`assembleContext` bloco DINÂMICO).
- Sucessor de: ADR-160 (`bulk_query_dimensions` — read tool de batching; mesmo pattern `runQueryDimension(input, ctx)` aplicável a `analyze_variance` se LLM precisar batchear diagnósticos no futuro).
- Diagramas: `Docs/architecture/diagrams/coach-ai-2a/diagnostic-tools-data-flow.mermaid`, `pool-intelligence-er.mermaid`.

---

## 1. Contexto

A Fase 2 do plano ("técnico de carreira") quer que o Coach **diagnostique** o estado do jogador — não só busca dados, mas cruza variáveis que ninguém cruza hoje: variância × leaks × rake × estudo × pool. O AI-2A entrega 5 tools read-only de diagnóstico + 1 bridge OCR (sem tool nova):

1. **`analyze_variance`** — quanto da P&L é skill vs variância. Reusa a heurística do Monthly Report AI-1C (`getVarianceVsExpected` retorna `null` hoje → fallback `sigmaUsd = 1.5 * stddev(daily_pnl_usd)` com FX cascade ADR-163; AI-2A não troca isso por PrimeDope ainda — feature future). Decisão central: **extrair a heurística do `monthlyReportGenerator.ts` para `server/coach/varianceAnalysis.ts`** (DRY — lesson #10) e os 2 consumidores (Monthly Report + `analyze_variance`) reusam.

2. **`diagnose_plateau`** — está em platô? Combina 4 sinais:
   - **ROI flat:** ROI dos N meses (default 3) tem `stddev/|mean| < 0.15` (variação relativa baixa).
   - **Volume flat:** mesmo critério aplicado a volume mensal.
   - **No study:** soma de `study_sessions_v2.duration_minutes / 60` nos últimos 30 dias < `STUDY_HOURS_FLOOR` (default 4h/mês).
   - **Selection drift:** desvio do `profileAdherence` (% de torneios jogados que seguem o profile do user) > `SELECTION_DRIFT_THRESHOLD` (default 30%).
   - `signal` retornado: primeiro sinal positivo (`roi_flat` > `volume_flat` > `no_study` > `selection_drift` > `unknown`).

3. **`compute_grind_study_ratio`** — horas de grind / horas de estudo. Benchmark "5:1 a 10:1" (heurística da literatura — Galfond, Doug Polk, Splitsuit: ~10h grind por hora de estudo é o range saudável). Acima → "grind sem estudo"; abaixo → "estuda demais sem aplicar"; `null` quando `studyHours=0` (narrative explícita).

4. **`calculate_effective_rake`** — rake efetiva pago em USD vs rakeback recebido. Usa `tournaments.rake` quando disponível; estima 10% MTT quando ausente. Rakeback de `wallet_transactions WHERE reason='rakeback'` (ADR-039). Agrupa por site se filtro não especificado.

5. **`query_pool_intelligence`** — knowledge base BR de torneios. LIKE case-insensitive em `tournament_pattern`. Tabela vazia → fallback `not_seeded` ("não tenho info do pool desse torneio") em vez de erro.

**Tool-bridge OCR (RF-07)** — o `/grind-live` e `/stats` já fazem upload de print de HUD via Claude vision (ADRs 064/067), persistindo em `hud_stats_uploads`. O Coach hoje **não sabe disso**. Decisão: **sem tool nova**. Em vez disso:
- **Page context novo:** `assembleContext` no bloco DINÂMICO adiciona `## Upload Recente` se houver upload < 24h.
- **Quick suggestion:** `quickSuggestions.ts` adiciona 1 sugestão "Você subiu um print agora há pouco. Quer que eu analise os stats?" para `route='/stats'` ou `'/grind-live'` quando o sinal está presente.
- O LLM usa `read_user_hud_stats` (AI-0A, ADR-052b) para puxar os stats e analisar — tool já existe.

A pergunta central: **(a)** input/output das 5 tools com Zod `.strict()`; **(b)** algoritmo de `analyze_variance` (extração de `varianceAnalysis.ts`); **(c)** `diagnose_plateau` — combinação de sinais + prioridade + thresholds calibráveis; **(d)** `compute_grind_study_ratio` — fontes (`grind_sessions` vs `study_sessions_v2`) + benchmark + null handling; **(e)** `calculate_effective_rake` — fontes (`tournaments.rake` vs estimativa 10%; `wallet_transactions.rakeback`) + agrupamento por site; **(f)** `query_pool_intelligence` — schema (em ADR-167 §1) + LIKE + fallback `not_seeded`; **(g)** OCR bridge — `getRecentStatsUpload` helper + page-context bloco + quick suggestion (sem tool nova).

### Restrições

- **Lesson #6 (USD):** `analyze_variance.expectedRoi`/`observedRoi` em pontos percentuais; `estimatedBySkillUsd`/`estimatedByVarianceUsd` em USD via `fxResolver.resolveExchangeRates(userId)` cascade canônica (ADR-163). `calculate_effective_rake.totalBuyIn`/`totalRake`/`totalRakeback` em USD.
- **Lesson #9 (logar antes de fallback):** `getVarianceVsExpected` retorna `null` (esperado hoje) → log info-level + fallback heurístico, sem erro. `query_pool_intelligence` tabela vazia → log info-level + retorna `{ rows:[], note:'pool_intelligence_not_seeded' }`. Erro DB no `analyze_variance` → log + retorna `{ ok:false, error:'handler_error' }` (não silenciar).
- **Lesson #10 (DRY):** heurística de variância vive **uma vez** em `server/coach/varianceAnalysis.ts`. Monthly Report + `analyze_variance` consomem. ADR-159 cita esse follow-up como TODO; AI-2A executa.
- **Lesson #11 (default mínimo):** `compute_grind_study_ratio` `null` em vez de fabricar ratio quando `studyHours=0`. `diagnose_plateau.isPlateau=false` quando `sampleSize<30` (não invente plateau com 10 torneios).
- **Lesson #34 (`injectedStorage?`):** todos os 5 handlers + `getRecentStatsUpload` aceitam `injectedStorage?` no terceiro arg.
- **Audit `'log'` (não `'persist'`):** read tools logam invocação para telemetria, **não** gravam em `coach_actions` (não há undo). Consistente com `query_dimension`, `bulk_query_dimensions`.
- **Page context bloco DINÂMICO, não STATIC (ADR-019):** o bloco `## Upload Recente` muda a cada chamada (timestamp + stats extraídos) — vai no bloco DINÂMICO, **NÃO quebra o cache STATIC**.

---

## 2. Decisões

### 2.1 `analyze_variance` — extração de `varianceAnalysis.ts` (DRY)

**Handler:** `server/coachTools/handlers/analyzeVariance.ts`.
**Helper extraído:** `server/coach/varianceAnalysis.ts` exporta `computeVarianceAnalysis(input, ctx, storage): Promise<VarianceAnalysisResult>`.

**Input (Zod `.strict()`):**
```ts
const analyzeVarianceInputSchema = z.object({
  period: z.enum(['30d','90d','6m','12m']).optional().default('90d'),
  dimension: z.enum(['overall','stake','site']).optional().default('overall'),
}).strict();
```

**Output:**
```ts
type VarianceAnalysisResult = {
  period: '30d'|'90d'|'6m'|'12m',
  sampleSize: number,                    // n torneios no período
  observedRoi: number | null,            // %
  expectedRoi: number | null,            // % (PrimeDope futuro; null hoje na heurística)
  stddevBuyIns: number | null,
  confidenceInterval95: { lower: number, upper: number } | null,
  estimatedBySkillUsd: number | null,
  estimatedByVarianceUsd: number | null,
  method: 'heuristic' | 'primedope',
  narrative: string,                     // 1-2 frases interpretativas geradas no handler (template — não LLM)
  confidence: 'high' | 'medium' | 'low', // baseado em sampleSize: <30=low, <100=medium, >=100=high
};
```

**Algoritmo (em `varianceAnalysis.ts`):**
1. `getPerformanceByPeriod(userId, period)` → `tournaments[]` filtrando `grind_session_id IS NULL` (§6.1).
2. Se `sampleSize < 30`: retorna `{ ..., method:'heuristic', confidence:'low', narrative:'Amostra pequena (X torneios). Diagnóstico de variância é pouco confiável; precisa de pelo menos 100 torneios em 90 dias para conclusões.' }` + null nos numéricos.
3. `getVarianceVsExpected(userId, period)` → se retornar valor: `method='primedope'` (futuro). Hoje retorna `null` → fallback heurístico.
4. **Fallback heurístico:**
   - Calcula `dailyPnLUsd[]` (FX cascade `fxResolver.resolveExchangeRates(userId)` via ADR-163).
   - `sigmaUsd = 1.5 * stddev(dailyPnLUsd)` (multiplier conservador da literatura).
   - `observedRoi = totalProfit / totalBuyIn * 100`.
   - `confidenceInterval95.lower = observedRoi - 1.96 * (sigmaUsd / totalBuyIn) * 100`.
   - `expectedRoi = null` (heurística não estima; PrimeDope estimaria).
   - `estimatedBySkillUsd = totalProfit * 0.7`, `estimatedByVarianceUsd = totalProfit * 0.3` (split conservador "30% variance" da literatura; calibrável via env futuro).
5. `narrative` por template no handler: `"Em {period}, {sampleSize} torneios, ROI observado {X}% (CI95% {lower}–{upper}). Método: heurística (PrimeDope quando disponível). Confidence: {high/medium/low}."` — não LLM (custo zero).
6. Retorna `VarianceAnalysisResult`.

**Refactor no Monthly Report (RF-05 do AI-1C):** `monthlyReportGenerator.ts` atualmente tem a heurística inline (`monthlyReport.variance`). Substitui por `computeVarianceAnalysis({ period: 'last_month_as_30d_proxy', dimension: 'overall' }, ctx, storage)` — DRY. Cuidado: o monthly usa `period_start/period_end` específicos (não preset `'30d'`); `varianceAnalysis.ts` ganha overload `computeVarianceAnalysisForRange(startDate, endDate, ctx, storage)` para suportar.

### 2.2 `diagnose_plateau` — combinação de 4 sinais

**Handler:** `server/coachTools/handlers/diagnosePlateau.ts`.

**Input (Zod `.strict()`):**
```ts
const diagnosePlateauInputSchema = z.object({
  months: z.number().int().min(2).max(12).optional().default(3),
}).strict();
```

**Output:**
```ts
{
  isPlateau: boolean,
  signal: 'roi_flat' | 'volume_flat' | 'no_study' | 'selection_drift' | 'unknown',
  roiTrend: Array<{ month: string, roi: number | null }>,
  studyMinutesTrend: Array<{ month: string, minutes: number }>,
  leaksActive: string[],
  narrative: string,
  recommendation: { kind: 'tool' | 'link', target: string },
}
```

**Algoritmo:**
1. Pre-check: `getPerformanceByPeriod(userId, 'last_N_months')` → se `sampleSize < 30 * months` → `{ isPlateau:false, signal:'unknown', narrative:'Amostra insuficiente para detectar plateau.' }`.
2. Calcula `roiTrend[]` (N meses), `volumeTrend[]`, `studyMinutesTrend[]`, `profileAdherenceTrend[]`.
3. Aplica thresholds (env-configuráveis):
   - **roi_flat:** `stddev(roiTrend) / max(|mean(roiTrend)|, 0.01) < COACH_PLATEAU_ROI_FLAT_THRESHOLD` (default `0.15`).
   - **volume_flat:** mesmo critério em `volumeTrend`.
   - **no_study:** `sum(studyMinutesTrend[last 30d]) < COACH_PLATEAU_STUDY_FLOOR_MIN` (default `240` = 4h/mês).
   - **selection_drift:** `1 - mean(profileAdherenceTrend) > COACH_PLATEAU_DRIFT_THRESHOLD` (default `0.30`).
4. `leaksActive` = `findActiveLeakFocusList(userId)` codes (AI-0A).
5. Prioridade do `signal` (primeiro positivo na ordem): `roi_flat` > `volume_flat` > `no_study` > `selection_drift` > `unknown`.
6. `isPlateau = signal !== 'unknown'`.
7. `recommendation` por mapa:
   - `roi_flat` + `leaksActive.length > 0` → `{ kind:'tool', target:'analyze_variance' }`.
   - `no_study` → `{ kind:'link', target:'/estudos' }`.
   - `selection_drift` → `{ kind:'tool', target:'bulk_propose_grade' }` (ADR-165).
   - `volume_flat` → `{ kind:'tool', target:'bulk_propose_grade' }`.
   - default → `{ kind:'link', target:'/biblioteca' }`.
8. `narrative` template: `"Detectei {signal} nos últimos {months} meses. {leaksActive.length} leaks ativos. Recomendação: {recommendation.target}."`

### 2.3 `compute_grind_study_ratio` — benchmark 5:1 a 10:1

**Handler:** `server/coachTools/handlers/computeGrindStudyRatio.ts`.

**Input (Zod `.strict()`):**
```ts
const computeGrindStudyRatioInputSchema = z.object({
  period: z.enum(['30d','90d']).optional().default('30d'),
}).strict();
```

**Output:**
```ts
{
  grindHours: number,
  studyHours: number,
  ratio: number | null,
  benchmark: { range: '5:1 a 10:1', interpretation: 'abaixo' | 'dentro' | 'acima' | 'sem_estudo' },
  narrative: string,
}
```

**Algoritmo:**
1. `grindHours` = sum(`grind_sessions.completedAt - startTime`) / 3600 — fonte canônica de horas de grind.
2. `studyHours` = sum(`study_sessions_v2.duration_minutes`) / 60 — inclui `mode='lesson'` + `mode='drill_gto'` + `mode='other'` (todos contam).
3. `ratio`:
   - `studyHours === 0` → `null`, `interpretation='sem_estudo'`.
   - senão → `grindHours / studyHours`.
4. `interpretation`:
   - `ratio === null` → `'sem_estudo'`.
   - `ratio < 5` → `'abaixo'` (estuda demais).
   - `5 <= ratio <= 10` → `'dentro'` (saudável).
   - `ratio > 10` → `'acima'` (grind sem estudo).
5. `narrative` template baseado em `interpretation`.

### 2.4 `calculate_effective_rake` — agrupa por site se filtro não especificado

**Handler:** `server/coachTools/handlers/calculateEffectiveRake.ts`.

**Input (Zod `.strict()`):**
```ts
const calculateEffectiveRakeInputSchema = z.object({
  period: z.enum(['30d','90d','6m']).optional().default('90d'),
  site: z.string().max(32).optional(),
  buyInRange: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  }).strict().optional(),
}).strict();
```

**Output:**
```ts
{
  totalBuyInUsd: number,
  totalRakeUsd: number,
  totalRakebackUsd: number | null,
  effectiveRakePct: number,
  netRakePct: number,
  bySite: Array<{
    site: string,
    rakePct: number,
    rakebackPct: number,
    netRakePct: number,
    totalBuyInUsd: number,
  }>,
  narrative: string,
  rakeEstimated: boolean,  // true se algum tournament sem rake field → estimado 10%
}
```

**Algoritmo:**
1. `tournaments[]` = `getPerformanceByPeriod(userId, period, { site, buyInRange })` filtrando `grind_session_id IS NULL`.
2. Para cada t: `rakeUsd = t.rakeUsd ?? t.buyInUsd * 0.10` (10% MTT default; `rakeEstimated=true` se algum estimou). FX cascade ADR-163.
3. `totalRakebackUsd` = `sum(wallet_transactions WHERE reason='rakeback' AND occurred_at IN [periodStart, periodEnd])` (ADR-039).
4. `effectiveRakePct = totalRakeUsd / totalBuyInUsd * 100`.
5. `netRakePct = (totalRakeUsd - (totalRakebackUsd ?? 0)) / totalBuyInUsd * 100`.
6. `bySite` (quando filtro `site` não especificado): groupBy `site` (top 10).
7. `narrative` template: `"Em {period}, rake efetivo {X}% ({estimated ? 'estimado' : 'real'}); rakeback recuperou {Y}%; rake líquido {Z}%. {bySite breakdown}."`

### 2.5 `query_pool_intelligence` — schema + LIKE + fallback

**Handler:** `server/coachTools/handlers/queryPoolIntelligence.ts`.
**Schema:** ver ADR-167 §1 (`tournament_pool_intelligence` table + 12 rows seed Q-F).

**Input (Zod `.strict()`):**
```ts
const queryPoolIntelligenceInputSchema = z.object({
  site: z.string().max(32).optional(),
  namePattern: z.string().max(120).optional(),
}).strict();
```

**Output:**
```ts
{
  rows: Array<{
    site: string,
    tournamentPattern: string,
    buyInMin: number | null,
    buyInMax: number | null,
    fieldAvg: number | null,
    fieldVolatility: number | null,
    poolQuality: 'soft' | 'medium' | 'tough' | null,
    notes: string | null,
  }>,
  note?: 'pool_intelligence_not_seeded' | 'no_match',
}
```

**Algoritmo:**
1. `SELECT count(*) FROM tournament_pool_intelligence` — se `0`, retorna `{ rows:[], note:'pool_intelligence_not_seeded' }` (log info-level).
2. Senão: `WHERE ($1::text IS NULL OR site = $1) AND ($2::text IS NULL OR LOWER(tournament_pattern) LIKE '%' || LOWER($2) || '%') LIMIT 20`.
3. Se `rows.length === 0` → retorna `{ rows:[], note:'no_match' }`.

### 2.6 Tool-bridge OCR — `## Upload Recente` no page-context + quick suggestion

**Sem tool nova.** Decisão: o LLM já tem `read_user_hud_stats` (AI-0A) para puxar stats. O que falta é o **sinal** de que houve upload recente.

**Helper novo em `server/storage/coachSignalsStorage.ts`:**
```ts
async function getRecentStatsUpload(userId: string, withinHours: number = 24): Promise<{
  uploadedAt: Date,
  statsExtracted: Array<{ statId: string, value: number }>,
} | null>
```
Query: `SELECT uploaded_at, extracted_stats FROM hud_stats_uploads WHERE user_id = $1 AND uploaded_at > now() - interval '$2 hours' ORDER BY uploaded_at DESC LIMIT 1`. Safe-deny em erro (lesson #9).

**`server/coachContext.ts` `assembleContext` no bloco DINÂMICO:**
```ts
const recentUpload = await getRecentStatsUpload(userId, 24);
if (recentUpload) {
  const topStats = recentUpload.statsExtracted.slice(0, 5)
    .map(s => `${s.statId}=${s.value}%`).join(', ');
  const hoursAgo = Math.round((Date.now() - recentUpload.uploadedAt.getTime()) / 3600_000);
  systemParts.push(
    `## Upload Recente\n` +
    `- O usuario subiu 1 print de HUD em ${recentUpload.uploadedAt.toISOString().slice(11,16)} ` +
    `(~${hoursAgo}h atras). Stats extraidos: [${topStats}] (top 5).`
  );
}
```

**`server/coach/quickSuggestions.ts`:**
```ts
// Mapa estatico ganha entry condicional:
if ((route === '/stats' || route === '/grind-live') && state.recentStatsUploadWithin24h) {
  suggestions.push({
    id: 'analyze-recent-ocr',
    text: 'Voce subiu um print agora ha pouco. Quer que eu analise os stats?',
    sendOnClick: true,
    // CTA target seria a propria mensagem auto-enviada
  });
}
```

Estado `state.recentStatsUploadWithin24h` é booleano calculado no handler de `/api/coach/suggestions` via `getRecentStatsUpload(userId, 24) !== null`.

---

## 3. Opções descartadas

### 3.1 Criar tool nova `coach_react_to_ocr_upload`
- **Prós:** Coach reage proativamente, sem o user perguntar.
- **Contras:** Vira nudge — pode ser invasivo logo após o upload (user está focado na sessão, não no chat). Page context + quick suggestion é passivo: aparece se o user abrir o chat.
- **Decisão:** sem tool nova (RF-07.2). O `read_user_hud_stats` cobre a análise quando o user pede.

### 3.2 `analyze_variance` implementação inline (sem extrair `varianceAnalysis.ts`)
- **Prós:** Tool independente, menos refactor no Monthly Report.
- **Contras:** Lesson #10 (DRY) — divergência silenciosa entre os 2 cálculos é inevitável; quando o founder mudar o multiplier 1.5 ou o split 70/30 vai esquecer um lugar.
- **Decisão:** extrair `varianceAnalysis.ts`. Refactor de Monthly Report é trivial (~20 linhas).

### 3.3 `diagnose_plateau` com pesos ponderados (modelo de scoring)
- **Prós:** mais sofisticado; combina sinais com confidence cada um.
- **Contras:** ADR-015 / ADR-154 — projeto opta por rule-based explícito vs ML. Pesos são opacos para o LLM justificar ao user.
- **Decisão:** prioridade ordenada de sinais (5 buckets); thresholds calibráveis via env. Sempre transparente.

### 3.4 `query_pool_intelligence` com fuzzy match (Levenshtein)
- **Prós:** matches "Sundey Million" → "Sunday Million".
- **Contras:** sem extensão `pg_trgm` instalada; fuzzy em LIKE é caro; LLM pode normalizar antes de chamar.
- **Decisão:** `LIKE LOWER('%...%')` simples; LLM normaliza no prompt. Se Sprint AI-2B precisar fuzzy, instalar `pg_trgm` + GIN index.

### 3.5 OCR bridge via WebSocket (server-push)
- **Prós:** Coach reage imediatamente após upload, sem esperar o user abrir chat.
- **Contras:** Sem infra de WebSocket no Grindfy hoje; mudança grande de stack. Page context resolve 90% dos casos (user normalmente abre o chat logo após o upload querendo análise).
- **Decisão:** page context + quick suggestion (RF-07). WebSocket é deferred (futuro).

---

## 4. Consequências

### Positivas
- 5 tools de diagnóstico cobrem 80% das perguntas comuns que o coach receberia ("Por que estou perdendo?", "Estou em plateau?", "Quanto pago de rake?", "Esse torneio é soft?").
- `varianceAnalysis.ts` DRY — quando AI-2B integrar PrimeDope real, mudança em 1 lugar.
- OCR bridge sem tool nova: zero custo de inferência adicional; user controla o timing (abre o chat quando quer).
- `tournament_pool_intelligence` knowledge base começa com 12 rows BR — o Coach passa a recomendar torneios com base em pool quality, não só score puro.

### Negativas
- `diagnose_plateau` heurística pode dar false positives quando ROI é naturalmente baixo (micro stakes). Mitigação: thresholds calibráveis via env; founder pode ajustar.
- `calculate_effective_rake` depende de `tournaments.rake` que está preenchido inconsistentemente nos imports legados — `rakeEstimated:true` quando estimar; LLM deve mencionar no narrative.
- Tabela `tournament_pool_intelligence` precisa de manutenção manual (não há endpoint admin). Mitigação: 12 rows iniciais; founder edita via SQL ou seed file até demand justificar admin UI.

### Neutras
- Page context cresce 4-6 linhas quando há upload recente — DINÂMICO, não quebra cache STATIC (ADR-019).
- `getRecentStatsUpload` adiciona 1 query extra por `assembleContext`. Mitigação: query indexada `(user_id, uploaded_at DESC) LIMIT 1` — < 5ms.

---

## 5. Notas de implementação

- **Ordem sugerida (test-writer → implementer):** 1) `query_pool_intelligence` (mais simples, valida pattern). 2) OCR bridge (helper + page context + quick suggestion). 3) `compute_grind_study_ratio`. 4) `calculate_effective_rake`. 5) `analyze_variance` (com refactor do Monthly Report). 6) `diagnose_plateau` (consome `analyze_variance` opcionalmente).
- **Env vars:**
  - `COACH_PLATEAU_ROI_FLAT_THRESHOLD` (default `0.15`)
  - `COACH_PLATEAU_VOLUME_FLAT_THRESHOLD` (default `0.15`)
  - `COACH_PLATEAU_STUDY_FLOOR_MIN` (default `240` minutos)
  - `COACH_PLATEAU_DRIFT_THRESHOLD` (default `0.30`)
  - `COACH_VARIANCE_SIGMA_MULTIPLIER` (default `1.5`)
  - `COACH_VARIANCE_SKILL_VARIANCE_SPLIT` (default `0.7,0.3`)
- **Storage layer:**
  - `storage.getRecentStatsUpload(userId, withinHours)` — **novo**.
  - `storage.queryTournamentPoolIntelligence({ site?, namePattern? })` — **novo**.
  - `storage.getRakebackTransactions(userId, periodStart, periodEnd)` — **novo** (filtra `wallet_transactions WHERE reason='rakeback'`).
  - `storage.getProfileAdherenceTrend(userId, months)` — **novo** (calcula adherence mensal).
- **Refactor do Monthly Report:** `monthlyReportGenerator.ts` chama `computeVarianceAnalysisForRange(periodStart, periodEnd, ctx, storage)` em vez de inline. ~20 linhas modificadas, mesmo output shape.

---

## 6. Plano de Verificação

- [ ] `analyze_variance` `period='90d'` para user com 100 torneios → `sampleSize:100`, `method:'heuristic'`, `confidence:'medium'`, narrative não-vazia.
- [ ] `analyze_variance` para user com <30 torneios → `confidence:'low'`, valores numéricos `null`, narrative "amostra pequena".
- [ ] Refactor do Monthly Report: snapshot do `content.variance` antes/depois é idêntico (regressão zero).
- [ ] `diagnose_plateau` user com ROI flat 3m + 0 estudo → `isPlateau:true`, `signal:'roi_flat'` (prioridade) ou `'no_study'`.
- [ ] `diagnose_plateau` user com sampleSize<90 → `isPlateau:false, signal:'unknown'`.
- [ ] `compute_grind_study_ratio` `grindHours:80, studyHours:4` → `ratio:20, interpretation:'acima'`.
- [ ] `compute_grind_study_ratio` `studyHours:0` → `ratio:null, interpretation:'sem_estudo'`.
- [ ] `calculate_effective_rake` agrupa por site quando filtro não especificado.
- [ ] `calculate_effective_rake` com algum tournament sem rake → `rakeEstimated:true`.
- [ ] `query_pool_intelligence` tabela vazia → `{ rows:[], note:'pool_intelligence_not_seeded' }`.
- [ ] `query_pool_intelligence` `site:'WPN', namePattern:'sunday'` → 1+ rows com `tournament_pattern LIKE '%Sunday%'`.
- [ ] OCR bridge: user com upload < 24h → `assembleContext` inclui `## Upload Recente` com timestamp + top 5 stats.
- [ ] OCR bridge: user com upload > 24h → bloco omitido.
- [ ] OCR bridge: `/api/coach/suggestions?route=/stats` para user com upload recente → inclui sugestão "analisar stats do último upload".
- [ ] Free → 5 tools não listadas em `listToolsForUser` (`isToolEligibleTier` filtra — ADR-167).
- [ ] Trial → 5 tools listadas (Q-E locked).
- [ ] FX cascade ADR-163 aplicada em `analyze_variance`/`calculate_effective_rake` (lesson #6).
