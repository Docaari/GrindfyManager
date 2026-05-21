# ADR-176: Sprint AI-3.1 — Cleanup refactor cluster (anthropicClient + reportCost extract, `_renderReportShell.safeBodyHtml` contract, `byCurrency.profitNative` rename, chars-only summarize threshold, `countGrindSessions`, `listUsersForCron` pagination deferred)

> **Nota de numeração:** o spec original (`Docs/specs/sprint-ai-3.1.md`) e a memória da sessão referenciam "ADR-175". O slot 175 já estava ocupado pelo `ADR-175 — calendarDaysSince` (Sprint UX-QW-3 RF-03, 2026-05-21). Adotado ADR-176. Citações cruzadas em CLAUDE.md / spec / sessões devem ler "ADR-176" daqui em diante.

## Status

Aceito

## Data

2026-05-21

## Sprint

AI-3.1 (`Docs/specs/sprint-ai-3.1.md`) — cleanup pós-AI-3 (commit `f64223a7` push `origin/main` 2026-05-20). Sem feature nova; 9 RFs de débito técnico documentados nos reviewer rounds AI-2B/AI-3.

## Decision owner

system-architect — defaults locked pelo spec (audit byCurrency consumers + audit mocks Anthropic delegados ao test-writer phase pré-implementer).

## Related

