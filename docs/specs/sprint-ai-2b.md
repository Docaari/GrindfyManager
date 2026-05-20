# Spec: Sprint AI-2B — Carreira (metas + Quarterly Review + IRPF) + Mental tracking (C-game/Inchworm + Mental Hand History) + Email pipeline + Disclaimer regulatório

## Status
Aprovada (decisões Q-A a Q-H travadas pelo founder em 2026-05-20 — ver seção "Decisões do founder (locked)" abaixo)

---

## Decisões do founder (locked 2026-05-20)

Founder delegou decisão "aceitar todas as 8 recomendações default". 8 questões resolvidas:

| Q | Decisão final | Impacto |
|---|---|---|
| **Q-A** | **Tabela dedicada `career_goals`** (não JSONB). `ai_structured_profile.metas` legacy permanece sem mudança. | Migration 0071 cria tabela com campos estruturados; tool `define_career_goal` grava lá; opt-sync com `metas` JSONB legacy a critério do system-architect. |
| **Q-B** | **Estender o enqueuer hourly existente** (`server/jobs/reportJobRunner.ts`) com regra "dia 1 do mês ∈ {jan, abr, jul, out} && hora local == 7 (fuso do user)" para `report_type='quarterly'`. **Sem cron dedicado.** | `reportJobRunner.ts` ganha branch novo; reusa lógica TZ-aware do weekly/monthly. |
| **Q-C** | **Seção "Resumo fiscal informativo"** dentro do Quarterly Report: P&L USD → BRL via **PTAX médio do trimestre** (`fxCascade.ts`), por moeda nativa + USD + BRL, rakeback bruto. Disclaimer explícito "informativo, não substitui contador". Sem cálculo de imposto devido, sem alíquotas. Só para users BR. | RF-04 (`compute_irpf_summary` tool) + RF-03.3 seção 14 + RF-09 disclaimer. |
| **Q-D** | **Heurística determinística** (sem LLM) deriva A/B/C de `warmup_rituals.emotionalCheckScore + overrideUsed + decisionToPlay`. Thresholds default: A = `score ≥ 8 && !overrideUsed && decisionToPlay`; C = `score ≤ 4 && overrideUsed && decisionToPlay`; B = resto (incluindo `decisionToPlay=false`). **Founder valida thresholds em implementer/reviewer round.** | `cgameAggregator.ts` puro (0 LLM). Sem coluna nova em `warmup_rituals`. |
| **Q-E** | **Tabela dedicada `mental_hand_history`** (não JSONB em `warmup_rituals`). Queries por emoção/tempo precisam ser indexáveis. | Migration 0071 cria tabela; tool `log_mental_hand` + endpoints CRUD + viewer. |
| **Q-F** | **Reusar Gmail SMTP** existente (`server/emailService.ts` + nodemailer) — **fase 1**. **Sem SES/SendGrid agora.** Tabela `email_log` para idempotência/retries/bounces local. Unsubscribe via HMAC token. | Aceita rate limit ~500/dia (folgado em alpha externo). SES/SendGrid = follow-up pós-alpha quando volume justificar. |
| **Q-G** | **Email só Weekly/Monthly/Quarterly. Daily Debrief NÃO email (só in-app).** Opt-in granular por tipo em `user_coach_preferences` (3 toggles: `email_weekly_enabled`, `email_monthly_enabled`, `email_quarterly_enabled`). Default OFF. | RF-07 não cobre daily; documentado em "Fora de Escopo". |
| **Q-H** | **Disclaimer em 3 superfícies: (1) footer dos reports** (`ReportContent.disclaimer` populado em todos os 4 tipos), **(2) system prompt do Coach** (regra de deflexão IRPF/tax/regulamentação/staking/contrato/lei), **(3) onboarding step novo** com aceite explícito (grava `disclaimer_accepted_at`). **Texto canônico em arquivo único** `server/coach/disclaimers.ts` exportando constante `REPORT_DISCLAIMER`. | Texto canônico PT-BR proposto abaixo (RF-09); implementer pode ajustar tom com aprovação do founder no commit. |

### Texto canônico do disclaimer (proposto — RF-09)

A constante `REPORT_DISCLAIMER` em `server/coach/disclaimers.ts`:

> *"Grindfy é uma ferramenta de análise de performance em poker. Não somos casa de apostas, advisor financeiro, contador, advogado ou consultor regulatório. O conteúdo gerado por nossos relatórios e pelo Grindfy AI é informativo e baseado em dados que você forneceu — não constitui aconselhamento fiscal, jurídico ou de investimento. Resultados passados não preveem resultados futuros e nenhum retorno é garantido. Para questões de IRPF, declaração fiscal, staking, contratos ou regulamentação, consulte um profissional especializado (contador, advogado). Jogue com responsabilidade."*

Onboarding step exige aceite explícito (checkbox "Eu li e aceito"); aceite grava `user_coach_preferences.disclaimer_accepted_at = now()`. Users existentes pré-AI-2B veem banner não-bloqueante no `/coach-ai` na primeira visita pós-deploy (back-fill single-click).

### Confirmações de impacto técnico (locked)

- **Migration 0071** inclui (confirmado): 3 tabelas novas (`career_goals`, `mental_hand_history`, `email_log`) + 5 colunas em `user_coach_preferences` (`report_quarterly_enabled`, `email_weekly_enabled`, `email_monthly_enabled`, `email_quarterly_enabled`, `disclaimer_accepted_at`). Rollback simétrico em `0071_rollback.sql`.
- **`server/coach/reportEligibility.ts`** ganha branch novo `isReportEligible(userId, 'quarterly')` (não existe hoje — confirmado). `PREF_FIELD_BY_KIND` adiciona `quarterly: 'reportQuarterlyEnabled'`. `getReportTier` em si **não muda**.

---

## Resumo

Último sprint do plano de melhoria dos agentes de IA (Fase 2 — "Técnico de carreira" parte 2). Entrega:

1. **Metas de carreira** — tabela nova `career_goals` (substitui Goal Setting cancelado do roadmap pivot, ADR-168), tool `define_career_goal` (movida do AI-2A — Q-A locked), `evaluate_career_goal` (read), edição/UI das metas no hub `/coach-ai`.
2. **Quarterly Career Review** — relatório trimestral automático (opt-in, só elegível via `getReportTier`), enfileirado dia 1 dos meses jan/abr/jul/out, reusa pipeline `report_jobs`/`reports` (o `report_type='quarterly'` **já está reservado** em AI-1C ADR-159, sem ALTER no DB), com **ajuda IRPF** (extrato P&L USD→BRL via FX cascade `shared/fxCascade.ts` — informativo, **não** cálculo fiscal).
3. **C-game / Inchworm visualization** — agregação de dados **já existentes** em `warmup_rituals` (`emotionalCheckScore` 0-10, `overrideUsed`, `decisionToPlay`, `blocksCompleted`) → score A-game/B-game/C-game derivado, Inchworm chart no hub. **Sem prompt invasivo** (founder Q6 locked), **sem coluna nova em warmup**.
4. **Mental Hand History (Tendler)** — tabela nova `mental_hand_history` (situação, emoção, resposta real, resposta ideal). Captura via tool `log_mental_hand` (write, confirm) + viewer no `/coach-ai` aba "Mental".
5. **Email HTML pipeline** — entrega de Weekly/Monthly/Quarterly por email (opt-in granular por tipo). Reusa `server/emailService.ts` (nodemailer + Gmail SMTP já em prod), templates novos em `server/emails/templates/`, tabela `email_log` para idempotência/retries/bounces.
6. **Disclaimer regulatório** — texto fixo em outputs financeiros (Coach chat, todos os relatórios, onboarding, footer). Coach **não** opina sobre tax/regulamentação/staking — deflete.

**NÃO entram (fora de escopo):**
- `log_mental_state` / `log_cgame_split` (D5 tools — agregação é via warm-up; Q-D resolve).
- Wellbeing prompts / schedule pattern detection (H3 — founder Q6 locked: **só dados de warm-up, sem prompt invasivo**; documentar como follow-up futuro).
- AI-2B Quarterly cobre apenas trimestres "civis" (jan-mar / abr-jun / jul-set / out-dez). Trimestres "móveis" (qualquer 3 meses) = fora.
- Email pipeline de Daily Debrief — daily fica **só in-app** (alto volume + custo SMTP + risco spam). Configurável via Q-G.
- Webhook de bounce/unsubscribe via provider externo (SES/SendGrid) — só log local + unsubscribe link com token. Pipeline robusto = follow-up.
- Calibração com dados reais do Inchworm — heurística fixa (mesma decisão do AI-2A para `confidence` das tools de diagnóstico).

---

## Histórico das 8 questões (resolvidas — ver "Decisões do founder (locked 2026-05-20)" acima)

