# ADR-159: AI-1C — Daily Debrief (enqueue event-driven pós-`session.completed`) + Monthly Report (regra dia 1 7h tz no enqueuer hourly; comparativos vs mês -1/6m/12m; variância heurística; leaks resolvidos/novos; progresso das metas) + tier gating estrito (`getReportTier` canônico, corrige o `PRO_PLANS` bug latente do AI-1B) + sumarização hierárquica Haiku→Sonnet + generalização do gerador (helpers compartilhados, despacho por `report_type`)

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1C (`Docs/specs/sprint-ai-1c.md`, RF-01/02/03/04/05/06/07/10)

## Decision owner
system-architect (founder validou: Q2 relatórios opt-in p/ Trial + Pro+; Q5 Free nunca recebe; Q3 sonnet 4.6 + haiku 4.5 p/ sumarização; Q6 mental só warm-up; Q7 in-app only; + 4 decisões diretas do AI-1C: cap daily 1/dia agregando sessões; enqueue do daily respeita `COACH_NUDGES_ENABLED`; `getMonthlyPerformanceSeries` à discrição do architect; janelas de comparativo = mês -1 + 6m + 12m).

## Related
- Depende de: ADR-155 (tabelas `report_jobs`/`reports` + job runner — estende o enqueuer/processor), ADR-156 (aposentadoria dos 2 crons de segunda — o `runBackfills` agora também roda no monthly), ADR-157 (timeline + render do hub — o `ReportView` generaliza o `WeeklyReportView`), ADR-152 (kill switch global `COACH_NUDGES_ENABLED` — gateia também o Daily/Monthly + o enqueue do daily), ADR-151 (perfil estruturado — `metas`/`focoDoMes`/`tomPreferido`/`nivel` alimentam o `goalsProgress` e os follow-ups), ADR-150 (hub `/coach-ai`), ADR-148 (agente único), ADR-146 (write tools confirm always — CTAs do relatório não auto-executam), ADR-144 (cron advisory lock), ADR-021/ADR-019 (modelo Coach canônico via env + prompt caching).
- Reusa: `getLocalHour`/`localCivilDate` (`server/coach/timezone.ts` + `reportJobRunner.ts`), `listUsersForCron` (`storage.ts`), `resolveUserTier`/`clearUserTierCache` (`server/coachAccess.ts`), `withAdvisoryLock` (ADR-144), `getPerformanceByPeriod`/`getDashboardStats`/`getAnalyticsBy*` (custom range `'YYYY-MM-DD to YYYY-MM-DD'` + presets `last_6_months`/`last_12_months` — confirmado no código), `getVarianceVsExpected` (retorna `null` hoje — heurística), `shared/primedopeDefaults.ts`, `walletService.getConsolidatedBalance`/`getBankrollSnapshots`/`listWalletTransactionsByUser`, `listWarmupRituals`, `detectLeaks` (`server/coachLeakDetection.ts`), `coach_leak_focus` + `findActiveLeakFocusList` + `findActiveLeakFocus`/`queryStatByKey` (a mesma lógica de `verify_leak_progress`), `getAiStructuredProfile` (`server/storage/aiStructuredProfile.ts`), `getGrindSessions`/`getSessionTournaments`/`getGrindSession` + `server/services/grindSessionHistory.ts`, `server/coachMemory.ts` (`getMemoryModel` + `getAnthropicClient` — pattern de sumarização Haiku), `coachSystemBuilder.ts` (`GRINDFY_AI_BASE`), `CITATIONS_RULES`, `recommendLessonForUser`/`coach_lesson_recommendations`, `generateWeeklyStudyPlan`/`study_weekly_plans`.
- Sucessor de: ADR-155 (Weekly Report — esta ADR estende o modelo para Daily + Monthly e corrige o bug de tier gating). ADR-160 (`bulk_query_dimensions`) e ADR-161 (follow-ups inteligentes) cobrem os RFs 09 e 08.
- Diagramas: `Docs/architecture/diagrams/coach-ai-1c/{daily-debrief-flow,monthly-report-flow,report-generator-structure,tier-gating-flow,hierarchical-summarizer-layers}.mermaid`.

---

## 1. Contexto

O AI-1B (ADR-155/156/157) entregou a infra de relatórios: tabelas `report_jobs` (fila — `status` pending/running/done/failed/skipped, `attempts`, `next_attempt_at` backoff, `timezone` snapshot, `subscription_plan_at_enqueue` snapshot, `report_type` **varchar(16) livre**, `enqueued_by` varchar livre, UNIQUE `(user_id, report_type, period_start)`) + `reports` (`content` JSONB `ReportContent` + `markdown`, `model_used`, `summarizer_model_used`, `cost_usd_estimate`, tokens, `status` ready/degraded, `degraded_reason`, `read_at`, `dismissed_at`, UNIQUE idem); `reportJobRunner.ts` (`enqueueWeeklyReportJobsTick` cron `0 * * * *` + `processReportJobsTick` cron `*/15 * * * *`; claim atômico; `withAdvisoryLock`; retry exponencial 15min/1h/4h; fail-soft determinístico após 3 falhas → `status='degraded'`, job `done` nunca `failed`; gated por `COACH_NUDGES_ENABLED`); `weeklyReportGenerator.ts` (bundle de métodos reais, `gatherBundle`, sumariza com Haiku "se grande" — hoje **stub**, `runBackfills` idempotentes, sonnet 4.6 via `callLlm` com `new AnthropicCtor` try/catch, `ReportContent` 8 seções, `markdown`, `sanitizeHref` whitelist de rotas Wouter, `dataSufficiency='low'`); `reportStorage.ts` (CRUD da fila + dos reports); endpoints `/api/coach/timeline` + `/api/coach/reports/:id`; hub `/coach-ai` aba "Relatórios e avisos" = timeline real; `userCoachPreferences.report_weekly_enabled`.

O AI-1C precisa fechar a Fase 1 do plano de IA com 3 frentes que tocam essa infra:

1. **Daily Debrief** — relatório curto e barato (~$0.013) gerado depois que o jogador finaliza uma sessão de grind no `/grind-live`. **Não existe event bus formal** — o gatilho tem que ser plugado em `handleUpdateGrindSession` (PUT `/api/grind-sessions/:id`, no bloco `status === 'completed'`), best-effort, sem bloquear a resposta do PUT, e **não pode gerar o relatório síncrono** (só enfileira; o processor do AI-1B gera depois). O daily usa `session_tournaments` da(s) sessão(ões) do dia (§6.1: a regra "filtra `grind_session_id IS NULL`" aplica-se ao histórico/dashboard, não ao detalhe da sessão). Cap **1/dia por user** (a UNIQUE `(user_id,'daily',period_start=data)` já garante isso; o gerador agrega as sessões do dia — founder).

