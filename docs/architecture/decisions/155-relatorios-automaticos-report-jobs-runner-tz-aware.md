# ADR-155: Relatórios automáticos — tabelas `report_jobs`/`reports` + job runner timezone-aware (enqueuer hourly + processor 15min) + idempotência + retry exponencial + fail-soft determinístico; Weekly Report opt-in só Pro+; gating pelo `COACH_NUDGES_ENABLED`

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1B (`Docs/specs/sprint-ai-1b.md`, RF-01/02/03/04/05/06/09)

## Decision owner
system-architect (founder validou os marcos no plano: Q2 opt-in, Q3 modelo sonnet 4.6, Q6 mental só warm-up, Q7 in-app only)

## Related
- Depende de: ADR-144 (cron advisory lock — todo tick envolto), ADR-152 (kill switch global `COACH_NUDGES_ENABLED`, anti-fadiga), ADR-151 (perfil estruturado — `tomPreferido`/`nivel` alimentam o cabeçalho e a personalização leve), ADR-150 (hub `/coach-ai` — a aba `reports` recebe a timeline), ADR-148 (agente único — o relatório é "do Grindfy AI"), ADR-146 (write tools confirm always — os CTAs do relatório que viram tool não auto-executam), ADR-021/ADR-019 (modelo Coach canônico + prompt caching).
- Reusa: `getLocalHour` (`server/coach/timezone.ts`), `listUsersForCron`/`getUserTimezone` (`storage.ts`), `withAdvisoryLock` (`server/lib/advisoryLock.ts`), `recommendLessonForUser` + `coach_lesson_recommendations`, `generateWeeklyStudyPlan` + `study_weekly_plans`, `coachMemory.ts` (sumarização Haiku), `coachSystemBuilder.ts` (bloco STATIC + CITATIONS_RULES), padrão de cron de `processBStudy` (`0 * * * *` + filtro `getLocalHour`).
- Sucessor de: nada — primeiro ADR de relatórios. ADR-156 (aposentadoria dos 2 crons de segunda) e ADR-157 (timeline + render) cobrem o resto do sprint; ADR-158 cobre quick suggestions.
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{report-job-runner-flow,weekly-report-structure,report-tables-er}.mermaid`.

---

## 1. Contexto

O plano de melhoria dos agentes de IA (`Docs/strategy/ai-agents-improvement-plan-2026-05-11.md`, Tema F) prevê relatórios automáticos (Daily/Weekly/Monthly/Quarterly). O AI-0B montou o esqueleto do hub `/coach-ai` com a aba `reports` em EmptyState, pronta pra plugar a timeline. O AI-1A entregou o anti-fadiga (`shouldSendNudge` é o gate de toda proatividade) e o perfil estruturado. Falta:

1. **Onde mora um "relatório"?** Não existe tabela. Não existe scheduler de relatório. O `generateCoachRecommendations` (segunda 6h BRT) e o `generateWeeklyStudyPlan` (segunda 9h UTC) são crons de "geração por user", mas escrevem direto em tabelas de domínio (`coach_lesson_recommendations`, `study_weekly_plans`) — não há conceito de "job de relatório com retry/idempotência".
2. **Timezone.** "Segunda 7h" precisa ser **no fuso de cada user** — os crons existentes ou rodam num fuso fixo (BRT/UTC) ou usam o padrão `0 * * * *` + filtro `getLocalHour(now, tz) === targetHour` (como `processBStudy`). O relatório quer o segundo padrão (granularidade de 1h cobre todos os fusos).
3. **Resiliência.** Geração via LLM (sonnet) pode falhar (timeout, rate limit, sem `ANTHROPIC_API_KEY`). O user não pode ficar sem relatório por causa disso → precisa de retry com backoff + fail-soft determinístico (números completos, sem prosa).
4. **Idempotência.** Não pode gerar 2 relatórios pra mesma semana/user. Nem 2 jobs pro mesmo período. Nem regerar quando o cron tickar de novo. Nem duplicar quando 2 réplicas processam o mesmo job.
5. **Elegibilidade.** Opt-in (founder Q2) + só Pro+ (founder Q5; o "Trial" de Q2 é AI-1C). Onde mora o opt-in? Como o gating de proatividade (`COACH_NUDGES_ENABLED`) interage com isso?
6. **Custo.** ~$0.045/relatório (sonnet, prompt caching). Precisa ser registrado por relatório (tokens + custo estimado) — visibilidade de cache hit/miss.

A pergunta central: **o schema das 2 tabelas; o modelo do runner (enqueuer + processor, periodicidade, claim atômico, retry/backoff, idempotência via UNIQUE); o tz-awareness; a estrutura do `ReportContent` JSONB; o opt-in (preference, só Pro+); o fail-soft (degraded); o custo registrado; o gating.**

### Restrições

- **`shouldSendNudge` é o gate de proatividade — mas relatórios são opt-in.** O user já controla via a preference. O `COACH_NUDGES_ENABLED` é a alavanca de emergência global; relatórios contam como proatividade e respeitam-no — não criar uma flag nova (KISS; uma alavanca a menos pra esquecer de virar). Os relatórios **não** passam pelo `shouldSendNudge` (não têm `cycleKey`/quiet hours — são entregues como card na timeline, não como interrupção); o controle é: opt-in + plano + `COACH_NUDGES_ENABLED`.
- **Lesson #7 (schema gradual):** colunas novas `optional + default`; nada de `SET NOT NULL` sem default. `report_weekly_enabled` é `NOT NULL DEFAULT false` (default trivial — opt-in). Colunas opcionais do `reports` são nullable.
- **Lesson #6 (conversão USD):** os valores de bankroll no `content` são normalizados pra USD antes de comparar com thresholds/`bankrollStart`.
- **Lesson #9 (logar antes de fallback / safe-deny):** erro do LLM nunca propaga pra fora do gerador (`console.error('report.job.error', ...)` + cai pro determinístico); erro de storage em check de elegibilidade → safe-deny (não enfileira). `try/catch` por user no batch.
- **Lesson #5/#35 (`new AnthropicCtor` mock):** `new AnthropicCtor(...)` em try/catch com fallback factory.
- **Lesson #10 (DRY de prompts):** o prompt do gerador num módulo único (`server/coach/prompts/weeklyReport.ts`); reusa o bloco STATIC base do `coachSystemBuilder.ts`.
- **Lesson #34 (storage injetável):** `generateWeeklyReport({ ..., injectedStorage? })`; handlers de route com `injectedStorage?`.
- **CLAUDE.md §6.1:** toda query de histórico no gerador filtra `grind_session_id IS NULL` — reusa métodos com o filtro já injetado.
- **ADR-144:** todo cron tick envolto em `withAdvisoryLock`; o claim de job no processor é atômico.
- **Modelo:** `process.env.COACH_MODEL ?? <constante canônica do projeto>` — **verificar** o nome exato em `coachSystemBuilder.ts` / ADR-021; não hardcodar `sonnet-4-6` solto.
- **Não criar tabela de "report subscriptions"** — overkill pra 1 tipo de relatório; o opt-in mora em `userCoachPreferences`; revisitar quando AI-1C adicionar Daily/Monthly.
- **Email = AI-2B** — Fase 1 = só in-app (founder Q7). As colunas `channel_email`/`channel_push` existem mas não são acionadas.

---

## 2. Opções consideradas

### 2.1 Modelo do scheduler

**Opção A — fila de jobs (`report_jobs`) + enqueuer + processor (ESCOLHIDA).** Uma tabela `report_jobs` (status `pending`→`running`→`done`/`failed`/`skipped`, `attempts`, `next_attempt_at`, `scheduled_for`, UNIQUE `(user, type, period_start)`). Enqueuer (`0 * * * *`) cria 1 job por user elegível na "segunda 7h do fuso dele" (`ON CONFLICT DO NOTHING`). Processor (`*/15 * * * *`) pega jobs `pending` due, claim atômico, gera, marca `done`. Retry com backoff via `next_attempt_at`.
- **Prós:** retry/backoff/idempotência triviais (estado na tabela); auditável (`last_error`, `attempts`); o processor é desacoplado do enqueuer (se o LLM tá lento, os jobs ficam na fila e drenam aos poucos sem segurar o tick do enqueuer); claim atômico (`UPDATE ... WHERE status='pending' RETURNING`) + `withAdvisoryLock` cobrem réplicas; estende natural pra Daily/Monthly (só muda `report_type` + a regra do enqueuer); padrão consagrado de "task queue in DB".
- **Contras:** 2 ticks de cron (enqueuer + processor) em vez de 1; uma tabela a mais. Aceito — o ganho de resiliência/auditabilidade vale.

**Opção B — cron único "segunda 7h" que gera direto (sem fila), como `generateCoachRecommendations`.**
- **Prós:** zero tabela de fila; 1 tick só.
- **Contras:** sem retry estruturado (se o LLM falha, o user fica sem relatório até a semana que vem ou precisa de lógica de re-tentativa no próprio tick — que não tem onde guardar `attempts`/`next_attempt_at`); o tz-awareness fica mais frágil (o `generateCoachRecommendations` roda num fuso fixo BRT, não no fuso de cada user); difícil auditar falhas; não estende bem pra outros tipos de relatório. **Rejeitada** — relatório é mais "caro/visível" que uma rec de lesson; precisa de fila.

**Opção C — fila externa (BullMQ/Redis, ou um worker process dedicado).**
- **Prós:** retry/backoff/concorrência "de graça" da lib.
- **Contras:** dep nova (Redis) + infra-cost; o projeto já tem o padrão "cron in-process + advisory lock" (ADR-144) que cobre o caso; ~10 jobs/semana/user não justifica. **Rejeitada** — mesmo raciocínio do ADR-144 (Redis SETNX rejeitado lá).

### 2.2 Onde mora o opt-in do Weekly Report

**Opção A — coluna `user_coach_preferences.report_weekly_enabled boolean NOT NULL DEFAULT false` (ESCOLHIDA).**
- **Prós:** mora junto dos outros toggles de proatividade; `getCoachPreferences` já é lido (cache 30s) — pega de gracinha; o `GET/PUT /api/coach/preferences` já existe (só estende o zod + o `buildPrefsResponse`); default `false` = opt-in trivial (Q2).
- **Contras:** quando AI-1C adicionar Daily/Monthly, vira `report_daily_enabled`/`report_monthly_enabled` ou um JSONB `report_subscriptions` — migração futura. Aceito (nota documentada).

**Opção B — tabela `report_subscriptions (user_id, report_type, enabled, ...)`.**
- **Contras:** over-engineering pra 1 tipo; query extra. **Rejeitada** (revisitar em AI-1C).

### 2.3 Periodicidade do enqueuer

**Opção A — `0 * * * *` (hourly) + filtro `getLocalHour(now, tz) === 7 && é segunda no fuso do user` (ESCOLHIDA).** Padrão de `processBStudy`. Cobre todos os fusos (UTC-12 a UTC+14) com granularidade de 1h; `scheduled_for = now` (já é a hora certa).
- **Prós:** o "segunda 7h local" se espalha por ~26h de UTC (fusos extremos) — rodar de hora em hora cobre todos sem pular; padrão da casa; o relatório não é time-critical no minuto.
- **Contras:** o enqueuer roda 24×/dia (barato — só queries de elegibilidade + insert). Aceito.

**Opção B — `0 0 * * 1` (uma vez de madrugada) + enfileirar com `scheduled_for` futuro pra cada fuso.** O processor processa quando `scheduled_for <= now`.
- **Prós:** 1 tick de enqueuer/semana.
- **Contras:** o cálculo de "que instante UTC é segunda 7h pro user X" precisa de aritmética de fuso mais elaborada (e DST — embora BRT não tenha; outros fusos têm); se o user mudar de fuso entre o enqueue e o `scheduled_for`, o job já tá agendado num instante "errado". A Opção A é mais simples e robusta. **Rejeitada.**

### 2.4 Gating

**Opção A — `COACH_NUDGES_ENABLED` (o kill switch global do AI-1A) gateia o enqueuer + o processor (ESCOLHIDA).**
- **Prós:** uma alavanca de emergência só (não 2); relatórios são proatividade conceitualmente; jobs já enfileirados ficam parados enquanto a flag tá off e drenam quando volta (`scheduled_for <= now` ainda vale).
- **Contras:** desligar a proatividade desliga os relatórios também — mas isso é o comportamento desejado de um kill switch global de emergência. Aceito.

**Opção B — `COACH_REPORTS_ENABLED` (kill switch próprio).**
- **Contras:** mais uma env var pra documentar/lembrar; o user já controla via opt-in (a granularidade fina é dele); o global de emergência já existe. **Rejeitada.**

### 2.5 Estrutura do `content` (JSONB)

**Decisão:** `ReportContent` é uma **interface TS** (`shared/schema.ts` ou módulo dedicado; não é pgTable) com `schemaVersion: number` (= 1), `reportType`, `periodStart`/`periodEnd`, `dataSufficiency: 'ok'|'low'`, `level?`, `tone?`, `header`, `sections` (5 sub-objetos: `volumeResults`, `bankroll`, `selection`, `study`, `mentalOps?` — opcional se opt-out/sem dados), `insights: Array<{ text; citations: string[]; confidence? }>` (3 quando `ok`), `nextWeekPlan`, `cta: Array<{ label; kind: 'tool'|'link'; toolName?; href?; payloadHint? }>`, `generation: { model; summarizerModel; degraded; degradedReason }`. Ver RF-05.4 da spec / o diagrama `weekly-report-structure.mermaid` para o shape completo.
- **Markdown:** o gerador produz e grava em `reports.markdown` (derivado de `content`); o frontend pode renderizar de `content` direto, mas a página/modal (ADR-157) usa `markdown` quando presente. **Por que armazenar e não só derivar:** o markdown é o "render canônico" — se o shape do `content` evoluir (schemaVersion++), relatórios antigos ainda têm o markdown que o gerador produziu na época; o frontend não precisa saber renderizar N versões de `content`.
- **Versionamento:** `schemaVersion` permite evolução; o frontend tolera campos ausentes (lesson #7). AI-1C (Daily/Monthly) reusa a interface com `reportType` diferente + seções específicas (subtipo do shape).

---

## 3. Decisão

### 3.1 Schema — migração `0067_report_jobs_reports.sql`

Cria **`report_jobs`** (fila): `id` (PK, `nanoid()`, varchar(21)), `user_id` (FK → `users.user_platform_id` ON DELETE CASCADE), `report_type` (varchar(16), `'weekly'`), `period_start`/`period_end` (date), `scheduled_for` (timestamptz), `status` (varchar(16), default `'pending'`), `attempts` (int, default 0), `max_attempts` (int, default 3), `next_attempt_at` (timestamptz, nullable), `timezone` (varchar(64), nullable — snapshot), `subscription_plan_at_enqueue` (varchar(16), nullable — snapshot), `report_id` (varchar(21), nullable, FK → `reports.id` ON DELETE SET NULL), `last_error` (text, nullable, ~1000 chars), `enqueued_by` (varchar(32), nullable — `'cron_enqueuer'|'manual'|'backfill'`), `created_at`/`updated_at` (timestamptz, default now). **Índices:** `idx_report_jobs_due` em `(status, scheduled_for)` (o processor: `WHERE status='pending' AND scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)`); `uniq_report_jobs_user_type_period` UNIQUE em `(user_id, report_type, period_start)` (idempotência do enfileiramento — `INSERT ... ON CONFLICT DO NOTHING`); `idx_report_jobs_user_status` em `(user_id, status)` (listagens).

Cria **`reports`** (relatórios gerados): `id` (PK, `nanoid()`), `user_id` (FK CASCADE), `report_type` (varchar(16)), `period_start`/`period_end` (date), `status` (varchar(16), default `'ready'` — `'ready'|'degraded'`), `content` (jsonb, default `'{}'::jsonb` — `ReportContent`), `markdown` (text, nullable), `model_used`/`summarizer_model_used` (varchar(64), nullable), `cost_usd_estimate` (numeric(10,4), nullable), `input_tokens`/`cache_creation_input_tokens`/`cache_read_input_tokens`/`output_tokens` (int, nullable), `degraded_reason` (varchar(64), nullable — `'llm_failed_3x'|'no_anthropic_key'|'insufficient_data'`), `read_at`/`dismissed_at` (timestamptz, nullable), `generated_at`/`created_at` (timestamptz, default now). **Índices:** `idx_reports_user_generated` em `(user_id, generated_at DESC)` (timeline); `uniq_reports_user_type_period` UNIQUE em `(user_id, report_type, period_start)` (idempotência da geração — UPSERT/pré-check).

Adiciona em **`user_coach_preferences`**: `report_weekly_enabled boolean NOT NULL DEFAULT false`. (As colunas `nudge_b_gapcheck`/`nudge_b_import` da mesma migração 0067 são cobertas por ADR-157.)

`shared/schema.ts` exporta: `reportJobs`/`reports` (pgTable), `ReportJob`/`InsertReportJob`/`Report`/`InsertReport` (types), `insertReportJobSchema`/`insertReportSchema` (zod com `.optional()`/`.default()` nos campos opcionais — lesson #7), `ReportContent` (interface TS, `schemaVersion: 1`). `updateCoachPreferencesSchema` ganha `reportWeeklyEnabled: z.boolean().optional()` (mantém `.strict()`); `buildPrefsResponse` inclui `reportWeeklyEnabled`.

### 3.2 Runner — `server/jobs/reportJobRunner.ts` (registrado via `server/jobs/index.ts` → `registerAllJobs()`)

**Enqueuer `enqueueWeeklyReportJobsTick({ now })`** (`0 * * * *`): se `COACH_NUDGES_ENABLED === 'false'` → return cedo. `withAdvisoryLock("cron:report-job-enqueuer", ...)`. Para cada user de `listUsersForCron("subscription_plan IN ('pro','premium')")`: `isWeeklyReportEligible(user)` (Pro+ && `prefs.reportWeeklyEnabled === true`; safe-deny em erro)? Se sim e `getLocalHour(now, user.timezone) === 7 && é segunda no fuso do user`: calcula `periodStart` = segunda da **semana que acabou** no fuso do user (date) e `periodEnd` = `periodStart + 6d`; `INSERT INTO report_jobs (...) ON CONFLICT (user_id, report_type, period_start) DO NOTHING` com `report_type='weekly'`, `scheduled_for = now`, `status='pending'`, `timezone = user.timezone`, `subscription_plan_at_enqueue = user.subscriptionPlan`, `enqueued_by = 'cron_enqueuer'`. `try/catch` por user (lesson #9).

**Processor `processReportJobsTick({ now })`** (`*/15 * * * *`): se `COACH_NUDGES_ENABLED === 'false'` → return cedo. `withAdvisoryLock("cron:report-job-runner", ...)`. `SELECT ... LIMIT 25` jobs `pending` due (`scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)`) `ORDER BY scheduled_for ASC`. Para cada job: **claim atômico** `UPDATE report_jobs SET status='running', attempts=attempts+1, updated_at=now WHERE id=? AND status='pending' RETURNING *` — se 0 rows, outro runner pegou → pula. Revalida elegibilidade (user ainda Pro+ && opt-in) — se não → `status='skipped'`, `last_error='no_longer_eligible'`. Idempotência da geração: se já existe `reports` row pra `(user, 'weekly', period_start)` → `status='done'`, `report_id=<existente>`, não regera (não chama o LLM). Senão chama `generateWeeklyReport({ userId, periodStart, periodEnd })` (RF-05/ADR-156):
- ok → UPSERT `reports` row (`status='ready'|'degraded'`), `status='done'`, `report_id=<novo>`.
- falha (exceção / LLM 3x dentro do gerador / sem `ANTHROPIC_API_KEY`) → `console.error('report.job.error', { jobId, userId, attempts, err })` (lesson #9) + grava `last_error`. Se `attempts < max_attempts` → `status='pending'`, `next_attempt_at = now + backoff(attempts)` (`1 → +15min`, `2 → +1h`, `3 → +4h` — constantes configuráveis). Se `attempts >= max_attempts` → **fail-soft**: o gerador retorna `ReportContent` determinístico (números completos, sem prosa); UPSERT `reports` row `status='degraded'`, `degraded_reason='llm_failed_3x'`; `status='done'` (nunca `failed` permanente). Caso especial: **sem `ANTHROPIC_API_KEY`** → o gerador retorna determinístico direto, `degraded_reason='no_anthropic_key'`, o job vira `done` na 1ª tentativa (não re-tenta — não vai resolver).

Pacing ~200ms entre jobs (Anthropic rate limit — padrão de `runWeeklyStudyPlan`). Ativação dos crons: `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'` (igual aos outros). `console.info('report.job.runner.started')` no boot; `console.info` informando "desabilitado pelo kill switch" quando `COACH_NUDGES_ENABLED === 'false'`.

