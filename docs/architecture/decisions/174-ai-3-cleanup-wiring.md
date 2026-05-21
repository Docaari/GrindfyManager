# ADR-174: Sprint AI-3 — Cleanup wiring pós-plano IA: Quarterly LLM real-call (paridade `monthlyReportGenerator`) + FX cascade real (deletar stubs `shared/fx/{bcb,frankfurter}Client.ts`, delegar para `server/services/fx/adapters/{bcbPtaxAdapter,frankfurterAdapter}`) + `cgameRecent` persistido em `users.ai_structured_profile` JSONB (sem `ALTER TABLE` — `schemaVersion`-style backward-compat via `normalizeAiStructuredProfile`) + `enqueueQuarterlyReportJobsTick` migrado de `iterateUsersWithTimezone` para `listUsersForCron("subscription_plan IN ('trial','active','admin')")` (paridade weekly/monthly AI-1B) + DRY refactors leves (`shared/brTimezones.ts` regex BR canônico + email shell helper `_renderReportShell.ts`; `resolveStorage` deliberadamente NÃO extraído — Q-B locked accept duplication) + perf via `Promise.all` no quarterly gather (2 waves) + `cgameAggregator.getInchwormSeries` (6 awaits → 1) — sprint encerra o plano IA 7/7 SHIPPED 2026-05-20.

## Status

Aceito

## Data

2026-05-20

## Sprint

AI-3 (`Docs/specs/sprint-ai-3.md` — RF-01 a RF-07; Q-A..Q-F locked 2026-05-20 founder accept defaults).

## Decision owner

system-architect (founder locked: Q-A = manter `shared/fxCascade.ts` em `shared/`; Q-B = aceitar duplicação `resolveStorage`, cancelar RF-05.2; Q-C = duplicar `callQuarterlyLlm`, consolidar no `/simplify`; Q-D = trigger `updateCgameRecent` só no quarterly; Q-E = aceitar custo $0.25/Q/user; Q-F = `getAveragePtaxForRange` não valida `from > to`, delega adapter).

## Related

- **Depende de:**
  - **ADR-159** (AI-1C — `report_jobs`/`reports` pipeline + `reportEligibility.ts` + `reportGeneratorShared.ts` helpers DRY + `hierarchicalSummarizer.ts` Haiku) — base do gerador.
  - **ADR-160** (`bulk_query_dimensions` — reusado pelo quarterly para Q-1/Q-2/Q-4 comparativos).
  - **ADR-161** (`ReportContent.followUp` — preservado pelo wiring novo).
  - **ADR-163** (`fxResolver` cascade — esta sprint religa os adapters de produção).
  - **ADR-168** (`career_goals` + tools `define_career_goal`/`evaluate_career_goal` — `careerGoalsProgress[*].narrative` populado pelo LLM nesta sprint).
  - **ADR-169** (Quarterly Career Review pipeline — esta sprint completa o stub `degradedReason='quarterly_llm_pending'`).
  - **ADR-170** (C-game/Inchworm heurística — `cgameAggregator.getInchwormSeries` ganha `Promise.all` aqui; `cgameRecent` snapshot persistido).
  - **ADR-172** (Email pipeline Gmail SMTP — shell helper extraído nesta sprint, sem mudança de comportamento).
  - **ADR-173** (Disclaimer regulatório — `REPORT_DISCLAIMER` preservado em todos os 3 templates pós-extração do shell).
  - **Sprint FX-1** (adapters `bcbPtaxAdapter` + `frankfurterAdapter` em produção desde 2026-05; usados pelo refresh do FX rates panel).
