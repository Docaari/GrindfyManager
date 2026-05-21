# Spec: Sprint AI-3 — Cleanup pós-plano IA: ligar pendências (Quarterly LLM real, FX stubs→adapters, cgame persist, enqueuer DRY) + refactors leves + perf

## Status
Proposta (aguardando aprovação founder + decisões Q-A..Q-F)

---

## Resumo

Última sprint do plano IA (7/7 SHIPPED 2026-05-20, commit `3b543370`). Esta sprint **não adiciona feature nova** — fecha pendências e dívida técnica documentada em `memory/session_2026-05-20-ai-2b-shipped.md` §"Pendências":

1. **Quarterly LLM real-call** com paridade `monthlyReportGenerator` (Sonnet 4.6 + sumarização hierárquica Haiku + parsed JSON populando header/comparison/insights/nextWeekPlan/variance/careerGoalsProgress). Hoje o gerador sempre marca `status='degraded' degradedReason='quarterly_llm_pending'` (linhas 265-273).
2. **FX cascade wire real** — `shared/fxCascade.ts` delegar para os adapters de produção (`server/services/fx/adapters/{bcbPtaxAdapter,frankfurterAdapter}`) em vez dos stubs `shared/fx/{bcbClient,frankfurterClient}.ts` que retornam `[]`. Hoje todo `getAveragePtaxForRange` throw `no_fx_data`, e portanto todo `irpfSummary` cai em `degraded='fx_unavailable'`.
3. **cgame snapshot persist** — escrever `cgame_recent` em `users.ai_structured_profile` após cada cálculo do `cgameAggregator` (Q-D requisito do AI-2B que ficou pra trás). Permite que o Coach acesse C-game histórico no contexto sem refazer agregação.
4. **`enqueueQuarterlyReportJobsTick` consistency** — migrar de `iterateUsersWithTimezone()` (full scan) para `listUsersForCron("subscription_plan IN ('trial','active','admin')")` — paridade com weekly/monthly enqueuer.
5. **DRY refactors leves** — extrair `isBrUser`/regex BR para `shared/brTimezones.ts` (hoje só em `quarterlyReportGenerator.ts`, mas iterar grep para identificar outros); extrair `resolveStorage` para `server/utils/resolveStorage.ts` (hoje duplicado em ~14 arquivos); extrair shell HTML comum (header + CTA + footer) de `weeklyReportEmail.ts` + `monthlyReportEmail.ts` + `quarterlyReportEmail.ts` em `server/emails/templates/_renderReportShell.ts`.
6. **Perf** — `Promise.all` no quarterly gather (hoje seriais: profile, perf, cgame, mental hands, career goals, irpf, sessions ≈ 8 awaits seriais); `Promise.all` em `cgameAggregator.getInchwormSeries` (6 queries mensais seriais).
7. **ADR + diagramas** — ADR-174 documenta as decisões de wiring; 2 diagramas Mermaid em `Docs/architecture/diagrams/coach-ai-3/` (quarterly LLM sequence + FX cascade real sequence).

**Não-objetivos (defer pra AI-3.1 ou outras sprints):**
- Cleanup de banners verbosos (~12 arquivos — estética, baixo valor).
- Migrar cache `fxCascade` in-memory para Redis (Map por replica é suficiente fase 1).
- UI editor de career goals (já existe `CareerGoalsPanel`; deferred polish).
- Migrar enqueuers para `cron` dedicado (estender hourly continua OK).
- LLM real para o `computeIrpfSummary` tool (hoje determinístico; pode permanecer).

---

## Contexto

### Estado atual (o que já existe — confirmado por leitura de código)

- **`server/services/quarterlyReportGenerator.ts`** (sprint AI-2B): pipeline completo de gather (profile + perf + cgame + mental + career goals + irpf + summarization Haiku stub). Mas linhas 265-273:
  ```ts
  if (!client) {
    status = "degraded";
    degradedReason = "no_anthropic_key";
  } else {
    status = "degraded";
    degradedReason = "quarterly_llm_pending";   // ← LLM nunca chamado
    modelUsed = null;
    summarizerModelUsed = null;
  }
  ```
  Nenhum `client.messages.create({...})` é invocado. Comparar com `monthlyReportGenerator.ts` linhas 332-403 que tem o pipeline completo (bundle + `maybeSummarizeBundle` + `callMonthlyLlm` + parsed JSON → header/comparison/insights/nextWeekPlan/trend/variance).
- **`shared/fxCascade.ts`** (sprint AI-2B): chama `import("./fx/bcbClient")` + fallback `import("./fx/frankfurterClient")`. Ambos stubs retornam `[]`. Throw `no_fx_data` sempre em prod (nunca houve quote real).
- **`server/services/fx/adapters/bcbPtaxAdapter.ts`** (sprint FX-1, em uso pelo refresh de cards FX): `fetchTimeseriesBrl(from, to): Promise<FxRow[]>` shape `{currency, date, ratePerUsd, source}`. Throws `FxFetchError` em falha. Funcional em prod (testado FX-1).
- **`server/services/fx/adapters/frankfurterAdapter.ts`**: `fetchTimeseries(from, to, symbols): Promise<FxRow[]>` shape idem. Funcional FX-1.
- **`server/jobs/reportJobRunner.ts`** linhas 184 (weekly+monthly enqueuer): `storage.listUsersForCron("subscription_plan IN ('trial','active','admin')")`. Linhas 340-345 (quarterly enqueuer): `storage.iterateUsersWithTimezone()` — full-scan async iterator, sem filtro de plano no SQL → mais rows + mais I/O.
- **`server/services/cgameAggregator.ts`** (sprint AI-2B):
  - `aggregateCgameForPeriod(userId, range, storage?)` → `CgameSnapshot` puro.
  - `getInchwormSeries(userId, months=6, storage?)` → 6 awaits seriais (linhas 124-134).
  - **Não persiste** snapshot em lugar nenhum.
