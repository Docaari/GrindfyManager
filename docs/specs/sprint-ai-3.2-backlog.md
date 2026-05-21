# Sprint AI-3.2 — Backlog (dormente)

Pendências catalogadas durante /simplify + reviewer do Sprint AI-3.1 (commit pendente 2026-05-21). Sem feature nova; cleanup adicional + DRY + perf + cobertura.

Status: **dormente** — vira spec ativa quando founder/strategist decidir priorizar. Catalogado para não perder débito técnico.

## Origem dos findings

- `simplify` Code Reuse Review (R#1-#12)
- `simplify` Code Quality Review (Q#1-#15)
- `simplify` Efficiency Review (E#1-#12)
- `reviewer` APPROVED-WITH-NITS (3 MEDIUM + 3 INFO)

## Resolvidos no commit AI-3.1 (não fazem parte deste backlog)

- Q#1 dead `lastErr` em anthropicClient
- Q#4 surface degradedReason completo monthly+daily (silent regression fix)
- Q#8 alias morto `llmMentalNarrativeFinal`
- R#1 wrappers `callMonthlyLlm`/`callDailyDebriefLlm` deletados
- R#2 `WHITELISTED_LEVELS` estendido (paridade prompts/quarterlyReport.ts)
- R#3 `sleep` extraído para `server/utils/sleep.ts` (migrei 4 callsites)
- E#7 status 529 retry em `isRetryableError`
- Reviewer MEDIUM HAIKU_45 pricing corrigido ($1.00/$5.00/$0.10/$1.25)
- Reviewer MEDIUM `quarterly.irpfSummary.byCurrency.profitNative` alias adicionado

## Backlog AI-3.2

### Cluster A — DRY (low risk)

- **R#4** `safe`/`num`/`N` finite-coerce helper duplicado ×6 (`reportCost.ts`, `quarterly`, `monthly`, `daily`, `tournamentScoringService`, `fxResolver`). Extract `shared/numCoerce.ts`.
- **R#5** `isValidConfidence` shared — narrowing duplicado em 4 files (quarterly + 3 generators no insight-mapping).
- **R#6** `stripTags` em `_renderReportShell` — duplica `learningObjectivesExtractor`. Promote para `_helpers.ts`.
- **R#7** `isRetryableError` shared (junto com sleep no `server/utils/`).
- **R#8** `resolveStorage` ×3 idêntico (quarterly/monthly/daily). Extract.
- **R#12** `previousMonthRange` em `monthlyReportGenerator` — generalizar para shared.

### Cluster B — Generators não migrados

- **R#9** `weeklyReportGenerator.ts:588-615` ainda usa SDK direto (não `callReportLlm`). 1 dos 5 generators planejados.
- **R#10** `recommendLessonForUser.ts:164-191` idem — 5º generator.
- **R#11** `weeklyReportGenerator` cost calc inline com rates Sonnet 4.6 (verificar se já não migrou para `computeReportCost`).

### Cluster C — Quality polish

- **Q#2** Parameter sprawl tone/level em `CallReportLlmInput` (top-level + opts duplicado).
- **Q#5** Nested 3-level conditional cgame persist quarterly. Achatar com guard clauses.
- **Q#6** Comment rot — sweep "Sprint XXX / RF-YY (ADR-ZZZ)" refs em function bodies. Mantém WHY-comments, drop task refs.
- **Q#7** Ratecard string union `'sonnet46' | 'haiku45'` → derivar de model string (`MODEL_TO_RATECARD`). Evita drift se `COACH_MODEL` env override.
- **Q#10** `cgamePersistPromise` init `Promise.resolve()` + `void` end — substituir por inline await fire-and-forget.
- **Q#11** Inline type `IrpfByCurrencyRow` em computeIrpfSummary — extract + TODO grep marker para drop AI-3.3.
- **Q#12** `getAveragePtaxForRange` dynamic-import dance duplicado ×2 (`quarterly` + `computeIrpfSummary`). Extract `shared/fx/getAveragePtaxSafe.ts`.
- **Q#13** `isValidConfidence` type-guard sem benefício (cgameSnapshotPlain é `any`). Tipar fonte ou drop type-guard.
- **Q#14** `safe-html` contract sem branded type. Defesa-em-profundidade: `SafeHtml = string & { __brand }` + tag function.
- **Q#15** Wrappers descartam `rawText` (útil para debug parse error).

### Cluster D — Performance + observability

- **E#1** Fallback `sessionsDetail` bundle inflation (quarterly path quando storage sem `countGrindSessions`).
- **E#2** Dynamic imports hot path (`reportSummarizer`, `prompts/quarterlyReport`, `fxCascade`) — top-level.
- **E#3 + Q#9** Dedup `getAiStructuredProfile` monthly+daily (quarterly já dedup AI-3.1). 2 DB hits redundantes por run.
- **E#4** Daily sessions filter post-fetch — passar range filter pro `getGrindSessions`.
- **E#5** `Promise.all([getCoachPreferences, getAiStructuredProfile])` paralelo (hoje sequencial).
- **E#6** Retry sem `AbortSignal` cap absoluto — worst-case ~182s pro report job em incidente Anthropic.
- **E#8** Summarizer `JSON.stringify(bundle, null, 2)` pretty-print — drop indent (~30% economia tokens Haiku).
- **E#9** Level resolution guard `if (process.env.ANTHROPIC_API_KEY)` em quarterly — micro-opt prematura.
- **E#10** `aggregateCgameForPeriod` disparado mesmo para Free (defense-in-depth eligibility gate no generator).
- **E#11** Monthly `Promise.all` → `Promise.allSettled` (paridade quarterly Wave 1).
- **E#12** `countGrindSessions` range `null-date` fallback (comentário menciona fallback mas não implementado).

### Cluster E — Cobertura testes

- Reviewer MEDIUM **`countGrindSessions` smoke silencioso**: catch handler swallow `db.select is not a function` retornando 0. Adicionar integration test com `db` real OR unit test que valida `gte(grindSessions.date, ...)` foi chamado.

### Cluster F — Defer scope-locked

- **RF-09** `listUsersForCron` cursor pagination — 4-5h effort + race condition risk com `processReportJobsTick`. 5 testes em `.skip()` em `tests/coach/ai-3.1/list-users-cron-pagination.test.ts` como contract guard.

## Effort estimado total

- Cluster A: ~3h (extracts triviais).
- Cluster B: ~4-5h (weekly + recommendLesson migrações lockstep + tests).
- Cluster C: ~3-4h (polish).
- Cluster D: ~4-6h (perf + observability).
- Cluster E: ~1h (1 integration test).
- Cluster F (RF-09): 4-5h se incluir.

**Total sem RF-09:** ~15-19h. **Com RF-09:** ~19-24h.

## Ordem sugerida quando ativado

1. Cluster A (DRY) — desbloqueia todos os outros.
2. Cluster E (test cov) — protege regressão.
3. Cluster B (weekly + recommendLesson migration) — fecha consolidação dos 5 generators.
4. Cluster D (perf + observability).
5. Cluster C (polish).
6. Cluster F (RF-09) — Phase 2 scale only.