- **Reusa:** `tryAnthropicClient` (já em `quarterlyReportGenerator.ts:60-82`, lessons #5/#35), `computeMonthlyCost` (paridade para Sonnet 4.6 $3/1M input + $15/1M output), `maybeSummarizeBundle` (Haiku ADR-159), `_resetFxCascacheCacheForTests` (idempotência testes).
- **Sucessor de:** nada — primeiro cleanup formal pós-plano IA. Encerra dívida técnica documentada em `memory/session_2026-05-20-ai-2b-shipped.md` §"Pendências".
- **Diagramas:**
  - `Docs/architecture/diagrams/coach-ai-3/quarterly-llm-sequence.mermaid` (sequence — quarterly LLM real-call ponta-a-ponta).
  - `Docs/architecture/diagrams/coach-ai-3/fx-cascade-real-sequence.mermaid` (sequence — cascade BCB → Frankfurter → throw `no_fx_data`).

---

## 1. Contexto

Plano de IA 7/7 SHIPPED em 2026-05-20 (commit `3b543370`). AI-2B encerrou as features novas: `career_goals`, Quarterly Review opt-in Pro+, C-game/Inchworm heurística, Mental Hand History, email pipeline Gmail SMTP, IRPF summary BR-only via PTAX, disclaimer regulatório em 3 superfícies. Mas 6 pendências documentadas ficaram para esta sprint cleanup:

1. **`quarterlyReportGenerator` nunca chama LLM real** — linhas 265-273 sempre marcam `status='degraded' degradedReason='quarterly_llm_pending'`. Toda execução automática (1/jul/2026 será a primeira em prod) gera relatório só com conteúdo estruturado, sem narrativa Sonnet. Feature flagship do AI-2B (opt-in Pro+ + email best-effort) entrega ~50% do valor prometido.
2. **`shared/fxCascade.ts` lê stubs** (`shared/fx/bcbClient.ts` + `frankfurterClient.ts` retornam `[]`) — throw `no_fx_data` em 100% das chamadas em produção. `irpfSummary` (BR-only) sempre `degraded='fx_unavailable'`. Adapters de produção (`bcbPtaxAdapter` + `frankfurterAdapter` da Sprint FX-1) existem mas estão desconectados do quarterly path.
3. **C-game snapshot só vive em runtime** — `aggregateCgameForPeriod` retorna `CgameSnapshot` puro; nada é persistido. Coach chat não consegue referenciar histórico ("seu A-game caiu vs trimestre passado") sem refazer agregação cara.
4. **Quarterly enqueuer usa `iterateUsersWithTimezone` full-scan** — paridade quebrada com weekly/monthly enqueuer (AI-1B linha 184 já usa `listUsersForCron` com filtro SQL `subscription_plan IN ('trial','active','admin')`). Mais I/O, mais rows iteradas em vão.
5. **DRY débito acumulado** — regex BR (16 timezones América) inline em `quarterlyReportGenerator.ts:47-53`; padrão `resolveStorage` repetido em ~14 arquivos com paths relativos diferentes; shell HTML dos 3 templates de email (~70% duplicação).
6. **Perf seriais** — quarterly gather faz 6-8 awaits seriais (profile, perf, cgame, mental hands, career goals, irpf, sessions) sem dependências reais (exceto irpf que depende de `isBrUser(profile)`); `cgameAggregator.getInchwormSeries` faz 6 awaits mensais seriais.

A pergunta central: **religar sem regredir**. Touch surface é cirúrgico (não introduz feature nova), mas 1172/1172 testes coach + 182/182 sprint AI-2B precisam continuar verdes; mocks dos stubs FX em testes existentes precisam migrar para mocks dos adapters; o `callQuarterlyLlm` precisa replicar exatamente o try/catch + fail-soft de `callMonthlyLlm` (lessons #5/#35) para não introduzir regressão silenciosa.

### Restrições

- **Backward compat reports já gerados:** Relatórios em prod com `degradedReason='quarterly_llm_pending'` ficam — não regenerar. Próxima execução automática (1/jul/2026 7h local Pro+) cai no novo path. (Sprint encerra hoje 2026-05-20; primeiro disparo real ~6 semanas à frente.)
- **`shared/fxCascade.ts` permanece em `shared/`** (Q-A) — mover para `server/services/` é cleaner conceitualmente (callers são server-only), mas custa atualizar ~5 import paths + path em `tests/shared/fxCascade.test.ts`. Não vale o risco de quebrar testes em sprint cleanup.
- **`resolveStorage` NÃO extraído** (Q-B) — helper centralizado quebra porque path relativo (`../storage` vs `../../storage`) muda por subpasta. Workaround com loader callback (`resolveStorage(injected, () => import("../storage"))`) elimina o ganho de DRY (caller ainda passa string literal). Aceitar duplicação é a escolha menos pior.
- **`callQuarterlyLlm` duplicado de `callMonthlyLlm` inicialmente** (Q-C) — consolidar `callLlm` genérico só no `/simplify` se sintaticamente possível (bundles/prompts têm shape divergente). Risco baixo: a duplicação é localizada (1 função por gerador).
- **Custo $0.25/Q/user aceito** (Q-E) — trimestral = 1x/3 meses = ~$1/ano/user em Pro+. Aceitável para tier paying.
- **`getAveragePtaxForRange` não valida `from > to`** (Q-F) — caller é interno (gerador), invariante já garante; adapters retornam vazio → cascade throw `no_fx_data` naturalmente. Simplifica cascade.
- **Trigger `updateCgameRecent` só no quarterly** (Q-D) — monthly/daily deferred AI-3.1. Reduz surface area: quarterly = 1x/3 meses, frequência baixa basta para Coach contexto referenciar último snapshot recente.
- **Lessons críticas:**
  - **#5/#35** (`new AnthropicCtor` try/catch): RF-01 reusa `tryAnthropicClient` já implementado; não reintroduzir o bug.
  - **#6** (FX → USD normalize): irpfSummary converte USD→BRL via PTAX médio SÓ na seção dedicada; resto do bundle permanece USD.
  - **#9** (log antes do fallback): RF-02 cascade loga `FxFetchError` antes de cair para Frankfurter — distinguir "API down" de "dados ausentes" em prod.
  - **#3** (mock shape real): test-writer das RF-02 precisa mockar adapter retornando shape `FxRow[]` exato (`{currency, date, ratePerUsd, source}`), não o shape legado `{value}` dos stubs.
  - **#10** (DRY prompt cache): RF-01 prompt `quarterlyReport.ts` reusa `GRINDFY_AI_BASE` + `CITATIONS_RULES` + `REPORT_DISCLAIMER` STATIC com `cache_control: ephemeral` (ADR-019); não recriar texto inline.
  - **#34** (`injectedStorage`): RF-03 helper `updateCgameRecent` aceita `injectedStorage?` para testabilidade.
  - **#36** (lazy schema import): `aiStructuredProfile.ts` já faz; RF-03 amplia interface sem mudar o pattern.

### O que está fora de escopo

- **Banner verbosos cleanup** (~12 arquivos — estética, defer pós-sprint).
- **`fxCascade` Redis** (multi-replica deploy) — Map in-memory por replica fica.
- **UI editor `CareerGoalsPanel`** — refactor visual fica para AI-3.1.
- **`computeIrpfSummary` LLM** — continua determinístico (Q-C original do AI-2B).
- **Quarterly + Weekly + Monthly enqueuer unificados** em 1 função — manter 3 separadas (não vale risco).
- **Migration de schema dedicada** (coluna `users.cgame_recent`) — RF-03 usa JSONB existente, schemaless.
- **`weeklyReportGenerator`/`dailyDebriefGenerator` LLM tweaks** — só quarterly muda.
- **Trigger `updateCgameRecent` no monthly** — defer AI-3.1.
- **Atualizar coach context com bloco "## C-game recente"** — só estende se já existir; criar do zero fica para sprint dedicada.

---

## 2. Decisão

Adotada: **7 sub-decisões alinhadas com RF-01..RF-07**. Cada uma cirúrgica, sem feature nova.

### 2.1. Quarterly LLM real-call (RF-01)

Substituir o stub `degradedReason='quarterly_llm_pending'` por pipeline real Sonnet 4.6 + sumarização Haiku + parsed JSON, replicando exatamente o padrão de `monthlyReportGenerator.callMonthlyLlm`.

- **Modelo:** `process.env.COACH_MODEL ?? "claude-sonnet-4-6"`, `max_tokens: 4000` (trimestre maior que monthly que usa 3000).
- **Prompt novo:** `server/coach/prompts/quarterlyReport.ts` — STATIC `GRINDFY_AI_BASE + CITATIONS_RULES + REPORT_DISCLAIMER` (cache `ephemeral` ADR-019); DINÂMICO instrui JSON com forma `{header, comparatives, variance, insights, nextWeekPlan, careerGoalsProgress, cgameNarrative?, mentalNarrative?, irpfNarrative?}`.
- **Function `callQuarterlyLlm`:** duplicada inicialmente de `callMonthlyLlm` (Q-C). Mesmo padrão de retry 3x exponencial + try/catch ctor `new Anthropic(...)` (lesson #5/#35) + retorno discriminado `{parsed, usage} | {clientUnavailable: true}`.
- **Sumarização hierárquica:** já parcialmente implementada (linhas 232-263); validar que o output de `summarizeBundleHierarchical` vai como `user` para o Sonnet (hoje só registra `summarizerModelUsed` mas não usa o bundle reduzido — bug latente que esta sprint fecha).
- **Fail-soft:** sem `ANTHROPIC_API_KEY` → `degraded='no_anthropic_key'` (existente). LLM throw 3x + `failSoft=true` → `degraded='llm_failed_3x'`. Parsed inválido → `degraded='llm_parse_error'`. Nenhum caminho mantém `quarterly_llm_pending`.
- **Custo:** `computeQuarterlyCost(usage)` extrai `input_tokens` + `output_tokens`; multiplica por tabela Sonnet 4.6 ($3/1M input, $15/1M output); persiste em `reports.cost_usd_estimate`. Admin valida via `GET /api/admin/coach/report-cost-metrics`.
- **Mapeamento de output:** parsed JSON popula `content.header.summaryLine`, `content.header.comparison`, `content.comparatives.trendNarrative`, `content.variance.narrative`, `content.insights[]` (cada com `{text, citations, confidence}`), `content.nextWeekPlan.{recommendedAction, studyFocus}`, `content.careerGoalsProgress[*].narrative` — preservando os outros campos populados pré-LLM (`goalId`, `title`, `progressPct`, `cgameSnapshot`, `mentalHandHighlights`, `irpfSummary`, `followUp`, `disclaimer`).

### 2.2. FX cascade wire real (RF-02)

`shared/fxCascade.ts` deixa de importar stubs e delega para adapters de produção da Sprint FX-1.

- **Antes:** `await import("./fx/bcbClient")` + `await import("./fx/frankfurterClient")` (stubs retornam `[]` shape `{value, date}`).
- **Depois:** `await import("../server/services/fx/adapters/bcbPtaxAdapter").fetchTimeseriesBrl(from, to)` (shape `FxRow[]` com `{currency, date, ratePerUsd, source}`) + fallback `await import("../server/services/fx/adapters/frankfurterAdapter").fetchTimeseries(from, to, ['BRL'])` + filtro `currency === 'BRL'` (Frankfurter aceita N symbols).
- **Ordem:** BCB PTAX primeiro (autoridade para IRPF brasileiro), Frankfurter fallback (ECB rates — útil em weekend/holiday quando BCB OData retorna vazio).
- **Erro handling:** `try { ... } catch (err) { logger.warn({err, source:'bcb_ptax'}, 'fxCascade BCB failed, falling back to Frankfurter') }` (lesson #9 — log antes do fallback). Distinguir "API down" de "vazio". `FxFetchError` capturado igual a empty array → ambos disparam fallback.
- **Cache 24h mantido** (Map in-memory por replica). `_resetFxCascacheCacheForTests` preserva nome para não quebrar testes.
- **Deletar:** `shared/fx/bcbClient.ts`, `shared/fx/frankfurterClient.ts`. Grep antes para validar zero imports remanescentes.
- **Assinatura `getAveragePtaxForRange(from, to): Promise<number>` inalterada** — callers (`quarterlyReportGenerator`, `computeIrpfSummary` handler) não mudam.
- **Q-F (não valida `from > to`):** adapter delega — BCB OData retorna vazio → fallback Frankfurter → também vazio → `no_fx_data`. Sem validação extra no cascade.

### 2.3. `cgameRecent` persistido em `users.ai_structured_profile` (RF-03)

- **Interface estendida:** `AiStructuredProfile.cgameRecent?: {aPct, bPct, cPct, sampleSize, confidence: 'high'|'medium'|'low', period: {start, end}, updatedAt} | null`.
- **Helper novo:** `updateCgameRecent(userId, snapshot, injectedDb?): Promise<void>` em `server/storage/aiStructuredProfile.ts`. Internamente chama `updateAiStructuredProfile(userId, {cgameRecent: snapshot}, injectedDb)`. Merge raso preserva outros campos (`metas`, `nivel`, `goalsLegacy` etc).
- **`normalizeAiStructuredProfile` valida shape:** clamp não-destrutivo — campos numéricos não-finitos OU `confidence` fora do enum OU `period.start/end` não-string → omite `cgameRecent` inteiro (não throw). Lesson #11 — default mínimo.
- **Trigger:** No final do gather do quarterly (após `cgameSnapshot = aggregateCgameForPeriod(...)`), `await updateCgameRecent(userId, snapshot).catch(err => log)` — best-effort, fire-and-forget, NÃO bloqueia o relatório.
- **Cache invalidation:** `updateAiStructuredProfile` já invalida `aiStructuredProfile` cache local (lazy import + sentinel — lesson #36).
- **JSONB schemaless → SEM `ALTER TABLE`.** Backward-compat: users com `ai_structured_profile.cgameRecent` ausente → leitura retorna `undefined` (interface optional).

### 2.4. `enqueueQuarterlyReportJobsTick` paridade (RF-04)

- **Antes:** `for await (const u of storage.iterateUsersWithTimezone())` (full scan async iterator).
- **Depois:** `const users = (await storage.listUsersForCron("subscription_plan IN ('trial','active','admin')")) ?? []` + `for (const u of users)`.
- **Demais lógica preservada** — checks `mês ∈ {0,3,6,9}` + `dia === 1` + `getLocalHour === 7` + `isReportEligible(userId, 'quarterly')` continuam idênticos. Paridade exata com weekly/monthly enqueuer (linha 184).
- **Tests:** mocks de `iterateUsersWithTimezone` migram para mocks de `listUsersForCron`. Test-writer reescreve fixtures.
- **`iterateUsersWithTimezone` permanece no codebase** (outros callers podem usar) — apenas o quarterly enqueuer migra.

### 2.5. DRY refactors leves (RF-05)

Apenas 2 dos 3 sub-refactors entram (Q-B cancela RF-05.2):

- **RF-05.1 — `shared/brTimezones.ts`:** novo módulo exportando `BR_TIMEZONE_REGEX` + `isBrUser({country, timezone})`. Substitui regex inline em `quarterlyReportGenerator.ts:47-53`. Grep antes para validar zero ocorrências em outros lugares (se houver, deixar — esta sprint não amplia scope).
- **RF-05.3 — `server/emails/templates/_renderReportShell.ts`:** extrai shell HTML compartilhado (header `<div max-width:600px>` + saudação `Olá ${name}` + CTA button + footer `REPORT_DISCLAIMER` + unsubscribe link) dos 3 templates (`weekly`, `monthly`, `quarterly`). API:
  ```ts
  renderReportShell({userName, subject, intro, bodyHtml, ctaLabel, ctaUrl, disclaimer?, unsubscribeUrl}): {html, text};
  ```
  Cada template específico injeta só o miolo (mental hand block, IRPF block etc).
- **RF-05.2 (`resolveStorage` helper) — CANCELADO** (Q-B). Decisão: aceitar duplicação. Path relativo varia (`../storage` vs `../../storage`) — helper centralizado quebra ou exige loader callback que elimina o ganho. Documentar em CLAUDE.md §Convenções para sprints futuras não tentarem extrair.

### 2.6. Perf via `Promise.all` (RF-06)

- **Quarterly gather:** Operações independentes paralelizadas em **2 waves**:
  - **Wave 1** (independentes): `profile`, `perf`, `sessions`, `careerGoals`, `mentalHands`, `cgameSnapshot`. `Promise.all(...)` ou `Promise.allSettled(...)` para isolar falhas (se `mentalHands` throw, `cgameSnapshot` ainda popula).
  - **Wave 2** (depende de `profile`): `irpfSummary` SÓ se `isBrUser(profile)`. Wait wave 1 → check `profile.country/timezone` → fetch FX + wallet_tx rakeback.
- **`cgameAggregator.getInchwormSeries`:** 6 awaits mensais seriais → `Promise.all(monthRanges.map(r => aggregateCgameForPeriod(userId, r, storage)))`.
- **Erros isolados:** `Promise.allSettled` na wave 1 — falhas individuais não derrubam outros campos. Logar `result.reason` quando `status === 'rejected'`.
- **Wall-clock alvo:** quarterly gather (sem LLM) <1.5s; `getInchwormSeries` reduzido em >50% (6 awaits → 1 wave).

### 2.7. ADR + diagramas (RF-07)

- **Este ADR-174** — documenta as 6 decisões de wiring (RF-01..RF-06).
- **Diagrama 1** — `coach-ai-3/quarterly-llm-sequence.mermaid` — sequence diagram cobrindo cron tick → enqueuer (filtro SQL) → `report_jobs` → processor 15min → `generateQuarterlyReport` → `Promise.all` gather → `updateCgameRecent` → `maybeSummarizeBundle` (Haiku) → `callQuarterlyLlm` (Sonnet) → parse + map → persist + email best-effort.
- **Diagrama 2** — `coach-ai-3/fx-cascade-real-sequence.mermaid` — sequence diagram cobrindo `getAveragePtaxForRange` → cache → `bcbPtaxAdapter.fetchTimeseriesBrl` → (se vazio/throw com log) `frankfurterAdapter.fetchTimeseries` + filtro BRL → (se ambos vazios) throw `no_fx_data`. Destaca lesson #9 (log antes do fallback).
- **CLAUDE.md §10 update pós-merge:** nota "AI-3 cleanup SHIPPED — Quarterly funcional + FX real + cgame persist".

---

## 3. Opções consideradas

### Opção A — Religar `quarterlyReportGenerator` chamando LLM real com paridade `monthlyReportGenerator` — ESCOLHIDA (RF-01)

**Prós:**
- Quarterly Report opt-in Pro+ finalmente entrega valor completo (não fica `degraded` em 100% das execuções).
- Paridade com monthly facilita manutenção (mesmo padrão de retry + cost tracking + fail-soft).
- Custo modesto (~$1/ano/user em Pro+).
- Lessons #5/#35 + #10 já validadas — risco baixo.

**Contras:**
- ~6h de implementer (mais complexa das RFs).
- Duplicação temporária de `callLlm` (mitigada por consolidação no `/simplify`).

### Opção B — Deletar `quarterlyReportGenerator` e fazer Quarterly reusar `monthlyReportGenerator` com janela 3 meses

**Rejeitada:**
- Quarterly tem 5 seções únicas (`irpfSummary`, `cgameSnapshot`, `mentalHandHighlights`, `careerGoalsProgress` por horizon, comparativos vs mesmo Q ano anterior) — não cabem no monthly template.
- Bundle quarterly quase sempre dispara sumarização hierárquica (>20K chars) — monthly raramente. Lógica de sumarização diverge.
- Trade-off de DRY não compensa a perda de clareza por tipo de report.

### Opção C — Deferir RF-01 para AI-3.1, fazer só RF-02..RF-06 nesta sprint

**Rejeitada:**
- Quarterly é a feature flagship do AI-2B. Deixar `degraded` em prod é regressão de produto perceptível (primeiro disparo automático 1/jul/2026 — janela curta).
- O wiring é cirúrgico e replica padrão já validado em monthly. Risco baixo.

### Opção D — Mover `shared/fxCascade.ts` para `server/services/fxCascade.ts`

**Rejeitada (Q-A lock):**
- Cleaner conceitualmente (callers são server-only), mas custa atualizar ~5 import paths + path em `tests/shared/fxCascade.test.ts`.
- Não vale o risco de quebrar tests em sprint cleanup. Manter em `shared/` (path histórico).
- A pasta `shared/` continua válida porque o módulo é puro TS (sem deps Node-specific).

### Opção E — Extrair `callLlm` genérico já agora (não duplicar `callQuarterlyLlm` de `callMonthlyLlm`)

**Rejeitada (Q-C lock):**
- Abstração prematura. Monthly e Quarterly têm prompts/bundles divergentes — extrair o LLM call em comum sem estabilizar antes leva a `if (type === 'quarterly')` em vários lugares.
- Separar risco: shipar `callQuarterlyLlm` duplicado (cópia validada de `callMonthlyLlm`), consolidar no `/simplify` se sintaticamente possível (com helpers `buildBundle`/`buildPrompt` ainda específicos).

### Opção F — Extrair `resolveStorage` helper (RF-05.2 original)

**Rejeitada (Q-B lock):**
- Path relativo (`../storage` vs `../../storage`) muda por subpasta — helper centralizado não funciona sem loader callback.
- Loader callback (`resolveStorage(injected, () => import("../storage"))`) elimina o ganho de DRY: caller ainda passa string literal.
- Alias `@/storage` via tsconfig exige config change risky em sprint cleanup.
- Aceitar duplicação documentada em CLAUDE.md.

### Opção G — Adicionar trigger `updateCgameRecent` no monthly + daily além do quarterly

**Rejeitada (Q-D lock):**
- Surface area maior. Quarterly = 1x/3 meses; monthly = 1x/mês; daily = N/dia (potencialmente N writes em `users.ai_structured_profile`).
- Frequência baixa do quarterly já basta para Coach contexto referenciar "último snapshot recente".
- Deferir AI-3.1 quando souber se `cgameRecent` virou útil no chat (data-driven).

---

## 4. Consequências

### Positivas

- **Quarterly Report funcional 100%** — próximo disparo automático (1/jul/2026 7h Pro+ opt-in) gera `status='ready'` com narrativa Sonnet 4.6 real (vs `degraded` em 100% hoje).
- **IRPF summary BR-only funcional** — `profitBrl` numérico em vez de `degraded='fx_unavailable'`. Users brasileiros ganham extrato informativo real (com disclaimer "não substitui contador" ADR-173).
- **C-game histórico acessível ao Coach** — `users.ai_structured_profile.cgameRecent` permite chat referenciar "seu A-game caiu de 60% para 52% vs trimestre passado" sem refazer agregação cara.
- **Quarterly enqueuer mais eficiente** — filtro SQL `IN ('trial','active','admin')` vs full scan; menos rows iteradas em vão.
- **DRY parcial** — 2/3 dos refactors aceitos. `brTimezones.ts` + email shell ganham reuso futuro; `resolveStorage` documentado como conscious duplication.
- **Perf melhor** — wall-clock do quarterly gather reduzido >30%; `getInchwormSeries` >50%.
- **Admin observability** — `cost_usd_estimate > 0` em quarterly reports permite tracking real do gasto.

### Negativas

- **Custo Anthropic aumenta** — quarterly real ~$0.25/Q/user (vs $0 quando degraded). Multiplicado pelo número de Pro+ users × 4 trimestres/ano = custo recorrente. Aceito (Q-E): produto Pro+ paying customers.
- **Surface de regressão** — 1172/1172 testes coach + 182/182 sprint AI-2B precisam continuar verdes. Mocks dos stubs FX em testes existentes migram para mocks dos adapters → risco de regressão silenciosa se shape divergir (mitigado por lesson #3 — validar shape REAL antes).
- **Duplicação temporária `callQuarterlyLlm` ↔ `callMonthlyLlm`** — `/simplify` consolida se viável. Se monthly evoluir antes da consolidação, divergência silenciosa possível (lesson #10).
- **Cache `fxCascade` Map in-memory por replica** — multi-replica deploy faz refetch desnecessário. Deferred AI-3.1 (Redis).
- **`updateCgameRecent` cresce `ai_structured_profile`** — ~150 bytes/user × Pro+ users. Storage cost marginal.

### Riscos mitigados

- **Lessons #5/#35** (`new AnthropicCtor`): `tryAnthropicClient` já implementado preserva o padrão.
- **Lesson #3** (mock shape real): test-writer da RF-02 mocka adapter retornando shape `FxRow[]` exato (`{currency, date, ratePerUsd, source}`), não `{value, date}` legado.
- **Lesson #6** (FX → USD normalize): irpfSummary converte USD→BRL via PTAX médio SÓ na seção dedicada; resto do bundle permanece USD.
- **Lesson #9** (log antes do fallback): cascade loga `FxFetchError` antes de cair para Frankfurter — distingue API down de dados ausentes.
- **Lesson #11** (default mínimo): `normalizeAiStructuredProfile` clampa shape inválido em vez de throw; `cgameRecent` ausente → undefined.
- **Lesson #34** (`injectedStorage`): RF-03 helper aceita `injectedStorage?` mantém testabilidade.
- **Lesson #36** (lazy schema import): `aiStructuredProfile.ts` já aplica; RF-03 amplia sem mudar pattern.

### Neutras

- **`shared/fx/bcbClient.ts` + `frankfurterClient.ts` deletados** — git history preserva código original se necessário ressuscitar.
- **`iterateUsersWithTimezone` permanece no codebase** — outros callers podem usar; só o quarterly enqueuer migra para paridade.
- **`callQuarterlyLlm` duplicado de `callMonthlyLlm`** — futura consolidação em `reportGeneratorShared.ts` quando padrão estabilizar.
- **`cgameRecent` JSONB schemaless** — futuro ALTER TABLE para coluna dedicada possível se queries `WHERE cgame_recent->>'aPct' > 60` virarem comuns.

## Confiança

**Alta** — sprint cleanup cirúrgica, sem feature nova. Paridade exata com padrões já validados (monthly LLM call, weekly/monthly enqueuer SQL filter). Lessons aplicadas. Custo modesto. Surface de regressão coberta por suite existente (1172 + 182 testes). Próximo disparo automático real (1/jul/2026) é janela suficiente para `/simplify` + reviewer + deploy + rollback se preciso.