- **`server/storage/aiStructuredProfile.ts`** (sprint AI-1A): `getAiStructuredProfile` + `updateAiStructuredProfile(userId, patch, injectedDb?)`. `normalizeAiStructuredProfile` clamps + back-fill. **`AiStructuredProfile` interface NÃO inclui `cgameRecent` hoje** (RF-03 amplia).
- **`server/emails/templates/{weekly,monthly,quarterly}ReportEmail.ts`** (sprint AI-2B): ~50-80 linhas cada. Header `<div style="font-family:...max-width:600px;...">` + `<h1>Ola...</h1>` + CTA `<a href="${baseUrl}/coach-ai/relatorio/${reportId}">` + `renderFooter(disclaimer, unsubscribeUrl)`. ~70% código duplicado entre os 3.
- **`isBrUser`** (regex BR): hoje só em `server/services/quarterlyReportGenerator.ts:47-53`. Mas potencialmente repete em `computeIrpfSummary` handler. Grep antes de extrair (RF-05.1).
- **`resolveStorage`** (`async function resolveStorage(injected) { if (injected) return injected; return (await import("../storage")).storage }`): grep mostrou 21 arquivos contendo o termo. Confirmar duplicação real em RF-05.

### Por que esta sprint

Sem essas pendências:
- **Quarterly Report sempre fica `degraded`** — opt-in Pro+ é o feature flagship do AI-2B mas usuário nunca recebe narrative LLM real.
- **IRPF summary sempre `degraded` com `fx_unavailable`** — feature útil pra users BR vira no-op.
- **C-game só vive em runtime** — sem persistência, o Coach AI não consegue referenciar histórico ("seu A-game caiu vs trimestre passado") sem refazer agregação.
- **DRY débito** — cada arquivo novo herda padrão de `resolveStorage` inline; sem extração, próximo sprint vai duplicar de novo.
- **Quarterly enqueuer mais lento** que weekly/monthly (full scan vs filtro SQL).

---

## Usuários

- **Pro/Premium/Trial elegível:** ganha Quarterly Report **funcional** (LLM real + sumarização + IRPF real), C-game persistido no perfil, mesma latência de relatórios.
- **Free:** sem mudança visível (não recebe quarterly). Mas indiretamente C-game persist habilita Coach chat (free também usa coach LLM via rate-limit) a referenciar histórico mental.
- **Admin:** ganha visibilidade do custo Quarterly real em `/api/admin/coach/report-cost-metrics`.

---

## Requisitos Funcionais

### RF-01: Quarterly LLM real-call — paridade `monthlyReportGenerator`

**Descrição:** Substituir o stub `degradedReason='quarterly_llm_pending'` por pipeline real Sonnet 4.6 + sumarização Haiku + parsed JSON. Custo alvo ~$0.25/Q/user (trimestre = 3x bundle vs mensal).

**Regras de negócio:**