2. **Monthly Report** — relatório mensal automático (~$0.11, sonnet 4.6 + sumarização Haiku). Gatilho = regra "dia 1 do mês, 7h no fuso do user" no enqueuer hourly do AI-1B (`getLocalHour===7 && civilDay===1`); `period_start` = 1º dia do mês anterior, `period_end` = último dia do mês anterior. Conteúdo: as 5 seções do weekly (volume, bankroll, selection, estudos, mental) + comparativos vs mês -1/6m/12m + análise de variância heurística (`getVarianceVsExpected` retorna `null` hoje — TODO PrimeDope) + leaks resolvidos/novos (`coach_leak_focus` × `detectLeaks`, sem tabela histórica nova) + progresso das metas (`AiStructuredProfileMeta` texto livre — o LLM interpreta) + 3-5 insights data-grounded + plano do próximo mês.

3. **Tier gating estrito** — formalizar quem recebe qual relatório (Free nunca; Trial + Pro/Premium + Admin opt-in) **e corrigir um bug latente do AI-1B**: `reportJobRunner.ts` usa `PRO_PLANS = new Set(['pro','premium','admin'])` + `listUsersForCron("subscription_plan IN ('pro','premium')")`, mas `users.subscription_plan` é `'trial' | 'active' | 'expired' | 'admin'` — **nunca** `'pro'`/`'premium'` (a distinção pro/premium vem de `user_subscriptions` JOIN `subscription_plans` via `resolveUserTier`). Consequência hoje: o filtro `IN ('pro','premium')` só pega `admin`, e mesmo se um user `'active'` chegasse ao processor, `getUserSubscriptionPlan` (lê `users.subscriptionPlan` cru) retornaria `'active'`, que `PRO_PLANS` rejeita. **Hoje nenhum user real recebe o Weekly Report exceto admin.** Não-bloqueante (relatórios são opt-in default false + cron só roda em prod), mas tem que ser corrigido — o tier gating estrito **é** esse fix.

Frentes auxiliares deste sprint, cobertas por ADRs próprios: **sumarização hierárquica Haiku→Sonnet** (RF-07 — `hierarchicalSummarizer.ts`; substitui o stub do AI-1B; coberta aqui na seção 5 porque o gerador a invoca), **`bulk_query_dimensions`** (RF-09 — ADR-160), **follow-ups inteligentes** (RF-08 — ADR-161).

A pergunta central desta ADR: **(a)** o schema (2 colunas booleanas em `user_coach_preferences`; `report_type` continua varchar livre; `ReportContent` v2 com campos opcionais); **(b)** o gatilho do Daily (onde plugar, best-effort, fire-and-forget, respeita o kill switch); **(c)** o gatilho do Monthly (regra dia 1 7h tz no enqueuer hourly); **(d)** o tier gating canônico (`getReportTier` que inclui Trial; como o enqueuer itera os users certos; downgrade → `skipped`); **(e)** a estrutura dos geradores (helpers compartilhados + 3 generators + `processReportJobsTick` despacha por `report_type`); **(f)** a sumarização hierárquica (camadas + threshold + modelo + fail-soft); **(g)** o `ReportContent` v2 + render genérico; **(h)** fail-soft, custos, idempotência, timezone.

### Restrições

- **`shouldSendNudge` é o gate de proatividade — mas relatórios são opt-in** (igual ao AI-1B): controle = opt-in (`report_{daily,monthly}_enabled`) + tier (`getReportTier`) + `COACH_NUDGES_ENABLED`. Relatórios **não** passam pelo `shouldSendNudge` (não têm `cycleKey`/quiet hours — são cards na timeline, não interrupções). O cap diário do Daily substitui a função do daily/hourly cap.
- **Lesson #7 (schema gradual):** as 2 colunas novas são `NOT NULL DEFAULT false` (back-fill trivial — opt-in). `ReportContent.reportType` alargado + campos novos **opcionais** + `schemaVersion` 1→2 (frontend tolera ambos). Nenhuma ALTER em `report_jobs`/`reports`.
- **Lesson #6 (USD):** todos os valores de bankroll/variância/comparativo no `content` são normalizados para USD antes de comparar com thresholds USD (`getCurrencyForSite`/`convertToNativeCurrency`/`usdConversionRates` no caminho do daily; `getConsolidatedBalance` já em USD para o monthly).
- **Lesson #9 (logar antes de fallback / safe-deny / try-catch granular):** erro do LLM (sonnet **ou** Haiku) nunca propaga pra fora do gerador (`console.error` + cai pro determinístico/truncado); erro de storage em check de elegibilidade → safe-deny; `try/catch` por user no enqueuer; **o enqueue do daily em `handleUpdateGrindSession` nunca quebra a resposta do PUT**.
- **Lesson #5/#35 (`new AnthropicCtor` mock):** `new AnthropicCtor(...)` em try/catch com fallback factory — **sonnet E haiku** (o sumarizador também usa `new`).
- **Lesson #10 (DRY de prompts E de helpers):** prompts num módulo único por tipo (`server/coach/prompts/{dailyDebrief,monthlyReport}.ts`); helpers que tocam o `ReportContent` (`persistReport`, `sanitizeHref`, `computeCost`, `callLlm`, `renderMarkdown`) num módulo compartilhado — não duplicar.
- **Lesson #34 (storage injetável):** todos os geradores + `enqueueDailyDebriefForSession` + os helpers aceitam `injectedStorage?`.
- **Lesson #17 (`grep "const X"` antes de declarar variável genérica num handler grande):** vale para `handleUpdateGrindSession` ao plugar o enqueue.
- **CLAUDE.md §6.1:** toda query de histórico no gerador mensal filtra `grind_session_id IS NULL` (reusa métodos que já injetam; queries inline novas adicionam explícito). **Exceção:** o daily usa `session_tournaments` da sessão.
- **ADR-144:** os ticks do report job runner já estão em `withAdvisoryLock`; o claim de job é atômico; o INSERT do daily é `ON CONFLICT DO NOTHING`.
- **Modelo:** `process.env.COACH_MODEL ?? <constante canônica do projeto>` — a mesma fonte do AI-1B (`weeklyReportGenerator.ts` usa `DEFAULT_REPORT_MODEL = "claude-sonnet-4-6"`; o shared exporta uma única `DEFAULT_REPORT_MODEL`). Sumarizador: `process.env.COACH_REPORT_SUMMARIZER_MODEL ?? process.env.COACH_MEMORY_MODEL ?? HAIKU_MODEL_DEFAULT` (a mesma fonte de `coachMemory.ts`).
- **`getReportTier` é um conceito separado — NÃO mudar `resolveUserTier`.** `resolveUserTier` gateia rate limit e tools (Trial → free lá, mantém). `getReportTier` é só para elegibilidade de relatório.
- **Sem tabela nova neste sprint.** Reusa `report_jobs`/`reports`. Sem tabela de "histórico de leaks", sem tabela de "report subscriptions" (o opt-in mora em `userCoachPreferences` — 3 booleanos).
- **Email = AI-2B.** `report_type='quarterly'` fica reservado mas não é despachado (o processor loga `unsupported_report_type` + marca `skipped`).

