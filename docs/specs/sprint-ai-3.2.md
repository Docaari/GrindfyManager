# Spec: Sprint AI-3.2 — Cleanup IA wave 2 (DRY closure + 5 generators lockstep + perf/observability + test cov)

## Status
Proposta (aguardando aprovação founder)

---

## Resumo

Sprint cleanup wave 2 pós-AI-3.1 (commit `c41532f1` push origin/main 2026-05-21). **Sem feature nova, sem migration, sem mudança comportamental observável.** Fecha o backlog dormente catalogado em `Docs/specs/sprint-ai-3.2-backlog.md` (R#4-#12 + Q#2-#15 + E#1-#12 + reviewer MEDIUM `countGrindSessions`) e desbloqueia drift acumulado pela paridade incompleta dos 5 generators Anthropic.

**Drivers principais:**

1. **DRY closure (Cluster A)** — 6 helpers duplicados (`safe`/`num`, `isValidConfidence`, `stripTags`, `isRetryableError`, `resolveStorage`, `previousMonthRange`) consolidados em shared modules. Pré-requisito para Cluster B (mocks compatíveis) e Cluster D (perf hooks).
2. **Generators lockstep (Cluster B)** — `weeklyReportGenerator` e `recommendLessonForUser` ainda usam SDK Anthropic direto; AI-3.1 migrou 3/5. Sprint fecha 5/5 (anthropicClient + computeReportCost) eliminando o último drift entre callsites.
3. **Quality polish (Cluster C)** — 11 NITs de tipo/lint/comment-rot catalogados durante `/simplify` AI-3.1.
4. **Perf + observability (Cluster D)** — 11 oportunidades de paralelização, dedup de DB roundtrip, AbortSignal cap, gate Free, Promise.allSettled monthly, summarizer JSON sem pretty-print (~30% tokens Haiku economizados em runs sumarizados).
5. **Test cov (Cluster E)** — `countGrindSessions` smoke silencioso (reviewer MEDIUM AI-3.1): catch handler engole `db.select is not a function` e retorna 0; integration test ou unit test que valida `gte(grindSessions.date, ...)` foi chamado.
6. **DEFER lockado (Cluster F)** — RF-09 `listUsersForCron` cursor pagination DEFER permanente até Phase 2 scale (>10K users) — 5 testes em `.skip()` permanecem como contract guard.

**Não-objetivos:**

- Sem feature nova (nenhum novo tool, nudge, report type, prompt).
- Sem migration de schema (todos os refactors são código puro).
- Sem mudança de UI (nenhum consumer downstream visível afetado).
- Sem mudança comportamental observável (mesma narrativa, mesmo retry, mesmo HTML email, mesmo custo Anthropic — só caminho do código muda).
- Sem cleanup de banners verbosos (defer permanente, estética).
- Sem RF-09 paginate (Cluster F lock).

---

## Contexto

### Estado atual

- **AI-3.1 shipped** (commit `c41532f1`): `server/coach/anthropicClient.ts` (`callReportLlm` retry 3x + whitelist tone/level + parseOnError + log #9), `server/coach/reportCost.ts` (Sonnet 4.6 + Haiku 4.5 pricing oficial 2026-01), `server/utils/sleep.ts` shared, `_renderReportShell.safeBodyHtml` contract + migrate weekly+monthly templates, `byCurrency.profitNative` rename + alias `profit` deprecated (1 sprint janela), chars-only summarize threshold, `countGrindSessions` storage method, dedup `getAiStructuredProfile` no quarterly. 3 dos 5 generators migrados (quarterly+monthly+daily+summarizer); weekly+recommendLesson DEFERIDOS AI-3.2.

- **Backlog dormente** (`Docs/specs/sprint-ai-3.2-backlog.md`):
  - **Cluster A — DRY (low risk):** R#4 finite-coerce, R#5 isValidConfidence, R#6 stripTags promote, R#7 isRetryableError shared, R#8 resolveStorage 3x dup, R#12 previousMonthRange.
  - **Cluster B — generators não migrados:** R#9 weeklyReportGenerator, R#10 recommendLessonForUser, R#11 weekly cost inline.
  - **Cluster C — quality polish:** Q#2/5/6/7/9/10/11/12/13/14/15 (11 itens).
  - **Cluster D — perf + observability:** E#1/2/3/4/5/6/8/9/10/11/12 (11 itens; E#7 já fechado AI-3.1).
  - **Cluster E — test cov:** reviewer MEDIUM `countGrindSessions` smoke.
  - **Cluster F — defer scope-locked:** RF-09 paginate.

- **Alias `byCurrency.profit` deprecation window:** AI-3.1 introduziu `profitNative` com alias `profit` por **1 sprint** (target removal = AI-3.2). Esta sprint **NÃO remove** o alias ainda — Cluster C Q#11 adiciona TODO grep marker para AI-3.3 remover (consumer migration pendente: Coach system prompt builder ainda lê `profit`). Decisão consciente: 1 sprint extra de janela evita breaking change no system prompt sem audit completo de consumers.

### Por que esta sprint

- **Backlog dormente catalogado** em AI-3.1: 19-24h de débito técnico documentado, agora priorizado.
- **5 generators lockstep** — AI-3.1 deixou 2 fora; cada nova feature LLM (futuro) replica o esforço lockstep. Fechar 5/5 elimina o drift permanentemente.
- **Custo Haiku 30% economia** (E#8 — JSON.stringify sem pretty-print): runs com bundle >20K chars (quarterly tipicamente) sumarizam ~20K-50K chars → economia ~$0.003/run × ~hundreds runs/Q = marginal mas mensurável.
- **AbortSignal cap (E#6):** Anthropic outage worst-case hoje = retry 3x exponencial 100/400/1600ms × 3 generators sequenciais ≈ 182s/job. AbortSignal global de 60s evita processor 15min ficar pendurado por 1 job em incidente.
- **Surface coberta por suite existente** (1300 coach + 9636 server tests).
- **Custo zero em produção** — nada visível pra founder/users.

---

## Usuários

- **Founder/Admins:** nenhum impacto visível. Custo Haiku admin metrics potencialmente reduz ~10-30% em runs sumarizados (E#8 + E#10 + threshold tuning AI-3.1 já aplicado).
- **Pro+/Trial users:** nenhum impacto visível (mesma narrativa, mesmo template, mesmos campos). Free users idem (E#10 gate cosmético).
- **IDE/Devs:** próxima paridade ↔ generators custa minutos (5/5 migrados); novo retry behavior é 1 arquivo (`anthropicClient.ts`); novo ratecard é 1 const (`reportCost.ts`).

---

## Requisitos Funcionais

> **Convenção:** cada RF lista `prioridade` (P0/P1/P2), `effort` (S = <30min, M = 30min-2h, L = 2-4h), `cluster` (A/B/C/D/E), `ICE score` (Impact 1-5 × Confidence 1-5 × Ease 1-5).

### Cluster A — DRY closure (P0, Effort ~3h, blast radius BAIXO)

#### RF-A1: `shared/numCoerce.ts` (R#4)

**Prioridade:** P0 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** extrair helper finite-coerce `safe`/`num`/`N` duplicado em 6 arquivos para `shared/numCoerce.ts`.

**Files tocados:**
- Cria `shared/numCoerce.ts` (export `coerceFiniteNumber(value: unknown, fallback?: number): number`).
- Refactor consumers: `server/coach/reportCost.ts`, `server/services/quarterlyReportGenerator.ts`, `server/services/monthlyReportGenerator.ts`, `server/services/dailyDebriefGenerator.ts`, `server/services/tournamentScoringService.ts`, `server/services/fx/fxResolver.ts`.

**Regras de negócio:**
- API canônica: `coerceFiniteNumber(value, fallback = 0): number` — retorna `value` se `Number.isFinite(value as number)`; senão `fallback`.
- Aceita `unknown` (compat com JSON.parse, DB queries que retornam `string | number`).
- Sem `parseInt`/`parseFloat` (callers fazem coerce explícito se precisarem).

**Critério de aceitação:**
- [ ] `shared/numCoerce.ts` exporta `coerceFiniteNumber`.
- [ ] 6 callsites migrados (grep `Number.isFinite` mostra apenas dentro do `numCoerce.ts` + casos legitimately diferentes).
- [ ] Unit test `tests/shared/numCoerce.test.ts` cobre: finite passthrough, NaN/Infinity/-Infinity → fallback, string numérica → fallback (sem coerce automático), undefined/null → fallback, custom fallback respeitado.
- [ ] Zero regressão em suite coach (1300/1300).

#### RF-A2: `isValidConfidence` shared (R#5)

**Prioridade:** P0 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** consolidar narrowing `cgameRecent.confidence ∈ { 'high', 'medium', 'low' }` duplicado em 4 generators.

**Files tocados:**
- Cria `shared/cgameTypes.ts` ou amplia `server/services/cgameAggregator.ts` exportando `CGAME_CONFIDENCE_VALUES = ['high','medium','low'] as const` + `isValidConfidence(value: unknown): value is CgameConfidence`.
- Refactor consumers: `quarterlyReportGenerator.ts` (cgameSnapshot persist + Coach narrative), 3 generators em insight-mapping.

**Regras de negócio:**
- Type guard runtime: `value === 'high' || value === 'medium' || value === 'low'`.
- Const exportada para uso em arrays de validação.

**Critério de aceitação:**
- [ ] 4 callsites usando `isValidConfidence` (zero duplicação).
- [ ] Unit test cobre cada valor válido + inválidos (undefined, null, 'unknown', number).

#### RF-A3: `stripTags` em `_helpers.ts` (R#6)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** promover `stripTags` (hoje duplicado em `_renderReportShell.ts` e `learningObjectivesExtractor.ts`) para `server/emails/templates/_helpers.ts` (já existe — `escapeHtml`).

**Files tocados:**
- `server/emails/templates/_helpers.ts`: adiciona `export function stripTags(html: string): string`.
- `server/emails/templates/_renderReportShell.ts`: importa de `_helpers`.
- `server/coach/learningObjectivesExtractor.ts`: idem.

**Regras de negócio:**
- Implementação canônica: `html.replace(/<[^>]*>/g, '').trim()`.
- Comportamento idêntico ao de cada callsite hoje (validar visualmente).

**Critério de aceitação:**
- [ ] Zero duplicação (grep `replace.*\/<[^>]\*>` retorna só 1 hit).
- [ ] Snapshot tests dos 3 templates email (weekly/monthly/quarterly) idênticos pré/pós.

#### RF-A4: `isRetryableError` shared em `server/utils/` (R#7)

**Prioridade:** P0 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** mover `isRetryableError` (hoje inline em `server/coach/anthropicClient.ts`) para `server/utils/isRetryableError.ts` para uso futuro (e.g. FX adapters, Stripe).

**Files tocados:**
- Cria `server/utils/isRetryableError.ts`.
- `server/coach/anthropicClient.ts`: importa.

**Regras de negócio:**
- API: `isRetryableError(err: unknown): boolean` — true se status ∈ {429, 500, 529} OU mensagem inclui `ECONNRESET`/`ETIMEDOUT`/`network`/`fetch failed` (case-insensitive).
- Lista canônica de status retryable como const exportada: `RETRYABLE_STATUS = [429, 500, 529] as const`.

**Critério de aceitação:**
- [ ] `server/utils/isRetryableError.ts` exporta função + const.
- [ ] `anthropicClient.ts` importa (zero inline).
- [ ] Unit test cobre cada status retryable + status não-retryable (400, 401, 403, 404, 503) + network errors comuns.

#### RF-A5: `resolveStorage` extract (R#8) — CONDICIONAL

**Prioridade:** P1 | **Effort:** M | **ICE:** 3×4×4 = 48

**Descrição:** extrair `resolveStorage` duplicado em 3 generators (quarterly/monthly/daily) — **CONTRARIANDO ADR-174 §3.F (Q-B locked)**.

**Justificativa para reabrir Q-B:**
- AI-3 lock acceitou duplicação por path relativo (`../storage` vs `../../storage` quebrava helper centralizado).
- Hipótese AI-3.2: hoje, em `server/coach/anthropicClient.ts` (criado AI-3.1), conseguimos isolar `resolveStorage` num módulo que recebe loader callback OU usa alias `@/storage` via tsconfig já configurado.
- Test-writer phase audita viabilidade ANTES de implementer. Se sintaxe quebra (path resolution AB), marca `[DEFER AI-3.3]` e sprint procede sem RF-A5.

**Files tocados (se viável):**
- Cria `server/coach/resolveStorage.ts` (ou `server/storage/resolveStorage.ts`).
- API: `async function resolveStorage(injected?: any, loader?: () => Promise<any>): Promise<IStorage>`.
- 3 callsites em generators substituem inline por `resolveStorage(injectedStorage, () => import('../storage'))`.

**Critério de aceitação:**
- [ ] OPÇÃO 1 (viável): 3 callsites migram, zero regressão, tests verde.
- [ ] OPÇÃO 2 (não-viável): marcar `[DEFER AI-3.3]` no resumo do implementer + documentar razão técnica em CLAUDE.md §Convenções.

#### RF-A6: `previousMonthRange` shared (R#12)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** generalizar `previousMonthRange` (hoje em `monthlyReportGenerator.ts`) para shared.

**Files tocados:**
- Cria `shared/dateRanges.ts` (ou amplia `shared/brTimezones.ts` se semanticamente próximo) exportando `previousMonthRange(reference: Date, timezone: string): {start: string, end: string}`.
- Refactor: `monthlyReportGenerator.ts` importa.

**Regras de negócio:**
- API canônica: retorna `{start, end}` no formato `YYYY-MM-DD` no fuso do user.
- Reusa lógica timezone existente (luxon/Intl.DateTimeFormat).

**Critério de aceitação:**
- [ ] Função extraída + unit test (3 meses diferentes, fuso BR vs UTC, boundary mês com 30 vs 31 dias, fevereiro bissexto).
- [ ] Monthly generator usa o shared, snapshot test inalterado.

---

### Cluster B — Generators lockstep (P0, Effort ~4-5h, blast radius MÉDIO)

#### RF-B1: `weeklyReportGenerator` migra para `callReportLlm` (R#9)

**Prioridade:** P0 | **Effort:** M | **ICE:** 5×4×4 = 80

**Descrição:** linhas 588-615 de `weeklyReportGenerator.ts` ainda usam SDK direto. Migrar para `callReportLlm` (`server/coach/anthropicClient.ts` criado AI-3.1).

**Files tocados:**
- `server/services/weeklyReportGenerator.ts:588-615` — substitui bloco `await import('@anthropic-ai/sdk')` + `new Anthropic` + `messages.create` + parse por `await callReportLlm({systemPrompt, userPromptBuilder, model, maxTokens, tone, level, parseOnError: 'fallback-degraded'})`.
- `tests/coach/weeklyReportGenerator.test.ts` — mocks migram de `vi.mock('@anthropic-ai/sdk', ...)` para `vi.mock('@/server/coach/anthropicClient', ...)`.

**Regras de negócio:**
- Comportamento observable preservado: mesmo retry (agora 3x via `callReportLlm` — antes era 1x; ligeira mudança de cauda em incidente Anthropic).
- `degradedReason` ∈ { `no_anthropic_key`, `llm_failed_3x`, `llm_parse_error` } — paridade monthly/quarterly/daily.
- `parseOnError: 'fallback-degraded'` (não throw — preserva fail-soft pattern).
- Whitelist tone/level: `WHITELISTED_TONES` + `WHITELISTED_LEVELS` exportados de `anthropicClient.ts`.

**Critério de aceitação:**
- [ ] Grep `import.*@anthropic-ai/sdk` em weeklyReportGenerator retorna 0 hits.
- [ ] Mocks migrados; suite weekly tests verde (paridade comportamental).
- [ ] Snapshot test `content` pré vs pós-migrate idêntico (mesmo bundle → mesmo parsed).
- [ ] degradedReasons fechados: `no_anthropic_key` + `llm_failed_3x` + `llm_parse_error` cada um com test dedicado.

#### RF-B2: `recommendLessonForUser` migra para `callReportLlm` (R#10)

**Prioridade:** P0 | **Effort:** M | **ICE:** 5×4×4 = 80

**Descrição:** `server/coach/tools/recommendLesson.ts:164-191` (ou path equivalente) idem RF-B1. Fecha consolidação 5/5 generators.

**Files tocados:**
- `server/coach/tools/recommendLesson.ts` (ou `server/coach/lessonRecommender.ts` — confirmar path via grep `messages.create` ao iniciar).
- Tests correspondentes.

**Critério de aceitação:**
- [ ] Paridade RF-B1 (zero SDK direto, mocks migrados, snapshot idêntico).
- [ ] Plano IA generators lockstep: 5/5 migrados (weekly+monthly+daily+quarterly+summarizer+recommendLesson) — anotar em CLAUDE.md §10.

#### RF-B3: Weekly cost calc inline → `computeReportCost` (R#11)

**Prioridade:** P1 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** verificar se weeklyReportGenerator ainda tem cost calc inline com rates Sonnet 4.6 hardcoded (RF-B1 pode já ter resolvido ao migrar `callReportLlm`). Se sim, substituir por `computeReportCost(usage, 'sonnet46')`.

**Files tocados:**
- `server/services/weeklyReportGenerator.ts` — grep `0.000003` ou `* 3` ou `SONNET` no arquivo.

**Critério de aceitação:**
- [ ] Grep retorna 0 hits hardcoded.
- [ ] `cost_usd_estimate` salvo em `reports` pré vs pós idêntico (tolerância 1e-6 float drift).

---

### Cluster C — Quality polish (P1, Effort ~3-4h, blast radius BAIXO)

#### RF-C1: `CallReportLlmInput` tone/level dedup (Q#2)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×4 = 60

**Descrição:** AI-3.1 introduziu `tone`/`level` top-level e em `opts.tone`/`opts.level` (sprawl). Consolidar em 1 lugar.

**Files tocados:**
- `server/coach/anthropicClient.ts` — `CallReportLlmInput` schema.
- 5 callsites — todos passam tone/level top-level (preferred).

**Regras de negócio:**
- Eliminar duplicação (`opts.tone` → `tone` top-level).
- Manter type-narrowing via `WHITELISTED_TONES`/`WHITELISTED_LEVELS`.

**Critério de aceitação:**
- [ ] `CallReportLlmInput.opts` perdeu `tone`/`level`; só top-level.
- [ ] 5 callsites migrados.

#### RF-C2: Quarterly cgame persist 3-level conditional flatten (Q#5)

**Prioridade:** P2 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** `quarterlyReportGenerator.ts:200-230` (bloco cgame persist) tem nested 3-level conditional. Achatar com guard clauses early-return.

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts:200-230`.

**Critério de aceitação:**
- [ ] Max nesting ≤ 2 levels.
- [ ] Logica equivalente (snapshot test idêntico).

#### RF-C3: Comment rot sweep (Q#6)

**Prioridade:** P2 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** sweep "Sprint XXX / RF-YY (ADR-ZZZ)" refs em function bodies de generators IA. Manter WHY-comments e refs em ADR/spec docs; drop task refs em código.

**Files tocados:**
- 5 generators (`weeklyReportGenerator`, `monthlyReportGenerator`, `dailyDebriefGenerator`, `quarterlyReportGenerator`, `recommendLesson*`).
- `_renderReportShell.ts`.

**Critério de aceitação:**
- [ ] Grep `// AI-[0-9]` / `// Sprint` / `// RF-` em function bodies dos files alvo retorna apenas comments que documentam WHY/contract (não task tracking).
- [ ] CLAUDE.md §10 mantém todas as refs (são histórico ali).

#### RF-C4: Ratecard string union deriva de `MODEL_TO_RATECARD` (Q#7)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** `Ratecard = 'sonnet46' | 'haiku45'` hoje é union literal. Derivar de map `MODEL_TO_RATECARD: Record<string, Ratecard>` para evitar drift quando `COACH_MODEL` env override mudar.

**Files tocados:**
- `server/coach/reportCost.ts`.
- `anthropicClient.ts` (`callReportLlm` agora pode resolver ratecard via map).

**Regras de negócio:**
- `MODEL_TO_RATECARD = { 'claude-sonnet-4-6': 'sonnet46', 'claude-sonnet-4-6-20250109': 'sonnet46', 'claude-haiku-4-5': 'haiku45', 'claude-haiku-4-5-20251001': 'haiku45' } as const`.
- `getRatecard(model: string): Ratecard | null` — retorna null se model desconhecido; caller decide fallback.

**Critério de aceitação:**
- [ ] `Ratecard` derivado de `MODEL_TO_RATECARD[keyof typeof]` (não literal manual).
- [ ] Unit test cobre cada model conhecido + model desconhecido → null.

#### RF-C5: `cgamePersistPromise` inline await fire-and-forget (Q#10)

**Prioridade:** P2 | **Effort:** S | **ICE:** 1×5×5 = 25

**Descrição:** `quarterlyReportGenerator.ts:cgamePersistPromise = Promise.resolve()` + `void cgamePersistPromise` no final — substituir por inline `void updateCgameRecent(...).catch(err => log)` direto.

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts`.

**Critério de aceitação:**
- [ ] Variável `cgamePersistPromise` removida.
- [ ] Pattern `void updateCgameRecent(...).catch(...)` direto.

#### RF-C6: `IrpfByCurrencyRow` extract + TODO grep marker (Q#11)

**Prioridade:** P2 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** inline type `IrpfByCurrencyRow` em `computeIrpfSummary.ts` extract + adicionar TODO marker para drop alias `profit` em AI-3.3.

**Files tocados:**
- `server/coach/tools/computeIrpfSummary.ts`.

**Regras de negócio:**
- Extract `interface IrpfByCurrencyRow { currency: string; profitNative: number; /* @deprecated remove AI-3.3 */ profit: number; depositsBrl: number; withdrawsBrl: number; ... }`.
- Comment marker grepável: `// TODO(AI-3.3): drop byCurrency.profit alias`.

**Critério de aceitação:**
- [ ] Tipo extraído + reusado.
- [ ] Grep `TODO(AI-3.3)` lista todos os pontos de cleanup futuro.

#### RF-C7: `getAveragePtaxSafe` extract em `shared/fx/` (Q#12)

**Prioridade:** P1 | **Effort:** M | **ICE:** 3×5×4 = 60

**Descrição:** `getAveragePtaxForRange` dynamic-import dance duplicado em quarterly + computeIrpfSummary. Extract `shared/fx/getAveragePtaxSafe.ts`.

**Files tocados:**
- Cria `shared/fx/getAveragePtaxSafe.ts` (ou `server/services/fx/getAveragePtaxSafe.ts` se preferir manter server-only).
- 2 callsites migram.

**Regras de negócio:**
- API: `getAveragePtaxSafe(from: string, to: string, options?: { logger?, signal? }): Promise<number | null>` — retorna `null` quando FX indisponível (degraded), nunca throw.
- Internamente delega para `fxCascade.getAveragePtaxForRange` com try/catch + log #9 antes do fallback.

**Critério de aceitação:**
- [ ] 2 callsites migrados.
- [ ] Unit test cobre: PTAX disponível, BCB throw + Frankfurter passa, ambos throw → null + log.

#### RF-C8: `isValidConfidence` type-guard tipar fonte ou drop (Q#13)

**Prioridade:** P2 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** AI-3.2 RF-A2 já consolida `isValidConfidence` — mas reviewer Q#13 questiona se vale type-guard quando `cgameSnapshotPlain` é `any`. Opções:
- (a) Tipar `cgameSnapshotPlain` no aggregator (`CgameSnapshot` em vez de `any`).
- (b) Drop type-guard (passa qualquer string e deixa `normalizeCgameRecent` filtrar).

**Decisão:** **opção (a)** — tipar fonte. Aggregator retorna `CgameSnapshot` type explícito; type-guard ganha benefit do TS narrowing.

**Files tocados:**
- `server/services/cgameAggregator.ts` — return type explícito.
- Consumers — confiam no narrowing.

**Critério de aceitação:**
- [ ] `aggregateCgameForPeriod` return type `CgameSnapshot | null` (não `any`).
- [ ] `isValidConfidence` type-guard ativo via `value is CgameConfidence`.

#### RF-C9: `safe-html` branded type (Q#14)

**Prioridade:** P2 | **Effort:** M | **ICE:** 2×4×4 = 32

**Descrição:** AI-3.1 introduziu `_renderReportShell.safeBodyHtml` contract caller-side. Hardening defesa-em-profundidade: branded type `SafeHtml = string & { __brand: 'SafeHtml' }` + tag function `safeHtml\`...\`` que aceita só strings literais ou outras `SafeHtml`.

**Files tocados:**
- `server/emails/templates/_helpers.ts` — exporta `SafeHtml` + `safeHtml` tag.
- 3 templates (`weekly`, `monthly`, `quarterly`) migram `bodyHtml` builder para usar `safeHtml\`...${escapeHtml(userContent)}...\``.

**Critério de aceitação:**
- [ ] `_renderReportShell.safeBodyHtml: SafeHtml` (não `string` puro).
- [ ] Caller que não usar `safeHtml` tag (ou `escapeHtml`) quebra TS compile.
- [ ] 3 templates migrados, snapshot test idêntico.

#### RF-C10: Wrappers preservam `rawText` (Q#15)

**Prioridade:** P2 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** AI-3.1 deletou wrappers `callMonthlyLlm`/`callDailyDebriefLlm` (R#1 backlog). Mas `rawText` (útil para debug parse error) hoje só vive no return de `callReportLlm` e os callsites não preservam ao retornar `degraded`. Adicionar `rawText?: string` no `degradedResult` quando `parseOnError='fallback-degraded'`.

**Files tocados:**
- `server/coach/anthropicClient.ts` — `CallReportLlmResult.degradedResult` ganha `rawText?: string`.
- 4 generators — preservam em fallback path (log antes de descartar).

**Critério de aceitação:**
- [ ] `rawText` capturado em log `anthropicClient.parse_failed` (lesson #9).
- [ ] Unit test simula parse error e valida log inclui `rawText`.

---

### Cluster D — Perf + observability (P1, Effort ~4-6h, blast radius BAIXO-MÉDIO)

#### RF-D1: Fallback `sessionsDetail` quarterly path (E#1)

**Prioridade:** P1 | **Effort:** M | **ICE:** 3×4×4 = 48

**Descrição:** quarterly path tem fallback `sessionsDetail` (carrega N rows) quando storage sem `countGrindSessions`. AI-3.1 introduziu o método; fallback agora redundante.

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts`.

**Critério de aceitação:**
- [ ] Fallback removido OU mantido com guard `if (!storage.countGrindSessions)` + log warn (mais defensivo).
- [ ] Bundle size pré vs pós-migrate verificado (snapshot test).

#### RF-D2: Dynamic imports hot path → top-level (E#2)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** `reportSummarizer`, `prompts/quarterlyReport`, `fxCascade` — hot path em geração de report. Cada `await import(...)` adiciona event loop tick + module cache lookup.

**Files tocados:**
- `quarterlyReportGenerator.ts`, `monthlyReportGenerator.ts`, `dailyDebriefGenerator.ts`.

**Regras de negócio:**
- Migrar `await import('./reportSummarizer')` para top-level `import { maybeSummarizeBundle } from './reportSummarizer'`.
- Validar zero ciclo de import (TS strict deve catch).

**Critério de aceitação:**
- [ ] 3+ dynamic imports migrados.
- [ ] tsc 0, sem warning de circular dependency.
- [ ] Wall-clock micro-benchmark (1 run) pré vs pós (esperado: ~10-50ms a menos em cold path).

#### RF-D3: Dedup `getAiStructuredProfile` monthly+daily (E#3 + Q#9)

**Prioridade:** P0 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** AI-3.1 dedupliquei o quarterly (LOW-4); monthly+daily ainda fazem 2 DB hits redundantes (`getUserProfile` + `getAiStructuredProfile`).

**Files tocados:**
- `server/services/monthlyReportGenerator.ts`.
- `server/services/dailyDebriefGenerator.ts`.

**Regras de negócio:**
- `storage.getUserProfile(userId)` retorna `User` com `aiStructuredProfile: AiStructuredProfile | null` JSONB → reusar direto.
- Audit pre-implementer: validar shape do `aiStructuredProfile` retornado por `getUserProfile` vs `getAiStructuredProfile` standalone (lesson #36 — schema lazy).

**Critério de aceitação:**
- [ ] 2 generators dedupduplicados (zero `getAiStructuredProfile` standalone call).
- [ ] Integration test (db spy ou mock counter): N queries pré vs N-1 pós.

#### RF-D4: Daily sessions filter pre-fetch via getGrindSessions range (E#4)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** daily debrief filtra sessões post-fetch (carrega todas + filtra in-memory). Passar range filter pro `getGrindSessions(userId, {from, to})`.

**Files tocados:**
- `server/services/dailyDebriefGenerator.ts`.

**Critério de aceitação:**
- [ ] `getGrindSessions` recebe range explícito.
- [ ] Snapshot test debrief idêntico.

#### RF-D5: `Promise.all([getCoachPreferences, getAiStructuredProfile])` paralelo (E#5)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** carregamentos sequenciais hoje; paralelizar com `Promise.all` (ou `Promise.allSettled` se erros independentes).

**Files tocados:**
- `monthlyReportGenerator.ts`, `dailyDebriefGenerator.ts`.

**Critério de aceitação:**
- [ ] Wall-clock micro-benchmark (esperado: ~50-150ms a menos no gather).
- [ ] Snapshot test idêntico.

#### RF-D6: Retry `AbortSignal` cap absoluto (E#6)

**Prioridade:** P0 | **Effort:** M | **ICE:** 4×4×4 = 64

**Descrição:** AI-3.1 retry 3x exponencial 100/400/1600ms × 3 generators sequenciais em incidente Anthropic = worst-case ~182s/job. Adicionar `AbortSignal.timeout(60_000)` global no `callReportLlm`.

**Files tocados:**
- `server/coach/anthropicClient.ts`.

**Regras de negócio:**
- Default cap = 60s. Configurável via env `COACH_LLM_TIMEOUT_MS` (default 60000).
- Quando signal abort → `degradedReason='llm_timeout'` (nova reason).
- Cap NÃO afeta retries individuais (cada attempt mantém timeout próprio do SDK ~30s); só limita total wall-clock.

**Critério de aceitação:**
- [ ] `AbortSignal.timeout(cap)` aplicado em todas as chamadas via `callReportLlm`.
- [ ] Unit test simula timeout (mock que sleep > cap) → `degradedReason='llm_timeout'`.
- [ ] Env `COACH_LLM_TIMEOUT_MS` documentada em CLAUDE.md §4.

#### RF-D7: Summarizer JSON.stringify sem pretty-print (E#8)

**Prioridade:** P0 | **Effort:** S | **ICE:** 4×5×5 = 100

**Descrição:** `reportSummarizer.ts` faz `JSON.stringify(bundle, null, 2)` (pretty-print). Tokens Haiku contam whitespace — drop indent economiza ~30% input tokens em sumarização.

**Files tocados:**
- `server/coach/reportSummarizer.ts`.

**Critério de aceitação:**
- [ ] `JSON.stringify(bundle)` (sem pretty-print).
- [ ] Custo Haiku admin metrics validado pós-deploy (esperado: ~20-30% menos `cost_usd_estimate` em reports sumarizados).
- [ ] Snapshot parse idêntico (Haiku não se importa com whitespace).

#### RF-D8: Quarterly `if (process.env.ANTHROPIC_API_KEY)` micro-opt drop (E#9)

**Prioridade:** P2 | **Effort:** S | **ICE:** 1×5×5 = 25

**Descrição:** `quarterlyReportGenerator.ts` tem level resolution guard `if (process.env.ANTHROPIC_API_KEY)` antes de chamar `aggregateCgameForPeriod` (micro-opt prematura — `aggregateCgameForPeriod` é SQL puro, sem Anthropic).

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts`.

**Critério de aceitação:**
- [ ] Guard removido.
- [ ] Snapshot test idêntico.

#### RF-D9: `aggregateCgameForPeriod` gate Free defense-in-depth (E#10)

**Prioridade:** P1 | **Effort:** S | **ICE:** 2×5×5 = 50

**Descrição:** `aggregateCgameForPeriod` hoje disparado mesmo para Free (eligibility gate é no generator, mas aggregator não checa). Defense-in-depth: gate no início do aggregator.

**Files tocados:**
- `server/services/cgameAggregator.ts`.

**Regras de negócio:**
- Adicionar `if (!isReportEligible(userId, 'quarterly')) return null` no topo (ou similar — confirmar API do `reportEligibility.ts`).
- Free user nunca cai no aggregator pesado.

**Critério de aceitação:**
- [ ] Aggregator early-return para Free user.
- [ ] Unit test cobre cada tier (Free → null, Trial/Pro → executa).

#### RF-D10: Monthly `Promise.all` → `Promise.allSettled` (E#11)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** paridade com quarterly Wave 1 (AI-3.1). Monthly hoje usa `Promise.all` (1 reject derruba todos).

**Files tocados:**
- `server/services/monthlyReportGenerator.ts`.

**Critério de aceitação:**
- [ ] `Promise.allSettled` no gather wave 1.
- [ ] Errors individuais logados (`status: 'rejected'`).
- [ ] Snapshot test cobre 1 source rejeitado → outros campos preservados.

#### RF-D11: `countGrindSessions` range null-date fallback (E#12)

**Prioridade:** P1 | **Effort:** S | **ICE:** 3×5×5 = 75

**Descrição:** `countGrindSessions` (AI-3.1) tem comentário "fallback para null date" mas não implementa — query `WHERE date >= ...` ignora rows com `date IS NULL`.

**Files tocados:**
- `server/storage/grindSessionsStorage.ts` (ou `storage.ts`).

**Regras de negócio:**
- Fallback opcional: parâmetro `{includeNullDate?: boolean}` default `false`.
- Query: `WHERE (date >= $from AND date <= $to) OR (includeNullDate AND date IS NULL)`.
- Documentar quando usar: hoje quarterly não precisa (sessões sem date são bug, exclusão é OK).

**Critério de aceitação:**
- [ ] Param `includeNullDate` aceito (default false).
- [ ] Unit test cobre with/without null-date rows.

---

### Cluster E — Test cov (P0, Effort ~1h)

#### RF-E1: `countGrindSessions` smoke test (reviewer MEDIUM)

**Prioridade:** P0 | **Effort:** M | **ICE:** 5×4×4 = 80

**Descrição:** reviewer AI-3.1 MEDIUM: catch handler em `countGrindSessions` engole `db.select is not a function` retornando 0. Sem test garantindo que `gte(grindSessions.date, ...)` foi chamado, regressão pode passar silenciosa.

**Files tocados:**
- Cria `tests/server/storage/countGrindSessions.test.ts`.

**Regras de negócio:**
- OPÇÃO A (integration): test com `db` real (`pgTestDb` se existe) + insert N sessões → `countGrindSessions(userId, range)` retorna N.
- OPÇÃO B (unit): mock `db.select` retornando `[{count: 5}]` + valida `gte(grindSessions.date, from)` chamado via spy.

**Decisão:** **opção B** (unit) — mais rápido, evita setup pgTestDb se inexistente; cobre 90% do risco. Opção A defer para sprint dedicada de test infra.

**Critério de aceitação:**
- [ ] Test cobre: db real returns count, db throw → handler retorna 0 + log warn (lesson #9).
- [ ] Spy valida `gte(grindSessions.date, fromDate)` foi chamado quando range provided.
- [ ] Spy valida `where()` chamado com user filter.

---

### Cluster F — DEFER scope-locked

#### RF-F1: `listUsersForCron` cursor pagination — DEFER permanente até Phase 2

**Prioridade:** N/A | **Effort:** L (4-5h se ativado) | **ICE:** 1×3×3 = 9

**Descrição:** AI-3.1 já marcou DEFER (5 testes em `.skip()` como contract guard). Esta sprint **reconfirma DEFER** explicitamente:

- Phase 1 (centenas de users) não tem urgência.
- Race condition risk entre paginação e `processReportJobsTick` concorrente.
- Effort 4-5h sozinho com tests de concorrência complexos.
- Defer até Phase 2 scale demand (>10K users — meses à frente).

**Files tocados:** nenhum (defer permanente).

**Critério de aceitação:**
- [ ] 5 testes em `tests/coach/ai-3.1/list-users-cron-pagination.test.ts` permanecem em `.skip()`.
- [ ] CLAUDE.md §10 anota "AI-3.2 reconfirma DEFER de RF-09".

---

## Requisitos Não-Funcionais

- **Performance:** wall-clock total de geração de report (gather + LLM call) reduzido ~5-15% em runs com bundle médio (RF-D2 + RF-D5 + RF-D7); ~30% redução custo Haiku em runs sumarizados (RF-D7).
- **Observability:** `AbortSignal` cap (RF-D6) garante worst-case wall-clock per-job ≤ 60s × generators sequenciais; `degradedReason='llm_timeout'` distingue Anthropic outage de erro normal.
- **Defensividade:** lesson #9 (log antes do fallback) preservado em todos os novos callsites; lesson #3 (mock shape real) ativa em todos os tests novos; lesson #34 (`injectedStorage`) preservado.
- **Backward compat:** zero breaking change observable (mesma narrativa, mesmo HTML email, mesmo `degradedReason` schema — exceto adição não-breaking de `llm_timeout`).
- **Disponibilidade:** sem migration de schema; deploy sem downtime; rollback via revert do commit (sem state migration).

---

## Endpoints Previstos

Nenhum endpoint novo. Sprint cleanup interno.

---

## Modelos de Dados Afetados

Nenhuma migration. Mudanças:

- **`AiStructuredProfile.cgameRecent.confidence`** (TS type): mantém `'high' | 'medium' | 'low'` enum; type-guard `isValidConfidence` consolidado (RF-A2 + RF-C8).
- **`CallReportLlmInput`** (TS interface): `opts.tone`/`opts.level` removidos; só top-level (RF-C1).
- **`CallReportLlmResult.degradedResult`** (TS interface): adiciona `rawText?: string` opcional (RF-C10).
- **`Ratecard`** (TS type alias): derivado de `MODEL_TO_RATECARD` map (RF-C4).
- **`SafeHtml`** (TS branded type): `string & { __brand: 'SafeHtml' }` (RF-C9).
- **`IrpfByCurrencyRow`** (TS interface): extraído inline → named export com TODO marker (RF-C6).

---

## Integrações Externas

Nenhuma nova. Mudanças:

- **Anthropic SDK**: WeeklyReportGenerator + recommendLessonForUser passam a chamar via `callReportLlm` wrapper (RF-B1 + RF-B2). Comportamento HTTP idêntico (mesmo model, max_tokens, prompt). Apenas retry policy unificada (3x exponencial em todos os 5 generators).

---

## Cenários de Teste Derivados

### Happy Path

- [ ] **A1 happy**: `coerceFiniteNumber(42)` → 42; `coerceFiniteNumber(NaN, 0)` → 0; 6 callsites migrados sem regressão.
- [ ] **A2 happy**: `isValidConfidence('medium')` → true (type-narrowed); 4 callsites usam.
- [ ] **A4 happy**: `isRetryableError({status: 429})` → true; `isRetryableError({status: 401})` → false.
- [ ] **B1 happy**: weeklyReportGenerator com bundle válido → mesma narrativa pré/pós-migrate.
- [ ] **B2 happy**: recommendLessonForUser idem; CLAUDE.md anota 5/5 generators lockstep.
- [ ] **D3 happy**: monthly+daily fazem 1 DB hit em vez de 2 para profile.
- [ ] **D7 happy**: summarizer envia `JSON.stringify(bundle)` (sem pretty-print) → parse Haiku idêntico.
- [ ] **E1 happy**: `countGrindSessions(userId, {from, to})` retorna count correto + spy valida `gte` chamado.

### Validação de Input

- [ ] **A1 invalid**: `coerceFiniteNumber('42')` → fallback (sem coerce automático); `coerceFiniteNumber(null)` → fallback; `coerceFiniteNumber(undefined)` → fallback.
- [ ] **A2 invalid**: `isValidConfidence('unknown')` → false; `isValidConfidence(undefined)` → false.
- [ ] **C7 invalid**: `getRatecard('claude-opus-4')` (model desconhecido) → null.
- [ ] **D6 invalid**: callReportLlm com `COACH_LLM_TIMEOUT_MS=100` + mock que sleep 200ms → `degradedReason='llm_timeout'`.

### Regras de Negócio

- [ ] **B1 retry**: weeklyReportGenerator com mock 429 → 429 → 200 → resolve com retry 3x bem-sucedido (paridade quarterly).
- [ ] **B1 failsoft**: weeklyReportGenerator com mock 500 × 3 → `degradedReason='llm_failed_3x'` + log #9 em cada attempt.
- [ ] **B1 parse**: weeklyReportGenerator com mock retornando JSON inválido → `degradedReason='llm_parse_error'` + log `anthropicClient.parse_failed` (com `rawText`).
- [ ] **C9 type-fail**: `_renderReportShell({safeBodyHtml: 'unsanitized'})` (string puro) → TS compile error; só `safeHtml\`...\`` ou `escapeHtml(...)` aceitos.
- [ ] **D6 timeout-config**: env `COACH_LLM_TIMEOUT_MS=30000` → cap 30s em vez de 60s default.
- [ ] **D9 free-gate**: `aggregateCgameForPeriod(userId)` com user Free → null + log warn; user Pro/Trial → executa SQL.

### Edge Cases

- [ ] **A3 stripTags edge**: HTML aninhado `<div><span>texto</span></div>` → "texto"; HTML malformado `<div>texto` → "texto"; vazio → "".
- [ ] **A6 previousMonthRange edge**: janeiro → dezembro ano anterior; março → fevereiro (validar dias 28/29 bissexto); fuso BR → UTC offset correto.
- [ ] **D10 allSettled edge**: monthly com 1 source throw + 4 success → 4 campos populados + 1 degradado (não derruba run).
- [ ] **D11 null-date edge**: `countGrindSessions(userId, range, {includeNullDate: true})` → conta sessões com `date IS NULL`.
- [ ] **F1 .skip preservado**: 5 testes em `list-users-cron-pagination.test.ts` em `.skip()` (contract guard).

---

## Fora de Escopo

- **Feature nova** — sprint cleanup. Nenhum novo tool, nudge, report type, prompt ou endpoint.
- **Migration de schema** — todos os refactors são código puro.
- **Remoção do alias `byCurrency.profit`** — deferred AI-3.3 (1 sprint extra para consumer migration audit). RF-C6 adiciona TODO marker.
- **Server-side HTML sanitizer (DOMPurify)** — convenção caller-side `escapeHtml` + branded type `SafeHtml` (RF-C9) fica.
- **`listUsersForCron` cursor pagination (RF-09 AI-3.1)** — DEFER permanente até Phase 2 (Cluster F).
- **`fxCascade` Redis multi-replica** — defer permanente.
- **Cleanup banners verbosos** — defer permanente, estética.
- **Mudança de prompts LLM** — todos estabilizados em AI-3.
- **Consolidação `weekly`/`monthly`/`quarterly`/`daily` enqueuers em 1** — manter 3 separados.
- **UI editor career_goals** — defer permanente.

---

## Dependências

- **ADR-176** (AI-3.1) — depende do `anthropicClient.ts` + `reportCost.ts` extracts já realizados.
- **ADR-174** (AI-3) — depende do `_renderReportShell.ts` + `shared/brTimezones.ts` + `listUsersForCron("subscription_plan IN ('trial','active','admin')")` paridade.
- **ADR-159** (AI-1C) — depende do `reportGeneratorShared.ts` + `hierarchicalSummarizer.ts` (RF-D7 toca summarizer).
- **Sem dependência de migration** — sprint puro código.

---

## ADRs a criar

- **ADR-203**: Sprint AI-3.2 — Cleanup wave 2 (Cluster A DRY + Cluster B generators lockstep + Cluster C polish + Cluster D perf + Cluster E test cov).
- Numeração: último ADR é **202** (`audio-logout-cleanup-contract` do MP3.2). Próximo livre = **203**.

---

## Diagramas a criar

Localização: `Docs/architecture/diagrams/coach-ai-3-2/`

1. **`generators-lockstep-final.mermaid`** — sequence final dos 5/5 generators consumindo `callReportLlm` único (paridade total — fecha consolidação AI-3.1).
2. **`abortsignal-timeout-flow.mermaid`** — flow `callReportLlm` com `AbortSignal.timeout(60_000)` cap + retry interno + degradedReason `llm_timeout` vs `llm_failed_3x` distinção.
3. **`promise-allsettled-gather-monthly.mermaid`** — gather monthly Wave 1 `Promise.allSettled` (paridade quarterly Wave 1 AI-3).

---

## Notas de Implementação

### Ordem sugerida (mantém ordem do backlog dormente)

1. **Cluster A (DRY)** — desbloqueia mocks compatíveis para Cluster B + helpers compartilhados para Cluster D.
2. **Cluster E (test cov)** — protege regressão do `countGrindSessions` antes de Cluster D mexer no método.
3. **Cluster B (generators migration)** — fecha 5/5 lockstep. Foco no audit de mocks pré-implementer (lesson #3).
4. **Cluster D (perf + observability)** — RF-D6 (AbortSignal) + RF-D7 (JSON sem pretty) prioritários (P0).
5. **Cluster C (polish)** — last, baixo risco.
6. **Cluster F (DEFER)** — reconfirmar `.skip` + CLAUDE.md note.

### Lessons learned aplicáveis

- **#3 (mock shape real):** RF-B1 + RF-B2 audit prévio obrigatório dos mocks Anthropic em `tests/coach/*Generator.test.ts` antes do implementer.
- **#5/#35 (`new Anthropic` ctor try/catch + factory fallback):** preservado em `callReportLlm` (já em AI-3.1).
- **#9 (log antes do fallback):** todos os novos catch handlers devem logar antes de fallback (RF-A4 + RF-C7 + RF-D6 + RF-E1).
- **#10 (DRY prompt cache):** RF-B1 + RF-B2 preservam STATIC prompt cache `ephemeral` (não mover prompts).
- **#11 (default mínimo):** RF-A1 `coerceFiniteNumber` retorna fallback explícito (não throw).
- **#34 (`injectedStorage`):** RF-A5 + RF-E1 preservam pattern.
- **#36 (lazy schema import):** RF-D3 audit shape `aiStructuredProfile` de `getUserProfile` vs standalone — lazy import preservado se shape divergir.
- **#38 (test modificado com justificativa):** RF-B1/RF-B2 migram mocks de `@anthropic-ai/sdk` para `@/server/coach/anthropicClient` — documentar cada teste alterado no resumo do implementer.

### Risk register

| Risco | Likelihood | Impact | Mitigação |
|---|---|---|---|
| Mocks Anthropic em tests legados quebram após RF-B1/RF-B2 | M | M | Audit prévio obrigatório (test-writer phase); fixtures shared `tests/fixtures/anthropicClientMocks.ts` |
| RF-A5 `resolveStorage` quebra por path resolution | M | L | DEFER-friendly (test-writer audita; marca AI-3.3 se inviável) |
| RF-D6 `AbortSignal` mata jobs legítimos em users com bundles enormes | L | M | Cap configurável via env; default 60s é conservador (>3× p95 esperado) |
| RF-D9 gate Free quebra Trial user (interseção `isReportEligible` ambígua) | L | H | Unit test cobre cada tier; reusar `isReportEligible` canônico AI-1C |
| Alias `byCurrency.profit` vira débito permanente | M | L | TODO grepável (RF-C6) + entrada CLAUDE.md §Pendências |

---

## Verificação Final

- [x] Cada requisito tem critérios de aceitação verificáveis.
- [x] Cenários de teste cobrem happy path, validação de input, regras de negócio, edge cases.
- [x] Seção "Fora de Escopo" preenchida (RF-09 lockado, sanitizer DOMPurify, banners verbosos, etc).
- [x] Sem ambiguidade — cada regra tem interpretação única.
- [x] Endpoints listados (nenhum — interno).
- [x] Modelos de dados afetados documentados (só TS types, sem migration).
- [x] ADRs a criar numerados (203).
- [x] Diagramas a criar listados em `Docs/architecture/diagrams/coach-ai-3-2/`.

---

## Tier list ICE — Priorização recomendada

Ordenado por ICE score decrescente. Founder pode cortar do bottom se sprint cap for menor que 19h.

| Rank | RF | Cluster | Effort | ICE | Crítico? |
|---|---|---|---|---|---|
| 1 | RF-A1 `numCoerce` | A DRY | S | 100 | Sim — desbloqueia outros |
| 2 | RF-A2 `isValidConfidence` | A DRY | S | 100 | Sim — desbloqueia C8 |
| 3 | RF-A4 `isRetryableError` | A DRY | S | 100 | Sim — desbloqueia uso futuro |
| 4 | RF-B3 weekly cost inline | B lockstep | S | 100 | Sim — paridade |
| 5 | RF-D3 dedup aiStructuredProfile | D perf | S | 100 | Sim — 2 DB hits redundantes/run |
| 6 | RF-D7 summarizer pretty-print drop | D perf | S | 100 | Sim — ~30% economia Haiku |
| 7 | RF-B1 weeklyReportGenerator migrate | B lockstep | M | 80 | Sim — fecha 4/5 |
| 8 | RF-B2 recommendLesson migrate | B lockstep | M | 80 | Sim — fecha 5/5 |
| 9 | RF-E1 countGrindSessions test | E test cov | M | 80 | Sim — reviewer MEDIUM |
| 10 | RF-A3 stripTags promote | A DRY | S | 75 | Não — quality |
| 11 | RF-A6 previousMonthRange | A DRY | S | 75 | Não — quality |
| 12 | RF-C4 ratecard MODEL_TO_RATECARD | C polish | S | 75 | Não — drift prevention |
| 13 | RF-D2 dynamic imports top-level | D perf | S | 75 | Não — micro-opt |
| 14 | RF-D4 daily sessions range filter | D perf | S | 75 | Não — micro-opt |
| 15 | RF-D5 Promise.all paralelo | D perf | S | 75 | Não — micro-opt |
| 16 | RF-D10 monthly allSettled | D perf | S | 75 | Não — paridade |
| 17 | RF-D11 countGrindSessions null-date | D perf | S | 75 | Não — opcional |
| 18 | RF-D6 AbortSignal cap | D perf | M | 64 | **Recomendado** — observability + worst-case cap |
| 19 | RF-C1 tone/level dedup | C polish | S | 60 | Não — quality |
| 20 | RF-C7 getAveragePtaxSafe extract | C polish | M | 60 | Não — DRY |
| 21 | RF-C2 cgame persist flatten | C polish | S | 50 | Não — quality |
| 22 | RF-C3 comment rot sweep | C polish | S | 50 | Não — hygiene |
| 23 | RF-C6 IrpfByCurrencyRow extract | C polish | S | 50 | Sim — RF-C6 prepara AI-3.3 alias drop |
| 24 | RF-C8 isValidConfidence type-guard | C polish | S | 50 | Não — quality (depende A2) |
| 25 | RF-C10 wrappers preservam rawText | C polish | S | 50 | Não — observability |
| 26 | RF-D9 aggregateCgameForPeriod free gate | D perf | S | 50 | Não — defense-in-depth |
| 27 | RF-A5 resolveStorage extract | A DRY | M | 48 | **Condicional** — DEFER se inviável |
| 28 | RF-D1 sessionsDetail fallback drop | D perf | M | 48 | Não — limpeza |
| 29 | RF-C9 SafeHtml branded type | C polish | M | 32 | Não — hardening |
| 30 | RF-C5 cgamePersistPromise inline | C polish | S | 25 | Não — micro |
| 31 | RF-D8 quarterly ANTHROPIC_API_KEY guard | D perf | S | 25 | Não — micro |
| 32 | RF-F1 RF-09 DEFER | F | — | 9 | DEFER permanente |

### Sprint cap scenarios

- **Cap 8h (mínimo viável):** RFs 1-9 (Clusters A core + B core + E). Entrega: 5/5 generators lockstep + dedup + countGrindSessions test cov. **~8h.**
- **Cap 12h (recomendado):** RFs 1-18 + RF-C6 (alias prep). Entrega: tudo acima + dynamic imports + paralelização + AbortSignal cap. **~12h.**
- **Cap 19h (escopo completo proposto):** RFs 1-31 (todos exceto F). Entrega: backlog dormente fechado completo + RF-A5 condicional. **~17-19h.**
- **Cap > 24h:** considerar incluir RF-09 (sair de DEFER) — mas requer race condition design + testes concorrência complexos.

**Recomendação founder:** **cap 12h** — bom tradeoff cleanup completo + ROI alto + sem touch nas peças mais arriscadas (RF-A5 condicional + RF-C9 branded type — defer AI-3.3 se sprint tight).