- Modelo: `process.env.COACH_MODEL ?? "claude-sonnet-4-6"`. `max_tokens=4000` (trimestre maior que monthly). Inferir caching `cache_control: ephemeral` no system prompt.
- Prompt em `server/coach/prompts/quarterlyReport.ts` (novo arquivo). Reusar `GRINDFY_AI_BASE` + `CITATIONS_RULES` + `REPORT_DISCLAIMER` como contexto estável (lesson #10 — fonte única). Bloco DINÂMICO instrui o LLM a retornar JSON com forma:
  ```ts
  {
    header: { summaryLine: string, comparison?: string },
    comparatives: { trendNarrative?: string },     // vs Q anterior
    variance: { narrative?: string },              // sample maior → confidence mais alto
    insights: Array<{ text: string, citations: string[], confidence: 'high'|'medium'|'low' }>,
    nextWeekPlan: { recommendedAction?: string, studyFocus?: string },  // "next quarter" semanticamente
    careerGoalsProgress: Array<{ goalId: string, narrative: string, estimate: 'on_track'|'behind'|'ahead'|'unknown' }>,
    cgameNarrative?: string,                       // 1-2 frases interpretativas do snapshot
    mentalNarrative?: string,                      // top 3 mental hands → 1 padrão observado
    irpfNarrative?: string,                        // BR-only — 1 frase resumindo o extrato
  }
  ```
- Function `callQuarterlyLlm({model, bundle, tone, level}): Promise<{parsed, usage} | {clientUnavailable: true}>`. Mesmo padrão de `monthlyReportGenerator.callMonthlyLlm` (não exportada hoje — duplicar inicialmente; consolidar em `reportGeneratorShared.ts` no `/simplify` se viável).
- **Sumarização hierárquica:** Quarterly bundle quase sempre dispara o threshold (20K chars padrão OU `sessionsCount > 100`). Já está implementado parcialmente (linhas 232-263); validar que `summarizerModelUsed` é populado **e** o bundle sumarizado é o que vai pro Sonnet (hoje o output de `summarizeBundleHierarchical` não é usado — só registra `summarizerModelUsed`).
- **Try/catch Anthropic ctor (lesson #5/#35):** Já implementado em `tryAnthropicClient` (linhas 60-82). Manter.
- **Fail-soft:** Sem `ANTHROPIC_API_KEY` → `status='degraded', degradedReason='no_anthropic_key'`. LLM error 3x → `degradedReason='llm_failed_3x'` quando `failSoft=true`; senão throw.
- **Custo calculation:** `computeQuarterlyCost(usage)` extrai da resposta `usage.input_tokens`/`output_tokens` + cost tabela Sonnet 4.6 ($3/1M input, $15/1M output). Gravar em `reports.cost_usd_estimate`.
- **`status` final:** `ready` quando `parsed` válido + sem erro; `degraded` nos outros casos.
- **Insights e CTAs:** Reusar `sanitizeHref` (já em `reportGeneratorShared.ts`); CTAs só apontam para tools/rotas existentes (lesson #19).
- **Narrativa popula seções existentes:** `content.header.summaryLine`, `content.header.comparison`, `content.comparatives.trendNarrative`, `content.variance.narrative`, `content.insights[]`, `content.nextWeekPlan.{recommendedAction,studyFocus}`, `content.careerGoalsProgress[].narrative` (preserva os outros campos populados antes da chamada LLM).

**Arquivos afetados:**
- `server/services/quarterlyReportGenerator.ts` — adicionar `callQuarterlyLlm`, substituir linhas 265-273 pelo pipeline real, mapear parsed JSON nas seções de `content`.
- `server/coach/prompts/quarterlyReport.ts` — NOVO (template do prompt).
- (Opcional) `server/services/reportGeneratorShared.ts` — adicionar `computeQuarterlyCost` helper (paridade `computeMonthlyCost`).

**Critério de aceitação:**
- [ ] Sem `ANTHROPIC_API_KEY` → `status='degraded'`, `degradedReason='no_anthropic_key'`. Não throw.
- [ ] Com `ANTHROPIC_API_KEY` válida + bundle valid → `status='ready'`, `model='claude-sonnet-4-6'`, `usage` populado.
- [ ] `content.header.summaryLine` populado pelo LLM (não fallback).
- [ ] `content.insights` tem entries com `{text, citations, confidence}` válido (não array vazio quando LLM retornou insights).
- [ ] `content.careerGoalsProgress[*].narrative` populado pelo LLM (preserva `goalId`, `title`, `progressPct` calculados pré-LLM).
- [ ] `cost_usd_estimate` gravado e > 0 quando LLM real chamado.
- [ ] Bundle > 20K chars OU sessions > 100 → `summarizerModelUsed='claude-haiku-4-5...'` + bundle sumarizado entra no payload final do Sonnet (não só "marca").
- [ ] LLM throw 3x consecutivos em `failSoft=true` → `degradedReason='llm_failed_3x'`.
- [ ] `degradedReason='quarterly_llm_pending'` NÃO aparece mais em nenhum caminho.
- [ ] Mock test que injeta `client.messages.create` retornando JSON válido cobre o caminho feliz.

**Estimate:** ~6h (paridade com monthly + diff sutil de schema parsed).

---

### RF-02: FX cascade wire real — deletar stubs, delegar para adapters

**Descrição:** `shared/fxCascade.ts` deixa de ler `shared/fx/{bcbClient,frankfurterClient}.ts` (stubs) e passa a ler `server/services/fx/adapters/{bcbPtaxAdapter.fetchTimeseriesBrl, frankfurterAdapter.fetchTimeseries}`. **Decisão de location:** `shared/fxCascade.ts` é importado por `server/services/quarterlyReportGenerator.ts` + `server/coachTools/handlers/computeIrpfSummary.ts` (server-only); mover para `server/services/fxCascade.ts` é cleaner mas pode quebrar import paths existentes — Q-A abaixo.

**Regras de negócio:**

- Adapter shape: `FxRow[]` com `{currency, date, ratePerUsd, source}`. `fxCascade` precisa filtrar `currency==='BRL'` no resultado do `frankfurterAdapter.fetchTimeseries(from, to, ['BRL'])` (porque ele aceita N symbols) e mapear `.ratePerUsd → value` (campo legado).
- Cascade ordem: **BCB PTAX primeiro** (autoridade pra IRPF), **Frankfurter fallback** (ECB rates — útil quando BCB retorna vazio por API down/weekend).
- Throw `no_fx_data` quando ambos vazios. Cache 24h mantido.
- Manter assinatura `getAveragePtaxForRange(from, to): Promise<number>` (callers não mudam).
- Erros do adapter (`FxFetchError`) capturados em try/catch + log (lesson #9 — log antes de fallback); cascata segue.
- **Deletar:**
  - `shared/fx/bcbClient.ts`
  - `shared/fx/frankfurterClient.ts`
- Verificar via Grep que ninguém mais importa esses paths antes de deletar.

**Arquivos afetados:**
- `shared/fxCascade.ts` (ou move pra `server/services/fxCascade.ts` se Q-A locked = mover).
- `shared/fx/bcbClient.ts` — DELETE.
- `shared/fx/frankfurterClient.ts` — DELETE.
- Possivelmente `shared/fx/index.ts` se houver re-export.

**Critério de aceitação:**
- [ ] `fxCascade.getAveragePtaxForRange('2026-01-01', '2026-03-31')` chama `bcbPtaxAdapter.fetchTimeseriesBrl('2026-01-01','2026-03-31')` primeiro.
- [ ] Se BCB retorna `FxRow[]` com N entries → calcula avg de `ratePerUsd`, retorna número, cacheia 24h.
- [ ] Se BCB throw `FxFetchError` → log + fallback para `frankfurterAdapter.fetchTimeseries(from, to, ['BRL'])` → filtra `currency==='BRL'` → calcula avg.
- [ ] Se ambos retornarem vazio OU throw → throw `no_fx_data`.
- [ ] `shared/fx/bcbClient.ts` e `frankfurterClient.ts` não existem mais no repo.
- [ ] Nenhum import quebra (grep `from "shared/fx/`).
- [ ] `quarterlyReportGenerator.irpfSummary` sai de `degraded:true, degradedReason:'fx_unavailable'` para `degraded` ausente + `profitBrl` numérico.
- [ ] `_resetFxCascacheCacheForTests` continua funcionando.
- [ ] Teste com adapter mockado (`vi.mock("../services/fx/adapters/bcbPtaxAdapter", ...)`) retornando 60 rates → average correto.

**Estimate:** ~3h (refactor straightforward + ajustar testes do `fxCascade.test.ts`).

---

### RF-03: cgame snapshot persist em `users.ai_structured_profile`

**Descrição:** Após cada `aggregateCgameForPeriod`, **opcionalmente** persistir o snapshot em `users.ai_structured_profile.cgameRecent` para que o Coach chat (que lê esse JSONB no contexto) tenha acesso. Idempotente, não-bloqueante.

**Regras de negócio:**

- Estender `AiStructuredProfile` interface em `server/storage/aiStructuredProfile.ts` com campo opcional:
  ```ts
  cgameRecent?: {
    aPct: number; bPct: number; cPct: number;
    sampleSize: number;
    confidence: 'high'|'medium'|'low';
    period: { start: string; end: string };  // YYYY-MM-DD
    updatedAt: string;                       // ISO
  } | null;
  ```
- `normalizeAiStructuredProfile` valida shape (numbers finitos, confidence em enum válido, datas strings) — clampa ou descarta valores ruins. **Importante:** clamp não-destrutivo (campo desconhecido → omite; não throw).
- **Novo helper** `server/storage/aiStructuredProfile.ts`: `updateCgameRecent(userId, snapshot): Promise<void>` que chama `updateAiStructuredProfile(userId, { cgameRecent: snapshot })`. Idempotente.
- **Trigger:** No final de `quarterlyReportGenerator` (após gather do `cgameSnapshot`), chamar `updateCgameRecent(userId, snapshot)` em try/catch (best-effort, não bloqueia o relatório). **Não trigger no `aggregateCgameForPeriod` puro** (poderia gerar writes excessivos toda vez que o snapshot é lido em UI).
- **Trigger secundário (opcional, defer):** Hook no `monthlyReportGenerator` para também atualizar — defer pra AI-3.1 se tempo apertar.
- Cache invalidation: `updateAiStructuredProfile` já invalida o cache (linha 265 do storage).
- **Page context impact:** O bloco DINÂMICO do `coachContext.ts` "## C-game recente" (planejado em AI-2B RF-08) já existe? Validar com grep; se já lê de `users.ai_structured_profile`, fica funcional automaticamente. Se não existe, **fora de escopo** desta sprint (criar o bloco vira RF separado).

**Arquivos afetados:**
- `server/storage/aiStructuredProfile.ts` — estender interface + adicionar `updateCgameRecent` + validar em `normalizeAiStructuredProfile`.
- `server/services/quarterlyReportGenerator.ts` — chamar `updateCgameRecent` após gather (linha ~121, depois do `cgameSnapshot = ...`).
- (Opcional) `server/coach/coachContext.ts` — ler `users.ai_structured_profile.cgameRecent` se o bloco dinâmico ainda não existe.

**Critério de aceitação:**
- [ ] `updateCgameRecent(userId, { aPct: 60, bPct: 30, cPct: 10, sampleSize: 25, confidence: 'high', period: {start:'2026-01-01', end:'2026-03-31'}, updatedAt: now })` → row de `users` atualizada com JSONB contendo `cgameRecent`.
- [ ] Chamar 2x com snapshots diferentes → segundo sobrescreve primeiro (não append).
- [ ] `getAiStructuredProfile(userId)` retorna `cgameRecent` no shape esperado após update.
- [ ] `normalizeAiStructuredProfile({ cgameRecent: { aPct: 'abc' } })` → `cgameRecent` omitido (não throw).
- [ ] Quarterly generator chama `updateCgameRecent` sem bloquear; erro no update logado mas não interrompe relatório.
- [ ] Test fixture cobre: shape válido aceito; shape inválido rejeitado; preserva outros campos do profile (merge raso).

**Estimate:** ~2h.

---

### RF-04: `enqueueQuarterlyReportJobsTick` consistency — usar `listUsersForCron`

**Descrição:** Migrar quarterly enqueuer (linhas 333-450 de `reportJobRunner.ts`) de `storage.iterateUsersWithTimezone()` para `storage.listUsersForCron("subscription_plan IN ('trial','active','admin')")` — paridade weekly/monthly (linha 184).

**Regras de negócio:**

- Substituir `for await (const u of storage.iterateUsersWithTimezone())` por `const users = (await storage.listUsersForCron("subscription_plan IN ('trial','active','admin')")) ?? []` + `for (const u of users)`.
- Demais lógica (mês ∈ {1,4,7,10}, dia 1, hora local 7, opt-in, eligible tier, period calc) **NÃO MUDA**.
- Manter check `iterateUsersWithTimezone` removido — não ressuscitar.
- **Compat de tests:** Testes que mockam `iterateUsersWithTimezone` viram mocks de `listUsersForCron`. Test-writer atualiza.

**Arquivos afetados:**
- `server/jobs/reportJobRunner.ts` — `enqueueQuarterlyReportJobsTick` linhas 340-345 + loop.

**Critério de aceitação:**
- [ ] `enqueueQuarterlyReportJobsTick` não chama `iterateUsersWithTimezone`.
- [ ] Chama `listUsersForCron` com filtro exato `subscription_plan IN ('trial','active','admin')`.
- [ ] Comportamento funcional idêntico (mesmo set de jobs enfileirados em 1/jan/abr/jul/out 7h local).
- [ ] Testes existentes adaptados (mock de `listUsersForCron` em vez de iterator).

**Estimate:** ~1h.

---

### RF-05: DRY refactors leves

**Descrição:** 3 sub-refactors. Cada um é independente; reviewer pode aceitar/rejeitar individual.

#### RF-05.1 — `shared/brTimezones.ts` (regex BR canônico)

- Novo módulo `shared/brTimezones.ts`:
  ```ts
  export const BR_TIMEZONE_REGEX = /^America\/(Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Eirunepe|Noronha|Santarem)$/;
  export function isBrUser(u: { country?: string|null; timezone?: string|null } | null | undefined): boolean { ... }
  ```
- Substituir em `quarterlyReportGenerator.ts` linha 47 + caller (se houver) em `computeIrpfSummary` handler.
- Grep `America\/Sao_Paulo` ANTES de extrair — pode haver versões mais simples só com SP em outros lugares (não tocar nesses, pra evitar mudança de comportamento).

**Critério de aceitação:**
- [ ] `isBrUser({ country: 'BR' })` → `true`.
- [ ] `isBrUser({ timezone: 'America/Sao_Paulo' })` → `true`.
- [ ] `isBrUser({ timezone: 'Europe/London' })` → `false`.
- [ ] `isBrUser(null)` → `false`.
- [ ] `quarterlyReportGenerator.ts` não tem mais a regex inline.

#### RF-05.2 — `server/utils/resolveStorage.ts`

- Novo módulo:
  ```ts
  export async function resolveStorage(injected?: any): Promise<any> {
    if (injected) return injected;
    const mod = await import("../storage");
    return (mod as any).storage;
  }
  ```
- Substituir as duplicações em (confirmar antes de tocar — pode ter variantes sutis):
  - `quarterlyReportGenerator.ts`
  - `dailyDebriefGenerator.ts`
  - `monthlyReportGenerator.ts`
  - `reportJobRunner.ts`
  - Outras handlers AI-2A/2B que copiaram o padrão.
- **Risco:** Path do import (`../storage` vs `../../storage`) varia. Helper centralizado precisa lidar com isso — fazer absolute via alias `@/server/storage`? No path do server, alias `@/` resolve em frontend; backend não tem alias. Usar `import("@shared/...")` falha. **Decisão:** importar o módulo via `await import("../storage")` no helper **não funciona** porque path é relativo ao helper, não ao caller. **Workaround:** helper aceita um lazy loader callback opcional, OU helper vive em cada subpasta — efetivamente desfaz o DRY. Q-B decide.

**Critério de aceitação (se Q-B = workaround com loader):**
- [ ] Helper centralizado existe.
- [ ] Pelo menos 4 callsites refatorados.
- [ ] Tests passam (não quebra `injectedStorage`).

#### RF-05.3 — `server/emails/templates/_renderReportShell.ts`

- Novo módulo: shell HTML comum (header `<div max-width:600px>` + saudação `Olá ${name}` + CTA button + footer).
- Cada template específico (`weeklyReportEmail`, `monthlyReportEmail`, `quarterlyReportEmail`) injeta **só o miolo** (mental hand block, IRPF block, etc).
- API proposta:
  ```ts
  renderReportShell({
    userName: string,
    subject: string,
    intro: string,                // "Seu relatorio semanal..."
    bodyHtml: string,             // miolo injetado
    ctaLabel: string, ctaUrl: string,
    disclaimer?: string,
    unsubscribeUrl: string,
  }): { html: string, text: string };
  ```
- Cada template chama isso passando seu `bodyHtml` (mental hand list pro weekly, IRPF block pro quarterly, etc).

**Critério de aceitação:**
- [ ] Os 3 templates compartilham o shell — header/CTA/footer idênticos.
- [ ] Snapshot tests dos 3 templates passam após refactor (HTML output equivalente — só o miolo muda).
- [ ] DOMPurify-safe mantido (lesson #16 — escape de campos do user).

**Estimate total RF-05:** ~3h.

---

### RF-06: Perf — `Promise.all` em quarterly gather + cgame inchworm

**Descrição:** Paralelizar awaits sem deps.

**Regras de negócio:**

- **Quarterly gather (`quarterlyReportGenerator.ts` linhas 91-221):** Operações independentes — paralelizar:
  - profile (linha 92-98)
  - perf (linha 102-106)
  - sessions (linha 234-236 — antes do bundle)
  - careerGoals (linha 145-148)
  - mentalHands (linha 127-129)
  - irpfSummary (linha 174-221) — depende de profile (`isBrUser`)
  - cgameSnapshot (linha 110-121) — independente
  
  Agrupar em `Promise.all` os independentes; `irpf` espera profile (`Promise.all` em duas waves).

- **`cgameAggregator.getInchwormSeries` (linhas 122-135):** 6 chamadas seriais → `Promise.all(monthRanges.map(r => aggregateCgameForPeriod(...)))`.

**Critério de aceitação:**
- [ ] Wall-clock do quarterly gather (sem LLM) reduzido em >30% num teste com fixture realista (6 fetches de ~50ms cada → ~150ms vs ~300ms serial).
- [ ] `getInchwormSeries` wall-clock reduzido em >50% (6 awaits → 1 wave).
- [ ] Comportamento funcional idêntico (mesmos valores em `cgameSnapshot`, `careerGoalsProgress` etc).
- [ ] Erros isolados: se `mentalHands` falhar, `careerGoalsProgress` ainda popula. Usar `Promise.allSettled` ou try/catch granular.

**Estimate:** ~2h.

---

### RF-07: ADR-174 + diagramas

**Descrição:**

- **ADR-174 — AI-3 cleanup wiring decisions:** `Docs/architecture/decisions/174-ai-3-cleanup-wiring.md` Michael Nygard format. Documenta:
  - Decisão 1: substituir stubs `shared/fx/{bcb,frankfurter}Client.ts` pelos adapters `server/services/fx/adapters/*`. Contexto: stubs `[]` faziam `getAveragePtaxForRange` throw `no_fx_data` sempre. Consequência: IRPF summary funcional pra users BR.
  - Decisão 2: chamar LLM real no `quarterlyReportGenerator` com paridade monthly. Contexto: stub `degradedReason='quarterly_llm_pending'`. Consequência: custo ~$0.25/Q/user; budget admin metrics passam a refletir.
  - Decisão 3: persistir `cgameRecent` em `users.ai_structured_profile`. Contexto: snapshot só vivia em runtime; Coach chat não tinha acesso histórico. Consequência: profile cresce ~150 bytes/user; cache invalidation pelo `updateAiStructuredProfile`.
  - Decisão 4: `enqueueQuarterlyReportJobsTick` migrado para `listUsersForCron`. Trade-off: perde async iterator pattern (paginação implícita), mas filtro SQL é mais barato.

- **Diagrama 1** — `Docs/architecture/diagrams/coach-ai-3/quarterly-llm-sequence.mermaid`:
  ```
  sequenceDiagram
    participant Cron as enqueueQuarterlyReportJobsTick
    participant Job as report_jobs
    participant Proc as processReportJobsTick
    participant Gen as quarterlyReportGenerator
    participant Sum as reportSummarizer (Haiku)
    participant Sonnet as Anthropic SDK (Sonnet 4.6)
    participant DB as reports table
    Cron->>Job: INSERT 'quarterly' (dia 1 jan/abr/jul/out, 7h local, opt-in)
    Proc->>Gen: generateQuarterlyReport(userId, periodStart, periodEnd)
    Gen->>Gen: Promise.all(profile, perf, sessions, careerGoals, mentalHands, cgame)
    Gen->>Gen: isBrUser? gather irpfSummary (FX cascade real)
    Gen->>Sum: maybeSummarizeBundle(rawBundle) [>20K chars]
    Sum-->>Gen: { bundle: summarized, summarizerModelUsed: 'haiku' }
    Gen->>Sonnet: messages.create(model='sonnet-4-6', system=prompt, user=bundle)
    Sonnet-->>Gen: { content: parsed JSON, usage: {...} }
    Gen->>Gen: mapToContent(parsed, bundle) — populate header/comparison/insights/etc
    Gen->>DB: persistReport({ content, markdown, status:'ready', model, cost })
  ```

- **Diagrama 2** — `Docs/architecture/diagrams/coach-ai-3/fx-cascade-real-sequence.mermaid`:
  ```
  sequenceDiagram
    participant Caller as quarterlyReportGenerator / computeIrpfSummary
    participant Cascade as fxCascade.getAveragePtaxForRange
    participant Cache as in-memory Map (24h TTL)
    participant BCB as bcbPtaxAdapter.fetchTimeseriesBrl
    participant Frank as frankfurterAdapter.fetchTimeseries
    Caller->>Cascade: getAveragePtaxForRange('2026-01-01','2026-03-31')
    Cascade->>Cache: lookup
    alt cache hit
      Cache-->>Caller: avg (number)
    else cache miss
      Cascade->>BCB: fetchTimeseriesBrl(from, to)
      alt BCB returns FxRow[]
        BCB-->>Cascade: [{currency:'BRL', date, ratePerUsd, source:'bcb_ptax'}, ...]
        Cascade->>Cache: SET avg = mean(ratePerUsd)
        Cache-->>Caller: avg
      else BCB throw FxFetchError OR []
        Cascade->>Frank: fetchTimeseries(from, to, ['BRL'])
        alt Frank returns FxRow[]
          Frank-->>Cascade: [{currency:'BRL', date, ratePerUsd, source:'frankfurter'}, ...]
          Cascade->>Cascade: filter currency==='BRL'
          Cascade->>Cache: SET avg
          Cache-->>Caller: avg
        else Frank empty/throw
          Cascade-->>Caller: throw 'no_fx_data'
        end
      end
    end
  ```

**Critério de aceitação:**
- [ ] ADR-174 commited (`accepted`).
- [ ] 2 diagramas Mermaid válidos (mermaid-cli render sem erro).
- [ ] CLAUDE.md §10 atualizado com nota de "AI-3 cleanup SHIPPED" após merge.

**Estimate:** ~1h.

---

## Requisitos Não-Funcionais

- **Performance:** Quarterly gather wall-clock < 1.5s (sem LLM). LLM call mantém budget atual (~10-30s p95 normal pra Sonnet 4.6 com 4K tokens).
- **Custo:** Quarterly LLM real ~$0.25/Q/user (admin pode validar via `/api/admin/coach/report-cost-metrics` após primeira execução).
- **Idempotência:** `updateCgameRecent` é idempotente (merge); `fxCascade` cache 24h evita refetch.
- **Backward compat:** Reports já gerados em prod com `degradedReason='quarterly_llm_pending'` continuam válidos (não regenerar). Próximo quarterly automático (1/jul/2026 7h) cai no novo path.
- **Disponibilidade:** Sem `ANTHROPIC_API_KEY` ou sem rede para Anthropic → quarterly cai em `degraded='no_anthropic_key'` (não throw). FX adapters offline → `no_fx_data` em `irpfSummary` (degraded flag, não breaks o relatório).

---

## Endpoints Previstos

Nenhum endpoint HTTP novo. Mudanças internas só em geradores/storages.

---

## Modelos de Dados Afetados

### `users.ai_structured_profile` (JSONB — sem ALTER TABLE)

Adiciona campo opcional `cgameRecent`:
```ts
cgameRecent?: {
  aPct: number; bPct: number; cPct: number;
  sampleSize: number;
  confidence: 'high'|'medium'|'low';
  period: { start: string; end: string };
  updatedAt: string;
} | null;
```

JSONB schemaless → **sem migration SQL**. Só atualiza `AiStructuredProfile` interface + `normalizeAiStructuredProfile`.

---

## Integrações Externas

Nenhuma nova. Reusa:
- **Anthropic SDK** — `claude-sonnet-4-6` + `claude-haiku-4-5-20251001` (já em prod via monthly).
- **BCB PTAX OData** + **Frankfurter API** — já em prod via Sprint FX-1 (refresh de FX rates panel).

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Quarterly gera com LLM real, todas as seções narrative populadas, status='ready'.
- [ ] FX cascade BCB retorna 60 rates → avg correto.
- [ ] cgame snapshot persistido no profile após quarterly.

### Validação de Input
- [ ] `getAveragePtaxForRange` com `from > to` → throw ou retorna `no_fx_data` (decisão Q-F).
- [ ] `updateCgameRecent` com shape inválido (`aPct: 'abc'`) → normalizer rejeita.

### Regras de Negócio
- [ ] Quarterly enqueuer só enfileira pra users com `subscription_plan IN ('trial','active','admin')`.
- [ ] LLM error 3x + `failSoft=true` → `degraded`, não throw.
- [ ] BCB empty → fallback Frankfurter.
- [ ] BCB throw `FxFetchError` → log + fallback Frankfurter.

### Edge Cases
- [ ] Trimestre 1/jan: cobre Q4 do ano anterior (out-dez/year-1).
- [ ] User BR sem `country` mas com `timezone='America/Sao_Paulo'` → `isBrUser` true.
- [ ] Promise.all com 1 falha isolada → demais campos populam (Promise.allSettled).
- [ ] Cache hit `getAveragePtaxForRange` → não chama adapters.
- [ ] `cgameRecent` no profile + outros campos preexistentes → merge raso preserva.

---

## Fora de Escopo

Listado explicitamente para o Implementer NÃO ampliar:

- **Banners verbosos cleanup** em ~12 arquivos (founder pediu defer).
- **fxCascade Redis** — Map in-memory por replica fica.
- **UI editor career goals** (`CareerGoalsPanel`) — refactor visual fica pra AI-3.1.
- **`computeIrpfSummary` LLM** — continua determinístico.
- **Quarterly hourly tick consolidation** com weekly/monthly enqueuer — manter 2 funções separadas (não vale o risco de regressão).
- **Migration de schema** — RF-03 usa JSONB existente, sem ALTER TABLE.
- **`weeklyReportGenerator`/`dailyDebriefGenerator` LLM tweaks** — só quarterly muda.
- **Trigger `updateCgameRecent` no monthly** — defer pra AI-3.1.
- **Atualizar coach context com bloco "## C-game recente"** — só estende se já existir o bloco; criar do zero = fora.
- **Renomear/mover `shared/fxCascade.ts` → `server/services/fxCascade.ts`** — só se Q-A locked decidir mover; default = manter em `shared/`.

---

## Dependências

- AI-2B SHIPPED (commit `3b543370`).
- Sprint FX-1 SHIPPED (adapters em `server/services/fx/adapters/` funcionais).
- Sem migration nova (JSONB schemaless em RF-03).

---

## Notas de Implementação

- **Ordem sugerida:** RF-04 (1h, trivial) → RF-05 (3h, refactor sem comportamento novo) → RF-02 (3h, FX wire) → RF-03 (2h, cgame persist) → RF-06 (2h, perf) → RF-01 (6h, LLM real — mais arriscado, deixa por último) → RF-07 (1h, docs).
- **Lessons críticas a aplicar:**
  - #5/#35 (Anthropic ctor try/catch) — já aplicado, manter.
  - #6 (FX → USD normalize) — verificar que `byCurrency` no `irpfSummary` segue convenção USD primeiro.
  - #9 (log antes do fallback) — aplicar no `fxCascade`.
  - #34 (injectedStorage) — RF-05.2 mantém esse padrão; helper é só um pequeno wrapper.
  - #36 (lazy schema import) — `aiStructuredProfile.ts` já faz; RF-03 amplia sem mudar.
- **`/simplify` foco:** após implementer, varrer:
  - Reusar `computeCost` shared (não duplicar `computeQuarterlyCost`).
  - Consolidar `callQuarterlyLlm` e `callMonthlyLlm` em `reportGeneratorShared.ts` se sintaticamente possível.
  - Validar que `resolveStorage` helper realmente reduziu duplicação (não introduziu indireção pior).

---

## Perguntas Abertas (Founder)

| Q | Pergunta | Recomendação default | Impacto |
|---|---|---|---|
| **Q-A** | `shared/fxCascade.ts` permanece em `shared/` ou move para `server/services/fxCascade.ts`? | **Manter em `shared/`** — evita quebrar import paths em testes existentes (`fxCascade.test.ts` já está com path atual). | Touch surface pequeno se manter; se mover, ~5 callers + 1 test path. |
| **Q-B** | `resolveStorage` helper viável dado o problema do path relativo (`../storage` muda de subpasta)? | **(a) Aceitar duplicação** — não vale a indireção. Cancelar RF-05.2. **(b) Helper aceita loader callback** (`resolveStorage(injected, () => import('../storage'))`) — feio mas funciona. **(c) Padronizar todos os callers em `await import("@/storage")` via alias** — exige config tsconfig. | (a) cancela ~1h de trabalho; (b) sem ganho real de DRY; (c) muda build config. Recomendado: **(a)**. |
| **Q-C** | RF-01 — `callQuarterlyLlm` duplicado do `callMonthlyLlm` inicialmente, consolidar no `/simplify`? OU consolidar de cara? | **Duplicar primeiro, consolidar no `/simplify`** — separa risco (LLM novo prompt vs refactor DRY). | Risco baixo de regressão monthly se separar. |
| **Q-D** | RF-03 — trigger `updateCgameRecent` só no quarterly OU também no monthly (e/ou no daily debrief)? | **Só quarterly nesta sprint** — monthly/daily deferred AI-3.1. | Reduz surface area; quarterly = 1x/3 meses, frequência baixa basta pra Coach contexto. |
| **Q-E** | RF-01 — Custo alvo $0.25/Q/user OK? Sonnet 4.6 trimestre = bundle maior + 4K tokens output. | **Aceitar $0.25** — quarterly é 1x/3 meses, $1/ano/user em Pro+. Aceitável. | Se cap mais agressivo, reduzir `max_tokens` ou usar Sonnet 3.7. |
| **Q-F** | RF-02 — `getAveragePtaxForRange('2026-03-31', '2026-01-01')` (from > to) → comportamento esperado? | **Manter atual (delega ao adapter)** — BCB OData provavelmente retorna vazio → fallback Frankfurter → também vazio → `no_fx_data`. Não validar input no `fxCascade`. | Simplifica `fxCascade`. Caller é interno (gerador), invariante já garante from <= to. |

---

## Métricas de Sucesso

- **Quarterly Report:** Próxima execução automática (1/jul/2026 7h) gera 100% `status='ready'` para users opt-in (vs 0% hoje).
- **IRPF summary:** Próxima execução para users BR popula `profitBrl` numérico em 100% dos casos (vs 0% hoje).
- **Custo:** `/api/admin/coach/report-cost-metrics` mostra `quarterly_cost_usd > 0` após primeira execução.
- **Sem regressão:** Suíte coach (1172/1172) + sprint (182/182) continuam verdes. `tsc 0`.
- **DRY:** ~250 linhas a menos no diff total (estimate; depende de Q-B).

---

## Follow-ups (pós-merge)

Defer pra AI-3.1 ou outras sprints:

- Migration de schema (se quisermos campo dedicado `users.cgame_recent` em vez de JSONB).
- Trigger `updateCgameRecent` no monthly + daily.
- LLM real no `computeIrpfSummary` tool.
- Redis cache para `fxCascade` (multi-replica deploy).
- Banner verbosos cleanup (~12 arquivos).
- UI polish `CareerGoalsPanel` (defer audit UX).
- Webhook bounce/unsubscribe via SES/SendGrid (substituir Gmail SMTP quando volume crescer).
- Quarterly enqueuer + Weekly/Monthly enqueuer unificados em 1 função.
- Trigger `mark off_day` quando user marca "skipped" em warm-up (cross-feature wiring).

---

## Testes-Chave (preview red phase para test-writer)

### RF-01 Quarterly LLM
- `tests/coach/quarterlyReportGenerator.llm.test.ts`
  - Sem `ANTHROPIC_API_KEY` → `status='degraded'`, `degradedReason='no_anthropic_key'`.
  - Mock `client.messages.create` retorna JSON válido → `content.header.summaryLine` é o do mock.
  - Mock retorna parsed inválido (string em vez de object) → `degraded`, `degradedReason='llm_parse_error'`.
  - Bundle > 20K chars → `summarizerModelUsed='claude-haiku-4-5-20251001'` + payload final do Sonnet usa bundle sumarizado.
  - Mock throw 3x + `failSoft=true` → `degraded='llm_failed_3x'`.
  - `cost_usd_estimate` > 0 quando `usage.input_tokens > 0`.
  - `careerGoalsProgress[*].narrative` populado do LLM (não null).
  - `insights[]` com 3-5 entries quando LLM retorna 5.

### RF-02 FX cascade real
- `tests/shared/fxCascade.real.test.ts` (renomeia/amplia existente)
  - `vi.mock("../../server/services/fx/adapters/bcbPtaxAdapter", { fetchTimeseriesBrl: vi.fn().mockResolvedValue([{currency:'BRL', date:'2026-01-02', ratePerUsd: 5.1, source:'bcb_ptax'}, {date:'2026-01-03', ratePerUsd: 5.2, ...}]) })` → `getAveragePtaxForRange('2026-01-01','2026-01-31')` retorna `5.15`.
  - BCB throw `FxFetchError` → fallback Frankfurter.
  - Ambos vazios → throw `no_fx_data`.
  - Cache hit 2ª chamada com mesmas datas.
  - Filtro `currency==='BRL'` no resultado Frankfurter (se adapter retorna BRL+EUR mistos).

### RF-03 cgame persist
- `tests/storage/aiStructuredProfile.cgame.test.ts`
  - `updateCgameRecent(userId, snapshot)` → row tem `cgameRecent` JSONB.
  - 2ª chamada sobrescreve (não append).
  - Shape inválido (`aPct: 'abc'`) → `normalizeAiStructuredProfile` omite.
  - `getAiStructuredProfile` retorna `cgameRecent` no shape esperado após update.
  - Merge raso preserva outros campos (`metas`, `nivel`, etc).

### RF-04 enqueuer consistency
- `tests/coach/reportJobRunner.quarterly-enqueuer.test.ts`
  - Mock `storage.listUsersForCron` retorna 3 users (1 trial, 1 active, 1 admin) → 3 jobs enfileirados (em 1/abr 7h local).
  - Mock retorna `[]` → 0 jobs.
  - User com plano `expired` no mock NÃO está no return (já filtrado pelo SQL).
  - `iterateUsersWithTimezone` NÃO é chamado.

### RF-05 DRY
- `tests/shared/brTimezones.test.ts`
  - 4 casos do critério de aceitação RF-05.1.
- Snapshot tests dos 3 email templates antes/depois do refactor (output equivalente).

### RF-06 Perf
- `tests/coach/cgameAggregator.parallel.test.ts`
  - `getInchwormSeries` chama `listWarmupRitualsForRange` em paralelo (validar via `mock.calls` ordering e tempo).
- Quarterly gather: medir tempo total com fixtures síncronos artificiais (`await sleep(100)` em cada storage method) → wall-clock < soma dos sleeps.

### RF-07 ADR
- Sem testes automatizados. Manual review do markdown.

---

**Total estimate:** ~18h (1 sprint focado, sem features novas).

**Pipeline TDD:** spec → architect → test-writer → implementer → /simplify → reviewer → commit.
