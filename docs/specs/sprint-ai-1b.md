# Spec: Sprint AI-1B — Weekly Report + Job Runner timezone-aware + Gap-check / B-IMPORT + Quick Suggestions + Hub Timeline

## Status
Aprovada

## Resumo
Segundo sprint da Fase 1 do plano de melhoria dos agentes de IA. Entrega: tabelas `report_jobs` + `reports`; um **job runner timezone-aware** (cron) que enfileira e processa jobs de relatório com idempotência + retry; o **Weekly Report** (opt-in, só Pro+), gerado segunda 7h no fuso do usuário, absorvendo os 2 crons de segunda hoje existentes (coach recommendation 6h BRT + weekly study plan 9h UTC); **gap-check D-3** e **nudge B-IMPORT** (duas categorias novas que passam pelo anti-fadiga do AI-1A); **quick suggestions anti-blank-page** no chat; **fail-soft** (relatório determinístico quando o LLM falha 3x); e o **hub timeline** — a aba "Relatórios e avisos" do `/coach-ai` passa de EmptyState a uma timeline real (relatórios + nudges). Email FICA pra depois (founder Q7: Fase 1 = só in-app).

## Contexto
- **Plano estratégico:** `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (Tema F — Relatórios automáticos: F2 Weekly, F5 gap-check, F6 B-IMPORT, F8 fail-soft; Tema C — C4 anti-blank-page; Tema G — G3 anti-fadiga obrigatório; Tema A — A2 hub com timeline).
- **Decisões do founder:** `memory/ai_agents_improvement_plan_2026-05-11.md` — Q2 relatórios opt-in disponíveis pra Trial+Pro+; Q5 reforça **só Pro+** (alinhamento abaixo); Q3 modelo Coach = sonnet 4.6 (haiku 4.5 pra sumarização); Q6 mental tracking só dados de warm-up, sem prompts invasivos; Q7 email só depois (Fase 1 = in-app); Q10 aposentar os 2 crons de segunda → absorver no Weekly Report.
- **Sprint anterior (AI-1A — `95eb4ba`):** entregou o anti-fadiga completo (`shouldSendNudge` é o gate de toda proatividade — checks: kill switch global `COACH_NUDGES_ENABLED` → toggle de categoria → categoria congelada → snooze → quiet hours → daily cap → hourly cap → one-shot per cycle; `nudgeAutoFreeze.checkAndFreezeCategory`); o perfil estruturado `users.ai_structured_profile` (`tomPreferido`, `metas`, `focoDoMes`, `nivel`, etc.); detecção de nível; onboarding wizard; system prompt enriquecido.
- **Estado do hub `/coach-ai` (AI-0B — ADR-150):** 4 tabs URL-persisted (`?tab=chat|reports|audit|prefs`). A tab `reports` (`ReportsPanel` em `client/src/pages/CoachAI.tsx`) é hoje um `EmptyState` (`data-testid="coach-ai-reports-empty"`) — desenhada para a Fase 1 plugar a timeline sem mexer no layout.
- **Crons de segunda hoje rodando:**
  - `generateCoachRecommendationsTick` (`server/coach/jobs/generateCoachRecommendations.ts`) — schedule `0 6 * * 1` tz `America/Sao_Paulo` (registrado em `server/coach/cronRunner.ts`, gated por `COACH_NUDGES_ENABLED !== 'false'`). Gera 1 recomendação de lesson por user via `recommendLessonForUser` (5 tiers em cascata: short-circuit sem dados → Coach IA Anthropic → leak→tag → popular → recente → null) e grava em `coach_lesson_recommendations` (`storage.createCoachRecommendation`, idempotente por `(userId, weekStartDate)`). Consumido pelo frontend via `GET /api/home/coach-recommendation` (`server/routes/home-coach-recommendation.ts`) → componentes `CoachRecommendationCard.tsx`, `EmptyPerformanceCluster.tsx`, `ImmediateAction.tsx`, `HomeSettingsGear.tsx` na página /inicio.
  - `runWeeklyStudyPlan` (`server/jobs/generateWeeklyStudyPlan.ts`, registrado via `server/jobs/index.ts`) — schedule `0 9 * * 1` UTC (= 06h BRT). Gera 1 plano semanal de estudo por user via `generateWeeklyStudyPlan` (`server/services/studyWeeklyPlanService.ts`) e grava em `study_weekly_plans` (UPSERT por `(userId, weekStartDate)`). Consumido pelo frontend via `StudyWeeklyPlanCard.tsx` (rota `server/routes/study-weekly-plan.ts`).
- **Infra reaproveitável:** `server/coach/timezone.ts` (`getLocalHour(date, tz)` — Intl, fallback Sao Paulo); `storage.listUsersForCron(filter)` (whitelist de planos; retorna `{userPlatformId, timezone, subscriptionPlan}`); `storage.getUserTimezone(userId)`; `withAdvisoryLock(key, fn)` (`server/lib/advisoryLock.ts` — ADR-144, contra N réplicas); `node-cron` estático; `coachMemory.ts` (sumarização Haiku — `checkMonthlyCompaction`); `coachSystemBuilder.ts` (CITATIONS_RULES + bloco STATIC base único Grindfy AI — ADR-148); o registry de tools do Coach com as write tools já registradas no AI-0A (`register_tournament_in_grade`, `log_leak_focus`, `record_wallet_transaction`, `log_study_session`, etc. — `server/coachTools/`).

## Usuários
- **Jogador Pro/Premium (Pro+):** recebe o Weekly Report toda segunda (in-app card na timeline do hub), recebe gap-check D-3 e nudge B-IMPORT, vê quick suggestions no chat, vê a timeline no hub.
- **Jogador Free/Trial:** **não** recebe o Weekly Report (Q5 — só Pro+; alinhamento abaixo resolve a aparente contradição com Q2). Vê quick suggestions e o hub timeline (que mostra os nudges in-app que ele recebe). Gap-check e B-IMPORT são proatividade — Free não recebe (gate de plano + anti-fadiga).
- **Admin:** kill switch por categoria já existe (`POST /api/admin/coach/freeze-category` — AI-1A) e cobre as categorias novas; o kill switch global `COACH_NUDGES_ENABLED` cobre a proatividade toda (e a geração de relatórios — ver RF-04).

### Alinhamento Q2 vs Q5 (resolução de ambiguidade)
Q2 diz "relatórios opt-in, disponíveis pra Trial + Pro+"; Q5 diz "relatórios = só Pro+". Decisão para este sprint (Weekly Report): **só Pro+** (`subscriptionPlan IN ('pro','premium')`). O "Trial" de Q2 é tratado como caso futuro/AI-1C (quando o gating estrito por tier for formalizado e o Daily Debrief entrar); a coluna `report_jobs.subscription_plan_at_enqueue` registra o plano no momento do enfileiramento para auditoria, mas a elegibilidade de hoje é Pro+. **Não bloqueia o sprint** — se o founder quiser incluir Trial depois, é trocar uma constante de filtro.

---

## Requisitos Funcionais

### RF-01: Schema — tabela `report_jobs` (fila de jobs de relatório)
**Descrição:** Migração `0067` (próximo livre). Tabela `report_jobs` = fila de jobs agendados de geração de relatório. Drizzle + drizzle-zod em `shared/schema.ts`. IDs via `nanoid()`. Lesson #7: colunas novas com `optional + default` onde fizer sentido; nada de required puro que quebre back-fill.

**Colunas:**
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar(21) | PK, not null | `nanoid()` |
| `user_id` | varchar(21) | not null, FK → `users.user_platform_id` ON DELETE CASCADE | |
| `report_type` | varchar(16) | not null | enum-like: `'weekly'` (`'monthly'`, `'daily'`, `'quarterly'` reservados — só `'weekly'` usado neste sprint) |
| `period_start` | date | not null | início do período coberto (segunda da semana, no fuso do user) |
| `period_end` | date | not null | fim do período (domingo da semana) |
| `scheduled_for` | timestamp (with tz) | not null | instante UTC em que o job deve ser processado (= "segunda 07:00 no fuso do user", convertido pra UTC) |
| `status` | varchar(16) | not null, default `'pending'` | `'pending'` → `'running'` → `'done'` \| `'failed'` \| `'skipped'` |
| `attempts` | integer | not null, default `0` | incrementado a cada tentativa de geração |
| `max_attempts` | integer | not null, default `3` | quando `attempts >= max_attempts` e ainda falhou → fail-soft (RF-09) e marca `done` com `degraded` no `reports` row (não fica `failed` pra sempre) |
| `next_attempt_at` | timestamp (with tz) | nullable | backoff: quando falha e ainda tem tentativa, `next_attempt_at = now + backoff(attempts)`; o runner só re-tenta jobs com `next_attempt_at <= now` (ou null) |
| `timezone` | varchar(64) | nullable | snapshot do `users.timezone` no momento do enfileiramento (fallback `'America/Sao_Paulo'` quando processar) |
| `subscription_plan_at_enqueue` | varchar(16) | nullable | snapshot do plano no enfileiramento (auditoria; elegibilidade real revalidada no processamento) |
| `report_id` | varchar(21) | nullable, FK → `reports.id` ON DELETE SET NULL | preenchido quando o job gera um `reports` row |
| `last_error` | text | nullable | mensagem do último erro (truncada ~1000 chars) — lesson #9: logar antes de fallback |
| `enqueued_by` | varchar(32) | nullable | `'cron_enqueuer'` \| `'manual'` \| `'backfill'` |
| `created_at` | timestamp (with tz) | not null, default now | |
| `updated_at` | timestamp (with tz) | not null, default now | |

**Índices:**
- `idx_report_jobs_due` em `(status, scheduled_for)` — o runner faz `WHERE status='pending' AND scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)`.
- `uniq_report_jobs_user_type_period` UNIQUE em `(user_id, report_type, period_start)` — **idempotência do enfileiramento** (não cria 2 jobs pro mesmo user/tipo/semana). O enqueuer faz `INSERT ... ON CONFLICT DO NOTHING`.
- `idx_report_jobs_user_status` em `(user_id, status)` — pra listagens.

**Critério de aceitação:**
- [ ] Migração `0067_report_jobs_reports.sql` cria `report_jobs` com as colunas, defaults e os 3 índices acima.
- [ ] `shared/schema.ts` exporta `reportJobs` (pgTable), `ReportJob` / `InsertReportJob` (types), e `insertReportJobSchema` (drizzle-zod ou zod manual com `.optional()`/`.default()` nos campos opcionais).
- [ ] Tentar inserir 2 jobs com mesmo `(user_id, report_type, period_start)` → o segundo é no-op (ON CONFLICT DO NOTHING) — nenhuma exceção propagada.
- [ ] `report_type` aceita `'weekly'`; valores fora do conjunto reservado não são exigidos para passar (a validação rígida é no service, não na coluna).

### RF-02: Schema — tabela `reports` (relatórios gerados)
**Descrição:** Mesma migração `0067`. Tabela `reports` = relatórios efetivamente gerados (1 por job concluído). Conteúdo estruturado em JSONB (seções) + um campo markdown renderizável derivado. Lesson #7.

**Colunas:**
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar(21) | PK, not null | `nanoid()` |
| `user_id` | varchar(21) | not null, FK → `users.user_platform_id` ON DELETE CASCADE | |
| `report_type` | varchar(16) | not null | `'weekly'` neste sprint |
| `period_start` | date | not null | |
| `period_end` | date | not null | |
| `status` | varchar(16) | not null, default `'ready'` | `'ready'` (gerado ok, com prosa) \| `'degraded'` (fail-soft — só números, sem insights de LLM) |
| `content` | jsonb | not null, default `'{}'::jsonb` | estrutura `ReportContent` — ver RF-05.4. Inclui as ~8 seções estruturadas + metadados. |
| `markdown` | text | nullable | render markdown completo do relatório (derivado de `content`) — usado pela página/modal de leitura (RF-08); nullable porque o frontend pode renderizar a partir do `content` se preferir, mas a recomendação é gerar e gravar o markdown. |
| `model_used` | varchar(64) | nullable | ex `'claude-sonnet-4-6'` ou `null` quando `degraded` |
| `summarizer_model_used` | varchar(64) | nullable | ex `'claude-haiku-4-5'` quando houve sumarização de contexto |
| `cost_usd_estimate` | numeric(10,4) | nullable | custo estimado (sonnet ~$0.045/weekly; 0 quando `degraded`) — calculado a partir de `usage` (input/cache/output tokens) |
| `input_tokens` | integer | nullable | |
| `cache_creation_input_tokens` | integer | nullable | |
| `cache_read_input_tokens` | integer | nullable | |
| `output_tokens` | integer | nullable | |
| `degraded_reason` | varchar(64) | nullable | `'llm_failed_3x'` \| `'no_anthropic_key'` \| `'insufficient_data'` (quando o user tem dados de menos, gera um report "minimalista" mas marca `ready` com `content.dataSufficiency = 'low'` — `degraded` é só pra falha técnica) |
| `read_at` | timestamp (with tz) | nullable | quando o user abriu o relatório |
| `dismissed_at` | timestamp (with tz) | nullable | quando o user fechou/arquivou o card na timeline |
| `generated_at` | timestamp (with tz) | not null, default now | |
| `created_at` | timestamp (with tz) | not null, default now | |

**Índices:**
- `idx_reports_user_generated` em `(user_id, generated_at DESC)` — pra a timeline.
- `uniq_reports_user_type_period` UNIQUE em `(user_id, report_type, period_start)` — **idempotência da geração** (1 relatório por user/tipo/semana). O service faz UPSERT ou pré-check.

**Critério de aceitação:**
- [ ] Migração cria `reports` com colunas, defaults e os 2 índices.
- [ ] `shared/schema.ts` exporta `reports` (pgTable), `Report` / `InsertReport`, `insertReportSchema`, e um tipo `ReportContent` (interface TS para o shape do `content` — não precisa ser pgTable; pode ser `type ReportContent = { ... }` em `shared/schema.ts` ou num módulo dedicado).
- [ ] Gerar 2 relatórios pro mesmo `(user_id, 'weekly', period_start)` → o segundo não cria duplicata (UPSERT/pré-check) — nenhuma exceção.
- [ ] `status` default `'ready'`; um relatório fail-soft tem `status='degraded'`, `model_used=null`, `cost_usd_estimate=0` (ou null), `degraded_reason` preenchido.

### RF-03: Job runner timezone-aware — cron, idempotência, retry com backoff
**Descrição:** Um runner in-process (`server/jobs/reportJobRunner.ts` ou `server/coach/jobs/reportJobRunner.ts` — system-architect decide o lugar; preferir `server/jobs/` por consistência com `purgeSpotScreenshots`, `refreshNews`, etc.) com **dois ticks**:

1. **Enqueuer (`enqueueWeeklyReportJobsTick`)** — roda **a cada hora** (`0 * * * *`). Para cada user elegível (Pro+ via `listUsersForCron("subscription_plan IN ('pro','premium')")`) **com o Weekly Report opt-in ligado** (RF-06): computa, no fuso do user, se "agora é segunda E a hora local é 7" (`getLocalHour(now, user.timezone) === 7` && é segunda no fuso do user). Se sim, calcula `period_start` (= a segunda **da semana corrente**, no fuso do user, em formato `date`) e `period_end` (= domingo seguinte), e faz `INSERT INTO report_jobs (...) ON CONFLICT (user_id, report_type, period_start) DO NOTHING` com `report_type='weekly'`, `scheduled_for = now` (já é a hora certa), `status='pending'`, `timezone = user.timezone`, `subscription_plan_at_enqueue = user.subscriptionPlan`, `enqueued_by = 'cron_enqueuer'`. (Alternativa de design: enfileirar com `scheduled_for` futuro num único tick diário às 00:xx — system-architect escolhe; o critério é: **um job por user por semana, no momento certo do fuso dele**, e idempotente.)
   - **Por que "a cada hora" e não "uma vez de madrugada":** os fusos espalham o "segunda 7h local" por ~24h de UTC. Rodar de hora em hora cobre todos os fusos com granularidade de 1h (suficiente — o relatório não é time-critical no minuto). Lesson da casa: `processBStudyTick` já usa esse padrão (`0 * * * *` + filtro `getLocalHour === targetLocalHour`).
2. **Processor (`processReportJobsTick`)** — roda **a cada 15 minutos** (`*/15 * * * *`). Pega até N jobs (`LIMIT 25` por tick — paginação defensiva) com `status='pending' AND scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)` ordenados por `scheduled_for ASC`. Para cada job:
   - Marca `status='running'`, `attempts = attempts + 1`, `updated_at = now` (idealmente num `UPDATE ... WHERE id=? AND status='pending' RETURNING *` para evitar 2 runners pegarem o mesmo job — claim atômico; combinado com `withAdvisoryLock` cobre o cenário de réplicas).
   - **Revalida elegibilidade:** se o user não é mais Pro+ OU o opt-in foi desligado entre o enfileiramento e agora → marca `status='skipped'`, `last_error='no_longer_eligible'`, segue.
   - **Idempotência da geração:** se já existe `reports` row com `(user_id, 'weekly', period_start)` → marca `status='done'`, `report_id = <existente>`, segue (não regera).
   - Chama o gerador do Weekly Report (RF-05). Se ok → cria/UPSERT o `reports` row, marca o job `status='done'`, `report_id = <novo>`.
   - Se o gerador falhar (exceção / LLM 3x dentro do gerador / sem `ANTHROPIC_API_KEY`): **logar o erro** (`console.error('report.job.error', { jobId, userId, attempts, err })` — lesson #9), gravar `last_error`. Se `attempts < max_attempts` → marca `status='pending'`, `next_attempt_at = now + backoff(attempts)` (backoff exponencial: `attempts=1 → +15min`, `2 → +1h`, `3 → +4h` — constantes configuráveis). Se `attempts >= max_attempts` → **fail-soft (RF-09)**: gera o relatório determinístico (só números), cria o `reports` row com `status='degraded'`, `degraded_reason='llm_failed_3x'`, marca o job `status='done'`, `report_id = <novo>`. (O job **não** fica `failed` pra sempre — o user recebe algo útil.)
   - `withAdvisoryLock("cron:report-job-runner", ...)` em torno do tick inteiro (padrão ADR-144).
   - Pacing: ~200ms entre jobs (Anthropic rate limit) — padrão de `runWeeklyStudyPlan`.
3. **Gating `COACH_NUDGES_ENABLED`:** o **enqueuer** e o **processor** **não rodam** quando `process.env.COACH_NUDGES_ENABLED === 'false'` (mesmo precedente dos crons de proatividade no `cronRunner.ts`). Decisão: relatórios contam como "proatividade" e respeitam o mesmo kill switch global — não criar uma flag nova. (Os jobs já enfileirados também não são processados enquanto a flag estiver off; quando voltar, o processor pega os atrasados — `scheduled_for <= now` ainda vale.)
4. **Registro:** o runner se registra junto com os outros jobs (`server/jobs/index.ts` → `registerAllJobs`), ou num `registerReportJobRunner()` chamado de lá. Mesmo gating de ativação dos outros crons (`NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'`).