Mantidas abaixo apenas para referência de raciocínio do pm-spec. Todas resolvidas via aceite das recomendações default.

### Q-A — Estrutura de `career_goals`: tabela dedicada vs JSONB em `ai_structured_profile.metas`?

Hoje há `users.ai_structured_profile.metas: AiStructuredProfileMeta[]` (`{ id, texto, prazo: 'mes'|'trimestre'|null, criadaEm, origem }`) — texto livre, sem campo de valor-alvo nem progresso. Recomendação: **tabela dedicada `career_goals`** com campos estruturados (`targetMetric`, `targetValue`, `targetDeadline`, `status`, `progressNote`) para permitir `evaluate_career_goal` precisar (vs interpretação LLM). O `ai_structured_profile.metas` vira **legacy/short-term focus** (mantido pra back-compat — onboarding wizard continua gravando lá; o user "promove" uma meta curta a `career_goals` formal via tool `define_career_goal`). **Founder decide:** (a) tabela dedicada (recomendado), (b) só JSONB, (c) ambos (tabela + sync). Afeta migration 0071 + 2 ADRs.

### Q-B — Quarterly Review: trigger no enqueuer hourly ou cron dedicado?

Recomendação: **estender o `enqueuer hourly`** existente (`enqueueWeeklyReportJobsTick` ou tick irmão — system-architect formaliza). Regra: "dia 1 do mês ∈ {jan, abr, jul, out} && hora local == 7 (fuso do user)". `period_start` = 1º dia do trimestre anterior; `period_end` = último dia do trimestre anterior. Reusa `report_jobs.report_type='quarterly'` (já reservado, sem ALTER). **Alternativa:** cron dedicado `0 7 1 1,4,7,10 *` — sem fuso, mais simples mas insensível a TZ. **Recomendado: (a) reusar enqueuer** (consistente com weekly/monthly). Afeta `reportJobRunner.ts` + ADR.

### Q-C — Quarterly Review: ajuda IRPF (formato e tom)

Recomendação: o relatório inclui uma **seção "Resumo fiscal informativo"** (não "ajuda IRPF") com: P&L USD do trimestre, conversão para BRL via **PTAX médio do período** (`shared/fxCascade.ts` já tem multi-source com fallback — BCB/PTAX é fonte preferencial pra BRL); P&L bruto, rakeback, FX rates usados. **Disclaimer explícito:** "Este é um extrato informativo. NÃO substitui contador. NÃO é declaração fiscal. Consulte um profissional para IRPF / Carnê-Leão." Sem cálculo de imposto devido, sem alíquotas, sem "como declarar". **Founder decide:** (a) recomendação acima, (b) só P&L USD sem conversão (mais conservador), (c) versão mais completa com sugestão de "guia de quais valores levar ao contador". **Recomendado: (a).** Afeta RF-04, prompts, disclaimer (RF-09).

### Q-D — C-game/Inchworm: derivação dos níveis A/B/C a partir do warm-up

Founder Q6 locked: **só dados de warm-up, sem prompt invasivo**. `warmup_rituals` já tem: `emotionalCheckScore` (0-10), `overrideUsed` (bool — score < 6 mas decidiu jogar), `decisionToPlay`, `blocksCompleted` (JSONB). Recomendação **heurística determinística** (sem LLM):
- **A-game:** `emotionalCheckScore ≥ 8 && !overrideUsed && decisionToPlay === true`.
- **C-game:** `emotionalCheckScore ≤ 4 && overrideUsed === true && decisionToPlay === true` (jogou apesar de score baixo — risco).
- **B-game:** tudo no meio (incluindo `decisionToPlay === false` e abortados — modo "decidiu não jogar" é B-game, não C).
- **Inchworm** = série temporal mensal: % de sessões em A/B/C ao longo dos últimos N meses; "movimento" = comparação mês atual vs 3 meses atrás (A-game subindo? C-game encolhendo?).
- **Confidence:** baixo se < 8 warm-ups no mês.

**Founder decide:** (a) heurística acima, (b) heurística simplificada (só A vs não-A, sem distinguir B/C), (c) outra. Afeta `server/services/cgameAggregator.ts` + componente UI + ADR.

### Q-E — Mental Hand History: tabela dedicada vs JSONB em coluna existente?

Recomendação: **tabela dedicada `mental_hand_history`** (substantivo distinto, queries de filtro/agregação ao longo do tempo). Campos: `id, user_id, occurred_at (snapshot do user), situation text, emotion varchar(32), real_response text, ideal_response text, linked_grind_session_id?, linked_hand_id? (futuro), tags text[]?, created_at`. Captura via tool `log_mental_hand` (write, confirm). Viewer = tab "Mental" do `/coach-ai` com lista paginada + filtro por emoção. **Alternativa:** reusar `warmup_rituals.sessionIntention` JSONB (já existe) — mas overload semântico ruim e perde a queryability. **Recomendado: (a) tabela dedicada.** Afeta migration 0071 + tool + viewer + ADR.

### Q-F — Email pipeline: provider e robustez