### 3.3 Opt-in / elegibilidade

`isWeeklyReportEligible(userId): Promise<boolean>` = `plan IN ('pro','premium')` && `prefs.reportWeeklyEnabled === true`. Safe-deny em erro de leitura (lesson #9). O enqueuer só considera elegíveis; o processor revalida no momento de processar (defesa em profundidade — user pode ter feito downgrade ou desligado o opt-in entre o enqueue e o processamento → `skipped`). A UI da aba Preferências do hub mostra o toggle "Relatório semanal do Grindfy AI" **só pra Pro+** (Free vê uma linha "disponível no plano Pro" desabilitada ou nada — refinável pelo strategist; o critério mínimo: o toggle funcional não aparece pra Free). Mesmo se um Free setar `true` via API direta, o enqueuer não enfileira (revalida o plano).

### 3.4 Gating

`COACH_NUDGES_ENABLED === 'false'` desliga o enqueuer e o processor (e os ticks de gap-check/B-IMPORT — ADR-157). `CLAUDE.md §4` ganha uma linha documentando isso. Não há `COACH_REPORTS_ENABLED`.

### 3.5 Custo / tokens

O gerador usa prompt caching (`cache_control: { type: 'ephemeral' }` nos blocos estáveis — reusa o STATIC base do `coachSystemBuilder.ts`); loga `coach.report.tokens` com `inputTokens/cacheCreation/cacheRead/outputTokens`; `cost_usd_estimate` calculado a partir do `usage` com a tabela de preços do modelo (constante no gerador, aproximação aceitável); gravados em cada `reports` row. Fail-soft / `dataSufficiency='low'` (sem LLM) → custo ≈ 0/null.

### 3.6 Replica-safe

Todo cron tick envolto em `withAdvisoryLock` (ADR-144). O claim de job no processor é atômico (`UPDATE ... WHERE status='pending' RETURNING *` — se 0 rows, outro runner já pegou; pula). 2 réplicas não processam o mesmo job 2x nem enfileiram 2x (`ON CONFLICT DO NOTHING` no enqueuer + claim atômico no processor).

---

## 4. Consequências

### Positivas
- Relatórios resilientes: retry com backoff, fail-soft determinístico — o user **sempre** recebe algo útil (números completos no pior caso).
- Idempotência em todas as camadas: enfileiramento (`ON CONFLICT`), geração (UNIQUE + pré-check/UPSERT), re-processamento (job que já tem `reports` row vira `done` sem chamar o LLM), réplicas (claim atômico + advisory lock).
- Tz-awareness: cada user recebe na "segunda 7h dele" — granularidade de 1h cobre todos os fusos (UTC-12 a UTC+14).
- Auditável: `report_jobs.last_error`/`attempts`/`status`; `reports.cost_usd_estimate`/tokens/`degraded_reason`.
- Estende natural pra Daily/Monthly (AI-1C): só muda `report_type` + a regra do enqueuer + seções do `ReportContent`.
- Custo controlado: ~$0.045/relatório, prompt caching ativo, Haiku pra sumarização, fail-soft/low-data ≈ $0.
- Gating: uma alavanca de emergência só (`COACH_NUDGES_ENABLED`).

### Negativas / trade-offs
- 2 ticks de cron novos (enqueuer + processor) + 1 tabela de fila + 1 tabela de relatórios + 1 coluna nova. Aceito — o ganho de resiliência vale.
- A preference `report_weekly_enabled` é específica de "weekly" — AI-1C precisará migrar pra um padrão multi-tipo (JSONB ou colunas por tipo). Nota documentada.
- O `markdown` armazenado pode "envelhecer" se a renderização mudar — mas é o render canônico da época; relatórios antigos ficam com o que foi gerado (aceitável; o `content` estruturado também está lá).
- Desligar o `COACH_NUDGES_ENABLED` desliga os relatórios (não só os nudges) — comportamento desejado de kill switch global, mas o leitor de ops precisa saber (documentado).
- Snapshot de `timezone` no enqueue: se o user muda de fuso depois, o job já agendado não muda. Aceitável (o próximo já pega o novo fuso).

### Neutras
- Reusa toda a infra existente (`getLocalHour`, `listUsersForCron`, `withAdvisoryLock`, `recommendLessonForUser`, `generateWeeklyStudyPlan`, `coachMemory`, `coachSystemBuilder`) — sem dep nova.
- Email fica pra AI-2B (founder Q7); as colunas `channel_email`/`channel_push` existem mas não são acionadas.

---

## 5. Notas para o test-writer

- **Tz-mocking:** `enqueueWeeklyReportJobsTick({ now })` recebe `now: Date` injetável — testar `now` = uma segunda 07:xx no fuso de um user Pro+ opt-in (cria 1 job), terça/hora≠7 (não cria), fusos extremos (`Pacific/Kiritimati` UTC+14, `Pacific/Pago_Pago` UTC-11 — quando é segunda 7h **lá**, cria; sem colisão/pulo), vira de ano (semana 52→01). Idempotência: chamar 2× no mesmo tick → 1 job só (`ON CONFLICT DO NOTHING` — sem exceção).
- **Mock do gerador no processor:** o `processReportJobsTick` chama `generateWeeklyReport` — mockar o gerador (não precisa do Anthropic real). Testar: job `pending` due → `running` → gera (mock) → `reports` row → `done` + `report_id`; job que já tem `reports` row → `done` sem chamar o gerador; gerador lança 1× → job `pending`, `attempts=1`, `next_attempt_at ≈ now+15min`, `last_error` preenchido, não re-chamado até `next_attempt_at`; gerador lança 3× → fail-soft (`reports` `status='degraded'`, `degraded_reason='llm_failed_3x'`, job `done` — nunca `failed`).
- **Claim atômico:** simular 2 `processReportJobsTick` concorrentes — o mesmo job não é processado 2×. (O claim é `UPDATE ... WHERE status='pending'`; mockar o storage pra retornar 0 rows no 2º claim.)
- **Mock do Anthropic no gerador:** ver ADR-156 §notas (lesson #5/#35 — `new AnthropicCtor` mock; sem `ANTHROPIC_API_KEY` → determinístico).
- **`COACH_NUDGES_ENABLED='false'`:** nem o enqueuer nem o processor fazem trabalho (return cedo, log `reason: 'nudges_globally_disabled'`).
- **Elegibilidade:** Free → enqueuer não cria; Pro+ com `reportWeeklyEnabled=false` → não cria; Pro+ opt-in que faz downgrade entre enqueue e processar → job `skipped` (`last_error='no_longer_eligible'`).
- **`updateCoachPreferencesSchema`:** `{ reportWeeklyEnabled: true }` aceito (`.strict()`); `GET /api/coach/preferences` reflete; campos crus de congelamento ainda `400` (comportamento AI-1A mantido).
- **Lessons:** #3 (mock valida shape real do storage — `getCoachPreferences` precisa back-fillar `reportWeeklyEnabled ?? false`), #7 (schema gradual), #9 (logar/safe-deny), #34 (storage injetável).

## 6. Referências

- Spec: `Docs/specs/sprint-ai-1b.md` (RF-01/02/03/04/05/06/09)
- Plano: `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (Tema F)
- Decisões do founder: `memory/ai_agents_improvement_plan_2026-05-11.md` (Q2/Q3/Q5/Q6/Q7/Q10)
- ADR-144 (advisory lock), ADR-152 (kill switch / anti-fadiga), ADR-151 (perfil estruturado), ADR-150 (hub), ADR-148 (agente único), ADR-146 (write tools confirm), ADR-021/ADR-019 (modelo Coach / prompt caching)
- ADR-156 (aposentadoria dos crons + gerador do Weekly Report), ADR-157 (timeline + render + B-GAPCHECK/B-IMPORT), ADR-158 (quick suggestions)
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{report-job-runner-flow,weekly-report-structure,report-tables-er}.mermaid`
- CLAUDE.md §6.1 (regra de fonte do histórico), §9 (lessons learned)