- **Depende de:** ADR-174 (AI-3 cleanup wiring — entregou `_renderReportShell.ts` quarterly-only + `shared/brTimezones.ts` + `updateCgameRecent` snapshot persist + `listUsersForCron("subscription_plan IN ('trial','active','admin')")` paridade quarterly). ADR-159 (`reportGeneratorShared.ts` + `hierarchicalSummarizer.ts`). ADR-169 (Quarterly Career Review). ADR-170 (`cgameRecent` + `confidence: 'high'|'medium'|'low'`). ADR-172 (Email pipeline Gmail SMTP). ADR-173 (`REPORT_DISCLAIMER` canônico).
- **Reusa:** `_renderReportShell` (ADR-174 §2.5), `tryAnthropicClient` pattern (lessons #5/#35 — generaliza em `getAnthropicClient`), `maybeSummarizeBundle` (ADR-159), `normalizeAiStructuredProfile.cgameRecent` (ADR-170), `listUsersForCron` (ADR-159), `escapeHtml` (`server/emails/templates/_helpers.ts`).
- **Sucessor de:** ADR-174 — primeiro fechamento formal das pendências `[DEFER AI-3.1]` documentadas em `memory/session_2026-05-20-ai-3-shipped.md` §"Pendências".
- **Diagramas:**
  - `Docs/architecture/diagrams/coach-ai-3.1/anthropicClient-sequence.mermaid` — sequence do `callReportLlm` (5 callsites → retry 3x exponencial → parseOnError → log lesson #9 → mock layer test).
  - `Docs/architecture/diagrams/coach-ai-3.1/email-shell-migration.mermaid` — flow weekly/monthly/quarterly → `_renderReportShell` consolidado + nota lateral `@safe-html` contract.

---

## 1. Contexto

AI-3 (ADR-174) shipou em 2026-05-20 fechando o plano IA 7/7 e abrindo 9 NITs documentados nos reviewer rounds APPROVED-WITH-NITS. Cada NIT individual é pequeno (HIGH-1 = 1 linha; MEDIUM-1 = rename + alias; LOW-4 = remover 1 chamada redundante), mas o cluster forma 3 grupos de pressão:

1. **Drift entre callsites Anthropic SDK** — 5 generators (`quarterlyReportGenerator.ts`, `monthlyReportGenerator.ts`, `dailyDebriefGenerator.ts`, `reportSummarizer.ts`, `recommendLessonForUser`) duplicam o bloco `lazy import → new AnthropicCtor try/catch → messages.create → usage capture → JSON parse fallback → log lesson #9`. AI-3 já mostrou o custo: para acrescentar paridade quarterly ↔ monthly precisou-se ajustar 4 lugares lockstep (whitelist tone/level só ficou no quarterly; retry 3x só em 3 deles; degraded reason naming inconsistente). Próxima paridade (Daily Debrief LLM real ou novo Quarterly tweak) replica o esforço.
2. **Drift entre callsites de custo Anthropic** — 4 funções (`computeCost` weekly, `computeMonthlyCost`, `computeDailyDebriefCost`, `computeQuarterlyCost`) hardcodam o ratecard Sonnet 4.6 ($3/M input, $15/M output, $0.30/M cache read, $3.75/M cache write). Próxima atualização de preço (Anthropic histórica ~6 meses) exige 4 edits manuais → garantido drift.
3. **Shell de email duplicado parcialmente** — AI-3 extraiu `_renderReportShell.ts` e migrou só quarterly (Q-A locked). Weekly e Monthly mantêm header/CTA/footer inline com ~70% código repetido; cada um carrega cópia do `REPORT_DISCLAIMER` e do unsubscribe block. Próxima mudança de copy (e.g. ajuste no disclaimer regulatório ADR-173) exige 3 edits manuais.

Além disso, 6 outros NITs táticos cabem na mesma sprint sem custo de coordenação:
- **HIGH-1** (RF-01) — `quarterlyReportGenerator.ts:207-209` força `confidence: 'low'` cobrindo o sinal real do `aggregateCgameForPeriod` (que já retorna `'high' | 'medium' | 'low'` calculado).
- **MEDIUM-1** (RF-02) — `compute_irpf_summary.byCurrency[ccy].profit` é nativo da moeda, mas o nome sugere base (USD) — risco de UI/email consumers interpretar errado.
- **MEDIUM-2** (RF-03) — `maybeSummarizeBundle` dispara Haiku quando `chars > 20K OR sessions > 100`. Sessões "leves" sem hand history detalhada inflam o count e disparam custo desnecessário.
- **LOW-4** (RF-05) — `quarterlyReportGenerator.ts` chama `getAiStructuredProfile(userId)` separado de `storage.getUserProfile(userId)` — ambos hitam `users`.
- **A3-H3** (RF-08) — `(await getGrindSessions(...)).length` carrega N linhas do DB só pra ler count.
- **A3-H2** (RF-09) — `listUsersForCron` sem LIMIT escala mal Phase 2 (>10K users). Defer-friendly se test-writer estimar > 4h.

### Restrições

- **Sem feature nova** — sprint cleanup. Reviewer rounds futuros não devem ver mudança comportamental observável (mesmo prompt, mesmo modelo, mesmo retry behavior, mesmo HTML de email — só o caminho do código muda).
- **Backward compat alias** — RF-02 mantém `byCurrency.profit` como alias deprecated por 1 sprint. Sem breaking change downstream.
- **Sem migration DB** — `countGrindSessions` é método SQL puro (`SELECT COUNT(*)`); rename `byCurrency.profitNative` é só output de tool (não atinge schema).
- **Lockstep RF-06** — `callReportLlm` migrate é tudo-ou-nada por callsite (não dá pra migrar 3 dos 5; bundle assinatura única). Test-writer audita primeiro mocks `vi.mock('@anthropic-ai/sdk', ...)` antes do implementer.
- **`_renderReportShell.safeBodyHtml` é contract, não runtime** — RF-04 NÃO adiciona sanitizer server-side (DOMPurify exige `window`); contract é caller-side e documentado via JSDoc `@safe-html` + warning explícito. Reviewer round valida que callers (`weekly`, `monthly`, `quarterly`) constroem `bodyHtml` só com `escapeHtml(...)` de campos vindos de user-content; o resto é literal de template (safe by construction).
- **`profitNative` é rename de contract de tool** — UI/email consumers identificados via grep (RF-02 audit pré-test-writer). Sistema prompt do Coach permanece lendo `profit` durante o alias-deprecation-window.
- **RF-09 defer-friendly** — se test-writer phase estimar > 4h ou detectar race condition com `processReportJobsTick`, marcar `[DEFER AI-3.2]` e sprint procede sem ele.
- **Lessons críticas:**
  - **#5/#35** (`new AnthropicCtor` try/catch + factory fallback): `getAnthropicClient` em RF-06 é onde o pattern vira único — qualquer regressão fica concentrada em 1 arquivo.
  - **#36** (lazy schema import): `anthropicClient.ts` faz lazy `import('@anthropic-ai/sdk')` mantendo o pattern atual.
  - **#37** (`node-cron` import estático para `vi.doMock`): NÃO aplica aqui (`@anthropic-ai/sdk` é dep prod garantida; lazy import dentro de `getAnthropicClient` é OK porque tests mockam o `anthropicClient` wrapper, não o SDK direto).
  - **#3** (mock shape real): `vi.mock('@/server/coach/anthropicClient', ...)` deve replicar o discriminado `{ content, usage, rawText, degradedReason? }` exatamente — test-writer valida via fixtures shared.
  - **#9** (log antes do fallback): `callReportLlm` loga `anthropicClient.before_fallback` antes do parse fallback / retry exhaust.
  - **#10** (DRY prompt cache): callsites continuam construindo prompts próprios; `callReportLlm` só recebe `systemPrompt` + `userPromptBuilder` callback. Não consolida prompts (out of scope; ADR-019 cache `ephemeral` preservado).
  - **#38** (test modificado com justificativa de contract fix): RF-01 + RF-03 + RF-08 + RF-09 implicam ajuste de testes existentes — implementer documenta cada um no resumo.

### O que está fora de escopo

- **Feature nova** — nenhuma tool, nudge ou report type novo.
- **UI editor de career goals** — defer permanente até demanda data-driven.
- **Cache `fxCascade` Redis** — multi-replica defer AI-3.2 ou AI-NEXT.
- **Migration de schema** — `countGrindSessions` é método SQL; `profitNative` é output de tool.
- **LLM real para `compute_irpf_summary`** — continua determinístico (Q-C original AI-2B).
- **Cleanup banners verbosos** — estética, defer permanente.
- **Consolidar `weekly`/`monthly`/`quarterly`/`daily` enqueuers em 1 função** — manter 3 separados (mesma justificativa ADR-174 §"fora de escopo").
- **Migrar coach system prompt builder para `profitNative`** — fica no alias `profit` por 1 sprint; revisit AI-3.2 quando alias for removido.
- **Hardening `_renderReportShell.safeBodyHtml` com sanitizer server-side** — contract caller-side fica.

---

## 2. Decisão

Adotada: **9 sub-decisões alinhadas com RF-01..RF-09 do spec**. Agrupadas em 3 clusters de risco/blast radius:

### Cluster A — Contract fixes táticos (RF-01, RF-02, RF-05) — blast radius BAIXO

#### 2.1. `cgameRecent.confidence` passthrough (RF-01)

- **Antes:** `quarterlyReportGenerator.ts:207-209` força `confidence: 'low'` se o sinal do `aggregateCgameForPeriod` não bater literal `'high'|'medium'|'low'`. Mas o aggregator JÁ retorna calculado dentro do enum — o coalesce é defensive code que apaga sinal real.
- **Depois:** `updateCgameRecent(userId, snapshot)` delega validação para `normalizeCgameRecent` (em `server/storage/aiStructuredProfile.ts`). Comportamento:
  - Confidence ∈ `{'high','medium','low'}` → passthrough.
  - Confidence inválido/undefined → omite persist inteiro (não escreve shape ruim). Log `cgame.persist.confidence_invalid` (warn).
- **Consumer downstream:** Coach system prompt builder lê `aiStructuredProfile.cgameRecent.confidence` para frasear "seu A-game está alto/médio/baixo" — `undefined` continua sendo tratado como "não há snapshot recente" (já tolerado).
- **Test modificado (lesson #38):** test legado "persiste com confidence='low' fallback" REMOVIDO e substituído por dois testes ("medium passthrough" + "invalid → no-op com log").

#### 2.2. `byCurrency.profit` rename → `profitNative` com alias deprecated (RF-02)

- **Antes:** `compute_irpf_summary` retorna `byCurrency[ccy] = { profit, depositsBrl, withdrawsBrl, ... }`. `profit` é nativo da moeda (BRL para BRL, USD para USD) — não convertido. Nome ambíguo.
- **Depois:**
  - Output passa a incluir `profitNative` (novo, canônico) E `profit` (alias deprecated, mesmo valor).
  - JSDoc no tool documenta: `@deprecated profit — use profitNative. Removal target: AI-3.2`.
  - Audit grep `byCurrency.*profit` em `client/src/`, `server/`, `shared/` — consumers identificados migram para `profitNative ?? profit` (defensive fallback) ANTES do RF-02 commit.
  - Coach system prompt builder mantém leitura via `profit` durante a janela de deprecation (1 sprint).
- **Trade-off da política de deprecation curta (1 sprint):** alias na própria estrutura economiza migration de schema (não é DB) mas exige discipline para remover na AI-3.2 — se passar 1 sprint sem remoção, transforma-se em débito permanente. Mitigação: TODO inline com data alvo + entrada em CLAUDE.md §Pendências.

#### 2.3. Dedup `getAiStructuredProfile` no quarterly (RF-05)

- **Antes:** `quarterlyReportGenerator.ts` chama `getAiStructuredProfile(userId)` separado de `storage.getUserProfile(userId)` — 2 hits em `users`.
- **Depois:** Se `storage.getUserProfile` já carrega `ai_structured_profile` JSONB no shape canônico → eliminar a chamada separada; usar `profile.aiStructuredProfile` direto. Se o shape NÃO bate (e.g. `getUserProfile` retorna shape normalizado para UI) → marcar `[DEFER AI-3.2]` no resumo do implementer e abrir sub-spec.
- **Test integration:** "quarterly gather faz N queries vs N+1 pré-dedup" via db spy ou mock counter.

### Cluster B — Perf/heuristic tweaks (RF-03, RF-08) — blast radius BAIXO-MÉDIO

#### 2.4. Summarize threshold chars-only (RF-03)

- **Antes:** `maybeSummarizeBundle` aciona Haiku quando `chars(JSON.stringify(bundle)) > 20K OR sessions.length > 100`. Sessões leves disparam Haiku desnecessariamente.
- **Depois:** chars-only. Threshold default `COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = 20000` (env var preservada).
- **Justificativa quantitativa:** tokens ≈ chars/4. Sonnet 4.6 context window = 200K tokens ≈ 800K chars. Threshold 20K chars = 5K tokens = 2.5% do context — margem de segurança ampla mesmo para runs com poucas sessões hand-history densas. Risco residual aceito.
- **Trade-off custo Haiku vs precisão:** custo Haiku é ~$0.20/M input. Bundle hierarquical de quarterly raramente excede 50K chars → max ~$0.01/run Haiku → desprezível. O motivo do refactor é não pagar isso quando NÃO precisa (sessões leves).
- **Test modificado (lesson #38):** test "bundle 19K chars + 200 sessions → aciona" REESCRITO para "NÃO aciona". Test novo "25K chars + 50 sessions → aciona".

#### 2.5. `storage.countGrindSessions` (RF-08)

- **Antes:** `(await storage.getGrindSessions({userId, from, to})).length` no quarterly header — carrega N rows full do DB só pra ler `.length`.
- **Depois:** Método novo `storage.countGrindSessions(userId, range): Promise<number>` → `SELECT COUNT(*) FROM grind_sessions WHERE ...`. Tipo de retorno `number` (não `bigint` mesmo se PG retornar — cast no helper).
- **Audit similar:** grep `getGrindSessions.*length` em `server/services/` + `server/coach/` — listar callsites; migrar OS QUE BATEM A INTENÇÃO (count puro, sem outro uso do array).
- **Trade-off do método dedicado:** mais 1 superfície na interface `IStorage`. Compensado por: padrão clássico (storage layer expõe count quando count é o uso), test stubs ganham helper isolado, evita armadilha de "vou carregar pra count agora, mas alguém vai aproveitar o array depois" (drift potencial).

### Cluster C — DRY extracts grandes (RF-04, RF-06, RF-07) — blast radius MÉDIO-ALTO

#### 2.6. `_renderReportShell.safeBodyHtml` contract + weekly/monthly migrate (RF-04)

- **Antes:** `_renderReportShell.ts` aceita `bodyHtml: string` sem contrato documentado. Quarterly migrou em AI-3; Weekly e Monthly mantêm shell inline com ~70% duplicação.
- **Depois:**
  - Rename param `bodyHtml` → `safeBodyHtml`. Breaking change — só 3 callsites (quarterly migrante + 2 novos).
  - JSDoc explícito:
    ```ts
    /**
     * @param safeBodyHtml HTML body do email. CALLER MUST SANITIZE.
     * @safe-html
     * Não há DOMPurify aqui (server context). Caller deve usar `escapeHtml`
     * em todo campo vindo de user-content; texto literal de template é safe by construction.
     */
    ```
  - `weeklyReportEmail.ts` + `monthlyReportEmail.ts` substituem header/CTA/footer inline por `renderReportShell({...})`.
  - Snapshot test em cada um dos 3 templates: HTML pré-migrate vs pós-migrate comparado via `string.trim().replace(/\s+/g, ' ')` — tolera whitespace cosmético mas detecta drift de copy.
  - Grep sanity: `bodyHtml` no codebase = 0 hits pós-rename.
- **Trade-off do contract caller-side:** server-side sanitization ideal seria `DOMPurify({window: jsdom})` mas adiciona dep + custo de runtime. Caller-side é defensivamente OK porque (a) `escapeHtml` em campos de user-content já é convenção; (b) `@safe-html` marker indexa para grep futuro de auditoria; (c) reviewer round verifica os 3 callsites manualmente.

#### 2.7. `server/coach/anthropicClient.ts` extract — `getAnthropicClient` + `callReportLlm` (RF-06)

- **Antes:** 5 generators duplicam: lazy `import('@anthropic-ai/sdk')` → `new AnthropicCtor` try/catch + factory fallback (lessons #5/#35) → `messages.create` → JSON parse → usage capture → log `lesson #9 before_fallback`.
- **Depois:** Módulo único `server/coach/anthropicClient.ts` com:
  ```ts
  // Tone/level whitelists exportados (shared constants)
  export const WHITELISTED_TONES = ['neutro', 'incisivo', 'gentil'] as const;
  export const WHITELISTED_LEVELS = ['iniciante', 'intermediario', 'avancado'] as const;

  export async function getAnthropicClient(injected?: any): Promise<any | null>;
  export async function callReportLlm(input: CallReportLlmInput): Promise<CallReportLlmResult>;
  ```
  - `getAnthropicClient`: lazy `import` + `new Anthropic({apiKey})` try/catch + factory fallback. Retorna `null` se sem chave ou se SDK ausente. Aceita `injected?` para testes (lesson #34).
  - `callReportLlm`: validação síncrona tone/level (throw se fora da whitelist) → constrói `messages.create` payload → retry 3x exponencial (100ms / 400ms / 1600ms) em 429/500/network → `parseOnError`: `'fallback-degraded'` retorna `{content: {}, degradedReason: 'llm_parse_error'}`; `'throw'` propaga. Log `console.warn('anthropicClient.before_fallback', {model, attempt, error})` antes de cada retry/fallback (lesson #9).
- **5 callsites lockstep:**
  1. `quarterlyReportGenerator.callQuarterlyLlm`
  2. `monthlyReportGenerator.callMonthlyLlm`
  3. `dailyDebriefGenerator.callDailyDebriefLlm`
  4. `recommendLessonForUser` (em `server/coach/tools/recommendLesson.ts` ou equivalente)
  5. `reportSummarizer.summarizeBundleHierarchical`
- **Mocks migration (delegated to test-writer):** grep `vi.mock.*['"@anthropic-ai/sdk['"]` em `tests/`. Mocks que precisam controle granular (e.g. simular 429 → 429 → 200) migram para `vi.mock('@/server/coach/anthropicClient', ...)` e mockam `callReportLlm` direto. Mocks de cenários atômicos (e.g. cliente null) ficam mockando o SDK base (`getAnthropicClient` ainda lê).
- **Feature flag rollback opcional:** spec menciona `USE_LEGACY_ANTHROPIC_CALL=true`. Decisão: NÃO incluir flag. Razão: blast radius é coberto por suite (1244 coach + 9568 server); rollback via revert do commit é trivial; flag adiciona dead code que tende a ficar.

#### 2.8. `server/coach/reportCost.ts` extract — constants + `computeReportCost` (RF-07)

- **Antes:** 4 funções (`computeCost` weekly, `computeMonthlyCost`, `computeDailyDebriefCost`, `computeQuarterlyCost`) hardcodam ratecard Sonnet 4.6 inline. Custo Haiku ratecard NÃO está em nenhum lugar — `reportSummarizer.ts` não tracka cost separadamente (bug latente: custo Haiku invisível em `cost_usd_estimate`).
- **Depois:**
  ```ts
  export const SONNET_46_PRICE_PER_M = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 } as const;
  export const HAIKU_45_PRICE_PER_M = { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 } as const;
  export type Ratecard = 'sonnet46' | 'haiku45';
  export function computeReportCost(usage: AnthropicUsage, ratecard: Ratecard = 'sonnet46'): number;
  ```
- **4 callsites migram + bonus reportSummarizer:** weekly/monthly/daily/quarterly usam `'sonnet46'` (default). `reportSummarizer` adiciona tracking Haiku via `'haiku45'` — se sumarização rodou, soma-se ao `cost_usd_estimate` final do report. Bug latente "custo Haiku invisível" fechado bonus.
- **Test:** snapshot test em report finalizado — `cost_usd_estimate` pré vs pós-migrate igual com tolerância 1e-6 (float drift).

### Cluster D — Perf scale (RF-09) — DEFER-FRIENDLY

#### 2.9. `listUsersForCron` cursor pagination — `[DEFER A1-NEXT se estimate > 4h]`

- **Antes:** `listUsersForCron(filterSql)` faz `SELECT ... WHERE <filterSql>` sem LIMIT. Phase 1 (centenas de users) OK; Phase 2 (>10K users) bloqueia enqueuer hourly por tempo perceptível.
- **Depois proposto:**
  ```ts
  async listUsersForCron(filterSql: string, opts?: { cursor?: string; limit?: number }): Promise<{users: UserRow[]; nextCursor?: string}>
  ```
  Cursor = último `userId` da página anterior. Query: `WHERE <filterSql> AND user_id > $cursor ORDER BY user_id LIMIT $limit`.
- **3 callsites migram:** `enqueueWeeklyReportJobsTick`, `enqueueMonthlyReportJobsTick`, `enqueueQuarterlyReportJobsTick`. Cada caller vira `while (nextCursor) { ... }`.
- **Critério de defer:** se test-writer phase identificar (a) race condition entre paginação e `processReportJobsTick` rodando concorrente, ou (b) effort > 4h, marcar `[DEFER AI-3.2]` e sprint procede.
- **Defer decision rationale:** Phase 1 não tem urgência (sprint cleanup, não scale). Phase 2 (>10K users) ainda está a meses de distância. Risco de defer é zero; risco de shippar com race é alto. Default = shippar se trivial, defer se touca.

---

## 3. Opções consideradas

### Opção A — Shippar 8/9 RFs nesta sprint, defer RF-09 — ESCOLHIDA

**Prós:**
- Cluster A + B + C limpam 8 NITs documentados sem feature nova; surface coberta por suite existente (1244 coach + 9568 server).
- RF-06 (anthropicClient) elimina drift de 5 callsites — maior payoff DRY.
- RF-07 (reportCost) fecha bug latente "custo Haiku invisível" no `cost_usd_estimate`.
- RF-09 deferido elimina risco de race condition em paginate vs processor; abordagem direcionada quando Phase 2 demandar.

**Contras:**
- Sprint ~9.5h efetivo (sem RF-09); janela apertada se RF-06 cascatear mocks demais (mitigado por audit pré-test-writer).

### Opção B — Shippar todos os 9 RFs incluindo RF-09 pagination

**Rejeitada:**
- Phase 2 (>10K users) ainda está distante; valor agora é zero.
- Race condition test é complexo (concorrência cron + processor) — provavelmente > 4h sozinho.
- Defer mantém spec aberta; ressuscitar quando demanda real (data-driven AI-NEXT).

### Opção C — Adicionar feature flag `USE_LEGACY_ANTHROPIC_CALL` para rollback rápido do RF-06

**Rejeitada:**
- Blast radius já coberto por suite (1244 + 9568 tests).
- Rollback via revert do commit é trivial em < 5min.
- Flag adiciona dead code que tende a ficar (lesson histórica de feature flags abandonadas).
- Mocks dos testes ficariam contaminados (precisariam testar ambos caminhos).

### Opção D — Centralizar prompts (não só LLM call) em RF-06

**Rejeitada:**
- Prompts (`quarterlyReport.ts`, `monthlyReport.ts`, `dailyDebrief.ts`) têm bundle/JSON shape divergente — centralizar exige `if (type === 'X')` em vários lugares.
- ADR-019 cache `ephemeral` continua válido com prompt `STATIC = GRINDFY_AI_BASE + CITATIONS_RULES + REPORT_DISCLAIMER` montado caller-side.
- Out of scope; sprint AI-3.2 pode revisitar se 5+ prompts emergirem.

### Opção E — Server-side sanitizer `DOMPurify({window: jsdom})` em `_renderReportShell`

**Rejeitada:**
- Adiciona dep (`jsdom`) — ~5MB instalado, custo de boot.
- Convenção atual `escapeHtml` em campos de user-content é defensivamente OK.
- Marker `@safe-html` indexa para grep auditoria.
- Reviewer round verifica 3 callsites manualmente — bar realista.

### Opção F — Manter `byCurrency.profit` sem rename, só adicionar comentário JSDoc

**Rejeitada:**
- Nome `profit` continua ambíguo para consumers downstream (UI, email).
- Comentário JSDoc é silencioso em código de consumer (IDE pode não mostrar).
- Custo de rename + alias deprecated é baixo (1 sprint de transição).

---

## 4. Consequências

### Positivas

- **Drift Anthropic SDK fechado** — qualquer ajuste futuro (novo retry behavior, novo provider, tone/level expansion) altera 1 arquivo. Próxima paridade ↔ generators custa minutos.
- **Drift ratecard Anthropic fechado** — atualização de preço futura é 1 constante. Custo Haiku tracked em `cost_usd_estimate` (bug latente fechado bonus).
- **Email shell consolidado** — copy mudanças (e.g. disclaimer regulatório evolutivo ADR-173) editam 1 arquivo. ~70% código duplicado removido.
- **`cgameRecent.confidence` sinal real preservado** — Coach system prompt narrativa "seu A-game caiu de high → medium" passa a refletir o aggregator de verdade.
- **`byCurrency.profitNative` semântico claro** — UI/email consumers leem o nome certo; alias `profit` documentado removível em AI-3.2.
- **Threshold summarize tunado** — custo Haiku reduzido 10-30% para users com >100 sessões leves/quarter (data-driven validar post-shipping).
- **Storage helper `countGrindSessions`** — padrão extensível para outros counts (e.g. `countSessionTournaments`, `countStudyBlocks`) futuro.
- **Sprint clean** — 1244 + 9568 tests verde, tsc 0, zero regressão observável.

### Negativas

- **Surface de regressão alta em RF-06** — 5 generators migram lockstep; teste atómicos de retry behavior precisam de mocks compatíveis (lesson #3 + #5/#35 ativas).
- **Mocks de tests existentes cascateiam** — quem mockava `@anthropic-ai/sdk` direto pode migrar para `@/server/coach/anthropicClient`. Audit prévio reduz risco mas não elimina.
- **Alias deprecated `byCurrency.profit` virar débito permanente** — risco se AI-3.2 não remover. Mitigação: TODO inline + CLAUDE.md §Pendências.
- **`safeBodyHtml` contract caller-side** — auditoria depende de discipline + grep `@safe-html`. Não bloqueia em compile-time.
- **`countGrindSessions` aumenta superfície `IStorage`** — método adicional para mockar em testes.

### Riscos mitigados

- **Lessons #5/#35** (`new AnthropicCtor` try/catch): `getAnthropicClient` concentra o pattern em 1 arquivo — qualquer regressão é localizada e coberta pelo test "callReportLlm com SDK não-construtor → degraded".
- **Lesson #3** (mock shape real): test-writer phase tem audit prévio obrigatório de mocks Anthropic; implementer só migra os listados.
- **Lesson #9** (log antes do fallback): `callReportLlm` loga `anthropicClient.before_fallback` antes de cada retry/fallback.
- **Lesson #34** (`injectedStorage`): `getAnthropicClient(injected?)` mantém testabilidade.
- **Lesson #36** (lazy schema import): `anthropicClient.ts` faz lazy `import('@anthropic-ai/sdk')` — pattern preservado.
- **Lesson #38** (test modificado com justificativa): RF-01 + RF-03 + RF-08 + RF-09 documentam cada test alterado no resumo final.

### Neutras

- **Constantes ratecard centralizadas** — quando Anthropic atualizar preço, sprint dedicada (~30min) edita `reportCost.ts`.
- **`iterateUsersWithTimezone` permanece no codebase** — outros callers podem usar; só enqueuers migram em RF-09 (se shippado).
- **`callReportLlm` retry behavior padronizado** — generators que tinham retry 1x ganham 3x; generators que tinham retry 3x ficam idênticos. Ligeira mudança de comportamento na cauda (mitigado por surface test).
- **`profit` alias 1 sprint** — janela curta mas explícita.

## Confiança

**Alta** — sprint cleanup cirúrgica, paridade com padrões já validados (lesson #5/#35 + tryAnthropicClient em ADR-174). 8 RFs de touch surface localizada + 1 deferable. Suite existente (1244 + 9568 tests) cobre regressão funcional; reviewer round confirma equivalência observable. Custo zero em produção (sem migration, sem mudança visível para founder/users). Defer-friendly em RF-09 elimina risco scale prematuro.