**Critério de aceitação:**
- [ ] `enqueueWeeklyReportJobsTick({ now })` com `now` = uma segunda 07:xx no fuso de um user Pro+ opt-in → cria exatamente 1 `report_jobs` row (`status='pending'`, `report_type='weekly'`, `period_start` = a segunda da semana no fuso do user); chamar de novo no mesmo tick (ou no tick seguinte da mesma hora) → não cria duplicata.
- [ ] User Pro+ com opt-in **desligado** → enqueuer não cria job pra ele.
- [ ] User Free → enqueuer não cria job.
- [ ] User com `now` = terça (ou hora local ≠ 7) → enqueuer não cria job pra ele nesse tick.
- [ ] Fuso extremo (ex `Pacific/Kiritimati` UTC+14, `Pacific/Pago_Pago` UTC-11): quando é segunda 7h **lá**, o enqueuer (rodando em UTC) cria o job; quando é segunda 7h em São Paulo, cria pro user de São Paulo — sem colisão, sem pular.
- [ ] `processReportJobsTick` pega um job `pending` com `scheduled_for <= now`, marca `running`, gera o relatório (mock do gerador), cria o `reports` row, marca `done`, seta `report_id`.
- [ ] Job já com `reports` row para `(user, 'weekly', period_start)` → processor marca `done` sem regerar (não chama o gerador / não chama Anthropic).
- [ ] Gerador falha 1ª vez → job volta a `pending`, `attempts=1`, `next_attempt_at ≈ now+15min`, `last_error` preenchido; não chamado de novo até `next_attempt_at`.
- [ ] Gerador falha 3x (`attempts` chega a `max_attempts`) → fail-soft: cria `reports` row `status='degraded'`, `degraded_reason='llm_failed_3x'`; job vira `done` (não `failed`).
- [ ] `COACH_NUDGES_ENABLED='false'` → nem o enqueuer nem o processor fazem qualquer trabalho (retornam cedo); o erro/log informa `reason: 'nudges_globally_disabled'`.
- [ ] Dois `processReportJobsTick` concorrentes (simulado) não processam o mesmo job 2x (claim atômico `WHERE status='pending'`).