---

## 2. Decisões

### 2.1 Schema (RF-01) — migração 0068

Migração `0068_report_preferences_daily_monthly.sql`:

| Coluna (em `user_coach_preferences`) | Tipo | Constraints | Notas |
|---|---|---|---|
| `report_daily_enabled` | `boolean` | `NOT NULL DEFAULT false` | opt-in do Daily Debrief (RF-03) |
| `report_monthly_enabled` | `boolean` | `NOT NULL DEFAULT false` | opt-in do Monthly Report (RF-05) |

- **Sem ALTER em `report_jobs`/`reports`:** `report_type` é `varchar(16)` livre (migration 0067, sem CHECK enum no DB; `insertReportJobSchema`/`insertReportSchema` usam `z.string().max(16).default("weekly")` sem `.enum()`) → aceita `'daily'`/`'monthly'` sem mudança. `enqueued_by` é varchar livre → aceita `'session_completed'`. As UNIQUEs `(user_id, report_type, period_start)` cobrem os tipos novos (1 daily por user/dia, 1 monthly por user/mês).
- **TS (não DB) — `shared/schema.ts`:** `ReportContent.reportType` alargado de `"weekly"` para `"weekly" | "monthly" | "daily"`; campos opcionais novos (`comparatives`, `variance`, `leaksDelta`, `goalsProgress`, `followUp`, `sessionSummary` — ver §2.7); `schemaVersion` mantém o campo, valor `2` quando o relatório usa campos novos (frontend tolera 1 e 2).
- **`server/storage/coachPreferences.ts`:** `CoachPreferences` ganha `reportDailyEnabled: boolean` + `reportMonthlyEnabled: boolean` (default `false`); `normalizeCoachPreferences` faz back-fill (`row?.reportDailyEnabled ?? false`); `updateCoachPreferencesSchema` (onde estiver — `server/routes/coach*.ts`) ganha `reportDailyEnabled: z.boolean().optional()` + `reportMonthlyEnabled: z.boolean().optional()`, **mantém `.strict()`** (lesson AI-1A — campos crus de congelamento rejeitados → 400). `buildPrefsResponse` (GET `/api/coach/preferences`) inclui os 2 novos campos no payload.

### 2.2 Tier gating estrito (RF-02) — `getReportTier` canônico, corrige o `PRO_PLANS` bug

**Decisão: novo módulo `server/coach/reportEligibility.ts`** com:

```
getReportTier(user): Promise<'free' | 'eligible'>
  = user.subscriptionPlan === 'trial'
    ? 'eligible'
    : (await resolveUserTier(user)) ∈ {'pro','premium','admin'} ? 'eligible' : 'free'
  // resolveUserTier já cobre admin (role='admin' OU subscriptionPlan='admin') e
  // 'active' → JOIN user_subscriptions. 'trial' → resolveUserTier devolve 'free'
  // hoje; o ramo explícito de 'trial' acima é o que muda a elegibilidade
  // SÓ para relatórios. Tem cache (resolveUserTier já cacheia 30s).

isReportEligible(userId, reportType: 'weekly'|'daily'|'monthly'): Promise<boolean>
  = try {
      const u = await storage.getUserById(userId);   // resolve por user_platform_id → tem subscriptionPlan/role
      if (await getReportTier(u) === 'free') return false;
      const prefs = await getCoachPreferences(userId);
      const key = { weekly: 'reportWeeklyEnabled', daily: 'reportDailyEnabled', monthly: 'reportMonthlyEnabled' }[reportType];
      return prefs?.[key] === true;
    } catch (err) { console.error('report.eligibility.error', { userId, reportType, err }); return false; }  // safe-deny (lesson #9)
```

**Por que um módulo novo e não em `coachAccess.ts`:** `coachAccess.ts` é o módulo de tier do *chat* (rate limit, tools); misturar a noção de "tier elegível para relatório" lá convidaria alguém a estender `resolveUserTier`. `reportEligibility.ts` deixa explícito que é um conceito separado. Importa `resolveUserTier` de `coachAccess.ts` (sem mudá-lo).

**Como o enqueuer itera os users certos.** Hoje `enqueueWeeklyReportJobsTick` faz `listUsersForCron("subscription_plan IN ('pro','premium')")` — só pega `admin` (e às vezes nem isso, dependendo de quem é admin via role). **Decisão: opção (a) — `listUsersForCron("subscription_plan IN ('trial','active','admin')")`** (a whitelist de `listUsersForCron` já aceita esses valores) para ter o **candidate set**, e para cada candidate `isReportEligible(userId, type)` (que internamente faz `getReportTier` → `resolveUserTier` para os `'active'` confirmarem pro/premium via JOIN, e descarta os `'active'` sem subscription = free, além de checar o opt-in). Rejeitada a opção (b) (`storage.listUsersEligibleForReports()` com JOIN) — adiciona um método de storage novo + duplica a lógica de tier que `resolveUserTier` já tem com cache; o candidate set de `'trial'/'active'/'admin'` é pequeno o suficiente para iterar com o cache de 30s de `resolveUserTier`. **Trade-off aceito:** N chamadas a `resolveUserTier` por tick (uma por candidate `'active'`); o cache de 30s + o promise-cache anti-thundering-herd já cobrem isso, e o tick roda 1×/h.

**Revalidação no processamento (downgrade — já existe no AI-1B, atualizada).** O `revalidateEligibility` em `reportJobRunner.ts` hoje compara `subscription_plan_at_enqueue` (ou `getUserSubscriptionPlan`) contra `PRO_PLANS.has(...)` — **substituir** por: revalida o opt-in via `getCoachPreferences` (para o `report_type` certo) + chama `getReportTier` (resolvendo o user via `getUserById`); se virou `free` ou desligou o opt-in entre enfileirar e processar → `status='skipped'`, `last_error='no_longer_eligible'`, nenhum `reports` row. Funciona para weekly/daily/monthly. O `subscription_plan_at_enqueue` continua sendo o snapshot de auditoria; a elegibilidade real é a revalidada.

**Refator do AI-1B:** `isWeeklyReportEligible` em `reportJobRunner.ts` → delega a `isReportEligible(userId, 'weekly')` (corrige o bug — agora Trial passa). `PRO_PLANS` removido de `reportJobRunner.ts`.

**Tabela de elegibilidade final** (vale para Weekly + Daily + Monthly):

