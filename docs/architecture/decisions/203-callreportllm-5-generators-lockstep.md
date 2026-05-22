# ADR-203: Sprint AI-3.2 — `callReportLlm` 5/5 generators lockstep (weekly + recommendLesson migram) + Cluster A/D consolidação (numCoerce + AbortSignal cap + dedup profile + summarizer pretty-print drop) + countGrindSessions test cov

## Status

Aceito

## Data

2026-05-22

## Sprint

AI-3.2 (`Docs/specs/sprint-ai-3.2.md`) — cleanup wave 2 pós-AI-3.1 (commit `c41532f1` push `origin/main` 2026-05-21). **Sem feature nova, sem migration, sem mudança comportamental observável.** Cap 12h founder-locked: P0+P1 RFs (A1/A2/A4 DRY shared + B1/B2/B3 generators lockstep + D3 dedup + D6 AbortSignal + D7 Haiku pretty-print drop + E1 test cov) + polish básicos (Q6 comment rot, Q10 inline await, Q15 rawText debug). EXCLUI: A5 `resolveStorage` (risco AI-3 Q-B reabrir), C9 `SafeHtml` branded type (overkill agora), demais P2 não selecionados.

## Decision owner

system-architect — defaults locked pelo spec. Audit de mocks Anthropic legados em `tests/coach/*Generator.test.ts` delegado ao test-writer phase pré-implementer (lesson #3 — shape mock real vs produção).

## Related

- **Depende de:** ADR-176 (AI-3.1) — exige `server/coach/anthropicClient.ts` (`callReportLlm` retry 3x exponencial + whitelist tone/level + `parseOnError` + log lesson #9) + `server/coach/reportCost.ts` (Sonnet 4.6 + Haiku 4.5 pricing oficial 2026-01) + `server/utils/sleep.ts` shared. AI-3.1 migrou 3/5 generators (quarterly + monthly + daily + summarizer); weekly + recommendLesson ficaram deferidos com nota `[DEFER AI-3.2]`. Esta sprint fecha 5/5.
- **Depende de:** ADR-174 (AI-3) — `_renderReportShell.ts` consolidado + `shared/brTimezones.ts` + `listUsersForCron("subscription_plan IN ('trial','active','admin')")` paridade.
- **Depende de:** ADR-159 (AI-1C) — `reportGeneratorShared.ts` + `hierarchicalSummarizer.ts` (RF-D7 toca `reportSummarizer.ts` que vive nesse cluster).
- **Reusa:** `callReportLlm` (ADR-176 §2.7), `computeReportCost` (ADR-176 §2.8), `RETRYABLE_STATUS` (extrai para `server/utils/isRetryableError.ts` em RF-A4), `maybeSummarizeBundle` (ADR-159), `escapeHtml` (`server/emails/templates/_helpers.ts`).
- **Diagramas:**
  - `Docs/architecture/diagrams/coach-ai-3-2/callReportLlm-5-generators-lockstep.mermaid` — sequence final 5/5 generators (weekly + monthly + daily + quarterly + recommendLesson) consumindo `callReportLlm` único + summarizer Haiku ao lado.
  - `Docs/architecture/diagrams/coach-ai-3-2/numCoerce-callsites.mermaid` — DAG dos 6 callsites do helper finite-coerce convergindo em `shared/numCoerce.ts`.
  - `Docs/architecture/diagrams/coach-ai-3-2/abortsignal-cap-flow.mermaid` — flow do retry chain com `AbortController` cap absoluto 60s + degraded reason `llm_timeout` vs `llm_failed_3x`.

---

## 1. Contexto

AI-3.1 (ADR-176) shipou em 2026-05-21 consolidando `callReportLlm` + `computeReportCost` + `_renderReportShell.safeBodyHtml` contract + `byCurrency.profitNative` rename. Reviewer rounds APPROVED-WITH-NITS pos-fixes deixaram backlog dormente catalogado em `Docs/specs/sprint-ai-3.2-backlog.md`: 19-24h de débito técnico distribuído em 6 clusters (A DRY closure, B generators lockstep, C quality polish, D perf + observability, E test cov, F defer-locked).

Founder cap = 12h. Decisão de escopo prioriza ICE 80+ + drivers de drift permanente:

1. **5/5 generators lockstep (Cluster B core).** AI-3.1 migrou 3/5 (`quarterlyReportGenerator`, `monthlyReportGenerator`, `dailyDebriefGenerator` + `reportSummarizer` indireto via `maybeSummarizeBundle`). `weeklyReportGenerator.ts:588-615` e `server/coach/tools/recommendLesson.ts:164-191` (path verificado pelo test-writer pré-implementer) ainda usam SDK Anthropic direto. Cada nova feature LLM (futuro) replicaria o esforço lockstep. Fechar 5/5 elimina o drift permanentemente — próxima paridade (ratecard novo, retry tunning, parse strategy nova) é 1 edit em 1 arquivo.

2. **DRY closure core (Cluster A — A1/A2/A4).** 3 helpers críticos hoje duplicados:
   - **`coerceFiniteNumber` (RF-A1)** — finite-coerce duplicado em 6 arquivos (`reportCost.ts`, `quarterlyReportGenerator.ts`, `monthlyReportGenerator.ts`, `dailyDebriefGenerator.ts`, `tournamentScoringService.ts`, `fxResolver.ts`). Próxima feature que precisar de safe number coerce replica de novo.
   - **`isValidConfidence` (RF-A2)** — narrowing `cgameRecent.confidence ∈ {'high','medium','low'}` duplicado em 4 generators. Risco de drift quando ADR-170 evoluir o enum (e.g. adicionar `'insufficient_data'`).
   - **`isRetryableError` (RF-A4)** — hoje inline em `anthropicClient.ts`. Futuro: FX adapters BCB/Frankfurter (ADR-174), Stripe webhooks (futuro), Mux ingestion (ADR-196/199). Mover para `server/utils/isRetryableError.ts` desbloqueia reuse.

3. **AbortSignal cap absoluto (Cluster D — RF-D6).** Worst-case wall-clock per-job hoje em incidente Anthropic = retry 3x exponencial (100/400/1600ms) × 3 generators sequenciais ≈ 182s. `processReportJobsTick` roda 15min — em pior cenário, 1 job de relatório enorme + Anthropic flapping pode pendurar o tick inteiro. `AbortSignal.timeout(60_000)` global em `callReportLlm` garante hard cap 60s/chamada + novo `degradedReason='llm_timeout'` distingue Anthropic outage de erro normal (lesson #9 log-before-fallback preservado).

4. **Haiku 30% economia (Cluster D — RF-D7).** `reportSummarizer.ts` faz `JSON.stringify(bundle, null, 2)` (pretty-print de 2 espaços). Tokens Haiku contam whitespace; drop indent economiza ~25-30% input tokens em sumarização. Bundles típicos quarterly sumarizados (chars > 20K threshold AI-3.1) custam ~$0.003/run × hundreds/Q = marginal mas mensurável + sem risco (Haiku não se importa com whitespace; parse idêntico).

5. **Dedup `getAiStructuredProfile` monthly+daily (Cluster D — RF-D3).** AI-3.1 LOW-4 dedupliquei só quarterly. Monthly + daily ainda fazem 2 DB hits redundantes (`storage.getUserProfile(userId)` que já retorna `aiStructuredProfile` JSONB + `storage.getAiStructuredProfile(userId)` standalone). Lesson #36 (lazy schema import) preservado — implementer audita shape de `getUserProfile.aiStructuredProfile` vs standalone antes da migração.

6. **`countGrindSessions` smoke test (Cluster E — RF-E1).** Reviewer AI-3.1 MEDIUM: catch handler em `storage.countGrindSessions` (criado AI-3.1 para o quarterly evitar carregar N rows só pra `.length`) engole `db.select is not a function` retornando 0. Sem test garantindo que `gte(grindSessions.date, ...)` foi chamado, regressão pode passar silenciosa em refactor futuro do storage layer. Unit test com mock `db.select` (lesson #3 — shape mock real) é defesa-em-profundidade barata.

### Restrições

- **Sem feature nova** — sprint cleanup wave 2. Reviewer rounds futuros não devem ver mudança comportamental observável (mesma narrativa, mesmo modelo, mesmo retry, mesmo HTML email, mesmo `cost_usd_estimate`).
- **Sem migration DB** — todos os refactors são código puro. `AiStructuredProfile.cgameRecent.confidence` segue como TS enum existente; `CallReportLlmResult` ganha `rawText?: string` opcional (RF-C10) e novo `degradedReason='llm_timeout'` (RF-D6) — ambos não-breaking.
- **Backward compat preservado** — `degradedReason` schema ganha `'llm_timeout'` adicional (não-breaking; reports já tratam degraded como branch genérica). Alias `byCurrency.profit` segue vivo (1 sprint extra de janela; RF-C6 fora deste cap — drop em AI-3.3 com TODO grepável documentado em CLAUDE.md §10 follow-ups).
- **Lockstep RF-B1+RF-B2 é tudo-ou-nada por callsite.** Test-writer audita primeiro mocks `vi.mock('@anthropic-ai/sdk', ...)` em `tests/coach/weeklyReportGenerator.test.ts` + `tests/coach/recommendLesson*.test.ts` antes do implementer. Lesson #3 (mock shape real) + Lesson #38 (test modificado com justificativa de contract fix — RF-B1/B2 migram de `vi.mock('@anthropic-ai/sdk')` para `vi.mock('@/server/coach/anthropicClient')`) documentados no resumo.
- **A5 `resolveStorage` EXCLUÍDO.** Risco de reabrir Q-B locked (ADR-174 §3.F). Permanece duplicado em 3 generators até AI-3.3 (ou demanda explícita de novo generator que sofra com a duplicação).
- **C9 `SafeHtml` branded type EXCLUÍDO.** Hardening defesa-em-profundidade que duplica intenção do contract `@safe-html` caller-side AI-3.1 (ADR-176 §2.6). Cabe em AI-3.3 se reviewer round encontrar regressão real; hoje overkill.
- **Lessons críticas aplicáveis:**
  - **#3** (mock shape real): RF-B1 + RF-B2 audit pré-implementer obrigatório. Fixtures shared em `tests/fixtures/anthropicClientMocks.ts` (criar se ainda não existe AI-3.1; reusar se existe).
  - **#5/#35** (`new Anthropic` ctor try/catch + factory fallback): preservado em `getAnthropicClient` (ADR-176 §2.7); não toca aqui.
  - **#9** (log antes do fallback): todos os novos catch handlers logam antes de fallback. RF-A4 (`isRetryableError` shared) + RF-D6 (AbortSignal timeout) + RF-E1 (`countGrindSessions` catch) cobertos.
  - **#10** (DRY prompt cache `ephemeral`): RF-B1 + RF-B2 preservam STATIC prompt cache; `callReportLlm` recebe `systemPrompt` + `userPromptBuilder` callback (mesmo formato AI-3.1).
  - **#11** (default mínimo): `coerceFiniteNumber(value, fallback = 0)` retorna fallback explícito (não throw).
  - **#34** (`injectedStorage` testabilidade): RF-E1 + RF-D3 preservam pattern.
  - **#36** (lazy schema import): RF-D3 audit shape `aiStructuredProfile` de `getUserProfile` vs standalone. Lazy import preservado se shape divergir.
  - **#37** (`node-cron` import estático para `vi.doMock`): NÃO aplica — `@anthropic-ai/sdk` é dep prod garantida; `node-cron` não é tocado nesta sprint.
  - **#38** (test modificado com justificativa de contract fix): RF-B1 + RF-B2 migram mocks; implementer documenta cada teste alterado no resumo + razão (paridade `callReportLlm`).

### O que está fora de escopo (defer permanente OU AI-3.3)

- **RF-A5 `resolveStorage` extract** — DEFER AI-3.3 (risco Q-B). Documentar em `Docs/specs/sprint-ai-3.3-backlog.md` quando criado.
- **RF-A3 `stripTags` promote** — DEFER AI-3.3 (P1 ICE 75 mas drop sem urgência; cabe em sweep de hygiene).
- **RF-A6 `previousMonthRange` shared** — DEFER AI-3.3 (P1 ICE 75; só monthly usa hoje).
- **RF-C1 tone/level dedup** — DEFER AI-3.3 (P1 quality; não desbloqueia outros).
- **RF-C2 quarterly cgame flatten** — DEFER AI-3.3 (P2 stylistic).
- **RF-C4 `MODEL_TO_RATECARD` derive** — DEFER AI-3.3 (P1 ICE 75; drift prevention vale mas próxima atualização Anthropic está ~6 meses fora).
- **RF-C5 `cgamePersistPromise` inline** — DEFER AI-3.3 (P2 micro).
- **RF-C6 `IrpfByCurrencyRow` extract + TODO grep marker** — DEFER AI-3.3 (P2; alias drop alinha com sprint que fizer consumer migration audit).
- **RF-C7 `getAveragePtaxSafe` extract** — DEFER AI-3.3 (P1 DRY; só 2 callsites hoje).
- **RF-C8 `isValidConfidence` type-guard com fonte tipada** — DEFER AI-3.3 (P2; depende de RF-A2 estável + 1 sprint de uso).
- **RF-C9 `SafeHtml` branded type** — EXCLUÍDO desta sprint (overkill).
- **RF-D1 fallback `sessionsDetail` quarterly drop** — DEFER AI-3.3 (P1 cleanup; mantém com guard `if (!storage.countGrindSessions)` como defesa-em-profundidade).
- **RF-D2 dynamic imports top-level** — DEFER AI-3.3 (P1 micro-opt; risco circular dependency requer audit cuidadoso).
- **RF-D4 daily sessions range filter pre-fetch** — DEFER AI-3.3 (P1 micro-opt).
- **RF-D5 `Promise.all` paralelo gather** — DEFER AI-3.3 (P1 micro-opt 50-150ms).
- **RF-D8 quarterly `ANTHROPIC_API_KEY` guard drop** — DEFER AI-3.3 (P2 micro).
- **RF-D9 `aggregateCgameForPeriod` gate Free** — DEFER AI-3.3 (P1 defense-in-depth; gate existente no generator já cobre 100% dos casos).
- **RF-D10 monthly `Promise.allSettled`** — DEFER AI-3.3 (P1 paridade quarterly Wave 1 AI-3).
- **RF-D11 `countGrindSessions` null-date fallback** — DEFER AI-3.3 (P1 opcional; quarterly não precisa hoje).
- **RF-F1 `listUsersForCron` cursor pagination** — DEFER permanente até Phase 2 scale (>10K users). 5 testes em `tests/coach/ai-3.1/list-users-cron-pagination.test.ts` permanecem em `.skip()` como contract guard (paridade AI-3.1).
- **Feature nova LLM** — defer permanente até demanda data-driven (founder decision).
- **`fxCascade` Redis multi-replica** — defer permanente (Phase 2 scale).
- **Cleanup banners verbosos** — defer permanente (estética).
- **Mudança de prompts LLM** — todos estabilizados em AI-3 (ADR-174 + ADR-176).

---

## 2. Decisão

Sprint cap 12h founder-locked. Entrega 9 RFs do tier P0/P1 do ICE ranking AI-3.2 + polish básicos sem ADR dedicado:

### 2.1 RF-B1 — `weeklyReportGenerator` migra para `callReportLlm` (P0, M)

`server/services/weeklyReportGenerator.ts:588-615` (bloco `await import('@anthropic-ai/sdk') → new Anthropic → messages.create → parse fallback`) substituído por `await callReportLlm({ systemPrompt, userPromptBuilder, model, maxTokens, tone, level, parseOnError: 'fallback-degraded' })`. Mocks em `tests/coach/weeklyReportGenerator.test.ts` migram de `vi.mock('@anthropic-ai/sdk', ...)` para `vi.mock('@/server/coach/anthropicClient', ...)` (paridade quarterly AI-3.1).

**Paridade comportamental:**
- Mesmo model (`COACH_MODEL` env ou default Sonnet 4.6).
- Mesmo `maxTokens` (preservado do callsite original).
- Retry policy AGORA = 3x exponencial 100/400/1600ms (antes era 1x sem retry). **Mudança de cauda em incidente Anthropic** (não-breaking: usuários veem narrativa válida em vez de degradação imediata).
- `degradedReason` ∈ { `no_anthropic_key`, `llm_failed_3x`, `llm_parse_error`, `llm_timeout` (novo via RF-D6) }.
- `parseOnError: 'fallback-degraded'` (preserva fail-soft pattern AI-3.1).
- Whitelist tone/level: `WHITELISTED_TONES` + `WHITELISTED_LEVELS` exportados de `anthropicClient.ts` (paridade quarterly).

**Snapshot test pré vs pós:** mesmo bundle → mesmo `content` parsed → mesmo HTML email. Custos `cost_usd_estimate` idênticos dentro de tolerância 1e-6 float drift.

### 2.2 RF-B2 — `recommendLessonForUser` migra para `callReportLlm` (P0, M)

Path verificado pelo test-writer pré-implementer (grep `messages.create` confirma `server/coach/tools/recommendLesson.ts:164-191` ou `server/coach/lessonRecommender.ts` — manter qualquer um que tiver o callsite). Paridade total com RF-B1.

**Fecha consolidação 5/5 generators lockstep.** Anotar em CLAUDE.md §10:

> **AI-3.2 generators lockstep:** 5/5 callsites Anthropic SDK migrados para `callReportLlm` (weekly + monthly + daily + quarterly + recommendLesson + summarizer indireto via `maybeSummarizeBundle`). Próxima paridade (ratecard, retry, parse strategy) é 1 edit em `server/coach/anthropicClient.ts`.

### 2.3 RF-B3 — Weekly cost calc inline → `computeReportCost` (P1, S)

`server/services/weeklyReportGenerator.ts`: grep `0.000003` / `* 3` / `SONNET` no arquivo. Se RF-B1 já capturou (callReportLlm internamente delega para `computeReportCost`), valida via grep que zero hits hardcoded restam. Caso sobre callsite isolado, substituir por `computeReportCost(usage, 'sonnet46')`.

**Snapshot test:** `cost_usd_estimate` salvo em `reports` pré vs pós idêntico dentro de tolerância 1e-6.

### 2.4 RF-A1 — `shared/numCoerce.ts` (P0, S)

Cria `shared/numCoerce.ts`:

```ts
export function coerceFiniteNumber(value: unknown, fallback: number = 0): number {
  return Number.isFinite(value as number) ? (value as number) : fallback;
}
```

6 callsites migrados: `server/coach/reportCost.ts`, `server/services/quarterlyReportGenerator.ts`, `server/services/monthlyReportGenerator.ts`, `server/services/dailyDebriefGenerator.ts`, `server/services/tournamentScoringService.ts`, `server/services/fx/fxResolver.ts`.

**API canônica:**
- Aceita `unknown` (compat com `JSON.parse`, queries Drizzle que retornam `string | number`).
- Sem `parseInt`/`parseFloat` — callers fazem coerce explícito se precisarem ("default mínimo" lesson #11).
- Tests: finite passthrough, `NaN`/`Infinity`/`-Infinity` → fallback, string numérica `'42'` → fallback (sem coerce), `undefined`/`null` → fallback, custom fallback respeitado.

### 2.5 RF-A2 — `isValidConfidence` shared (P0, S)

Amplia `server/services/cgameAggregator.ts` (mais próximo semanticamente) exportando:

```ts
export const CGAME_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type CgameConfidence = typeof CGAME_CONFIDENCE_VALUES[number];
export function isValidConfidence(value: unknown): value is CgameConfidence {
  return value === 'high' || value === 'medium' || value === 'low';
}
```

4 callsites usando `isValidConfidence` (zero duplicação). Type-guard runtime + const exportada para uso em arrays de validação Zod ou similares.

### 2.6 RF-A4 — `isRetryableError` shared em `server/utils/` (P0, S)

Cria `server/utils/isRetryableError.ts`:

```ts
export const RETRYABLE_STATUS = [429, 500, 529] as const;
const RETRYABLE_MESSAGE_PATTERNS = /(econnreset|etimedout|network|fetch failed)/i;

export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && (RETRYABLE_STATUS as readonly number[]).includes(status)) {
    return true;
  }
  const message = (err as { message?: string }).message ?? '';
  return RETRYABLE_MESSAGE_PATTERNS.test(message);
}
```

`anthropicClient.ts` importa em vez de manter inline. **Desbloqueia reuse futuro:** FX adapters BCB/Frankfurter (ADR-174), Stripe webhooks, Mux ingestion (ADR-196/199).

Tests cobrem cada status retryable (429, 500, 529) + status não-retryable (400, 401, 403, 404, 503) + network errors (`ECONNRESET`, `ETIMEDOUT`, `network error`, `fetch failed`) + non-objects (string, null, undefined, number).

### 2.7 RF-D3 — Dedup `getAiStructuredProfile` monthly+daily (P0, S)

`server/services/monthlyReportGenerator.ts` + `server/services/dailyDebriefGenerator.ts`: hoje fazem 2 DB hits (`storage.getUserProfile(userId)` + `storage.getAiStructuredProfile(userId)`). AI-3.1 LOW-4 dedupliquei quarterly. Esta sprint estende para monthly + daily.

**Audit pré-implementer (lesson #36):** validar shape do `aiStructuredProfile` retornado por `getUserProfile` (deve ser `User.aiStructuredProfile: AiStructuredProfile | null` JSONB) vs `getAiStructuredProfile` standalone (pode incluir normalização adicional via `normalizeAiStructuredProfile`). Se shape divergir, manter standalone OU normalizar inline.

**Integration test (db spy ou mock counter):** N queries pré vs N-1 pós. Padrão `injectedStorage` (lesson #34) preservado.

### 2.8 RF-D6 — Retry `AbortSignal` cap absoluto (P0, M) [ADR-205 dedicado]

Ver **ADR-205** para spec detalhada. Resumo: `server/coach/anthropicClient.ts` ganha `AbortSignal.timeout(cap)` global (default 60s, configurável via `COACH_LLM_TIMEOUT_MS`). Novo `degradedReason='llm_timeout'` (não-breaking — reports tratam degraded como branch genérica). Worst-case wall-clock per-job ≤ 60s em incidente Anthropic.

### 2.9 RF-D7 — Summarizer `JSON.stringify` sem pretty-print (P0, S)

`server/coach/reportSummarizer.ts`: `JSON.stringify(bundle, null, 2)` → `JSON.stringify(bundle)`. Economia ~25-30% input tokens Haiku em sumarização.

**Validação:**
- Snapshot parse idêntico (Haiku não se importa com whitespace).
- Custo Haiku admin metrics (`reports.cost_usd_estimate` filtrado por `summarizer_model_used IS NOT NULL`) validado pós-deploy: esperado ~20-30% redução em reports sumarizados (bundles >20K chars).

### 2.10 RF-E1 — `countGrindSessions` smoke test (P0, M)

Cria `tests/server/storage/countGrindSessions.test.ts` (unit, opção B do spec — mock `db.select`).

**Tests cobertos:**
- Happy path: `db.select` mock retorna `[{ count: 5 }]` → função retorna `5`. Spy valida `gte(grindSessions.date, fromDate)` chamado quando range provided.
- Throw path: `db.select` throw `db.select is not a function` → handler retorna `0` + log warn (lesson #9 — log antes do fallback).
- Spy valida `where()` chamado com user filter.

**Justificativa unit vs integration:** opção A (integration `pgTestDb`) defer para sprint dedicada de test infra. Opção B cobre 90% do risco com setup mínimo.

### 2.11 Polish básicos (sem ADR dedicado, dentro do commit final)

- **Q6 (comment rot sweep):** grep `// AI-[0-9]` / `// Sprint` / `// RF-` em function bodies de `weeklyReportGenerator`, `monthlyReportGenerator`, `dailyDebriefGenerator`, `quarterlyReportGenerator`, `recommendLesson*`, `_renderReportShell.ts`. Drop task tracking; manter apenas WHY-comments e refs em ADR/spec docs.
- **Q10 (inline await fire-and-forget):** `quarterlyReportGenerator.ts:cgamePersistPromise = Promise.resolve()` + `void cgamePersistPromise` → `void updateCgameRecent(...).catch(err => log)` direto.
- **Q15 (rawText debug):** `CallReportLlmResult.degradedResult` ganha `rawText?: string` opcional. Capturado em log `anthropicClient.parse_failed` (lesson #9 — log inclui `rawText` truncado a 500 chars para debug). 4 generators preservam em fallback path.

---

## 3. Consequências

### Positivas

- **5/5 generators lockstep fechado permanentemente.** Próxima paridade Anthropic (ratecard novo, retry tuning, parse strategy nova, novo `degradedReason`) é 1 edit em `server/coach/anthropicClient.ts` — zero risco de drift.
- **3 helpers shared desbloqueiam reuse futuro.** `coerceFiniteNumber` (6 callsites consolidados + futuros), `isValidConfidence` (4 callsites + futuros enum changes), `isRetryableError` (1 callsite + FX/Stripe/Mux futuros).
- **Worst-case wall-clock per-job ≤ 60s.** AbortSignal cap absoluto + `degradedReason='llm_timeout'` distingue Anthropic outage de erro normal — observability ganho real.
- **~25-30% redução custo Haiku** em runs sumarizados (bundles >20K chars — quarterly tipicamente). Mensurável via `reports.cost_usd_estimate` filtrado por `summarizer_model_used IS NOT NULL`.
- **1 DB hit a menos por monthly + daily run.** Dedup `getAiStructuredProfile` reduz pressure no `users` table; pequeno mas mensurável em peak hours (Pro+ pool).
- **Regression coverage countGrindSessions.** Unit test garante que método AI-3.1 não pode regredir silenciosamente em refactor futuro do storage layer.
- **rawText debug.** Próximo parse failure Anthropic é instantaneamente debuggable via log (lesson #9 ampliada).

### Negativas

- **Mocks Anthropic em `tests/coach/weeklyReportGenerator.test.ts` + `tests/coach/recommendLesson*.test.ts` migram.** Lesson #3 audit obrigatório pré-implementer (test-writer phase). Risco mitigado: AI-3.1 já estabeleceu fixtures shared `tests/fixtures/anthropicClientMocks.ts` (se ainda não existe, criar; se existe, reusar). Lesson #38 documentação em resumo implementer obrigatória.
- **Retry policy weekly + recommendLesson mudou de 1x para 3x exponencial.** Mudança de cauda em incidente Anthropic — usuários veem narrativa válida em vez de degradação imediata. **Não-breaking, mas comportamento observável muda.** Documentado em CLAUDE.md §10 + acceptance test cobre os 3 caminhos (`llm_failed_3x` + `llm_parse_error` + `llm_timeout`).
- **Snapshot tests weekly + recommendLesson podem precisar de update controlado.** Implementer documenta cada snapshot regenerado + diff visual (lesson #38). Tolerância 1e-6 em `cost_usd_estimate`.
- **A5 `resolveStorage` permanece duplicado em 3 generators.** Decisão consciente (risco Q-B reabrir). Defer AI-3.3 ou demanda explícita.
- **C9 `SafeHtml` branded type defer.** Contract caller-side `@safe-html` AI-3.1 (ADR-176 §2.6) continua sendo a única defesa. Risco mitigado: reviewer round AI-3.2 audita callers (`weekly`, `monthly`, `quarterly`) — qualquer regressão é catch pré-merge.

### Neutras

- **CLAUDE.md §10 atualiza** com nota "AI-3.2 generators lockstep 5/5".
- **Backlog AI-3.3** documentado em `Docs/specs/sprint-ai-3.3-backlog.md` (criar pós-merge): A5 + A3 + A6 + C1 + C2 + C4 + C5 + C6 + C7 + C8 + D1 + D2 + D4 + D5 + D8 + D9 + D10 + D11.
- **Lessons learned CLAUDE.md §9** **não ganha entrada nova** — sprint reusa lessons existentes (#3, #9, #11, #34, #36, #38). Caso reviewer round identifique padrão novo, anotar normalmente.

---

## 4. Verificação pós-merge

- [ ] Grep `import.*@anthropic-ai/sdk` em `server/services/*.ts` + `server/coach/tools/*.ts` retorna apenas `server/coach/anthropicClient.ts` (1 hit total).
- [ ] Grep `Number.isFinite` em `server/` + `shared/` retorna apenas `shared/numCoerce.ts` (1 hit) + casos legitimately diferentes documentados.
- [ ] Grep `replace.*<\[\^>\]\*>` (regex `replace(/<[^>]*>/g, '')`) retorna apenas `_helpers.ts` (RF-A3 defer) OU os 2 callsites originais (sem regressão).
- [ ] Suite coach (1300+ tests) verde 100% — paridade comportamental confirmada.
- [ ] Suite server (9700+ tests) verde 100%.
- [ ] `tsc` exit 0.
- [ ] CLAUDE.md §10 atualizado com nota AI-3.2.
- [ ] `Docs/specs/sprint-ai-3.3-backlog.md` criado com tier ICE remanescente.

---

## 5. Notas históricas

- **Numeração:** último ADR é 202 (`audio-logout-cleanup-contract`, MP3.2). Próximo livre = 203. ADR-204 + ADR-205 reservados para `numCoerce` shared util + `AbortSignal` cap absoluto (subdecisões com superfície técnica suficiente para ADR dedicado).
- **Conflito-livre com sessões paralelas:** verificar pré-merge se outro slot 203/204/205 foi reservado por sprint paralela. Se sim, renumerar e atualizar cross-refs.