### RF-04: Opt-in do Weekly Report (preference, só Pro+)
**Descrição:** O opt-in mora numa preference do usuário. Decisão: **reusar `userCoachPreferences`** adicionando uma coluna `report_weekly_enabled boolean NOT NULL DEFAULT false` (opt-in → default `false`; founder Q2 "opt-in"). Migração `0067` adiciona a coluna (NOT NULL DEFAULT false — back-fill trivial). O schema zod `updateCoachPreferencesSchema` ganha `reportWeeklyEnabled: z.boolean().optional()` (mantém `.strict()`). O `buildPrefsResponse` (GET `/api/coach/preferences`) passa a incluir `reportWeeklyEnabled` no payload. A UI da aba Preferências (RF-08 do hub) ganha um toggle "Relatório semanal do Grindfy AI" — **só visível se o user for Pro+** (o GET de preferences ou um campo de plano no contexto do frontend gateia a visibilidade; se um Free conseguir setar `true` via API direta, o enqueuer mesmo assim não enfileira porque revalida o plano — defesa em profundidade).
- **Helper:** `isWeeklyReportEligible(userId): Promise<boolean>` (ou inline no enqueuer) = `plan IN ('pro','premium')` && `prefs.reportWeeklyEnabled === true`. Safe-deny em erro (lesson #9).
- **Não-objetivo:** não criar uma tabela de "report subscriptions" separada (overkill pra 1 tipo de relatório; quando AI-1C adicionar Daily/Monthly, system-architect pode decidir migrar pra um padrão de array/JSONB — fica como nota).

**Critério de aceitação:**
- [ ] Migração adiciona `user_coach_preferences.report_weekly_enabled` NOT NULL DEFAULT false.
- [ ] `GET /api/coach/preferences` inclui `reportWeeklyEnabled: boolean` no response.
- [ ] `PUT /api/coach/preferences { reportWeeklyEnabled: true }` (zod `.strict()` aceita) → persiste; GET subsequente reflete.
- [ ] `isWeeklyReportEligible` retorna `true` só pra (Pro+ && `reportWeeklyEnabled===true`); `false` pra Free com `true`, pra Pro+ com `false`, e `false` em erro de leitura.
- [ ] A UI da aba Preferências mostra o toggle só pra Pro+ (Free vê uma linha "disponível no plano Pro" desabilitada ou nada — system-architect decide; o critério mínimo é: o toggle funcional não aparece pra Free).

### RF-05: Weekly Report — desenho das ~8 seções, gatilho, conteúdo, CTAs, custo, fail-soft
**Descrição:** O gerador (`server/services/weeklyReportGenerator.ts` ou similar; o RF-03 chama `generateWeeklyReport({ userId, periodStart, periodEnd })`). Modelo: `process.env.COACH_MODEL ?? 'claude-sonnet-4-6'` (founder Q3 — usar o canônico do projeto; **não** hardcodar `sonnet-4-6` se houver uma constante; verificar `coachSystemBuilder.ts` / ADR-021 para o nome exato e usar a mesma fonte). Sumarização de contexto via Haiku se o contexto ficar grande (reaproveitar `coachMemory.ts` / `checkMonthlyCompaction` ou um helper de sumarização) — registrar `summarizer_model_used`. Custo estimado ~$0.045/relatório — calcular a partir do `usage` retornado e gravar em `reports.cost_usd_estimate` (+ os campos de tokens).

#### RF-05.1 — Gatilho
- Criado via `report_jobs` row pelo **enqueuer** (RF-03), `report_type='weekly'`, **segunda 07:00 no fuso do user** (`scheduled_for` ≈ esse instante em UTC). `period_start` = a segunda da semana corrente no fuso do user; `period_end` = o domingo seguinte. (Decisão de qual semana cobrir: a **semana que acabou** — i.e. se enfileira segunda 7h dia 12/mai, cobre 5/mai–11/mai. System-architect confirma e a constante de offset fica clara.)
- O processor processa o job (a cada 15min) → chama o gerador → cria o `reports` row → marca o job `done`.

#### RF-05.2 — Dados de entrada (fontes)
Reaproveitar storage methods existentes. **Toda query de histórico filtra `grind_session_id IS NULL`** (CLAUDE.md §6.1). O gerador monta um "bundle de dados da semana" e passa pro LLM como contexto (com as regras de citation/confidence do `coachSystemBuilder.ts` — cada insight cita a fonte). Fontes por seção:

| Seção | Conteúdo | Fonte de dado |
|---|---|---|
| **0. Cabeçalho (tom pessoal)** | "Sua semana — DD/mês a DD/mês. Você jogou Xh, N torneios, +$Y (ROI Z%). [comparativo curto vs média 6 semanas]." Tom = `aiStructuredProfile.tomPreferido` (gentle/balanced/direct; fallback `userCoachPreferences.coachTone`). | `getPerformanceByPeriod(userId, '7d')` (volume, ROI, profit) + média 6 semanas (`getPerformanceByPeriod` ou agregação de 42d / 6×7d) + `aiStructuredProfile`. |
| **1. Volume + Resultados** | Sessões concluídas vs planejadas; torneios / ITM% / FTs / cravadas; ROI da semana vs ROI 30d. | `grind_sessions` da semana (concluídas) vs `planned_tournaments`/`weekly_plans` da semana; `tournaments` da semana (`getTournaments` com period inline, `grindSessionId IS NULL`) para ITM/FT; `getPerformanceByPeriod('7d'/'30d')`. |
| **2. Bankroll (delta da semana)** | Profit por moeda nativa + USD; banca atual vs início da semana; transferências/saques da semana. | `walletService.getConsolidatedBalance` / `bankrollService` (snapshots `bankroll_snapshots`); `wallet_transactions` da semana (transfers/withdrawals). **Normalizar para USD antes de comparar** (lesson #6). |
| **3. Selection** | Rodou o Tournament Selector essa semana? Aderência à grade (planejado vs jogado); top 3 categorias ROI+, bottom 3 com leak de seleção ("30 hypers GG, ROI -8% em 90d — bloqueio?"). | `getAnalyticsByModifier` / `getAnalyticsBy*` (ROI por dimensão); `planned_tournaments` vs `tournaments`; `tournament_selector` usage (se houver log) — se não houver telemetria de "rodou o selector", omitir essa frase (não inventar). |
| **4. Estudos** | Tempo de estudo registrado na semana; tópicos cobertos; foco escolhido vs cobertura real; **+ a recomendação de lesson da semana** (absorve o cron `generateCoachRecommendations` — ver RF-07). | `study_sessions` (v2) da semana; `findActiveLeakFocusList` / foco do mês; `recommendLessonForUser(...)` chamado **dentro** do gerador (ou o resultado gravado em `coach_lesson_recommendations` — ver RF-07). |
| **5. Mental + Operacional (opt-in)** | Sessões com tilt reportado, off days, **dados de warm-up** (focus rating, etc.) — **só dados de warm-up, sem prompt invasivo** (founder Q6). Se o user não usa warm-up / não tem dados → seção omitida ou "sem dados de warm-up essa semana". | `warmupService` (rituais/relatórios de warm-up da semana); `grind_sessions` com flag de tilt; off days (se houver `mark_off_day` — não tem ainda, é AI-2A → omitir). |
| **6. 3 insights do Coach (LLM)** | Exatamente 3 insights acionáveis, **data-grounded** — cada um cita a fonte (regras do `coachSystemBuilder.ts` / CITATIONS_RULES). Ex: "Seu ROI em hypers caiu pra -8% em 90d (n=120 torneios) — vale bloquear pra próxima grade." Confidence tag quando a amostra é pequena. | LLM (sonnet) recebe o bundle de dados das seções 1-5 + o perfil estruturado + as regras de citation; gera os 3 insights. |
| **7. Plano da próxima semana** | Sugestão de grade (link pro Tournament Selector / Grade Planner — não monta a grade, AI-2A; ou usa a tool `register_tournament_in_grade` se o user clicar); 1 foco de estudo; 1 ação recomendada. **Absorve o cron `generateWeeklyStudyPlan`** — ver RF-07. | LLM + `generateWeeklyStudyPlan(...)` chamado dentro do gerador (ou o resultado gravado em `study_weekly_plans` — ver RF-07); leaks de `detectLeaks`; `aiStructuredProfile.focoDoMes`. |
| **8. CTAs (loop fechado)** | 1+ CTA estruturado por seção/insight, cada um virando **uma tool que JÁ existe** (AI-0A: `register_tournament_in_grade`, `log_leak_focus` / `verify_leak_progress`, `record_wallet_transaction`, `log_study_session`) OU um **link pra uma página** (`/grade-planner`, `/upload`, `/estudos`, `/biblioteca/...`, `/coach-ai?tab=chat`). **NÃO** referenciar `bulk_propose_grade`, `schedule_study_block`, `define_career_goal`, `mark_off_day` (são AI-2A — não existem ainda). | Definido no gerador; o `content.cta[]` lista `{ label, kind: 'tool'|'link', toolName?, href?, payloadHint? }`. CTAs que viram tool: ao clicar no chat, dispara o `coachToolRunner` (confirm + undo — ADR-146); links: navegação direta. |

#### RF-05.3 — Personalização por nível (leve)
Reportar leve adaptação por `aiStructuredProfile.nivel`: iniciante → mais educação/benchmark, menos seções de variância; intermediário → foco em leaks + selection + comparativo pool BR; pro/high-stakes → foco em variância + carreira, menos hand-holding. Implementação: passar o `nivel` (e `nivelConfirmado`) no contexto do LLM + uma instrução no prompt. **Não** criar templates separados por nível neste sprint (o LLM adapta o tom/foco; a estrutura das 8 seções é a mesma). Quando `nivel === 'sem_dados'` ou o user tem pouco dado → ver RF-05.5.

#### RF-05.4 — Estrutura do `content` (JSONB) + markdown
`ReportContent` (TS interface em `shared/schema.ts` ou módulo dedicado):
```
ReportContent = {
  schemaVersion: number;              // 1
  reportType: 'weekly';
  periodStart: string;                // 'YYYY-MM-DD'
  periodEnd: string;                  // 'YYYY-MM-DD'
  dataSufficiency: 'ok' | 'low';      // 'low' → relatório minimalista (RF-05.5)
  level?: AiPlayerLevel | null;       // do perfil estruturado
  tone?: 'gentle' | 'balanced' | 'direct';
  header: { title: string; summaryLine: string; comparison?: string };
  sections: {
    volumeResults: { sessionsCompleted: number; sessionsPlanned: number; tournaments: number; itmPct: number | null; finalTables: number; wins: number; roiWeek: number | null; roi30d: number | null; narrative?: string };
    bankroll: { profitByCurrency: Array<{ currency: string; native: number; usd: number }>; bankrollStart: number | null; bankrollNow: number | null; transfers: number; withdrawals: number; narrative?: string };
    selection: { ranThisWeek: boolean | null; adherencePct: number | null; topCategories: Array<{ label: string; roi: number; n: number }>; bottomCategories: Array<{ label: string; roi: number; n: number; suggestBlock: boolean }>; narrative?: string };
    study: { minutesLogged: number; topicsCovered: string[]; focusOfMonth: string | null; focusCoveragePct: number | null; recommendedLesson?: { lessonId: string; title: string; reason: string; ctaHref: string } | null; narrative?: string };
    mentalOps?: { hasWarmupData: boolean; warmupSessions: number; tiltSessions: number; avgFocusRating?: number | null; narrative?: string };  // ausente se opt-out / sem dados
  };
  insights: Array<{ text: string; citations: string[]; confidence?: 'high' | 'medium' | 'low' }>;  // exatamente 3 quando 'ok'
  nextWeekPlan: { gradeSuggestionHref: string | null; studyFocus: string | null; recommendedAction: string | null; weeklyStudyPlanRef?: { weekStartDate: string } | null };
  cta: Array<{ label: string; kind: 'tool' | 'link'; toolName?: string; href?: string; payloadHint?: Record<string, unknown> }>;
  generation: { model: string | null; summarizerModel: string | null; degraded: boolean; degradedReason: string | null };
};
```
- `markdown` = render legível das seções (o gerador produz e grava; o frontend pode renderizar de `content` direto se preferir, mas a página/modal (RF-08) usa `markdown` quando presente).
- Lesson #7: `schemaVersion` permite evolução; o frontend tolera campos ausentes.

#### RF-05.5 — Dados insuficientes (não confundir com fail-soft)
Se o user tem pouco/nenhum dado na semana (volume=0, sem sessões, sem snapshot, sem estudo): gerar um relatório **minimalista** — `content.dataSufficiency = 'low'`, `status='ready'` (não `degraded` — `degraded` é falha técnica), header tipo "Semana tranquila — você não registrou torneios. Quer importar seu histórico?" + 1 CTA link `/upload` + (se aplicável) a recomendação de lesson popular/recente (fallback do `recommendLessonForUser` Tier 0). Não chamar o LLM pra gerar 3 insights de prosa sobre nada (pode pular a seção `insights` ou colocar 1 insight "sem dados suficientes"). **Custo ≈ $0** nesse caminho (ou só a chamada de fallback que já é barata).

#### RF-05.6 — Fail-soft (degraded)
Ver RF-09. Resumo: LLM falha 3x (ou sem `ANTHROPIC_API_KEY`) → o gerador retorna um `ReportContent` **determinístico** — todas as seções 1-5 preenchidas com os números (sem `narrative`), `insights = []` (ou 1 insight determinístico genérico), `nextWeekPlan` só com os links/refs determinísticos, `cta` só com links, `generation.degraded = true`, `degradedReason = 'llm_failed_3x'`. O `reports` row fica `status='degraded'`. O user recebe os números, só sem a prosa.

#### RF-05.7 — Custo / tokens
- Prompt caching: o gerador usa o bloco STATIC cacheado quando possível (mesma estratégia do `recommendLessonForUser` / `coachSystemBuilder` — `cache_control: { type: 'ephemeral' }`). Logar `coach.report.tokens` com `inputTokens / cacheCreation / cacheRead / outputTokens` (padrão de `recommendLessonForUser`).
- `cost_usd_estimate` calculado a partir do `usage` com a tabela de preços do modelo (constante no gerador; aproximação aceitável).
- Pacing 200ms entre jobs no processor (RF-03).

**Critério de aceitação:**
- [ ] `generateWeeklyReport({ userId, periodStart, periodEnd })` com um user com dados → retorna `{ content, markdown, model, usage, status: 'ready' }`; `content.sections` tem as 5 seções com números coerentes; `content.insights` tem exatamente 3 itens, cada um com `citations.length >= 1`.
- [ ] Toda query de dados de histórico no gerador filtra `grind_session_id IS NULL` (verificável: chama `getTournaments`/`getPerformanceByPeriod` etc. que já injetam o filtro; queries inline novas adicionam explicitamente).
- [ ] Valores de moeda no `content.sections.bankroll` são normalizados para USD antes de comparar com qualquer threshold/`bankrollStart` (lesson #6).
- [ ] `content.cta[]` só referencia `toolName` ∈ {tools registradas no AI-0A} ou `href` (string de rota Wouter válida — ver lesson #19; rotas: `/grade-planner`, `/upload`, `/estudos`, `/biblioteca/...`, `/coach-ai`, etc.) — **nunca** `bulk_propose_grade` / `schedule_study_block` / `define_career_goal` / `mark_off_day`.
- [ ] User com volume=0 e sem dados → `content.dataSufficiency='low'`, `status='ready'`, header convidando a importar, CTA link `/upload`; o LLM **não** é chamado pra gerar 3 insights de prosa (ou é chamado uma vez de forma barata pro fallback de lesson).
- [ ] Tom: `content.tone` reflete `aiStructuredProfile.tomPreferido` (fallback `coachTone`); o prompt instrui o LLM a usar esse tom.
- [ ] Nível: `content.level` reflete `aiStructuredProfile.nivel`; o prompt recebe o nível + instrução de adaptação.
- [ ] Custo: `cost_usd_estimate` é preenchido (> 0 quando o LLM rodou; 0/null quando `degraded` ou `dataSufficiency='low'` sem LLM); tokens logados.
- [ ] `markdown` é gerado e não-vazio quando `status='ready'`.

### RF-06: Job runner — wiring com o opt-in e o gating
**Descrição:** (Coberto em RF-03 + RF-04; este RF é o ponto de verificação do wiring de ponta a ponta.)
- O `registerReportJobRunner()` é chamado de `server/jobs/index.ts` → `registerAllJobs()`.
- O enqueuer só considera users que `isWeeklyReportEligible` (Pro+ && opt-in).
- O processor revalida elegibilidade no momento de processar (defesa: user pode ter feito downgrade).
- `COACH_NUDGES_ENABLED='false'` desliga os dois ticks.
- O `CLAUDE.md` §4 ganha uma linha (ver RF-13) documentando que `COACH_NUDGES_ENABLED` também gateia a geração de relatórios.

**Critério de aceitação:**
- [ ] Boot do server em modo cron (`COACH_CRON_ENABLED=true`) registra o report job runner sem erro; `console.info('report.job.runner.started')`.
- [ ] Em modo cron com `COACH_NUDGES_ENABLED='false'` → `console.info` informa que o runner está desabilitado pelo kill switch; nenhum tick agendado.

### RF-07: Aposentar os 2 crons de segunda — `generateCoachRecommendations` + `generateWeeklyStudyPlan`
**Descrição:** O Weekly Report absorve a recomendação de lesson (seção 4) e o plano semanal de estudo (seção 7). Migração de comportamento:
1. **Desligar o agendamento dos 2 crons antigos:**
   - Remover (ou comentar com referência a este sprint) o `cron.schedule("0 6 * * 1", ...)` de `generateCoachRecommendationsTick` em `server/coach/cronRunner.ts`.
   - Remover (ou comentar) a chamada `registerWeeklyStudyPlanCron()` de `server/jobs/index.ts` (e/ou fazer `registerWeeklyStudyPlanCron` virar no-op com log "deprecated — absorbed by Weekly Report").
   - Os módulos `generateCoachRecommendations.ts` e `generateWeeklyStudyPlan.ts` (jobs) **não precisam ser deletados** — viram dead code agendado; podem ficar (com um comentário "DEPRECATED — agendamento removido no AI-1B; lógica reaproveitada pelo Weekly Report") para reduzir risco de quebra.
2. **Continuar preenchendo as tabelas `coach_lesson_recommendations` e `study_weekly_plans`** — porque o frontend (página /inicio: `CoachRecommendationCard`, `ImmediateAction`, etc.; e `StudyWeeklyPlanCard`) **consome essas tabelas** e **não muda neste sprint**. Decisão: o **gerador do Weekly Report**, ao montar a seção 4, chama `recommendLessonForUser(...)` e grava o resultado via `storage.createCoachRecommendation(...)` (idempotente por `(userId, weekStartDate)` — mesmo comportamento do cron antigo); ao montar a seção 7, chama `generateWeeklyStudyPlan({ userId, source: 'coach_auto', weekStartDate })` (UPSERT idempotente). Assim:
   - O frontend de /inicio e o `StudyWeeklyPlanCard` continuam funcionando sem mudança.
   - A `weekStartDate` usada para `coach_lesson_recommendations` deve ser a **mesma** que o cron antigo usava (`getCurrentWeekStartBRT()` — segunda BRT) para não quebrar o `GET /api/home/coach-recommendation` que lê com essa chave. **Atenção:** o Weekly Report usa `period_start` no fuso do user; mas a recomendação de lesson grava com `getCurrentWeekStartBRT()` (consistência com o consumidor existente). O system-architect documenta esse detalhe (duas noções de "semana" coexistem: a do report = fuso do user; a da rec de lesson = BRT, por back-compat).
   - Idem para `study_weekly_plans`: `weekStartDate` = a segunda UTC (`utcMondayOfWeek` — o que `runWeeklyStudyPlan` usava) para não quebrar `StudyWeeklyPlanCard`. Ou: o system-architect decide unificar tudo no fuso do user e ajustar os consumidores — **fora de escopo deste sprint** (risco de regressão); preferir manter as chaves de semana como estão e só mudar quem aciona a geração.
3. **Idempotência cruzada:** se por algum motivo um cron antigo ainda rodar (ex: rollback parcial), o Weekly Report não duplica nada (todas as gravações são idempotentes por chave de semana). Sem risco de duplicação.
4. **Quem chama a geração da lesson rec / plano de estudo se o user NÃO é Pro+ (não recebe Weekly Report)?** Hoje os crons antigos rodavam para `subscription_plan IN ('free','pro','premium')` (rec de lesson) e Pro+ (plano de estudo). Decisão: a rec de lesson e o plano de estudo passam a ser gerados **só pra quem recebe o Weekly Report** (Pro+ opt-in) — ou seja, **Free perde a rec de lesson automática semanal** e **Pro+ que não optou pelo report perde a rec automática**. **Trade-off documentado** (founder autorizou aposentar os crons; a rec de lesson volta a aparecer pro user via o chat / a tool `recommend_lesson` quando ele pede). Se isso for considerado regressão inaceitável pelo founder, alternativa: o **enqueuer** (ou um terceiro tick leve) gera a rec de lesson + o plano de estudo pra **todos os users elegíveis dos crons antigos** mesmo sem report (mantém o comportamento antigo desses dois artefatos), e o Weekly Report só **reaproveita** o que já foi gravado. **Recomendação:** começar com a versão simples (só pra quem recebe o report) + deixar a alternativa documentada como follow-up se o founder reclamar. **Test-writer:** testar o caminho "Pro+ opt-in → report gerado + `coach_lesson_recommendations` row criada + `study_weekly_plans` row criada (ou UPSERTed)".

**Critério de aceitação:**
- [ ] `cronRunner.ts` não agenda mais `generateCoachRecommendationsTick` (o `cron.schedule("0 6 * * 1", ...)` foi removido/comentado com referência ao AI-1B).
- [ ] `server/jobs/index.ts` não registra mais o `registerWeeklyStudyPlanCron` ativo (removido ou no-op com log "deprecated").
- [ ] O gerador do Weekly Report, ao rodar para um user Pro+ opt-in, cria/UPSERTa uma row em `coach_lesson_recommendations` (chave `(userId, getCurrentWeekStartBRT())`) e uma row em `study_weekly_plans` (chave `(userId, utcMondayOfWeek)`) — verificável via mocks de `storage.createCoachRecommendation` / `getStudyWeeklyPlan` / `generateWeeklyStudyPlan`.
- [ ] `GET /api/home/coach-recommendation` continua retornando a rec da semana corrente após o Weekly Report rodar (não quebrou — a chave de semana é a mesma).
- [ ] `StudyWeeklyPlanCard` continua funcionando (a row em `study_weekly_plans` existe).
- [ ] Rodar o gerador 2x para o mesmo user/semana → nenhuma duplicata em `coach_lesson_recommendations` nem `study_weekly_plans` (idempotência).
- [ ] (Documentado, não necessariamente testado) Free não recebe mais a rec de lesson automática semanal — comportamento esperado, registrado no ADR.

### RF-08: Hub timeline — aba "Relatórios e avisos" vira timeline real + render do relatório + `NudgeCard`
**Descrição:** A aba `reports` do hub `/coach-ai` (`ReportsPanel` em `client/src/pages/CoachAI.tsx`) deixa de ser EmptyState e passa a mostrar uma **timeline** unindo: relatórios gerados (`reports` rows, clicáveis → abre o relatório) + nudges in-app (`coach_nudge_log` rows do AI-1A — dismiss/snooze/engage). Quando vazia → EmptyState (mantém o `data-testid="coach-ai-reports-empty"` como fallback ou troca por um novo testid; system-architect decide).

#### RF-08.1 — `GET /api/coach/timeline`
- Query params: `?limit=` (default 30, max 100), `?cursor=` (opcional, paginação por `generated_at`/`sent_at`).
- Response: `{ items: TimelineItem[], nextCursor?: string }` onde `TimelineItem` é uma union discriminada por `kind`:
  - `{ kind: 'report', id, reportType, periodStart, periodEnd, status, summaryLine, generatedAt, readAt, dismissedAt }` — `summaryLine` = `content.header.summaryLine`.
  - `{ kind: 'nudge', id, category, status, title, bodyPreview, sentAt, engagedAt, dismissedAt, snoozeUntil, chatSessionId, triggeredByEvent }` — vem de `coach_nudge_log` (reusa o `GET /api/coach/nudges` do AI-1A ou junta aqui; o critério é: a timeline mostra os dois).
- Ordenado por timestamp desc (merge de `reports.generated_at` e `coach_nudge_log.sent_at`).
- `requireAuth`; só itens do user logado.
- Handler com `injectedStorage?` (lesson #34).

#### RF-08.2 — `GET /api/coach/reports/:id` — ler um relatório
- Response: `{ id, reportType, periodStart, periodEnd, status, content, markdown, generatedAt, costUsdEstimate? }`.
- Marca `read_at = now` na primeira leitura (idempotente).
- 404 se não existe; 403 se não é do user.
- (Opcional, nice-to-have, não obrigatório: `POST /api/coach/reports/:id/dismiss` para arquivar o card na timeline — seta `dismissed_at`.)

#### RF-08.3 — Frontend: `ReportsPanel` reescrito + `NudgeCard.tsx` + render do relatório
- `ReportsPanel` faz `useQuery(['/api/coach/timeline'])` (lesson #13 — `apiRequest` retorna JSON parseado; lesson #29 — está dentro do `QueryClientProvider` do app). Renderiza a lista; cada `report` item → um card clicável (abre o relatório); cada `nudge` item → um `<NudgeCard>`.
- **`NudgeCard.tsx`** (deferido do AI-1A, entra aqui) — `client/src/components/coach/NudgeCard.tsx`: mostra título + body preview + status badge + (se `status` em estado acionável) botões "Não agora" (snooze short) / "Não por enquanto" (snooze long) / "Ver no chat" (engage → navega pra `/coach-ai?tab=chat` com a session) / "Dispensar" (dismiss). Chama os endpoints do AI-1A (`POST /api/coach/nudges/:id/{dismiss,snooze,engage}`). Quando `triggeredByEvent === 'auto_freeze_notice'` → renderiza diferente (aviso de categoria pausada, sem botões de snooze). Reusa o padrão visual de cards do hub.
- **Render do relatório** — uma **página ou modal**. Recomendação: rota `/coach-ai/relatorio/:id` (página) — reusa o padrão de roteamento do hub; ou um modal/`Dialog` sobre a timeline. System-architect decide; o critério é: o user clica num card de relatório na timeline → vê o relatório renderizado (markdown via `ReactMarkdown` + `remarkGfm`, igual ao chat) com as seções, os 3 insights, o plano da semana, e os CTAs (botões: link → navega; tool → abre o chat com a tool pré-armada, OU dispara o `coachToolRunner` com confirm). Componente `WeeklyReportView.tsx` (ou `ReportView.tsx`).
- **Lessons aplicáveis:** #13 (apiRequest JSON), #14/#26 (testes de componente React usam `await import`, não `require`), #19 (CTAs com `href` casam com rotas Wouter registradas — `grep "Route path" client/src/App.tsx`), #23 (Wouter v3 `<Link>` — verificar versão), #27 (Radix Tabs onMouseDown — o hub já tem onClick redundante), #29 (useQuery dentro de provider — encapsular fetchers secundários em ErrorBoundary se precisar render standalone), #30 (hook test em `.test.ts` precisa de jsdom — config-level).

**Critério de aceitação:**
- [ ] `GET /api/coach/timeline` retorna `{ items, nextCursor? }`; items são union `report`|`nudge` ordenados por timestamp desc; só itens do user logado; respeita `limit`/`cursor`.
- [ ] `GET /api/coach/reports/:id` retorna o relatório com `content` + `markdown`; marca `read_at`; 404 se não existe; 403 se de outro user.
- [ ] `ReportsPanel` (aba reports do hub): com timeline vazia → EmptyState; com itens → lista com cards de relatório (clicáveis) e `NudgeCard`s.
- [ ] `NudgeCard` renderiza título/body/status; em estado acionável mostra os botões de snooze/dismiss/engage e chama os endpoints do AI-1A; com `triggeredByEvent='auto_freeze_notice'` renderiza o aviso sem botões de snooze.
- [ ] Clicar num card de relatório → abre o `WeeklyReportView` (página ou modal) com as 8 seções, os 3 insights e os CTAs renderizados; markdown renderizado via ReactMarkdown.
- [ ] CTAs do relatório com `kind: 'link'` navegam para rotas Wouter **registradas** (sem 404 silencioso — lesson #19); CTAs `kind: 'tool'` abrem o fluxo de tool com confirm (não auto-executam — ADR-146).
- [ ] Um relatório `status='degraded'` renderiza os números + um aviso "este relatório foi gerado em modo simplificado" (sem a prosa dos insights).

### RF-09: Fail-soft — relatório determinístico quando o LLM falha
**Descrição:** (Coberto em RF-03 + RF-05.6; consolidado aqui.) Caminhos de fail-soft:
1. **Sem `ANTHROPIC_API_KEY`** (ou o SDK não carrega) → o gerador nem tenta o LLM; retorna o `ReportContent` determinístico direto; `degraded_reason='no_anthropic_key'`. O job vira `done` na 1ª tentativa (não re-tenta — não vai resolver).
2. **LLM falha (exceção / timeout / resposta inválida) numa tentativa** → o job volta a `pending` com backoff (RF-03). Após `max_attempts` falhas → `ReportContent` determinístico, `degraded_reason='llm_failed_3x'`, job `done`.
3. **`vi.fn()` não é constructor / `new Anthropic(...)`** — lesson #5 + #35: envolver `new AnthropicCtor(...)` em try/catch com fallback (chamar como factory) — mesmo padrão de `recommendLessonForUser.tryCoachIA` e dos handlers do AI-0A wave 2. Erros do LLM **nunca** propagam pra fora do gerador (lesson #9 — logar e cair pro determinístico).
4. **Conteúdo determinístico:** todas as seções 1-5 com os números (sem `narrative`); `insights = []` (ou 1 insight determinístico tipo "Relatório gerado em modo simplificado — os números estão completos abaixo"); `nextWeekPlan` só com links/refs determinísticos (a rec de lesson e o plano de estudo vêm de `recommendLessonForUser` / `generateWeeklyStudyPlan` que têm fallbacks próprios determinísticos — então mesmo no fail-soft do report, a seção 4/7 pode ter conteúdo via os fallbacks deles); `cta` só com links; `generation.degraded = true`.

**Critério de aceitação:**
- [ ] Sem `ANTHROPIC_API_KEY` no env → `generateWeeklyReport` retorna `status='degraded'`, `degraded_reason='no_anthropic_key'`, `content.generation.degraded=true`, `content.sections` com números, `content.insights` vazio (ou 1 item determinístico); custo 0/null; o job vira `done` na 1ª tentativa.
- [ ] LLM mockado pra lançar exceção em todas as tentativas → após `max_attempts`, `reports` row `status='degraded'`, `degraded_reason='llm_failed_3x'`; o job `done` (nunca `failed` permanentemente).
- [ ] `new AnthropicCtor` que é um `vi.fn()` (mock) → não quebra; cai pro caminho determinístico ou usa o mock como factory (lesson #5/#35).
- [ ] Erro do LLM é **logado** (`console.error`) antes do fallback (lesson #9).
- [ ] Mesmo no fail-soft, a seção 4 (rec de lesson) e a 7 (plano de estudo) podem ter conteúdo (via os fallbacks determinísticos de `recommendLessonForUser` / `generateWeeklyStudyPlan`) — não ficam vazias só por causa do fail-soft do report.

### RF-10: Gap-check D-3 — categoria de nudge `B-GAPCHECK`
**Descrição:** 3 dias antes do Weekly Report (i.e. **quinta-feira** se o report é segunda — D-3 = sexta? Não: "3 dias antes da segunda" = sexta da semana anterior... ajustar: o report cobre a semana que acabou e é entregue segunda 7h; o gap-check roda **D-3 dias antes da entrega** = **sexta-feira** (segunda menos 3 = sexta da mesma semana de jogo). System-architect confirma a aritmética; o critério é "≈3 dias antes do relatório, ainda dentro da semana de jogo, dá tempo de o user agir"). O agente roda um check do **estado real** (nunca confia em flag stale — lesson #9 + risco R5 do plano) e, se faltam dados, manda **1 nudge gentil por ciclo** cobrando.
- **Categoria nova:** `B-GAPCHECK` adicionada ao enum `NudgeCategory` em `server/coach/nudgeEngine.ts` + ao `CATEGORY_TOGGLE_MAP` + uma coluna toggle nova `nudge_b_gapcheck boolean NOT NULL DEFAULT true` em `user_coach_preferences` (migração `0067`) + `updateCoachPreferencesSchema` ganha `nudgeBGapcheck: z.boolean().optional()` + `unfreezeCategory` enum ganha `'B-GAPCHECK'` + a UI de preferências (RF-08 do hub / a aba prefs) ganha o toggle. **Default `true`** (gap-check é útil e gentil).
- **Trigger (cron tick):** um novo tick no report job runner (ou um cron separado `0 * * * *` filtrando hora local) — `gapCheckTick({ now })`: para cada user Pro+ opt-in (mesma elegibilidade do report — gap-check só faz sentido pra quem vai receber o report), se hoje é o dia D-3 no fuso do user E a hora local é uma hora útil (ex: 10h ou 18h — system-architect escolhe; evitar quiet hours, mas o engine já filtra isso): rodar o **check de estado real**:
  - Não importou histórico essa semana E tem sessões registradas? (sinal "jogando no escuro")
  - Tem sessões `grind_sessions` da semana sem reconciliação / sem report manual?
  - Snapshot de bankroll pendente?
  - 0min de estudo registrado E tem foco ativo?
  - Escolheu um foco mas não atualizou stats (HUD)?
  - Se **algum** desses for verdade → montar 1 nudge gentil listando os itens faltantes ("Vi que talvez esteja faltando alguns dados pro seu relatório de segunda: [...] — se você já fez por outro caminho, ignora.") com links (`/upload`, `/grind`, `/bankroll`, `/estudos`, `/stats`).
  - **`cycleKey`** = `YYYY-WW` da semana do report (ISO week) → `shouldSendNudge(userId, { category: 'B-GAPCHECK', cycleKey, now })` garante 1x por ciclo (idempotência via o engine).
  - Se **nenhum** item faltante → não manda nada (não cobra quem está OK — risco R5).
  - Cria `coach_nudge_log` row (`category: 'B-GAPCHECK'`, `status: 'sent'`, `triggeredByEvent: 'gap_check_d3'`, `cycleKey`, `bodyPreview`, `chatSessionId` se criar uma chat session — opcional; pode ser só o card na timeline) — mesmo padrão de `processBStudyTick`.
- **Anti-fadiga:** passa por `shouldSendNudge` (kill switch global → toggle `nudgeBGapcheck` → categoria congelada → snooze → quiet hours → daily/hourly cap → one-shot per cycle). Auto-freeze do AI-1A cobre `B-GAPCHECK` automaticamente (se o user dispensa >50% em 7d → congela).
- **Não-objetivo:** o gap-check **mensal** do plano (D-3 antes do Monthly Report) é AI-1C — aqui é só o pré-Weekly.

**Critério de aceitação:**
- [ ] `B-GAPCHECK` está no enum `NudgeCategory`, no `CATEGORY_TOGGLE_MAP`, no `updateCoachPreferencesSchema` (`nudgeBGapcheck`), e no `unfreezeCategory` enum.
- [ ] Migração adiciona `user_coach_preferences.nudge_b_gapcheck` NOT NULL DEFAULT true.
- [ ] `gapCheckTick({ now })` com `now` = dia D-3 no fuso de um user Pro+ opt-in **com dados faltantes** (ex: sessões registradas mas sem import essa semana) → cria 1 `coach_nudge_log` row `category='B-GAPCHECK'`, `cycleKey=YYYY-WW`; chamar de novo no mesmo ciclo → `shouldSendNudge` retorna `already_sent_this_cycle`, não duplica.
- [ ] User Pro+ opt-in **sem dados faltantes** (tudo OK) → `gapCheckTick` não manda nada pra ele.
- [ ] User Pro+ **sem opt-in** do report → não recebe gap-check.
- [ ] User Free → não recebe gap-check.
- [ ] User com `nudgeBGapcheck=false` → `shouldSendNudge` retorna `category_disabled`, nada enviado.
- [ ] User com `B-GAPCHECK` congelada (auto-freeze) → nada enviado (`category_frozen`).
- [ ] O check de estado é **real** (faz as queries no momento) — não usa nenhuma flag pré-computada que poderia estar stale.
- [ ] `COACH_NUDGES_ENABLED='false'` → `gapCheckTick` não roda (ou roda mas o engine nega tudo no check 0).

### RF-11: Nudge B-IMPORT — cobrança de import standalone (categoria `B-IMPORT`)
**Descrição:** Independente do gap-check (D-3 é pré-relatório; B-IMPORT é "você está jogando mas não trackeando"). Se `upload_history` não tem entrada há ≥N dias (default 5, configurável via env opcional `COACH_BIMPORT_DAYS`) **E** o user tem sessões de grind registradas no período (sinal de que está jogando) → 1 nudge gentil **1x por semana** com link direto pra `/upload`.
- **Categoria nova:** `B-IMPORT` no enum `NudgeCategory` + `CATEGORY_TOGGLE_MAP` + coluna `nudge_b_import boolean NOT NULL DEFAULT true` em `user_coach_preferences` (migração `0067`) + `updateCoachPreferencesSchema` (`nudgeBImport`) + `unfreezeCategory` enum + toggle na UI de prefs. **Default `true`** (F6 do plano — ICE 8.3, alto valor).
- **Trigger (cron tick):** `bImportTick({ now })` — roda diário (ou hora-em-hora filtrando hora local; reusar o padrão de `processBStudyTick`: `0 * * * *` + `getLocalHour(now, tz) === targetLocalHour`). **Elegibilidade:** todos os planos? Decisão: **Pro+** (consistente com B-STUDY que é Pro+; e cobrar import de quem não paga é menos prioritário — embora F6 não restrinja por tier). System-architect pode decidir incluir Free; o critério mínimo é Pro+. Lógica:
  - `lastImportAt = storage.getLastUploadAt(userId)` (ou max de `upload_history`); se `now - lastImportAt < N dias` (ou nunca importou mas também não tem sessões) → skip.
  - `sessionsInPeriod = storage.countGrindSessionsSince(userId, lastImportAt ?? now-Ndias)` (ou sessões nos últimos N dias); se `=== 0` → skip (não está jogando, não tem sentido cobrar).
  - Se `lastImportAt` muito antigo (ou null) E `sessionsInPeriod > 0` → montar 1 nudge gentil ("Você registrou N sessões nas últimas semanas mas não importou nenhum CSV — estou meio cego sobre seus resultados reais. Bora importar?") com link `/upload`.
  - `cycleKey` = `YYYY-WW` (ISO week) → `shouldSendNudge(userId, { category: 'B-IMPORT', cycleKey, now })` → 1x/semana.
  - Cria `coach_nudge_log` row (`category: 'B-IMPORT'`, `status: 'sent'`, `triggeredByEvent: 'b_import_check'`, `cycleKey`, `bodyPreview`, opcionalmente `chatSessionId`).
- **Anti-fadiga:** passa por `shouldSendNudge` (mesma cadeia de checks); auto-freeze cobre `B-IMPORT`.

**Critério de aceitação:**
- [ ] `B-IMPORT` está no enum `NudgeCategory`, no `CATEGORY_TOGGLE_MAP`, no `updateCoachPreferencesSchema` (`nudgeBImport`), e no `unfreezeCategory` enum.
- [ ] Migração adiciona `user_coach_preferences.nudge_b_import` NOT NULL DEFAULT true.
- [ ] `bImportTick({ now })` para um user Pro+ que **não importou há ≥5 dias** E **tem ≥1 sessão registrada** no período → cria 1 `coach_nudge_log` `category='B-IMPORT'`, `cycleKey=YYYY-WW`; de novo na mesma semana → `already_sent_this_cycle`, não duplica.
- [ ] User que importou ontem (< N dias) → `bImportTick` não manda nada.
- [ ] User que não importou há muito tempo **mas não tem sessões registradas** → não manda nada (não está jogando).
- [ ] User com `nudgeBImport=false` → `category_disabled`, nada enviado.
- [ ] `B-IMPORT` congelada → nada enviado.
- [ ] `COACH_BIMPORT_DAYS` env override altera o threshold de dias (default 5).
- [ ] `COACH_NUDGES_ENABLED='false'` → não roda / engine nega tudo.
- [ ] B-IMPORT e B-GAPCHECK são categorias **distintas** — um user pode receber os dois na mesma semana (sujeito aos caps diário/horário do anti-fadiga); não há lógica que confunda os dois.

### RF-12: Quick suggestions anti-blank-page — sugestões contextuais no chat
**Descrição:** No chat (hub `/coach-ai` aba Chat + `MiniChat`), mostrar **2-4 sugestões contextuais de pergunta** dependendo da rota/estado, para reduzir a "tela em branco". Substitui/atualiza o conceito legado de "prompt starters" (que era por-coach e foi desativado no AI-0B — `CoachAI.prompt-starters.test.tsx` está `describe.skip`; o sujeito mudou). Implementação: **endpoint** `GET /api/coach/suggestions?route=<route>&...` que recebe a rota (e opcionalmente campos do page context, ex `activeTab`) e retorna `{ suggestions: Array<{ id, text, sendOnClick: true }> }` — o frontend chama esse endpoint quando o chat abre numa rota e renderiza as sugestões como chips clicáveis (clicar → preenche o input e/ou envia direto).
- **Por que endpoint e não 100% frontend:** as sugestões "ricas" dependem de **estado real** (tem downswing? tem dados? tem sessão sem reconciliar?) — o servidor já sabe isso (storage). Frontend puro só conseguiria mapear por rota, sem o estado. Decisão: **endpoint** (que internamente faz um check leve de estado, com cache TTL ~30s por user — lesson #21 — pra não martelar o storage a cada abertura de chat), com um **fallback frontend** estático (mapa rota→sugestões genéricas) quando o endpoint falha (lesson #9 — degrade graceful).
- **Mapa de sugestões (não exaustivo — system-architect/strategist refina):**
  | Rota / estado | Sugestões |
  |---|---|
  | `/dashboard` ou `/inicio` com downswing detectado (ROI negativo na semana / `detectLeaks` high) | "Por que estou perdendo essa semana?" · "Isso é variância ou erro?" · "Quais meus leaks principais agora?" |
  | `/dashboard` sem downswing, com dados | "Como está meu ROI por site?" · "Quais meus leaks principais?" · "Sugira foco de estudo pra essa semana" |
  | Qualquer rota, user **sem dados** (volume=0, sem import) | "Como importo meus torneios?" · "O que o Grindfy faz?" · "Por onde eu começo?" |
  | `/bankroll` | "Como está minha banca?" · "Quanto posso sacar com segurança?" · "Simular: e se eu perder 10 buy-ins?" |
  | `/grade-planner` ou `/grade` | "Sugira uma grade pra essa semana" · "Esses torneios cabem na minha banca?" · "Qual o melhor horário pra eu jogar?" |
  | `/grind` ou `/grind-live` | "Como foi minha última sessão?" · "Tem algum spot que vale revisar?" · "Como está meu mental hoje?" |
  | `/estudos` | "O que devo estudar agora?" · "Como está meu progresso no foco do mês?" · "Quanto tempo de estudo eu registrei?" |
  | `/biblioteca` | "Qual aula você recomenda pra mim?" · "Tem conteúdo sobre [foco do mês]?" |
  | `/stats` | "Meus stats batem com o esperado?" · "Algum stat fora do padrão?" |
  | `/coach-ai` (sem contexto específico) | "O que mudou na minha semana?" · "Quais meus leaks?" · "Sugira meu próximo passo" |
  - As sugestões textuais ficam num módulo (`server/coach/quickSuggestions.ts`) — fácil de iterar; **não** geradas por LLM (custo zero, latência zero).
- **Frontend:** `ChatPanel` (e o `MiniChat`) renderizam as sugestões quando `messages.length === 0` (tela vazia) — chips abaixo do título "Grindfy AI". Clicar → `sendMessage(text)` (ou preenche o input — system-architect decide; recomendação: preenche o input e dá foco, deixando o user editar antes de enviar — menos "mágico", mais controle). Quando há mensagens, somem (ou ficam num botão "sugestões" discreto). Reusa o hook `useCoachPageContext` que já existe pra saber a rota.
- **Lessons:** #13 (apiRequest JSON), #21 (cache server-side com `_resetForTests` exportado), #29 (useQuery dentro de provider — o `MiniChat` em páginas standalone pode precisar de ErrorBoundary se a query falhar; ou tornar o fetch best-effort com try/catch e fallback estático).

**Critério de aceitação:**
- [ ] `GET /api/coach/suggestions?route=dashboard` → `{ suggestions: [...] }` com 2-4 itens; cada item `{ id, text, sendOnClick }`.
- [ ] `GET /api/coach/suggestions?route=dashboard` para um user **com downswing** → sugestões incluem variantes de "por que estou perdendo / isso é variância"; para um user **sem dados** (qualquer rota) → sugestões de import/onboarding.
- [ ] `GET /api/coach/suggestions?route=bankroll` → sugestões de banca/saque/simular.
- [ ] Rota desconhecida → retorna um set genérico (não 400).
- [ ] Endpoint tem cache TTL ~30s por user (lesson #21) + `_resetSuggestionsCacheForTests()` exportado e chamado em `beforeEach` dos testes do service.
- [ ] `ChatPanel` com `messages.length === 0` → renderiza as sugestões como chips clicáveis; clicar preenche o input (ou envia — conforme decisão); com mensagens → as sugestões somem (ou viram botão discreto).
- [ ] Endpoint falha → o frontend cai num set estático por rota (não quebra a tela; sem erro de console fatal).
- [ ] Handler com `injectedStorage?` (lesson #34).

### RF-13: Documentação — CLAUDE.md, lessons-learned, data-model-index, endpoints-index, ADRs
**Descrição:** Atualizar:
- `CLAUDE.md` §4 — `COACH_NUDGES_ENABLED` também gateia o report job runner (enqueuer + processor) e os ticks de gap-check / B-IMPORT. (Opcional) `COACH_BIMPORT_DAYS` (default 5). §6 — mencionar `report_jobs` + `reports` nas tabelas (ou no índice). §7 — os endpoints novos (`/api/coach/timeline`, `/api/coach/reports/:id`, `/api/coach/suggestions`). §10 — nota de que os 2 crons de segunda foram aposentados (referência ao ADR).
- `Docs/architecture/data-model-index.md` — `report_jobs` + `reports` + as colunas novas em `user_coach_preferences` (`report_weekly_enabled`, `nudge_b_gapcheck`, `nudge_b_import`).
- `Docs/api/endpoints-index.md` — os endpoints novos.
- `Docs/architecture/lessons-learned.md` — qualquer lesson nova que surgir na implementação (ex: padrões de job runner / idempotência de fila, se algo não-óbvio aparecer; numerar #38+).
- ADRs (system-architect cria — numeração a partir de **155**):
  - **ADR-155** — "Relatórios automáticos: tabelas `report_jobs`/`reports` + job runner timezone-aware (cron enqueuer hourly + processor 15min) + idempotência por `(user, tipo, período)` + retry exponencial + fail-soft determinístico. Weekly Report opt-in só Pro+ (preference em `userCoachPreferences.report_weekly_enabled`). Gating pelo `COACH_NUDGES_ENABLED`."
  - **ADR-156** — "Aposentadoria dos 2 crons de segunda (`generateCoachRecommendations` 6h BRT + `generateWeeklyStudyPlan` 9h UTC) — absorvidos pelo Weekly Report; as tabelas `coach_lesson_recommendations` e `study_weekly_plans` continuam sendo preenchidas pelo gerador do report (back-compat com os consumidores do frontend); chaves de semana mantidas (BRT pra rec, UTC pra plano) por back-compat; Free perde a rec de lesson automática semanal (trade-off documentado)."
  - **ADR-157** — "Categorias de nudge `B-GAPCHECK` (gap-check D-3 pré-Weekly, valida estado real) e `B-IMPORT` (cobrança de import, 1x/semana) — toggles novos em `userCoachPreferences`, passam pelo `shouldSendNudge`, cobertas pelo auto-freeze."
  - **ADR-158** — "Quick suggestions anti-blank-page — endpoint `GET /api/coach/suggestions` (mapa estático por rota + check leve de estado, cache TTL 30s, fallback frontend estático); não-LLM."
  - (system-architect pode consolidar 2 em 1 ou abrir um 5º — o critério é cobertura, não contagem.)
- Diagramas Mermaid (system-architect): fluxo do report job runner (enqueuer → fila → processor → gerador → reports/job done; ramo de retry/fail-soft); fluxo do gap-check / B-IMPORT (cron tick → check de estado → shouldSendNudge → nudge log); sequência da timeline (frontend → GET /api/coach/timeline → merge reports+nudges).

**Critério de aceitação:**
- [ ] `CLAUDE.md` §4/§6/§7/§10 atualizados conforme acima.
- [ ] `data-model-index.md` e `endpoints-index.md` atualizados.
- [ ] ADRs 155-158 (ou equivalente consolidado) criados, formato Michael Nygard, numerados.
- [ ] Diagramas Mermaid criados em `Docs/architecture/` (pasta `coach-ai-1b/` ou similar).
- [ ] Lessons novas (se houver) adicionadas a `lessons-learned.md`.

---

## Requisitos Não-Funcionais
- **Custo de tokens:** Weekly Report ~$0.045/relatório (sonnet 4.6, prompt caching ativo). Sumarização de contexto via Haiku quando o bundle ficar grande (`summarizer_model_used` registrado). Custo + tokens gravados em cada `reports` row (`cost_usd_estimate`, `input_tokens`, `cache_*`, `output_tokens`). Logar `coach.report.tokens` (visibilidade de cache hit/miss). Fail-soft e `dataSufficiency='low'` → custo ≈ $0.
- **Idempotência:** `report_jobs` UNIQUE `(user_id, report_type, period_start)`; `reports` UNIQUE `(user_id, report_type, period_start)`; `coach_lesson_recommendations` e `study_weekly_plans` mantêm suas UNIQUEs por semana; o engine de nudge garante `already_sent_this_cycle`. Nenhum caminho duplica relatório/rec/plano/nudge.
- **Timezone:** todo cálculo de "segunda 7h" / "dia D-3" usa `getLocalHour(now, user.timezone)` (fallback `'America/Sao_Paulo'`). Testar fusos extremos (UTC+14, UTC-11) e a virada de dia/semana. `report_jobs.timezone` é snapshot do `users.timezone` no enfileiramento (se o user mudar o fuso depois, o job já agendado não muda — aceitável).
- **Concorrência (réplicas):** todo cron tick envolto em `withAdvisoryLock` (ADR-144); o claim de job no processor é atômico (`UPDATE ... WHERE status='pending'`). 2 réplicas não processam o mesmo job 2x nem enfileiram 2x.
- **Fail-soft / robustez:** erros do LLM nunca propagam pra fora do gerador (lesson #9 — logar e cair pro determinístico). Erros de storage em qualquer check de elegibilidade → safe-deny (não enfileira / não manda nudge). `try/catch` por user no batch (lesson #9) — falha de 1 user não quebra o tick.
- **Gating de ativação:** os crons só rodam em `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'` (igual aos outros). `COACH_NUDGES_ENABLED='false'` é o kill switch global (desliga proatividade + geração de relatórios).
- **Performance:** o processor pega no máximo 25 jobs por tick (paginação); pacing 200ms entre jobs. O endpoint `/api/coach/timeline` pagina (limit default 30, max 100). O endpoint `/api/coach/suggestions` tem cache TTL 30s por user. Queries do gerador filtram `grind_session_id IS NULL` (§6.1) — reusam métodos com o filtro já injetado.
- **Segurança:** `requireAuth` em todos os endpoints novos; só itens do user logado; `injectedStorage?` nos handlers (lesson #34); zod `.strict()` no `updateCoachPreferencesSchema` (não aceita campos crus de congelamento).
- **Compatibilidade:** o frontend de /inicio (`CoachRecommendationCard` etc.) e o `StudyWeeklyPlanCard` **não mudam** — as tabelas que eles consomem continuam preenchidas. O `ReportsPanel` muda de EmptyState pra timeline (mantém ou troca o `data-testid` de forma documentada). Os testes legados `CoachAI.prompt-starters.test.tsx` (já `describe.skip`) podem ser substituídos por testes do novo endpoint/UI (ou ficam skip).

---

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/coach/timeline | Timeline do hub: merge de `reports` + `coach_nudge_log`, paginada (`?limit=`, `?cursor=`) | JWT |
| GET | /api/coach/reports/:id | Lê um relatório (`content` + `markdown`); marca `read_at` | JWT |
| POST | /api/coach/reports/:id/dismiss | (Opcional) arquiva o card do relatório na timeline (`dismissed_at`) | JWT |
| GET | /api/coach/suggestions | Quick suggestions contextuais (`?route=`, opcional campos de page context) | JWT |
| GET | /api/coach/preferences | (Existente — estendido) inclui `reportWeeklyEnabled` no payload | JWT |
| PUT | /api/coach/preferences | (Existente — estendido) aceita `reportWeeklyEnabled`, `nudgeBGapcheck`, `nudgeBImport` (zod `.strict()`) | JWT |
| GET | /api/coach/nudges | (Existente — AI-1A) já cobre os nudges; a timeline pode reusar ou consolidar | JWT |

Endpoints internos (não HTTP — ticks de cron): `enqueueWeeklyReportJobsTick`, `processReportJobsTick`, `gapCheckTick`, `bImportTick`.

## Modelos de Dados Afetados

### `report_jobs` (nova) — migração 0067
Ver RF-01 (colunas, defaults, índices).

### `reports` (nova) — migração 0067
Ver RF-02 (colunas, defaults, índices). + tipo TS `ReportContent` (RF-05.4).

### `user_coach_preferences` (alteração) — migração 0067
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `report_weekly_enabled` | boolean | not null, default `false` | opt-in do Weekly Report (RF-04) |
| `nudge_b_gapcheck` | boolean | not null, default `true` | toggle da categoria B-GAPCHECK (RF-10) |
| `nudge_b_import` | boolean | not null, default `true` | toggle da categoria B-IMPORT (RF-11) |
+ `updateCoachPreferencesSchema` ganha `reportWeeklyEnabled`, `nudgeBGapcheck`, `nudgeBImport` (todos `z.boolean().optional()`); `unfreezeCategory` enum ganha `'B-GAPCHECK'` e `'B-IMPORT'`; `CATEGORY_TOGGLE_MAP` em `nudgeEngine.ts` ganha as duas categorias; `NudgeCategory` enum ganha as duas.

### `coach_lesson_recommendations` e `study_weekly_plans` (sem alteração de schema)
Continuam sendo preenchidas — agora pelo gerador do Weekly Report em vez dos crons antigos (RF-07). Chaves de semana mantidas.

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic API (Claude sonnet 4.6) | Gerar o cabeçalho/narrativas + os 3 insights data-grounded do Weekly Report; rec de lesson (Tier 1 do `recommendLessonForUser`); plano semanal de estudo (`generateWeeklyStudyPlan`) | No processamento de cada `report_jobs` row (segunda+, no fuso do user) |
| Anthropic API (Claude haiku 4.5) | Sumarização de contexto quando o bundle de dados da semana fica grande (`summarizer_model_used`) | Dentro do gerador, antes de chamar o sonnet, se necessário |

(Sem integrações novas — reusa o SDK Anthropic já em uso. Email = AI-2B, fora de escopo.)

## Cenários de Teste Derivados

### Happy Path
- [ ] Enqueuer numa segunda 7h (fuso de um user Pro+ opt-in) → 1 `report_jobs` row pending; processor (≤15min depois) → gera o relatório (LLM mockado), cria `reports` row `status='ready'` com 5 seções + 3 insights + plano + CTAs, marca o job `done` com `report_id`; o gerador também criou/UPSERTou `coach_lesson_recommendations` e `study_weekly_plans`.
- [ ] User abre `/coach-ai?tab=reports` → vê o card do relatório na timeline; clica → `WeeklyReportView` renderiza o markdown com as seções; `GET /api/coach/reports/:id` marcou `read_at`.
- [ ] User com downswing abre o chat no `/dashboard` → vê as quick suggestions de "por que estou perdendo / variância"; clica → input preenchido.

### Validação de Input
- [ ] `PUT /api/coach/preferences { reportWeeklyEnabled: true, nudgeBGapcheck: false }` → aceito (zod `.strict()`); GET reflete.
- [ ] `PUT /api/coach/preferences { frozenCategories: {...} }` → 400 (zod `.strict()` rejeita campo cru de congelamento — comportamento do AI-1A mantido).
- [ ] `GET /api/coach/reports/:id` com id inexistente → 404; id de outro user → 403.
- [ ] `GET /api/coach/timeline?limit=999` → clampa pra 100.
- [ ] `GET /api/coach/suggestions?route=` (vazio) ou rota desconhecida → set genérico, 200 (não 400).

### Regras de Negócio
- [ ] User Free → enqueuer não cria job; não recebe gap-check; não recebe B-IMPORT; o toggle de report semanal não aparece na UI de prefs.
- [ ] User Pro+ com `reportWeeklyEnabled=false` → enqueuer não cria job; não recebe gap-check (gap-check só pra quem recebe o report).
- [ ] User Pro+ opt-in que faz downgrade entre enfileirar e processar → o job vira `skipped` (`last_error='no_longer_eligible'`), nenhum `reports` row criado.
- [ ] Gerador rodado 2x pro mesmo `(user, 'weekly', period_start)` → 1 `reports` row só (UPSERT/pré-check); processor que pega um job cujo `reports` row já existe → marca `done` sem chamar o LLM.
- [ ] Gap-check: user com sessões registradas + sem import essa semana → recebe 1 nudge B-GAPCHECK por ciclo; user com tudo OK → não recebe; user com `nudgeBGapcheck=false` ou categoria congelada → não recebe.
- [ ] B-IMPORT: user que não importa há ≥5d + tem sessões → 1 nudge B-IMPORT/semana; importou ontem → não recebe; sem sessões → não recebe; `nudgeBImport=false` ou congelada → não recebe.
- [ ] Aposentadoria: `cronRunner.ts` não agenda mais o weekly rec cron; `jobs/index.ts` não registra mais o weekly study plan cron; `GET /api/home/coach-recommendation` ainda funciona após o report rodar; `StudyWeeklyPlanCard` ainda funciona.
- [ ] CTAs do relatório só referenciam tools que existem (AI-0A) ou rotas Wouter registradas — nenhuma referência a `bulk_propose_grade`/`schedule_study_block`/`define_career_goal`/`mark_off_day`.

### Edge Cases
- [ ] Fusos extremos: enqueuer (rodando em UTC) cria o job pro user `Pacific/Kiritimati` (UTC+14) quando é segunda 7h **lá**; cria pro user `America/Sao_Paulo` quando é segunda 7h **lá**; nenhum dos dois é pulado nem duplicado; vira do ano (semana 52→01) não quebra o `cycleKey`.
- [ ] Sem `ANTHROPIC_API_KEY` → relatório `degraded` (`degraded_reason='no_anthropic_key'`), números completos, sem insights de prosa, custo 0; o job vira `done` na 1ª tentativa (não re-tenta).
- [ ] LLM falha 3x → relatório `degraded` (`degraded_reason='llm_failed_3x'`); o job vira `done` (nunca `failed` permanentemente); backoff respeitado entre as tentativas (`next_attempt_at`).
- [ ] `new AnthropicCtor` que é um `vi.fn()` mock → não quebra (lesson #5/#35 — try/catch + fallback factory).
- [ ] User com volume=0 e sem import → relatório `status='ready'`, `dataSufficiency='low'`, header convidando a importar, CTA `/upload`, sem 3 insights de prosa, custo ≈ 0.
- [ ] 2 réplicas processando concorrentemente → o mesmo job não é processado 2x (claim atômico); 2 enqueuers concorrentes → 1 job só (`ON CONFLICT DO NOTHING`).
- [ ] `COACH_NUDGES_ENABLED='false'` → enqueuer, processor, gap-check tick e B-IMPORT tick não fazem trabalho; jobs já enfileirados ficam parados; quando a flag volta, o processor pega os atrasados (`scheduled_for <= now` ainda vale).
- [ ] Timeline com só nudges (nenhum relatório ainda) → renderiza os `NudgeCard`s; timeline vazia → EmptyState; `triggeredByEvent='auto_freeze_notice'` → `NudgeCard` renderiza o aviso sem botões de snooze.
- [ ] Quick suggestions endpoint cai → frontend usa o fallback estático por rota; cache TTL 30s evita martelar o storage; `_resetSuggestionsCacheForTests` chamado em `beforeEach`.

---

## Fora de Escopo (Não-Objetivos)
- **Daily Debrief** (pós-`session.completed`) — AI-1C.
- **Monthly Report** (dia 1, comparativos vs mês anterior/6m/12m, variância, leaks resolvidos/novos, goals progress) — AI-1C.
- **Quarterly Career Review** + ajuda IRPF — AI-2B.
- **Email** como canal (HTML pipeline, push notification, PDF download) — AI-2B (founder Q7: Fase 1 = só in-app). As colunas `channel_email`/`channel_push` de `userCoachPreferences` já existem mas não são acionadas neste sprint.
- **Novas write tools de grade/estudo/carreira** (`bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `define_career_goal`, `mark_off_day`) e tools de diagnóstico (`analyze_variance`, `diagnose_plateau`, etc.) — AI-2A. Os CTAs do Weekly Report deste sprint só disparam tools que **já existem** (AI-0A) ou links de navegação.
- **Nudges B-DOWNSWING / B-VOLUME / B-GRADE** (crons novos de proatividade) — AI-2A. Este sprint só adiciona `B-GAPCHECK` e `B-IMPORT`.
- **C-game / Inchworm visualization** e **Mental Hand History** (alimentados por warm-up) — AI-2B. A seção "Mental + Operacional" do Weekly Report deste sprint só **lê** dados de warm-up que já existem; não cria visualização nova nem prompts de mental.
- **Onboarding conversacional via LLM** (vs wizard) — fora (o AI-1A entregou o wizard).
- **Sumarização hierárquica completa Haiku→Sonnet + tool batching + follow-ups inteligentes** — AI-1C (este sprint usa Haiku pra sumarização de contexto de forma simples, não a hierarquia mensal completa).
- **Migrar as chaves de semana de `coach_lesson_recommendations`/`study_weekly_plans` para o fuso do user** — fora (risco de regressão nos consumidores; mantém BRT/UTC como está).
- **Tabela dedicada de "report subscriptions"** — fora (o opt-in mora em `userCoachPreferences`; revisitar quando AI-1C adicionar Daily/Monthly).
- **Toggle de UI para `COACH_NUDGES_ENABLED`** — fora (é env var de ops, não setting de usuário).

## Dependências
- **Sprint AI-1A (`95eb4ba`)** — o anti-fadiga (`shouldSendNudge`, `nudgeAutoFreeze`, `coach_nudge_log` telemetria, `userCoachPreferences.frozen_categories`), o perfil estruturado (`users.ai_structured_profile`, `aiStructuredProfile.ts` — `tomPreferido`, `nivel`, `focoDoMes`, `metas`), o kill switch global `COACH_NUDGES_ENABLED`, os endpoints de nudge (`/api/coach/nudges` + `:id/{dismiss,snooze,engage}`).
- **Sprint AI-0B (`5ffc95a`)** — o hub `/coach-ai` com 4 tabs (a `reports` tab é o ponto de plug da timeline), o agente único + page context plugado, o `coachSystemBuilder.ts` (bloco STATIC base único Grindfy AI).
- **Sprint AI-0A (`8796e26`)** — as tools registradas (read + write) que os CTAs do Weekly Report podem disparar (`register_tournament_in_grade`, `log_leak_focus`, `verify_leak_progress`, `record_wallet_transaction`, `log_study_session`), as regras de citation/confidence (`CITATIONS_RULES`).
- **Infra existente** — `getLocalHour` (`server/coach/timezone.ts`), `listUsersForCron` / `getUserTimezone` (`storage.ts`), `withAdvisoryLock` (ADR-144), `node-cron`, `recommendLessonForUser` + `coach_lesson_recommendations`, `generateWeeklyStudyPlan` + `study_weekly_plans`, `coachMemory.ts` (sumarização Haiku), `warmupService`, `walletService`/`bankrollService`, os métodos de dashboard/analytics do `storage.ts`.

## Notas de Implementação (sugestões — não vinculantes)
- **Lugar do runner:** `server/jobs/reportJobRunner.ts` (consistente com `purgeSpotScreenshots`, `refreshNews`, `generateWeeklyStudyPlan`); registrado via `server/jobs/index.ts` → `registerAllJobs()`. Os ticks de gap-check / B-IMPORT podem morar em `server/coach/jobs/` (consistente com `processBStudy`) ou junto do runner — system-architect decide.
- **Gerador:** `server/services/weeklyReportGenerator.ts`. Função `generateWeeklyReport({ userId, periodStart, periodEnd, injectedStorage? }): Promise<{ content: ReportContent; markdown: string; status: 'ready'|'degraded'; model: string|null; usage?: {...} }>`. Internamente: (1) monta o bundle de dados (queries de storage, `grind_session_id IS NULL`); (2) se bundle grande → sumariza via Haiku; (3) chama `recommendLessonForUser` + grava `coach_lesson_recommendations`; (4) chama `generateWeeklyStudyPlan` + grava `study_weekly_plans`; (5) chama o sonnet (com `try/catch` em torno do `new AnthropicCtor` — lesson #5/#35) pra gerar narrativas + 3 insights (com as regras de citation); (6) monta o `ReportContent` + o markdown; (7) calcula custo. Em qualquer falha do passo 5 → caminho determinístico (fail-soft). **Tudo idempotente** (UPSERT por chave de semana).
- **Prompt do gerador:** extrair para um módulo único (`server/coach/prompts/weeklyReport.ts`) — lesson #10 (divergência de prompt quebra o cache da Anthropic). Reusar o bloco STATIC base do `coachSystemBuilder.ts` (Grindfy AI) + um bloco específico de "como gerar o relatório semanal" (estrutura das seções, exigência de citation, tom por nível). `cache_control: { type: 'ephemeral' }` nos blocos estáveis.
- **Modelo:** usar `process.env.COACH_MODEL ?? <constante canônica do projeto>` — **verificar** o nome exato em `coachSystemBuilder.ts` / ADR-021 e usar a mesma fonte (não hardcodar uma string solta de "sonnet-4-6").
- **Schema:** colunas opcionais como `.optional()` + `.default()` no zod (lesson #7). `ReportContent` com `schemaVersion` (evolução futura). Os types re-declarados local nos módulos que poderiam ter problema de mock de `@shared/schema` (lesson #36) — provavelmente não necessário aqui (os módulos novos não são tão centrais), mas atenção se algum teste mockar `drizzle-orm` parcialmente.
- **Idempotência de fila:** o claim do processor — `UPDATE report_jobs SET status='running', attempts=attempts+1, updated_at=now WHERE id=? AND status='pending' RETURNING *` — se retornar 0 rows, outro runner já pegou; pula. Combinado com `withAdvisoryLock("cron:report-job-runner", ...)` cobre réplicas.
- **Frontend timeline:** `ReportsPanel` reescrito com `useQuery(['/api/coach/timeline'])`; `NudgeCard.tsx` novo (reusa o padrão visual dos cards do hub); `WeeklyReportView.tsx` novo (ReactMarkdown + remarkGfm, igual ao chat). Rota `/coach-ai/relatorio/:id` (ou modal) — verificar `client/src/App.tsx` pra registrar a rota (lesson #19) e a versão do Wouter (lesson #23). Testes de componente com `await import` (lesson #14/#26), não `require`.
- **Quick suggestions:** `server/coach/quickSuggestions.ts` (mapa estático rota→sugestões + `computeSuggestions(userId, route, ctx, injectedStorage?)` com check leve de estado + cache TTL 30s + `_resetSuggestionsCacheForTests`). Endpoint `GET /api/coach/suggestions` em `server/routes/coach.ts` ou num módulo `coachAi1b.ts` (handler com `injectedStorage?`). Frontend: `ChatPanel`/`MiniChat` renderizam os chips quando `messages.length === 0`; fallback estático no frontend (`client/src/lib/quickSuggestionsFallback.ts` ou inline) quando o endpoint falha.
- **Testes:** seguir o pipeline TDD da casa. Atenção às lessons: #5/#35 (`new Anthropic` mock), #7 (schema gradual), #9 (logar antes de fallback / safe-deny), #10 (DRY prompts), #13 (apiRequest JSON), #14/#26 (`await import` em testes de componente), #19 (CTAs casam com rotas Wouter), #21 (cache server-side com `_resetForTests`), #29 (useQuery dentro de provider / ErrorBoundary pra fetchers secundários), #30 (hook test `.test.ts` → jsdom config), #34 (storage injetável), #36 (não importar `@shared/schema` no topo de módulo mockado), #3 (mocks validam shape real do storage). Testar fusos extremos com `now` controlado (DI de `Date`).

---

## ADRs sugeridos
- **ADR-155** — Relatórios automáticos: `report_jobs`/`reports` + job runner timezone-aware (enqueuer hourly + processor 15min) + idempotência + retry exponencial + fail-soft determinístico; Weekly Report opt-in só Pro+ (preference em `userCoachPreferences.report_weekly_enabled`); gating pelo `COACH_NUDGES_ENABLED`.
- **ADR-156** — Aposentadoria dos 2 crons de segunda (`generateCoachRecommendations` + `generateWeeklyStudyPlan`) — absorvidos pelo Weekly Report; `coach_lesson_recommendations` e `study_weekly_plans` continuam preenchidas pelo gerador do report (back-compat); chaves de semana mantidas; Free perde a rec de lesson automática semanal (trade-off documentado).
- **ADR-157** — Categorias de nudge `B-GAPCHECK` (gap-check D-3, valida estado real) e `B-IMPORT` (cobrança de import, 1x/semana) — toggles em `userCoachPreferences`, passam pelo `shouldSendNudge`, cobertas pelo auto-freeze.
- **ADR-158** — Quick suggestions anti-blank-page — endpoint `GET /api/coach/suggestions` (mapa estático por rota + check leve de estado, cache TTL 30s, fallback frontend estático); não-LLM.
- (Próximo nº de migração: **0067**. Próximo nº de ADR: **155**.)