| `getReportTier` | Critério | Daily | Weekly | Monthly |
|---|---|---|---|---|
| `'eligible'` | `subscriptionPlan === 'trial'` | ✅ opt-in | ✅ opt-in | ✅ opt-in |
| `'eligible'` | `subscriptionPlan === 'active'` + plano "pro" em `user_subscriptions` | ✅ opt-in | ✅ opt-in | ✅ opt-in |
| `'eligible'` | `subscriptionPlan === 'active'` + plano "premium" | ✅ opt-in | ✅ opt-in | ✅ opt-in |
| `'eligible'` | `role === 'admin'` OU `subscriptionPlan === 'admin'` | ✅ opt-in (default false — admin liga) | ✅ opt-in | ✅ opt-in |
| `'free'` | `subscriptionPlan ∈ {'free','expired',''}` sem subscription ativa; `'active'` sem subscription = free | ❌ nunca | ❌ nunca | ❌ nunca |

UI de Preferências (`CoachPreferencesPanel`): mostra os 3 toggles só para `getReportTier === 'eligible'`; Free vê linha desabilitada ("disponível no plano Pro/Trial") ou nada. Defesa em profundidade: se um Free setar `true` via API direta, o enqueuer/processor revalida e não enfileira / `skipped`.

### 2.3 Gatilho do Daily Debrief (RF-03.1) — event-driven, best-effort, em `handleUpdateGrindSession`

**Helper novo `server/coach/jobs/enqueueDailyDebrief.ts` → `enqueueDailyDebriefForSession({ userId, sessionId, now, injectedStorage? })`:**
1. Se `COACH_NUDGES_ENABLED === 'false'` → no-op (founder Q: o enqueue **respeita o kill switch**; relatórios contam como proatividade).
2. `isReportEligible(userId, 'daily')` — se `false`, no-op.
3. Resolve a sessão (`storage.getGrindSession(sessionId)`) para obter a data (`completedAt` / `date` / `startTime`) e calcula `periodStart = ymd(completedAt no fuso do user)` (`localCivilDate` já existe; o `civilUtc.getUTCDate()` dá o dia). `periodEnd = periodStart` (o debrief cobre 1 dia; se houver várias sessões nesse dia, o gerador agrega — RF-03.5).
4. Pré-check barato de cap (`storage.getReportForPeriod(userId, 'daily', periodStart)` — se já existe um report daily desse dia, no-op; a UNIQUE já garantiria, mas evita o INSERT desnecessário).
5. `storage.insertReportJobOnConflictDoNothing({ userId, reportType: 'daily', periodStart, periodEnd, scheduledFor: now, status: 'pending', maxAttempts: 3, timezone: <user.timezone>, subscriptionPlanAtEnqueue: <user.subscriptionPlan>, enqueuedBy: 'session_completed' })`.

**Onde chamar (RF-03.1):** em `handleUpdateGrindSession` (PUT `/api/grind-sessions/:id`), **dentro** do bloco `if (req.body?.status === 'completed')`, **depois** do `stopService.evaluateStops` e **depois** do `res.status(200).json(...)` — ou seja: a resposta do PUT sai primeiro, e o enqueue é fire-and-forget. **Decisão: `void enqueueDailyDebriefForSession({ userId, sessionId: id, now: new Date() }).catch((err) => console.error('daily.enqueue.error', { sessionId: id, userId, err: err?.message }))`** — não-bloqueante, nunca lança, nunca atrasa a resposta. O handler já tem `userId` (`userIdOfReq(req)`) e `id` (`req.params.id`); a data da sessão é resolvida dentro do helper (não confiar em `req.body` — pode não ter `completedAt`). Alternativa (um `await` rápido envolto em try/catch, antes do `res.json`) rejeitada: adiciona latência ao PUT (mesmo que mínima) e o spec é explícito que a resposta sai imediatamente.
- **NÃO gera o relatório síncrono** — só insere um `report_jobs` row; o `processReportJobsTick` (já roda a cada 15min) gera depois via `generateDailyDebrief`.
- **Idempotência:** UNIQUE `(user_id, 'daily', periodStart)` → 1 daily job por user por dia. 2ª sessão no mesmo dia → 2º enqueue é no-op (ON CONFLICT DO NOTHING). O gerador, ao processar, agrega **todas** as sessões do dia. **Decisão de regen quando a 2ª sessão chega depois do report já gerado: opção (b) com regen** — o `enqueueDailyDebriefForSession`, se o pré-check (passo 4) achar que já existe um report daily de hoje, faz `storage.insertReportJobOnConflictDoNothing` mesmo assim (ON CONFLICT DO NOTHING — não cria nada), **mas** se o report job ainda existir como `done` e quisermos regerar, o caminho mais simples e seguro é **não regerar** (opção (a)): o daily reflete "as sessões que existiam quando o processor rodou". Critério mínimo do spec: nunca mais de 1 daily report por user por dia, e o conteúdo cobre as sessões do dia que existiam quando processou. **Escolhido: (a) sem regen** — KISS; o ganho de "report reflete o dia inteiro" não vale a complexidade de re-armar o job + UPSERT; se o jogador finaliza 2 sessões em sequência, normalmente o processor (15min) ainda não rodou e pega as 2.
- **`COACH_NUDGES_ENABLED='false'`:** o enqueue é no-op (passo 1) — consistente com "relatórios = proatividade". (Se a flag estiver on no enqueue mas off depois, o processor não roda e o job fica `pending`; quando volta, processa.)

### 2.4 Gatilho do Monthly Report (RF-05.1) — regra dia 1 7h tz no enqueuer hourly

**Decisão: estender `enqueueWeeklyReportJobsTick`** (não um tick irmão) — ele já itera os users e checa o fuso; adicionar a regra do monthly no mesmo loop economiza 1 cron + 1 passada. Renomeado mentalmente para "o enqueuer de relatórios" (o nome da função pode ficar — back-compat de testes — ou virar `enqueueReportJobsTick`; o spec não obriga; **decisão: manter o nome `enqueueWeeklyReportJobsTick`** para não quebrar a registração do cron / os testes do AI-1B, mas internamente ele enfileira weekly **e** monthly).