Recomendação: **fase 1 minimal — reusar `server/emailService.ts` (Gmail SMTP via nodemailer)** que já está em prod para verification/welcome/reset. Adicionar `sendReportEmail(reportId, kind)` + 3 templates HTML novos (weekly/monthly/quarterly) + tabela `email_log` (`id, user_id, report_id?, kind varchar(32), to_email, status varchar(16) 'pending'|'sent'|'failed'|'bounced', subject, sent_at, error_message, attempts int, message_id text — header SMTP, idempotência via UNIQUE `(report_id, kind)`). Sem webhook de bounce externo (SES/SendGrid) — só log local. Unsubscribe link com token JWT-like (assinatura HMAC user_id+kind+expira-em-1ano). **Alternativa:** migrar para SES/SendGrid agora — mais escalável mas adiciona dep + secrets + custos. **Recomendado: (a) reusar Gmail SMTP** até volume justificar troca. **Risco aceito:** Gmail SMTP tem rate limit ~500/dia — em alpha externo isso é folgado. Afeta migration 0071 (`email_log`) + RF-08 + ADR.

### Q-G — Email pipeline: Daily Debrief entra ou não?

Recomendação: **Daily Debrief só in-app** (decisão default — alto volume + ruído). Email = só Weekly + Monthly + Quarterly. Opt-in granular por tipo em `user_coach_preferences`: `email_weekly_enabled`, `email_monthly_enabled`, `email_quarterly_enabled` (NOT NULL DEFAULT false). Default OFF — user precisa ligar explicitamente. **Alternativa:** Daily também — mas spam alto, baixo ROI. **Recomendado: (a) sem Daily.** Afeta migration 0071 (cols em `user_coach_preferences`).

### Q-H — Disclaimer regulatório: superfície e tom

Recomendação: **3 superfícies**:
1. **Footer fixo** em todo relatório (`ReportContent.disclaimer: string`) — texto curto: *"Grindfy é uma ferramenta de análise de poker. Não somos casa de apostas, advisor financeiro nem contador. Conteúdo informativo — não garante retorno futuro. Resultados passados não preveem resultados futuros. Jogue com responsabilidade."*
2. **System prompt** do Coach (`GRINDFY_AI_BASE`): adicionar regra "Quando o user perguntar sobre IRPF/tax/regulamentação/staking/contrato/lei → defletir: 'Não opino sobre isso — consulte um profissional especializado (contador, advogado).'"
3. **Onboarding wizard:** 1 step novo (ou modificar step existente) com aceite explícito do disclaimer.

Founder decide se aceita os 3 + tom do texto. Afeta RF-09 + ADR.

---

## Contexto

### Estado atual (o que JÁ existe)

- **AI-2A (`Sprint shipped`):** 8 tools (3 write core grade/estudo + 1 utility off-day + 5 read diagnóstico), 3 nudges B-DOWNSWING/B-VOLUME/B-GRADE, tool-bridge OCR, `user_off_days`, `tournament_pool_intelligence` (12 rows BR), `isToolEligibleTier` helper (Trial-friendly), ADRs 165-167. Migration 0070.
- **AI-1C:** `server/coach/reportEligibility.ts` (`getReportTier(user)`/`isReportEligible(userId, type)` — `'weekly'|'daily'|'monthly'` hoje). `report_jobs.report_type` é `varchar(16)` **livre** (sem CHECK enum no DB) — `'quarterly'` já está reservado e documentado em ADR-159 (sem ALTER). `dailyDebriefGenerator.ts` + `monthlyReportGenerator.ts` + `reportGeneratorShared.ts` (helpers DRY: `persistReport`, `sanitizeHref`, `computeCost`, `callLlm`, `resolveStorage`). `processReportJobsTick` despacha por `job.reportType`. `bulk_query_dimensions` tool (batching). Follow-ups (`ReportContent.followUp`).
- **AI-1A:** `users.ai_structured_profile` JSONB com `metas: AiStructuredProfileMeta[]` (texto livre, sem valor alvo). `COACH_NUDGES_ENABLED` kill switch global.
- **Warm-up:** `warmup_rituals` schema (lines 796-818 em `shared/schema.ts`) — `emotionalCheckScore int 0-10`, `decisionToPlay bool`, `overrideUsed bool default false`, `blocksCompleted jsonb`, `sessionIntention jsonb {focus,tiltPlan,stopCriteria}`, `version varchar(16) 'full'|'aborted'|'minimal'`, `linkedGrindSessionId fk`. **Indexes:** `(user_id, completed_at)` + `(user_id, started_at)`. **Nada precisa mudar nesse schema** — Inchworm/C-game agrega o que já tem.
- **Email pipeline:** `server/emailService.ts` existe com `nodemailer` + Gmail SMTP (SMTP_HOST/USER/PASS/FROM_NAME/FROM_ADDRESS), 3 templates HTML inline (verification/reset/welcome), `auth_tokens` table para verification/reset. **Nenhuma tabela de log de emails enviados.**
- **FX:** `shared/fxCascade.ts` (multi-source BCB/PTAX preferencial pra BRL; cache) — já usado pelo Monthly Report e Bankroll. **Reusável** pra conversão USD→BRL no Quarterly IRPF.
- **`users.email`:** `varchar unique not null` (line 42). Existe garantido — não precisa preocupar com null.
- **Coach context:** `coachContext.ts` `assembleContext` monta bloco DINÂMICO. `coachSystemBuilder.ts` `GRINDFY_AI_BASE` STATIC com `cache_control: ephemeral`.

### O que falta (objeto deste sprint)

| Capacidade | Estado | AI-2B entrega |
|---|---|---|
| Metas de carreira estruturadas | Texto livre em JSONB | Tabela `career_goals` (Q-A) + 2 tools (`define_career_goal`, `evaluate_career_goal`) |
| Quarterly Career Review | Reservado em report_type, sem gerador | `quarterlyReportGenerator.ts` + enqueuer rule (Q-B) + ajuda IRPF (Q-C) |
| C-game/Inchworm | Dados em warm-up, sem agregador nem viewer | `cgameAggregator.ts` (Q-D) + `InchwormChart` componente + 1 tab no hub |
| Mental Hand History | Não existe | Tabela `mental_hand_history` (Q-E) + tool `log_mental_hand` + viewer |
| Email pipeline | SMTP+nodemailer pra auth; sem reports | `email_log` + `sendReportEmail` + 3 templates + 3 toggles opt-in (Q-F/Q-G) |
| Disclaimer regulatório | Não existe | Footer fixo em reports + system prompt + onboarding step (Q-H) |

---

## Usuários

- **Pro/Premium/Trial elegível (`getReportTier`):** ganha as 2 tools de carreira + Quarterly Report opt-in (default OFF) + email opt-in por tipo + C-game/Inchworm/Mental Hand History na UI.
- **Free:** **não recebe** Quarterly Report nem email. Vê os toggles de opt-in desabilitados. **Pode** ver C-game/Inchworm (vem de dados próprios do warm-up que ele já gera, sem custo LLM extra). **Pode** registrar mental hands via UI (não via tool LLM — tool gated). System-architect decide se C-game/Mental UI também é gated; recomendação pm-spec: liberar a leitura pra free (engajamento), gatear só o registro via tool LLM.
- **Admin:** elegível.

---

## Requisitos Funcionais

### RF-01: Migration 0071 — `career_goals` + `mental_hand_history` + `email_log` + 3 colunas em `user_coach_preferences`

**Descrição:** Migration `0071_ai_2b_career_mental_email.sql` (próximo livre — 0070 = AI-2A). Rollback em `0071_ai_2b_career_mental_email_rollback.sql`.

#### RF-01.1 — Tabela `career_goals` (Q-A — pendente; recomendado tabela dedicada)
```sql
CREATE TABLE career_goals (
  id varchar PRIMARY KEY,                    -- nanoid
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,               -- "Atingir Pro Stakes em 12 meses"
  description text,                          -- texto livre
  target_metric varchar(40),                 -- 'profit_usd' | 'tournaments_count' | 'roi_pct' | 'bankroll_usd' | 'custom'
  target_value numeric,                      -- ex: 50000 (USD), 1000 (torneios), 8 (%)
  target_deadline date,                      -- prazo
  horizon varchar(16) NOT NULL DEFAULT 'trimestre',  -- 'mes' | 'trimestre' | 'ano' | 'multi_ano'
  status varchar(16) NOT NULL DEFAULT 'active',      -- 'active' | 'achieved' | 'abandoned' | 'expired'
  progress_note text,                        -- atualizada por evaluate_career_goal
  achieved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX idx_career_goals_user_status ON career_goals(user_id, status);
CREATE INDEX idx_career_goals_user_deadline ON career_goals(user_id, target_deadline);
```
- Sem UNIQUE — user pode ter múltiplas metas. Cap em código (RF-02 — max 5 ativas).
- Sync com `ai_structured_profile.metas`: legacy mantida (sem mudança); `define_career_goal` cria em `career_goals` + opcionalmente popula `metas` resumida (1 frase) — system-architect decide se faz sync ou trata como dois universos paralelos.

#### RF-01.2 — Tabela `mental_hand_history` (Q-E — pendente; recomendado tabela dedicada)
```sql
CREATE TABLE mental_hand_history (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  occurred_at timestamp NOT NULL,            -- quando aconteceu (snapshot do user)
  situation text NOT NULL,                   -- "BB 30 vs UTG opener 22"
  emotion varchar(32),                       -- 'frustration' | 'tilt' | 'fear' | 'overconfidence' | 'fatigue' | 'other'
  real_response text NOT NULL,               -- o que realmente fez
  ideal_response text NOT NULL,              -- o que deveria ter feito
  tags text[],                               -- ['preflop','3bet','tilt-after-bad-beat']
  linked_grind_session_id varchar REFERENCES grind_sessions(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX idx_mental_hh_user_occurred ON mental_hand_history(user_id, occurred_at DESC);
CREATE INDEX idx_mental_hh_user_emotion ON mental_hand_history(user_id, emotion);
```

#### RF-01.3 — Tabela `email_log` (Q-F — pendente; recomendado tabela dedicada)
```sql
CREATE TABLE email_log (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  report_id varchar REFERENCES reports(id) ON DELETE SET NULL,   -- null se for email tipo não-report (futuro)
  kind varchar(32) NOT NULL,                 -- 'report_weekly' | 'report_monthly' | 'report_quarterly'
  to_email varchar(255) NOT NULL,            -- snapshot (em caso de email mudar depois)
  subject varchar(255) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed'
  attempts integer NOT NULL DEFAULT 0,
  message_id text,                           -- nodemailer messageId (header SMTP)
  error_message text,
  sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT email_log_report_kind_unique UNIQUE (report_id, kind)   -- 1 email por report por tipo
);
CREATE INDEX idx_email_log_user_kind ON email_log(user_id, kind, created_at DESC);
CREATE INDEX idx_email_log_pending ON email_log(status, created_at) WHERE status = 'pending';
```
- UNIQUE `(report_id, kind)` permitindo `report_id IS NULL` — comportamento PG: NULLs não disparam UNIQUE (cuidado se quisermos multi-emails do mesmo tipo sem report; aqui aceita).

#### RF-01.4 — Colunas em `user_coach_preferences` (Q-G + Q-F)
```sql
ALTER TABLE user_coach_preferences
  ADD COLUMN report_quarterly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN email_weekly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN email_monthly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN email_quarterly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN disclaimer_accepted_at timestamp;                   -- Q-H — aceite explícito do disclaimer
```
- Idêntico ao padrão AI-1C (NOT NULL DEFAULT false, opt-in).
- `report_quarterly_enabled` é o opt-in do **conteúdo** (gerar o relatório); `email_quarterly_enabled` é o opt-in do **canal email** (entrega). User pode ter quarterly in-app sem email.

#### RF-01.5 — Alargar tipos TS
- `ReportContent.reportType: 'weekly' | 'monthly' | 'daily' | 'quarterly'` (já reservado em AI-1C; só formalizar TS).
- `isReportEligible(userId, 'quarterly')` adicionar ao `PREF_FIELD_BY_KIND` em `server/coach/reportEligibility.ts` → `quarterly: 'reportQuarterlyEnabled'`.
- `updateCoachPreferencesSchema` (`.strict()` mantido) ganha 5 campos opcionais novos.
- `GET/PUT /api/coach/preferences` payload inclui os 5 novos.

**Critério de aceitação:**
- [ ] Migration 0071 cria as 3 tabelas + ALTER em `user_coach_preferences` (5 cols); rollback 0071 dropa/REVERSE.
- [ ] `shared/schema.ts` declara as 3 tabelas + Zod insert schemas.
- [ ] `db:push` aplica sem erro; INSERT/SELECT funcionam em todas.
- [ ] `ReportContent.reportType` alarga para incluir `'quarterly'`; `schemaVersion` bump para 3 (lesson #7).
- [ ] `updateCoachPreferencesSchema` aceita 5 campos novos como `z.boolean().optional()`; `.strict()` continua rejeitando campos crus.
- [ ] `isReportEligible(userId, 'quarterly')` retorna correto (tier elegível + opt-in ligado).

---

### RF-02: Tools de carreira — `define_career_goal` + `evaluate_career_goal`

**Descrição:** 2 tools no Coach. `define_career_goal` (write, confirm v1, ADR-146) + `evaluate_career_goal` (read, audit log).

#### RF-02.1 — `define_career_goal`
- Handler: `server/coachTools/handlers/defineCareerGoal.ts`.
- Registry: `coachTools/index.ts` `safeRegister(defineCareerGoalTool)`.
- **Gating:** `isToolEligibleTier(user, 'define_career_goal')` — Pro+/Trial (mesmo padrão AI-2A Q-E).
- **Input zod:**
```ts
{
  title: string,                              // max 120
  description?: string,                       // max 1000
  targetMetric?: 'profit_usd'|'tournaments_count'|'roi_pct'|'bankroll_usd'|'custom',
  targetValue?: number,
  targetDeadline?: string,                    // 'YYYY-MM-DD'
  horizon?: 'mes'|'trimestre'|'ano'|'multi_ano',  // default 'trimestre'
}
```
- **Output preview:** o que será criado + aviso se user já tem 5 metas ativas ("Você já tem 5 metas — confirmar substitui a mais antiga? Ou prefere atualizar uma existente?"). Cap 5 (config via env `COACH_CAREER_GOALS_MAX_ACTIVE`, default 5).
- **Execute:** INSERT em `career_goals` (status='active'); opcionalmente sync `ai_structured_profile.metas` com 1 entry resumida.
- **`requiresConfirmation: true`**, `auditLevel: 'persist'`, `gateByTier: ['pro','premium','admin']` + Trial via `isToolEligibleTier`.
- **Undo:** DELETE da row (mesma window de 30min do `coach_actions.undo`).

#### RF-02.2 — `evaluate_career_goal`
- Handler: `server/coachTools/handlers/evaluateCareerGoal.ts`.
- **Gating:** mesmo.
- **Input:** `{ goalId: string }`.
- **Output:**
```ts
{
  goal: { id, title, targetMetric, targetValue, targetDeadline, horizon, status, createdAt },
  progress: {
    currentValue: number | null,             // calcula baseado em targetMetric (ex: profit_usd → getPerformanceByPeriod desde createdAt até hoje)
    progressPct: number | null,              // currentValue / targetValue * 100
    estimate: 'on_track' | 'behind' | 'ahead' | 'unknown',
    daysRemaining: number | null,
    narrative: string,                       // 1-2 frases interpretativas
    confidence: 'high' | 'medium' | 'low',
  }
}
```
- **`requiresConfirmation: false`**, `auditLevel: 'log'`.
- **Atualiza** `career_goals.progress_note` em side-effect (read-mostly mas grava nota — system-architect decide se aceita; alternativa: virar `auditLevel: 'persist'` ou separar leitura de gravação). **Recomendação:** read-only puro; nota fica no markdown do output, não em DB. Se quiser persistir, criar `evaluate_career_goal_with_save` separado (fora de escopo aqui).

#### RF-02.3 — UI de edição/lista de metas
- Hub `/coach-ai`: aba existente "Preferências" ganha **subsection "Metas"** com:
  - Lista de `career_goals` ativas (top 5).
  - Botão "+ Nova meta" → modal com campos da `define_career_goal` (sem passar pelo chat).
  - Cada meta: botão "Editar" (PATCH `/api/coach/career-goals/:id`), "Avaliar progresso" (chama `evaluate_career_goal` server-side), "Marcar como atingida"/"Abandonar".
- Componente novo: `client/src/components/coach/CareerGoalsPanel.tsx`.

**Critério de aceitação:**
- [ ] Ambas tools registradas em `coachTools/index.ts`; presença individual validada (lesson #8).
- [ ] `define_career_goal` execute cria 1 row em `career_goals` (status='active'); undo deleta.
- [ ] Cap de 5 ativas: 6ª criação → preview pede confirmação extra para arquivar mais antiga.
- [ ] `evaluate_career_goal` para meta `targetMetric='profit_usd'` calcula `currentValue` via `getPerformanceByPeriod(userId, createdAt..now)`; FX → USD normalizado (lesson #6).
- [ ] Free → tools não listadas pelo `listToolsForUser`.
- [ ] Endpoints HTTP: `GET /api/coach/career-goals`, `POST /api/coach/career-goals`, `PATCH /api/coach/career-goals/:id`, `DELETE /api/coach/career-goals/:id` — todos com `requireAuth`, ownership validado (lesson #28-similar — path mock match).
- [ ] UI `CareerGoalsPanel` renderiza lista; testes RTL com `data-testid` (lesson #2).

---

### RF-03: Quarterly Career Review — gerador + enqueuer + tier gating

**Descrição:** Relatório trimestral. Opt-in `report_quarterly_enabled`, só elegível. Reusa pipeline do AI-1B/1C. Mais caro (~$0.18).

#### RF-03.1 — Gatilho (Q-B — pendente; recomendado estender enqueuer hourly)
- Em `enqueueWeeklyReportJobsTick` (ou `enqueueMonthlyReportJobsTick` — system-architect formaliza o local): adicionar regra "se, no fuso do user, hoje é **dia 1** do mês ∈ {**1, 4, 7, 10**} **AND** hora local == **7** **AND** `report_quarterly_enabled=true` **AND** `isReportEligible(userId, 'quarterly')`": `period_start` = 1º dia do trimestre anterior (no fuso do user); `period_end` = último dia do trimestre anterior; INSERT em `report_jobs` com `report_type='quarterly'`, `ON CONFLICT (user_id, 'quarterly', period_start) DO NOTHING`.
- **Idempotência:** UNIQUE garante 1 quarterly job por user por trimestre.

#### RF-03.2 — Processor despacha para `quarterlyReportGenerator`
- `processReportJobsTick` (já despacha por `job.reportType`) — adicionar case `'quarterly'` → `(await import("../services/quarterlyReportGenerator")).generateQuarterlyReport({ userId, periodStart, periodEnd, injectedStorage? })`.

#### RF-03.3 — Conteúdo (seções)
Reusa muito do Monthly (RF-05 do AI-1C) + extensões. `ReportContent.reportType='quarterly'`, `schemaVersion=3`. Seções:
1. **Cabeçalho** — "Seu trimestre Q2/2026 (abr-jun) — Xh, N torneios, +$Y (ROI Z%). [Comparação curta vs trimestre anterior]." Tom = `tomPreferido`.
2-6. **Mesmas 5 seções do monthly** (volume, bankroll, selection, study, mental) — agregadas para o trimestre.
7. **Evolução intra-trimestre** — série mensal dos 3 meses do trimestre (já que monthly reports existem, podemos linkar a eles).
8. **Comparativos vs trimestres anteriores** — Q-1, Q-2 atrás, mesmo Q do ano anterior (Q2/2025 vs Q2/2026 se houver dado).
9. **Análise de variância trimestral** — sample maior, confidence mais alto. Mesma heurística do monthly (`varianceAnalysis.ts`).
10. **Leaks: evolução trimestral** — resolvidos no trimestre vs novos vs ainda ativos.
11. **Progresso das metas (`career_goals`)** — para cada meta com `horizon ∈ {'trimestre','ano','multi_ano'}`: chama `evaluate_career_goal` internamente para cada uma + LLM compõe narrative. (Diferente do monthly que avalia `ai_structured_profile.metas` por interpretação livre — quarterly tem dados estruturados.)
12. **C-game / Inchworm — movimento trimestral** (RF-05) — A%/B%/C% do trimestre + comparação vs Q anterior + Inchworm visualization data no `content`.
13. **Mental Hand History highlights** (RF-06) — top 3 mental hands registradas no trimestre + emoção dominante + 1 padrão observado pelo LLM (data-grounded).
14. **Resumo fiscal informativo — IRPF (Q-C — pendente; recomendado)** — só para users BR (`users.country='BR'` ou `users.timezone` começa com `America/`): P&L USD total do trimestre, conversão para BRL via PTAX médio do período (`fxCascade.getAveragePtaxForRange`); por moeda nativa + USD + BRL; rakeback bruto; disclaimer explícito: "Informativo — não substitui contador. Consulte profissional."
15. **Plano dos próximos 90 dias** — sugestão de foco de estudo + 1 ação recomendada + link `/coach` (grade) / `/estudos` / `/biblioteca`. NÃO monta grade (AI-2A faz isso via tools quando user pedir).
16. **Seção "Seu acompanhamento"** (`followUp` block — AI-1C) — career_goals em progresso + foco de leak ativo.
17. **CTAs** — só tools AI-0A/2A/2B existentes + rotas Wouter registradas (lesson #19/#28-similar). **Nunca** sugerir feature inexistente.
18. **Disclaimer regulatório** (RF-09 — Q-H — pendente) — footer fixo.

#### RF-03.4 — Custo / modelo / fail-soft
- Modelo: `process.env.COACH_MODEL ?? 'claude-sonnet-4-6'`. `max_tokens` ~4000 (trimestre é maior). Custo estimado ~$0.18.
- Bundle grande → sumarização hierárquica Haiku via `reportSummarizer.ts` (AI-1C RF-07) — threshold de 20K chars já estabelecido aciona. Para quarterly o bundle quase sempre dispara.
- Fail-soft mesmo padrão AI-1C (lesson #5/#35, `new AnthropicCtor` em try/catch; sem `ANTHROPIC_API_KEY` → determinístico).
- Custo gravado em `reports.cost_usd_estimate` + tokens.
- Prompt único em `server/coach/prompts/quarterlyReport.ts` (reusa `GRINDFY_AI_BASE` + `CITATIONS_RULES`; `cache_control: ephemeral`).

#### RF-03.5 — Estrutura do `content` (extensão de `ReportContent`)
Adiciona campos opcionais (lesson #7):
```ts
ReportContent {
  reportType: 'weekly'|'monthly'|'daily'|'quarterly',
  ...,
  // extensões quarterly:
  irpfSummary?: {
    profitUsd: number,
    profitBrl: number,
    avgPtax: number,
    period: { start: string, end: string },
    byCurrency: Array<{ currency: string, profit: number, convertedUsd: number, convertedBrl: number }>,
    disclaimer: string,            // texto Q-H
  },
  cgameSnapshot?: {                // RF-05
    aPct: number, bPct: number, cPct: number,
    sampleSize: number,
    confidence: 'high'|'medium'|'low',
    movement?: { vsPreviousPeriod: { aPctDelta: number, cPctDelta: number, narrative: string } },
    inchwormSeries: Array<{ month: string, aPct: number, bPct: number, cPct: number }>,
  },
  mentalHandHighlights?: Array<{   // RF-06
    id: string, occurredAt: string, emotion: string, situation: string, idealResponse: string,
  }>,
  careerGoalsProgress?: Array<{    // RF-02 evaluate
    goalId: string, title: string, horizon: string, progressPct: number | null,
    estimate: 'on_track'|'behind'|'ahead'|'unknown', narrative: string,
  }>,
  disclaimer?: string,             // RF-09 — sempre presente em quarterly
}
```

**Critério de aceitação:**
- [ ] Enqueuer hourly enfileira `report_jobs` row `'quarterly'` no dia 1 de jan/abr/jul/out às 7h local; UNIQUE garante 1/user/trimestre.
- [ ] `processReportJobsTick` despacha `'quarterly'` para `generateQuarterlyReport`.
- [ ] `generateQuarterlyReport({ userId, periodStart, periodEnd, injectedStorage? })` retorna `{ content, markdown, status:'ready', model, usage }`.
- [ ] `content` inclui 14+ seções; markdown sanitizado (`sanitizeHref`).
- [ ] Free com `report_quarterly_enabled=true` → enqueuer revalida via `isReportEligible` → no-op.
- [ ] Sem `ANTHROPIC_API_KEY` → degraded determinístico (lesson #5/#35).
- [ ] Bundle > 20K chars → sumarização Haiku aciona; `summarizer_model_used` populado.
- [ ] `irpfSummary` só inclui BRL se `users.country='BR'` ou `timezone` america-BR; senão omite.
- [ ] CTAs só apontam pra tools/rotas existentes.
- [ ] `COACH_NUDGES_ENABLED=false` → enqueuer não roda; processor não processa.
- [ ] Trimestre 1 = Q1 (jan-mar). Quarterly enfileirado em 1/abril às 7h cobre Q1. Verificar boundary com timezone (lesson "boundary de mês/trimestre").

---

### RF-04: Tool de leitura da ajuda IRPF (informativo)

**Descrição:** Tool read que o user pode chamar no chat para gerar o extrato fiscal ad-hoc (sem esperar o quarterly). Útil pra reconciliação pontual.

- Handler: `server/coachTools/handlers/computeIrpfSummary.ts`.
- **Input:** `{ period: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }`.
- **Output:** mesmo shape de `ReportContent.irpfSummary` + 1 disclaimer prominente.
- **`requiresConfirmation: false`**, `auditLevel: 'log'`, `gateByTier: ['pro','premium','admin']` + Trial.
- **Disclaimer obrigatório** em todo output (RF-09).

**Critério de aceitação:**
- [ ] Tool registrada; preview/execute funcionando.
- [ ] FX via `fxCascade.getAveragePtaxForRange` (BCB preferencial).
- [ ] Free → não listada.
- [ ] Disclaimer presente no output (verificável no markdown).

---

### RF-05: C-game / Inchworm aggregator + visualization

**Descrição:** Agregação determinística (Q-D — pendente; recomendado heurística sem LLM) de `warmup_rituals` em score A/B/C-game + Inchworm chart no hub.

#### RF-05.1 — Aggregator
- Módulo: `server/services/cgameAggregator.ts` (read-only, sem LLM).
- Funções:
  - `classifyWarmupGame(ritual: WarmupRitual): 'A' | 'B' | 'C'` (heurística Q-D).
  - `aggregateCgameForPeriod(userId, range): Promise<{ aPct, bPct, cPct, sampleSize, confidence }>`.
  - `getInchwormSeries(userId, months): Promise<Array<{ month: 'YYYY-MM', aPct, bPct, cPct }>>`.
  - `getCgameMovement(userId, currentRange, comparisonRange): Promise<{ aPctDelta, cPctDelta, narrative }>`.
- `confidence`: `< 8 warm-ups no período` → `'low'`; `< 20` → `'medium'`; senão `'high'`.
- Safe-deny em erro (lesson #9).

#### RF-05.2 — Endpoint HTTP
- `GET /api/coach/cgame/snapshot?period=30d|90d|trimestre|ano` → retorna `aggregateCgameForPeriod` + `getInchwormSeries(months=6)`.
- `requireAuth`. Sem gating de tier (free pode ver — dados próprios).

#### RF-05.3 — UI
- Hub `/coach-ai` ganha aba nova **"Mental"** (ou subseção; system-architect decide layout).
- Componente: `client/src/components/coach/InchwormChart.tsx` — chart Recharts (line/area) com 3 séries (A%/B%/C%) ao longo de 6 meses.
- Componente: `client/src/components/coach/CgameSummaryCard.tsx` — card grande com %A/%B/%C atual + comparação ("A-game subiu 5pp vs Q anterior").
- Empty state quando `sampleSize=0`: "Faça mais warm-ups pra ver seu Inchworm. [Link → /grind-live]".

**Critério de aceitação:**
- [ ] `classifyWarmupGame` retorna A/B/C conforme heurística Q-D (testado com fixtures cobrindo todos os ramos).
- [ ] `aggregateCgameForPeriod` para user com mix de warm-ups retorna %s que somam 100 (± erro de arredondamento).
- [ ] `getInchwormSeries(months=6)` retorna 6 entries (uma por mês), preenche zero quando sem dados.
- [ ] `confidence='low'` para sample < 8.
- [ ] Endpoint `GET /api/coach/cgame/snapshot` retorna 200 + payload válido; sem dados → empty payload.
- [ ] `InchwormChart` renderiza com fixtures; testes RTL com `data-testid` (lesson #2).
- [ ] Free → vê seu próprio C-game (não-gated em leitura).
- [ ] Quarterly Report inclui `cgameSnapshot` no `content`.

---

### RF-06: Mental Hand History — tool `log_mental_hand` + viewer

**Descrição:** Captura de "mental hands" (framework Tendler).

#### RF-06.1 — Tool `log_mental_hand`
- Handler: `server/coachTools/handlers/logMentalHand.ts`.
- **Gating:** Pro+/Trial via `isToolEligibleTier`.
- **Input zod:**
```ts
{
  situation: string,                        // max 1000
  emotion: 'frustration'|'tilt'|'fear'|'overconfidence'|'fatigue'|'other',
  realResponse: string,                     // max 1000
  idealResponse: string,                    // max 1000
  tags?: string[],
  linkedGrindSessionId?: string,
  occurredAt?: string,                      // ISO; default = now
}
```
- **Output preview:** o que será gravado.
- **Execute:** INSERT em `mental_hand_history`.
- **`requiresConfirmation: true`** (lesson "default mínimo" — coisa que mexe em DB sempre confirma), `auditLevel: 'persist'`.
- **Undo:** DELETE.

#### RF-06.2 — Endpoints HTTP (viewer)
- `GET /api/coach/mental-hands?limit=20&offset=0&emotion=...` — lista paginada com filtro por emoção.
- `DELETE /api/coach/mental-hands/:id` — user pode apagar uma entry (sem passar pelo undo do tool).
- `requireAuth`, ownership validado.

#### RF-06.3 — UI
- Aba "Mental" do `/coach-ai` (mesma do RF-05) ganha section "Mental Hand History" abaixo do Inchworm.
- Componente: `client/src/components/coach/MentalHandHistoryList.tsx` — lista paginada + botão "+ Nova" → modal/form (chama POST endpoint direto, ou pelo tool LLM).
- Componente: `client/src/components/coach/MentalHandForm.tsx`.
- Free → pode usar via UI form (sem custo LLM). Tool gated.

**Critério de aceitação:**
- [ ] Tool registrada; execute cria 1 row em `mental_hand_history`; undo deleta.
- [ ] Endpoint `GET /api/coach/mental-hands` lista; pagination funciona; filter emotion.
- [ ] Endpoint `DELETE /api/coach/mental-hands/:id` deleta com ownership check (try delete de outro user → 404/403).
- [ ] UI list + form renderizam; testes RTL.
- [ ] Quarterly Report inclui top 3 `mentalHandHighlights` em `content`.

---

### RF-07: Email pipeline — entrega de Weekly/Monthly/Quarterly por email

**Descrição:** Adicionar canal email aos relatórios. Reusa `emailService.ts` (Q-F — recomendado).

#### RF-07.1 — `sendReportEmail` helper
- Módulo: `server/services/reportEmailSender.ts`.
- Função: `sendReportEmail({ reportId, userId, kind }: { reportId, userId, kind: 'report_weekly'|'report_monthly'|'report_quarterly' }): Promise<{ status, messageId?, error? }>`.
- Lógica:
  1. Lê `reports` row + `users.email` + `users.firstName`.
  2. Revalida `isReportEligible(userId, type)` + opt-in correspondente (`email_<type>_enabled`). Não elegível → skip silencioso.
  3. INSERT `email_log` row `status='pending'` (idempotência via UNIQUE `(report_id, kind)` — `ON CONFLICT (report_id, kind) DO NOTHING`).
  4. Renderiza template HTML (RF-07.3) com `ReportContent` + `markdown`.
  5. `EmailService.getTransporter().sendMail(...)`.
  6. UPDATE `email_log` SET `status='sent'`, `sent_at`, `message_id`.
  7. Em erro: `status='failed'`, `error_message`, `attempts+1`; retry exponencial (15min/1h/4h, mesmo padrão `reportJobRunner` AI-1B); após 3 falhas → `status='failed'` final, log.

#### RF-07.2 — Trigger
- Após `processReportJobsTick` finalizar gerar um report (`status='ready'`), chamar `sendReportEmail(...)` em try/catch (best-effort, não bloqueia o tick). Se opt-in de email do tipo está OFF → skip silencioso.
- Alternativa system-architect pode optar: queue separada `email_queue` com cron tick próprio. **Recomendação:** inline no processor (simpler), aceita debounce mínimo.

#### RF-07.3 — Templates HTML
- Diretório novo: `server/emails/templates/`.
- Arquivos: `weeklyReportEmail.ts`, `monthlyReportEmail.ts`, `quarterlyReportEmail.ts` — cada um exporta `function renderXReportEmail(args: { content: ReportContent, userName: string, unsubscribeUrl: string, baseUrl: string }): { subject: string, html: string, text: string }`.
- Visual: reusar header/footer pattern de `emailService.ts` (gradiente, marca Grind/fy). Body: resumo + CTA "Abrir relatório completo no Grindfy" → link para `${baseUrl}/coach-ai/relatorio/${reportId}`.
- **Unsubscribe link obrigatório** (CAN-SPAM/LGPD): HMAC token assinado `${userId}|${kind}|${expiresAt}` — endpoint `GET /api/coach/email/unsubscribe?token=...` desliga o opt-in correspondente.
- **Disclaimer regulatório** (RF-09) no footer.

#### RF-07.4 — Endpoint unsubscribe
- `GET /api/coach/email/unsubscribe?token=...` — público (sem auth, validação por HMAC).
- Valida token (assinado com `JWT_SECRET` ou env nova `EMAIL_UNSUBSCRIBE_SECRET`); extrai `userId, kind, expiresAt`; if válido + não expirado → UPDATE `user_coach_preferences.email_<type>_enabled = false`; retorna página HTML simples "Você foi descadastrado do tipo X".

**Critério de aceitação:**
- [ ] `sendReportEmail` envia email para user com opt-in ligado; `email_log` row criada com `status='sent'`, `message_id`.
- [ ] Idempotência: chamar 2x para mesmo `(report_id, kind)` → segunda call é no-op (UNIQUE).
- [ ] User com opt-in OFF → `sendReportEmail` skip silencioso (não cria `email_log`).
- [ ] Free com opt-in ON → revalida tier, skip silencioso.
- [ ] Sem SMTP config → `EmailService.getTransporter` throw; capturado em try/catch; `email_log.status='failed'`, retry após backoff.
- [ ] Unsubscribe link com HMAC válido → desliga o opt-in correspondente; user vê página de confirmação.
- [ ] Unsubscribe token inválido/expirado → 400/403.
- [ ] Template HTML válido (DOMPurify-safe — lesson #16; teste com snapshot).
- [ ] Daily Debrief **não** envia email (Q-G).

---

### RF-08: System prompt + page context — disclaimer + tools novas

**Descrição:** O `GRINDFY_AI_BASE` (lesson #10 — fonte única) ganha:
- **Regra de deflexão** (Q-H): "Quando user perguntar sobre IRPF, tax, regulamentação, staking, contrato ou direito → defletir: 'Não opino sobre isso — consulte um profissional especializado (contador, advogado).' NÃO inventar números fiscais."
- **Inventário de tools novas:** 1-2 linhas mencionando `define_career_goal`, `evaluate_career_goal`, `log_mental_hand`, `compute_irpf_summary`.
- **Disclaimer condicional** (Q-H): em qualquer output que mencione $/BRL/banca/profit → adicionar 1 frase "Conteúdo informativo — não garante retorno futuro." (LLM aplica via regra do system prompt; review pode pegar omissões).

Page context (`coachContext.ts`):
- Bloco "## Metas ativas" no DINÂMICO se user tem `career_goals` ativas: lista top 3 (`title`, `horizon`, `progressPct` se houver).
- Bloco "## C-game recente" se há warm-ups recentes (últimos 30d): "A-game X%, B-game Y%, C-game Z% (n=N, confidence=...)".

**Critério de aceitação:**
- [ ] Snapshot do prompt STATIC contém regra de deflexão + inventário das 4 tools novas + regra de disclaimer financeiro.
- [ ] LLM pergunta sobre IRPF → deflete (testado via integration smoke).
- [ ] `assembleContext` para user com 3 `career_goals` ativas → inclui bloco "## Metas ativas".
- [ ] Cache `ephemeral` mantido nos blocos estáveis (custo de cache não estourado).

---

### RF-09: Disclaimer regulatório — 3 superfícies (Q-H — pendente)

**Descrição:**

#### RF-09.1 — Footer fixo em relatórios
- Texto canônico em constante `REPORT_DISCLAIMER` em `server/coach/constants.ts`:
  > "Grindfy é uma ferramenta de análise de poker. Não somos casa de apostas, advisor financeiro nem contador. Conteúdo informativo — não garante retorno futuro. Resultados passados não preveem resultados futuros. Jogue com responsabilidade."
- `ReportContent.disclaimer` populado em **todos** os reports (weekly/monthly/daily/quarterly).
- `markdown` renderiza no footer.
- Frontend `ReportView` renderiza o `disclaimer` como bloco final destacado (border + texto menor).

#### RF-09.2 — System prompt (RF-08)
- Já coberto.

#### RF-09.3 — Onboarding step de aceite
- `OnboardingWizard` (AI-1A) ganha 1 step novo (penúltimo): "Antes de começar: leia e aceite o disclaimer". Checkbox "Eu li e aceito." → desbloqueia "Concluir onboarding".
- Aceite grava `user_coach_preferences.disclaimer_accepted_at = now()`.
- Para users existentes (que já completaram onboarding pré-AI-2B): banner não-bloqueante no hub `/coach-ai` na primeira visita pós-deploy pedindo aceite (back-fill); aceite via 1 click.

**Critério de aceitação:**
- [ ] `REPORT_DISCLAIMER` constante usada em todos os 4 geradores.
- [ ] `ReportContent.disclaimer` populado; `markdown` inclui no footer; frontend `ReportView` renderiza bloco final.
- [ ] Email templates incluem o disclaimer no footer.
- [ ] `OnboardingWizard` tem step novo; aceite grava timestamp.
- [ ] Banner back-fill pra users existentes (single-dismiss via `disclaimer_accepted_at`).

---

### RF-10: Documentação — CLAUDE.md, lessons-learned, data-model-index, endpoints-index, coach-tools.md, ADRs

**Descrição:**
- **CLAUDE.md** §4 env novas (`COACH_CAREER_GOALS_MAX_ACTIVE`, `EMAIL_UNSUBSCRIBE_SECRET` se for separado de JWT, opcionalmente `COACH_QUARTERLY_REPORT_DEFAULT_HOUR`). §6 — tabelas novas (`career_goals`, `mental_hand_history`, `email_log`) + ALTER em `user_coach_preferences` (5 cols). §7 — endpoints novos (`/api/coach/career-goals`, `/api/coach/mental-hands`, `/api/coach/cgame/snapshot`, `/api/coach/email/unsubscribe`). §9 — lessons novas se houver. §10 — marca AI-2B 100% completo.
- **Docs/api/coach-tools.md** — 4 tools novas (`define_career_goal`, `evaluate_career_goal`, `log_mental_hand`, `compute_irpf_summary`).
- **Docs/api/endpoints-index.md** — 4 endpoint groups novos.
- **Docs/architecture/data-model-index.md** — 3 tabelas novas.
- **ADRs (system-architect cria — próximos a partir de 168):**
  - **ADR-168** — `career_goals` schema + sync com `ai_structured_profile.metas` legacy (Q-A).
  - **ADR-169** — Quarterly Report — enqueuer rule + IRPF summary heurística + disclaimer (Q-B + Q-C).
  - **ADR-170** — C-game/Inchworm — heurística determinística sem LLM, sem prompt invasivo (Q-D, founder Q6).
  - **ADR-171** — `mental_hand_history` schema + framework Tendler (Q-E).
  - **ADR-172** — Email pipeline — Gmail SMTP fase 1, `email_log` idempotência, unsubscribe HMAC (Q-F + Q-G).
  - **ADR-173** — Disclaimer regulatório — 3 superfícies + texto canônico (Q-H).
- **Diagramas Mermaid** em `Docs/architecture/coach-ai-2b/`:
  - Sequência `define_career_goal` (LLM → preview → confirm → execute → undo).
  - Fluxo Quarterly Report enqueuer + processor + email.
  - Fluxo Inchworm aggregator (warmup → classify → aggregate → series).
  - Fluxo email pipeline (report ready → sendReportEmail → email_log → SMTP → retry).
  - Diagrama de tier gating (free/trial/pro+/admin × content/email × type).

**Critério de aceitação:**
- [ ] CLAUDE.md / data-model-index / coach-tools.md / endpoints-index / lessons-learned atualizados.
- [ ] ADRs 168-173 criados (numeração final system-architect ajusta).
- [ ] 5 diagramas Mermaid em `Docs/architecture/coach-ai-2b/`.

---

## Requisitos Não-Funcionais

- **Confirmação SEMPRE v1 (ADR-146):** todas as 3 write tools (`define_career_goal`, `log_mental_hand`, + ajustes em outras) passam por `coachToolRunner.preview → confirm → execute`. `evaluate_career_goal` + `compute_irpf_summary` são read-only.
- **Undo:** todas as write tools têm entry em `coach_actions.undo` reverso.
- **Tier gating:** `isToolEligibleTier` (Q-E AI-2A já formalizou — Trial-friendly). `getReportTier` para quarterly (`isReportEligible(_, 'quarterly')` adicionado).
- **Kill switch:** `COACH_NUDGES_ENABLED=false` desliga quarterly enqueuer + processor (consistente com AI-1B/1C). Email pipeline também desligado (parte da "proatividade").
- **Idempotência:** `career_goals` sem UNIQUE (cap por código); `mental_hand_history` sem UNIQUE; `email_log` UNIQUE `(report_id, kind)`; `report_jobs` UNIQUE `(user_id, 'quarterly', period_start)`.
- **Performance:** Quarterly é caro mas raro (1/user/trimestre). Sumarização Haiku quase sempre dispara (bundle grande). `cgameAggregator` é determinístico O(n) sobre warm-ups do período — cache em memória 5min opcional.
- **Privacidade (Q6 founder):** Mental Hand History grava texto livre do user — sensível. Política: nunca enviado a 3rd parties (só Anthropic via Quarterly Report context, e mesmo lá só os 3 highlights, não tudo). User pode deletar (RF-06.2 DELETE).
- **Lessons aplicadas:** #3 (mocks integration shape REAL), #6 (FX → USD antes), #7 (schemaVersion bump + optional + default), #9 (log antes de fallback), #10 (DRY prompt), #16 (DOMPurify allowlist em templates), #19 (CTAs em rotas existentes), #27 (Radix onMouseDown — UI mental tabs), #28 (mock paths), #32 (`db.transaction` fallback), #34 (handlers aceitam `injectedStorage?`), #36 (lazy schema import), #37 (vi.doMock + import estático).
- **Compatibilidade:** AI-1B/1C/2A continuam verdes. `getReportTier` ganha `'quarterly'` em `PREF_FIELD_BY_KIND` — backward compat. `ReportContent` ganha campos opcionais — frontend tolera ausência (schemaVersion bump 2→3).
- **Segurança:** ownership validado em `career_goals` + `mental_hand_history` + `email_log`. HMAC unsubscribe usa `JWT_SECRET` (ou env separada).

---

## Endpoints Previstos (novos)

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/coach/career-goals` | Lista metas ativas do user | JWT |
| POST | `/api/coach/career-goals` | Cria meta (alternativa direta ao tool LLM) | JWT |
| PATCH | `/api/coach/career-goals/:id` | Atualiza meta (status, progress_note) | JWT + ownership |
| DELETE | `/api/coach/career-goals/:id` | Deleta meta | JWT + ownership |
| GET | `/api/coach/mental-hands` | Lista mental hands paginada | JWT |
| POST | `/api/coach/mental-hands` | Cria mental hand (alternativa direta) | JWT |
| DELETE | `/api/coach/mental-hands/:id` | Deleta mental hand | JWT + ownership |
| GET | `/api/coach/cgame/snapshot` | Inchworm + C-game atual | JWT |
| GET | `/api/coach/email/unsubscribe` | Desinscreve por HMAC token | Public (HMAC valida) |

Existentes do AI-1B/1C continuam (timeline, reports, suggestions, preferences) — payload de preferences ganha 5 campos novos (RF-01.4).

---

## Modelos de Dados Afetados

### Novas
- `career_goals` (RF-01.1).
- `mental_hand_history` (RF-01.2).
- `email_log` (RF-01.3).

### Alteradas
- `user_coach_preferences`: +5 cols (`report_quarterly_enabled`, `email_weekly_enabled`, `email_monthly_enabled`, `email_quarterly_enabled`, `disclaimer_accepted_at`).
- `ReportContent` (TS type): `reportType` alarga `'weekly'|'monthly'|'daily'|'quarterly'`; campos opcionais novos (`irpfSummary`, `cgameSnapshot`, `mentalHandHighlights`, `careerGoalsProgress`, `disclaimer`); `schemaVersion 2 → 3`.

### Sem alteração
- `warmup_rituals` — usado read-only pelo `cgameAggregator`.
- `report_jobs`/`reports` — `report_type` aceita `'quarterly'` sem ALTER (varchar(16) livre).
- `coach_actions` — reuso direto pra undo.
- `users.ai_structured_profile.metas` — legacy mantida, sem mudança.

---

## Integrações Externas

| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic Claude Sonnet 4.6 | Quarterly Report generation | 1x/user/trimestre |
| Anthropic Claude Haiku 4.5 | Sumarização hierárquica do bundle do quarterly | Sempre (bundle grande dispara) |
| Gmail SMTP (nodemailer) | Envio dos emails de relatório | Pós geração de cada report com opt-in |
| BCB/PTAX via `fxCascade.ts` | Conversão USD→BRL na seção IRPF informativa | Quarterly Report (users BR) + `compute_irpf_summary` |

---

## Cenários de Teste Derivados

### Happy path
- [ ] `define_career_goal` com meta válida → preview + confirm → 1 row em `career_goals`; undo → 0 rows.
- [ ] `evaluate_career_goal` para meta `profit_usd` → retorna `progressPct` calculado.
- [ ] `log_mental_hand` com inputs válidos → 1 row em `mental_hand_history`; viewer lista.
- [ ] Quarterly enfileurer no dia 1 abril 7h fuso BRT → 1 `report_jobs` row `'quarterly'` `period_start=2026-01-01` `period_end=2026-03-31`.
- [ ] Processor processa → gera `reports` row `'quarterly'` com 14+ seções; `cost_usd_estimate > 0`; `summarizer_model_used` = haiku.
- [ ] Email `sendReportEmail` para user com `email_quarterly_enabled=true` → `email_log` row `sent` + email entregue no inbox (verificável em dev via test SMTP).
- [ ] Inchworm aggregator para user com 30 warm-ups → série mensal de 6 meses + %A/B/C correta.

### Validação de input
- [ ] `define_career_goal` com `title.length > 120` → 400.
- [ ] `log_mental_hand` com `emotion` fora do enum → 400.
- [ ] `compute_irpf_summary` com `period.end < period.start` → 400.

### Regras de negócio / edge cases
- [ ] User com 5 metas ativas + tenta criar 6ª → preview pede confirmação extra.
- [ ] Free com `report_quarterly_enabled=true` → enqueuer revalida e skipa.
- [ ] User com 0 warm-ups → `cgameAggregator` retorna `{ aPct:0, bPct:0, cPct:0, sampleSize:0, confidence:'low' }`.
- [ ] User com 5 warm-ups (sample baixo) → `confidence='low'`.
- [ ] Quarterly bundle > 20K chars → Haiku sumarizer aciona; `summarizer_model_used` populado.
- [ ] Sem `ANTHROPIC_API_KEY` → quarterly degraded determinístico, sem prosa; job `done`.
- [ ] LLM falha 3x → quarterly degraded; job `done` (nunca `failed`).
- [ ] User com `country='US'` → `irpfSummary` omitido do quarterly.
- [ ] User com `country='BR'` mas sem profit no período → `irpfSummary` com zeros + disclaimer.
- [ ] Email SMTP fail (config inválida) → `email_log.status='failed'`, retry após 15min/1h/4h.
- [ ] Unsubscribe link válido → desliga opt-in; user vê página confirmação.
- [ ] Unsubscribe token expirado → 403.
- [ ] User pergunta no chat "como declarar no IRPF?" → LLM deflete (verificável via prompt snapshot + integration smoke).
- [ ] User pergunta "vou ficar rico jogando poker?" → LLM responde com tom condicional + disclaimer (regra do system prompt).
- [ ] `COACH_NUDGES_ENABLED=false` → enqueuer quarterly não roda; email pipeline não envia.
- [ ] Daily debrief existente continua **não** mandando email (Q-G).
- [ ] Mental hand `linkedGrindSessionId` apontando para session deletada → após DELETE da session, mental_hand_history.linkedGrindSessionId vira NULL (ON DELETE SET NULL).
- [ ] User deleta sua mental_hand → ownership check; outro user tenta → 404.

---

## Fora de Escopo (explícito)

- **`log_mental_state` / `log_cgame_split` tools** (D5 plano canônico) — agregação é via warm-up (Q-D), sem prompt invasivo (Q6 founder); tools D5 ficariam invasivas.
- **Wellbeing prompts / schedule pattern detection** (H3 plano canônico) — risco alto de ser invasivo; founder Q6 não.
- **Trimestres móveis** (qualquer 3 meses) — só civis (Q1/Q2/Q3/Q4).
- **Email pipeline avançado** (SES/SendGrid, webhook bounce, suppression list automática) — fase 2 pós-alpha.
- **Email do Daily Debrief** (Q-G — só in-app).
- **Cálculo fiscal real** (alíquota, imposto devido, declaração) — Q-C exclui; só extrato informativo.
- **Calibração do Inchworm com dados reais** — heurística fixa.
- **Mental Hand History com upload de mão de poker** (FK para uma tabela `hands` que não existe ainda) — tags texto livre por enquanto.
- **Career goals com decomposição em sub-metas / OKRs** — flat por enquanto.
- **Tool `evaluate_career_goal` que persiste o `progress_note`** — read-only puro (RF-02.2 nota).
- **Mudanças em `warmup_rituals` schema** — usa só o que já existe.

---

## Dependências

- AI-0A (write tools confirm v1 + `coach_actions` + `coachToolRunner`).
- AI-0B (page context + agente único).
- AI-1A (`ai_structured_profile.metas` legacy + onboarding wizard + `COACH_NUDGES_ENABLED`).
- AI-1B (`report_jobs`/`reports`/`reportJobRunner.ts` — extensão do enqueuer/processor).
- AI-1C (`reportEligibility.ts` `getReportTier` + `isReportEligible` + `reportGeneratorShared.ts` DRY + `reportSummarizer.ts` Haiku + `ReportContent.followUp` block).
- AI-2A (`isToolEligibleTier` Trial-friendly helper).
- Email infra: `server/emailService.ts` (já em prod).
- FX: `shared/fxCascade.ts` (já em prod).
- Warm-up: `warmup_rituals` (já em prod desde W-3).

---

## Notas de Implementação (sugestões para o Implementer)

- **`quarterlyReportGenerator.ts`** deve **reusar `reportGeneratorShared.ts`** ao máximo (extraído em AI-1C). O delta vs monthly é: período maior (3 meses), seções extras (`irpfSummary`, `cgameSnapshot`, `mentalHandHighlights`, `careerGoalsProgress`), comparativos vs trimestres anteriores. Não duplicar `persistReport`/`sanitizeHref`/`computeCost`/`callLlm`.
- **`reportEmailSender.ts`** pode reusar `EmailService.getTransporter()` direto sem duplicar a config SMTP. Templates HTML em arquivos separados (não inline) — mais fácil iterar visual.
- **`cgameAggregator.ts`** é determinístico — testar com fixtures cobrindo todos os ramos da heurística (Q-D). 0 chamadas LLM.
- **`mental_hand_history` viewer** — usar `data-testid` (lesson #2) + Radix Tabs onClick redundante (lesson #27) se for em sub-tabs.
- **Unsubscribe HMAC** — sugestão: `crypto.createHmac('sha256', secret).update(`${userId}|${kind}|${expiresAt}`).digest('hex')`. Token URL-safe: `${userId}.${kind}.${expiresAt}.${hmac}`.
- **Disclaimer texto:** centralizar em `server/coach/constants.ts` `REPORT_DISCLAIMER` — qualquer mudança propaga (lesson #10).
- **IRPF FX:** `fxCascade.getAveragePtaxForRange(from, to)` — se não existir esse método ainda, criar; alternativa: calcular média simples dos rates diários do BCB no range.
- **OnboardingWizard back-fill banner:** componente reusa o padrão de banner do hub `/coach-ai` (já existe banner de pendentes — ADR-125).

---

## Critérios de Aceite Globais

- [ ] 8 questões do founder (Q-A a Q-H) resolvidas e travadas no topo do spec.
- [ ] 4 tools novas registradas (`define_career_goal`, `evaluate_career_goal`, `log_mental_hand`, `compute_irpf_summary`) — listadas em `coachTools/index.ts`, presença individual validada (lesson #8).
- [ ] Quarterly Report enfileurer + processor + gerador funcionando; integration test com `now` controlado em dia 1 abril 7h BRT → produz `reports` row `'quarterly'`.
- [ ] `cgameAggregator` + endpoint `/api/coach/cgame/snapshot` funcionando.
- [ ] `mental_hand_history` CRUD endpoints + viewer UI.
- [ ] Email pipeline: `email_log` table + `sendReportEmail` + 3 templates + unsubscribe endpoint.
- [ ] Disclaimer 3 superfícies (footer reports, system prompt, onboarding step + back-fill banner).
- [ ] Migration 0071 aplicada (founder roda `db:push` ou psql manual — autonomy_db memory).
- [ ] tsc 0; vitest sprint verde + zero regressão (AI-0A/0B/1A/1B/1C/2A).
- [ ] ADRs 168-173 criados (numeração final system-architect ajusta).
- [ ] CLAUDE.md / data-model-index / coach-tools / endpoints-index / lessons-learned atualizados.
- [ ] Reviewer APPROVED.
- [ ] Strategist UX audit dos 3 fluxos UX novos (CareerGoalsPanel, InchwormChart, MentalHandHistoryList) — wireframes validados.
- [ ] **Founder QA 2 semanas antes de alpha externo** (plano canônico mile-stone M11/M12) — verificar disclaimer + tool deflexão + email entrega + tier gating real.

---

## Decisões do Founder

✅ **Todas as 8 questões travadas em 2026-05-20** — ver seção "Decisões do founder (locked 2026-05-20)" no topo. System-architect pode prosseguir.