Dentro do loop de users (já filtrado por `listUsersForCron("subscription_plan IN ('trial','active','admin')")` — §2.2):
- **Weekly** (existente, atualizado): `getLocalHour(now, tz) === 7 && localCivilDate(now, tz).weekday === 1` (segunda) && `isReportEligible(userId, 'weekly')` → `insertReportJobOnConflictDoNothing({ reportType: 'weekly', periodStart: <segunda da semana que acabou>, periodEnd: <domingo>, ... enqueuedBy: 'cron_enqueuer' })`.
- **Monthly** (novo): `getLocalHour(now, tz) === 7 && localCivilDate(now, tz).civilUtc.getUTCDate() === 1` (dia 1 do mês no fuso) && `isReportEligible(userId, 'monthly')` → `periodStart` = 1º dia do mês anterior (aritmética com `Date.UTC`: se `civilUtc` é 01/jan/Y, o mês anterior é dez/Y-1 → `periodStart='Y-1-12-01'`, `periodEnd='Y-1-12-31'`; se for 01/mar, mês anterior é fev → `periodEnd='Y-02-28'` ou `'Y-02-29'`; se for 01/mai, `periodEnd='Y-04-30'`) → `insertReportJobOnConflictDoNothing({ reportType: 'monthly', periodStart, periodEnd, scheduledFor: now, status: 'pending', timezone: tz, subscriptionPlanAtEnqueue: u.subscriptionPlan, enqueuedBy: 'cron_enqueuer' })`.
- **Helper de aritmética de mês anterior:** `previousMonthBounds(civilUtc: Date): { periodStart: string; periodEnd: string }` — `const y = civilUtc.getUTCFullYear(), m = civilUtc.getUTCMonth(); const prevM = m === 0 ? 11 : m - 1; const prevY = m === 0 ? y - 1 : y; const start = new Date(Date.UTC(prevY, prevM, 1)); const end = new Date(Date.UTC(prevY, prevM + 1, 0)); /* dia 0 do mês seguinte = último dia do mês */ return { periodStart: ymd(start), periodEnd: ymd(end) }`. Vira do ano e fevereiro (28/29) cobertos por `Date.UTC` nativo.
- **Idempotência:** UNIQUE `(user_id, 'monthly', periodStart)` → 1 monthly job por user por mês. Rodar de hora em hora cobre todos os fusos com granularidade de 1h (mesmo padrão do weekly).
- **`localCivilDate`:** já expõe `{ weekday, civilUtc }`; o `civilUtc.getUTCDate()` dá o dia civil. Não precisa estender.

### 2.5 Estrutura dos geradores (RF-04) — helpers compartilhados + 3 generators + dispatch

**Decisão: helpers compartilhados num módulo + 3 generators (não um `generateReport` despachante único).** Cada tipo de relatório tem um bundle e seções suficientemente diferentes (weekly = a semana; daily = a sessão do dia; monthly = o mês + comparativos) que um `generateReport({ reportType, ... })` viraria um `switch` gigante; 3 funções nomeadas são mais legíveis e testáveis. Mas os helpers que tocam o `ReportContent`/`reports` row são **compartilhados** (lesson #10).

**`server/services/reportGeneratorShared.ts`** — extrair de `weeklyReportGenerator.ts` (sem regressão — testes do AI-1B verdes):
- `DEFAULT_REPORT_MODEL` (`"claude-sonnet-4-6"`), `PRICE_PER_M`, `getReportModel()` (`process.env.COACH_MODEL ?? DEFAULT_REPORT_MODEL`).
- `ALLOWED_HREFS` + `sanitizeHref(href, fallback)` (whitelist de rotas Wouter — lesson #19).
- `computeCost(usage)`.
- `n(v, fallback)`, `ymd(d)`, `safe<T>(fn, fallback)`, `resolveStorage(injected?)`.
- `callLlm({ model, system, userMessage, maxTokens })` — o padrão `const Anthropic = (await import('@anthropic-ai/sdk')).default; let client; try { client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch { client = Anthropic({ apiKey: ... }) as any; } const resp = await client.messages.create({ model, max_tokens, system: [{ type:'text', text: system, cache_control:{type:'ephemeral'} }], messages:[{ role:'user', content: userMessage }] }); return { text, usage: resp.usage }` (lesson #5/#35). Retorna `{ parsedJson?, text, usage }` — o caller faz o `JSON.parse` defensivo.
- `persistReport({ storage, userId, reportType, periodStart, periodEnd, status, content, markdown, model, summarizerModel, usage, costUsdEstimate, degradedReason })` — chama `storage.upsertReport({ ..., reportType, ... })` com tokens propagados. **`reportType` é parâmetro** (não hardcodado `'weekly'`).
- `renderMarkdownBase(content)` — render genérico das seções comuns (header, insights, cta, follow-up); cada generator pode estender com as suas seções (o monthly adiciona comparativos/variância/leaks/metas; o daily adiciona `sessionSummary`).
- `buildCtas(parsed, opts)`, `mergeLlm(sections, parsed)` — utilitários de merge LLM↔determinístico.

**`server/services/weeklyReportGenerator.ts`** (refatorado): `generateWeeklyReport({ userId, periodStart, periodEnd, failSoft?, injectedStorage? })` reusa os shared; mantém o seu `gatherBundle` (a semana) + `buildSections` (as 5 seções) + `runBackfills`; chama `summarizeBundleHierarchical` (RF-07 — substitui o stub "sumariza se grande").

**`server/services/dailyDebriefGenerator.ts`** (novo): `generateDailyDebrief({ userId, periodStart, failSoft?, injectedStorage? })` (`periodEnd = periodStart`). Tem o seu `gatherDailyBundle(storage, userId, periodStart)`:
- Resolve a(s) sessão(ões) do dia: `storage.getGrindSessions(userId, { limit: 50 })` + filtra por data (`s.date`/`s.startTime`/`s.completedAt` cai em `periodStart`) e `status ∈ {'completed','finished'}`; para cada, `storage.getSessionTournaments(sessionId)` (ou reusa `grindSessionHistory.ts` se ele já agrega ITM/FT/wins/profit/ROI da sessão — FX para USD via `getCurrencyForSite`/`convertToNativeCurrency`).
- Spots/notas da sessão: o storage de `starred_hands` filtrado por `sessionId` (`capturedDuring='grind-live'`) — contagem + 1 título de exemplo.
- Comparação com o ritmo recente: `storage.getGrindSessions` últimas ~10 completed + agregação simples (lucro/ROI médio por sessão) — ou `getPerformanceByPeriod(userId, '30d')` como proxy.
- Foco de leak ativo / metas (para o `followUp` — RF-08): `findActiveLeakFocusList(userId)` + `getAiStructuredProfile(userId).metas`/`focoDoMes`.
- Tom/nível: `getAiStructuredProfile.tomPreferido`/`nivel`; fallback `getCoachPreferences().coachTone`.
- Seções: principalmente `sessionSummary` + `insights` (1-2, data-grounded, `[fonte:]`) + `followUp` + `cta` + `header`; `dataSufficiency='low'` se 0 torneios e 0 spots (header minimalista, sem LLM, custo ≈ 0).
- **`runBackfills` NÃO roda no daily** (o daily é por sessão, não por semana — regerar a rec de lesson semanal a cada sessão seria desperdício; e o daily roda múltiplas vezes/semana).
- **Sumarização NÃO roda no daily** (bundle pequeno; `summarizer_model_used = null`).

**`server/services/monthlyReportGenerator.ts`** (novo): `generateMonthlyReport({ userId, periodStart, periodEnd, failSoft?, injectedStorage? })`. Tem o seu `gatherMonthlyBundle(storage, userId, periodStart, periodEnd)`:
- Volume/resultados do mês: `getDashboardStats(userId, '${periodStart} to ${periodEnd}')` + `getPerformanceByPeriod(userId, '${periodStart} to ${periodEnd}')` (custom range `'YYYY-MM-DD to YYYY-MM-DD'` confirmado no código de ambos — `getPerformanceByPeriod` faz `period.includes(' to ')`; `getDashboardStats` via `buildPeriodCondition('custom', { dateFrom, dateTo })` — **atenção:** `buildPeriodCondition` aceita `period === 'custom'` + `filters.dateFrom`/`dateTo`, NÃO o string `'to'`; mas `getDashboardStats(userId, '${periodStart} to ${periodEnd}')` cai no `default` de `buildPeriodCondition` que é `30d` — **decisão: o monthly usa `getPerformanceByPeriod` (que suporta o string `'to'`) para os totais do mês, e os comparativos; e/ou `getDashboardStats(userId, 'custom', { dateFrom: periodStart, dateTo: periodEnd })` para os contadores ricos (count/ABI/ROI/ITM/FT/wins).** Documentar isso para o implementer.).
- Bankroll do mês: `walletService.getConsolidatedBalance(userId)` (import direto, já em USD); `getBankrollSnapshots(userId, { to: <monthEnd> })` (snapshot mais próximo do início do mês como baseline — normalizar USD); `listWalletTransactionsByUser(userId, { from: <monthStart>, to: <monthEnd> })` (transfers/saques); `getRakebackForPeriod` se existir.
- Selection do mês: `getAnalyticsByModifier`/`getAnalyticsBy*` com filtros de período; `planned_tournaments`/`weekly_plans` vs `tournaments`.
- Estudos do mês: `getStudySessionsV2`/`getStudySessions` filtrados por mês; `findActiveLeakFocusList`; `getAiStructuredProfile.focoDoMes`; `recommendLessonForUser` (via `runBackfills`).
- Mental + operacional: `listWarmupRituals({ userId, from: <monthStart>, to: <monthEnd> })` — focus rating, override usage, decisionToPlay; **só warm-up** (founder Q6). 0 dados → seção omitida.
- **Comparativos** (RF-05.2): ver §2.6.
- **Variância** (RF-05.2): `getVarianceVsExpected(userId)` (retorna `null` hoje) — se `null`, **heurística**: `roiObservadoDoMes` (de `getDashboardStats`) vs `roiMedio12m` (de `getPerformanceByPeriod('last_12_months')` agregado), desvio em buy-ins; `variance.method = 'heuristic'`, `confidence = 'low'`, `narrative` rotula como estimativa. Se `getVarianceVsExpected` algum dia retornar dados (AI-2A `analyze_variance`) → `variance.method = 'primedope'`, usa esses números.
- **Leaks resolvidos vs novos** (RF-05.2): `detectLeaks(userId, { minSeverity: 'low' })` (snapshot atual) + `findActiveLeakFocusList(userId)` (focos escolhidos com `targetMonth`) + (para cada foco) a lógica de `verify_leak_progress` (`findActiveLeakFocus`/`queryStatByKey` — reusar a função, não a tool). **Heurística:** "resolvido/melhorado" = foco com `targetMonth` = o mês do relatório cujo `verify_leak_progress` dá `status='improving'` ou que sumiu do `detectLeaks`; "novo" = leak em `detectLeaks` sem foco escolhido. Sem histórico de leaks → lista os ativos atuais + os focos + o status de cada. **Sem tabela nova.**
- **Progresso das metas** (RF-05.2): `getAiStructuredProfile.metas: AiStructuredProfileMeta[]` (`{ id, texto, prazo: 'mes'|'trimestre'|null, criadaEm, origem }`) — uma entrada por meta no `goalsProgress`; `estimate` (`'on_track'|'behind'|'ahead'|'unknown'`) inferido pelo LLM a partir do texto da meta + os dados do mês (sem campo de valor-alvo estruturado — `'unknown'` quando não dá pra inferir). `focoDoMes` também mencionado.
- **`runBackfills` roda no monthly** (cobre ≥1 semana — preenche `coach_lesson_recommendations` + `study_weekly_plans` idempotente).
- **Sumarização roda no monthly se o bundle exceder o threshold** (RF-07 — esp. com 12 meses de série).
- Seções: as 5 do weekly (com comparativo curto vs mês -1 cada) + `comparatives` + `variance` + `leaksDelta` + `goalsProgress` + `insights` (3-5) + `nextWeekPlan` (foco + ação — não monta a grade) + `followUp` + `cta`; `dataSufficiency='low'` se mês vazio (header convidando a importar, CTA `/upload`, custo ≈ 0).

**`processReportJobsTick` despacha por `report_type`** (`server/jobs/reportJobRunner.ts`): substituir o `import("../services/weeklyReportGenerator").generateWeeklyReport(...)` fixo por um `getGeneratorFor(reportType)`:
```
function getGeneratorFor(reportType) {
  if (reportType === 'weekly')  return (a) => import('../services/weeklyReportGenerator').then(m => m.generateWeeklyReport(a));
  if (reportType === 'daily')   return (a) => import('../services/dailyDebriefGenerator').then(m => m.generateDailyDebrief({ userId: a.userId, periodStart: a.periodStart, failSoft: a.failSoft, injectedStorage: a.injectedStorage }));
  if (reportType === 'monthly') return (a) => import('../services/monthlyReportGenerator').then(m => m.generateMonthlyReport(a));
  return null;  // 'quarterly' e desconhecidos
}
```
Se `getGeneratorFor` devolve `null` → `console.warn('report.job.unsupported_report_type', { jobId, reportType })` + `storage.updateReportJob(jobId, { status: 'skipped', lastError: 'unsupported_report_type' })` — não quebra o tick. O `persistOrFetchReportId`/`getReportForPeriod`/`upsertReport` no `reportJobRunner.ts` passam a usar `claimed.reportType` (não o literal `'weekly'`).

### 2.6 `getMonthlyPerformanceSeries` — decisão: **não criar** (compor de `getPerformanceByPeriod`)

**Decisão: NÃO criar `storage.getMonthlyPerformanceSeries`.** O monthly gera a série mês-a-mês compondo `getPerformanceByPeriod(userId, '${monthStart} to ${monthEnd}')` para cada um dos últimos 6 e 12 meses (12 chamadas — cada uma é uma query agregada por dia, pequena; o monthly é um job assíncrono, não um request). Um helper privado no `monthlyReportGenerator.ts`:
```
async function buildMonthlyComparatives(storage, userId, monthsBack: number): Promise<Array<{ month: 'YYYY-MM', profit, roi, count }>> {
  const out = [];
  const now = new Date();  // ou o periodEnd do relatório, para consistência
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)); // último dia de cada mês
    const mStart = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const mEnd = ymd(d);
    const series = await safe(() => storage.getPerformanceByPeriod(userId, `${mStart} to ${mEnd}`), []);
    const profit = sum(series.map(r => Number(r.profit)));
    const buyins = sum(series.map(r => Number(r.buyins)));
    const count = sum(series.map(r => Number(r.count)));
    out.push({ month: mStart.slice(0,7), profit, roi: buyins > 0 ? (profit / buyins) * 100 : null, count });
  }
  return out.reverse(); // ordem cronológica
}
```
- `comparatives.previousPeriod` = a entrada de `i=1` (mês -1).
- `comparatives.last6Months` = `monthsBack=6`; `comparatives.last12Months` = `monthsBack=12` (chamar `buildMonthlyComparatives(..., 12)` uma vez e fatiar para os 6 últimos evita 18 chamadas → 12).
- **Por que não criar o método:** evita risco (boundary de mês, timezone — o spec marca isso como risco a testar com `now` controlado; concentrar a aritmética num helper testável do gerador é tão testável quanto um método de storage, e não polui a interface `IStorage` com mais um método). `getPerformanceByPeriod` já filtra `grind_session_id IS NULL` (§6.1). **Trade-off aceito:** 12 queries em vez de 1; o job é assíncrono e roda 1×/mês/user.
- **Risco / teste:** a aritmética `new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0))` lida com vira-do-ano nativo (mês negativo → ano anterior). Testar com `now` controlado em jan (mês -1 = dez do ano anterior), em mar (mês -1 = fev — 28/29 dias), e num mês com 31 dias.

### 2.7 `ReportContent` v2 (RF-05.4) + render genérico (RF-06)

`ReportContent` (em `shared/schema.ts`) ganha (todos **opcionais** — frontend v1 ignora; `schemaVersion: 2` quando usados):

```ts
reportType: "weekly" | "monthly" | "daily";   // alargado
comparatives?: {
  previousPeriod?: { label: string; profit: number | null; roi: number | null; count: number | null };
  last6Months?: Array<{ month: string; profit: number; roi: number | null; count: number }>;   // 'YYYY-MM'
  last12Months?: Array<{ month: string; profit: number; roi: number | null; count: number }>;
  trendNarrative?: string;
};
variance?: {
  bankrollDeltaUsd: number | null;
  estimatedBySkillUsd: number | null;
  estimatedByVarianceUsd: number | null;
  sampleSize: number | null;
  method: "heuristic" | "primedope";
  narrative?: string;
  confidence?: "high" | "medium" | "low";
};
leaksDelta?: {
  resolved: Array<{ code: string; label: string; note?: string }>;
  newSignals: Array<{ code: string; label: string; severity?: string }>;
  activeFocus: Array<{ code: string; label: string; status: string; progressNote?: string }>;
  narrative?: string;
};
goalsProgress?: Array<{ goalId: string; texto: string; prazo: "mes" | "trimestre" | null; estimate: "on_track" | "behind" | "ahead" | "unknown"; narrative?: string }>;
followUp?: {  // RF-08 — "Seu acompanhamento" (weekly/monthly/daily); ADR-161
  activeLeakFocus: Array<{ code: string; label: string; targetMonth: string; status: string; progressNote?: string }>;
  goalsInProgress: Array<{ goalId: string; texto: string; prazo: "mes" | "trimestre" | null }>;
  narrative?: string;
};
sessionSummary?: {  // usado quando reportType==='daily' (ou 'monthly' agregando sessões)
  sessionDate: string;
  sessionsCount: number;
  durationMinutes: number;
  tournaments: number;
  itmPct: number | null;
  finalTables: number;
  wins: number;
  profitByCurrency: Array<{ currency: string; native: number; usd: number }>;
  roiSession: number | null;
  spotsCount: number;
  spotHighlight?: string | null;
  vsRecentNarrative?: string;
};
```
- O `sections` do weekly (`volumeResults`/`bankroll`/`selection`/`study`/`mentalOps`) continua **obrigatório no shape mas com campos individuais que o weekly preenche**; para o **daily**, o generator preenche um `sections` mínimo (ou os campos com 0 / `null`) — o `ReportView` não renderiza um bloco vazio. **Decisão: `sections` continua como está (não vira opcional)** — o weekly e o monthly o preenchem; o daily preenche com os números da sessão onde fizer sentido (`volumeResults.tournaments` = torneios da sessão etc.) ou deixa em 0; o frontend já tolera campos `null`/0 sem renderizar nada significativo. Isso evita um type-break em todo o `WeeklyReportView`.
- **`markdown`:** o gerador produz e grava (`renderMarkdownBase` + extensões por tipo); o `ReportView` usa `markdown` quando presente (renderiza via `ReactMarkdown` + `remarkGfm` — igual ao chat), senão renderiza do `content`.

**Render (RF-06): `WeeklyReportView` → `ReportView`** (a rota `/coach-ai/relatorio/:id` já existe — só renomear o componente ou manter o nome tratando os 3 tipos). **Decisão: renomear para `client/src/pages/coach-ai/ReportView.tsx`** (e um re-export `WeeklyReportView` opcional para não quebrar imports legados). Renderiza:
- Sempre: `header`, `markdown` (ou fallback do `content`), `insights`, `cta` (botões: `kind:'link'` → navega para rota Wouter registrada — lesson #19; `kind:'tool'` → abre o fluxo de tool com confirm — ADR-146, não auto-executa), `followUp` quando presente ("## Seu acompanhamento").
- `reportType === 'weekly'` → as 5 seções (`volumeResults`/`bankroll`/`selection`/`study`/`mentalOps`) — sem regressão vs AI-1B.
- `reportType === 'monthly'` → as 5 seções + bloco de evolução (`comparatives` — tabela/sparkline dos últimos 6 meses) + bloco de variância (`variance`) + bloco de leaks resolvidos/novos (`leaksDelta`) + progresso das metas (`goalsProgress`).
- `reportType === 'daily'` → `sessionSummary` (resumo da sessão) + `insights` (feedback) + `followUp`.
- `status === 'degraded'` (qualquer tipo) → renderiza os números + aviso "modo simplificado".
- `ReportsPanel` (AI-1B): já lista todos os tipos — só adicionar um **badge do tipo** no card ("Diário"/"Semanal"/"Mensal"). `GET /api/coach/timeline` já retorna `reportType` no item — sem mudança de endpoint. `GET /api/coach/reports/:id` já serve qualquer tipo (`content` + `markdown`, marca `read_at`, ownership 404/403) — sem mudança.
- `CoachPreferencesPanel`: +2 toggles (daily/monthly), gateados por `getReportTier === 'eligible'`.
- **NENHUM endpoint HTTP novo.**

### 2.8 Prompts (RF-03.4 / RF-05.5)

- `server/coach/prompts/dailyDebrief.ts` — `DAILY_DEBRIEF_SYSTEM = ${GRINDFY_AI_BASE}\n\n## Você está gerando o DEBRIEF DA SESSÃO ...` + `CITATIONS_RULES`; tarefa: a partir do BUNDLE DA SESSÃO, produzir um JSON curto (`header`, `sessionSummary.vsRecentNarrative`, 1-2 `insights` data-grounded com `[fonte:]`, opcionalmente 1 `cta`, `followUp.narrative`); CTAs só tools AI-0A ou rotas Wouter registradas; `max_tokens ~1200`; `cache_control: ephemeral` nos blocos estáveis. Reusa `GRINDFY_AI_BASE` (lesson #10).
- `server/coach/prompts/monthlyReport.ts` — `MONTHLY_REPORT_SYSTEM = ${GRINDFY_AI_BASE}\n\n## Você está gerando o RELATÓRIO MENSAL ...` + `CITATIONS_RULES`; tarefa: a partir do BUNDLE DO MÊS (já com a série mensal, leaks, metas, warm-up — possivelmente sumarizado), produzir o JSON com as narrativas de cada seção + `comparatives.trendNarrative` + `variance.narrative` (rotular como estimativa heurística) + `leaksDelta.narrative` + `goalsProgress[].narrative` + 3-5 `insights` data-grounded + `nextWeekPlan` (foco + ação) + `followUp.narrative`; CTAs idem; `max_tokens ~4000`; cache nos blocos estáveis.
- `weeklyReport.ts` permanece (sem mudança de prompt — só os imports do `weeklyReportGenerator.ts` mudam para os shared).

### 2.9 Custos, fail-soft, idempotência, timezone

- **Custos:** Daily ~$0.013/debrief (sonnet, `max_tokens ~1200`, prompt caching no STATIC); Monthly ~$0.11/relatório (sonnet, `max_tokens ~4000`) + a sumarização Haiku (~10× mais barata — economiza input tokens do sonnet). `cost_usd_estimate` + tokens (`input/cacheCreation/cacheRead/output`) gravados em cada `reports` row; `coach.report.tokens` logado (cache hit/miss). Fail-soft / `dataSufficiency='low'` → custo ≈ $0 (não chama o sonnet).
- **Fail-soft:** mesmo padrão do AI-1B para os 3 tipos — sem `ANTHROPIC_API_KEY` → determinístico, `degraded_reason='no_anthropic_key'`, job `done` na 1ª tentativa; LLM falha 3x → determinístico, `degraded_reason='llm_failed_3x'`, job `done` (nunca `failed`); erros logados antes do fallback (lesson #9); `new AnthropicCtor` em try/catch com fallback factory (lesson #5/#35) — **sonnet E haiku**. Determinístico = todas as seções/comparativos/variância/leaks/metas com os números, sem `narrative`, `insights=[]` (ou 1 determinístico), `cta` só links.
- **Idempotência:** `report_jobs` UNIQUE `(user_id, report_type, period_start)` (cobre weekly/daily/monthly); `reports` UNIQUE idem; `coach_lesson_recommendations`/`study_weekly_plans` mantêm suas UNIQUEs (`runBackfills` idempotente). Nenhum caminho duplica relatório.
- **Timezone:** "dia 1 7h" (monthly) e "data da sessão" (daily — `completedAt` no fuso do user) usam `getLocalHour` / `localCivilDate` (já existem). `report_jobs.timezone` é o snapshot do `users.timezone` no enfileiramento. Testar fusos extremos (UTC+14 `Pacific/Kiritimati`, UTC-11 `Pacific/Pago_Pago`) e meses de borda (jan↔dez, fevereiro 28/29, mês 31 dias) com `now` controlado.
- **Concorrência (réplicas):** os ticks já estão em `withAdvisoryLock` (ADR-144); o claim de job é atômico; o INSERT do daily é `ON CONFLICT DO NOTHING`. As mudanças deste sprint não introduzem race nova.
- **Gating de ativação:** os crons só rodam em `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'`; `COACH_NUDGES_ENABLED === 'false'` é o kill switch global — desliga o report job runner (enqueuer + processor) e o enqueue do daily na finalização da sessão.

---

## 3. Consequências

### Positivas
- O Weekly Report do AI-1B **passa a funcionar para users reais** (o `PRO_PLANS` bug é corrigido — Trial + Pro/Premium recebem, não só admin).
- Fecha a Fase 1 do plano de IA — o jogador opt-in tem 3 relatórios (daily pós-sessão, semanal, mensal) na timeline do hub, todos resilientes (fila + retry + fail-soft).
- O Daily é barato e event-driven sem precisar de event bus formal — best-effort em `handleUpdateGrindSession`, fire-and-forget, nunca quebra a resposta do PUT.
- A generalização do gerador (helpers compartilhados + dispatch por `report_type`) prepara o Quarterly Review (AI-2B — só registrar um 4º generator + a regra do enqueuer).
- A sumarização hierárquica Haiku→Sonnet economiza input tokens do sonnet no relatório mensal (e em weeklys grandes) — substitui o stub do AI-1B por algo real.
- `getReportTier`/`isReportEligible` ficam como a fonte canônica de elegibilidade de relatório — um lugar só para alterar regras de tier de relatório no futuro.

### Negativas / trade-offs
- O enqueuer faz N chamadas a `resolveUserTier` por tick (uma por candidate `'active'`) — mitigado pelo cache 30s + promise-cache; o tick roda 1×/h.
- O monthly faz 12 queries `getPerformanceByPeriod` por relatório (a série mensal) em vez de 1 — aceito (job assíncrono, 1×/mês/user).
- A análise de variância é heurística (`getVarianceVsExpected` retorna `null` hoje) — rotulada como estimativa, confidence baixo; o `variance.method` deixa o caminho pronto para o PrimeDope (AI-2A).
- Os leaks resolvidos/novos são heurística (sem tabela histórica de leaks) — aceito; revisitar se AI-2A precisar de precisão histórica.
- O daily não regera quando uma 2ª sessão chega depois do report (opção (a)) — o report reflete "as sessões que existiam quando o processor rodou"; aceito por KISS.
- 3 generators + 1 módulo shared = mais arquivos; aceito (legibilidade > 1 `switch` gigante).

### Neutras
- Migração 0068 = 2 colunas booleanas `NOT NULL DEFAULT false` — back-fill trivial.
- `report_type` continua varchar livre (não vira enum DB — padrão do projeto; validação rígida no service).
- `ReportContent` v2 = campos opcionais + `schemaVersion: 2` — frontend tolera 1 e 2 (lesson #7).
- `report_type='quarterly'` reservado mas não despachado (AI-2B).

## Confiança
Alta — estende um modelo já consagrado (ADR-155); o bug corrigido é claro e bem isolado; todas as fontes de dados existem; os riscos (aritmética de mês/timezone) são testáveis com `now` controlado.
