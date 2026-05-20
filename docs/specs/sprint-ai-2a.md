# Spec: Sprint AI-2A — Write tools de grade/estudo + tools de diagnostico + nudges B-DOWNSWING/B-VOLUME/B-GRADE + tool-bridge OCR de stats

## Status
Aprovada (locked 2026-05-20)

---

## Decisões do founder (locked 2026-05-20)

Founder delegou decisão ao pm-spec e aceitou todas as 9 recomendações default. Estas decisões são **finais** e travadas para system-architect e demais agentes do pipeline:

- **Q-A — `define_career_goal`:** movido para **AI-2B** (carreira). Removido do escopo AI-2A. Total de tools deste sprint = **3 write + 5 diagnostic = 8** (era 4 write + 5 diagnostic = 9 quando incluía `define_career_goal` na hipótese do briefing).
- **Q-B — `schedule_study_block` destino:** grava em `study_sessions_v2` (status `planned`, `scheduled_for`).
- **Q-C — `create_study_theme` duplicado:** recusa com erro `theme_name_duplicate`. User re-prompta.
- **Q-D — Off-days storage:** tabela nova `user_off_days` (RF-01.1, migration 0070).
- **Q-E — Trial recebe as tools:** SIM. Trial recebe as 8 tools (consistente com `getReportTier` AI-1C). Criar `isToolEligibleTier(user, tool)` separado de `resolveUserTier`. Trial mantém rate limit Pro-like nas tools (não o rate limit estrito de Free); o rate limit do chat permanece como hoje. System-architect formaliza o helper.
- **Q-F — Seed `tournament_pool_intelligence`:** 12 rows BR curadas manualmente (lista no RF-06.5 abaixo).
- **Q-G — `bulk_propose_grade` cap:** N=20 torneios/chamada. Validação no zod input.
- **Q-H — B-DOWNSWING threshold:** drawdown `>= 15%` em janela 7d (vs bankroll do user no início da janela). **NOTA:** o threshold de "5 sessões negativas consecutivas" da recomendação original foi **substituído** por essa regra de drawdown em janela 7d (sinal único, mais robusto). Configurável via `COACH_DOWNSWING_DRAWDOWN_PCT` (default 15) + `COACH_DOWNSWING_WINDOW_DAYS` (default 7).
- **Q-I — B-VOLUME timing:** terça 11h local (fuso do user). **B-GRADE timing:** domingo 18h local (alinha com planning da próxima semana — sugestão pm-spec para fechar a lacuna que o plano canônico diz "sábado"; founder pode ajustar via env futuramente). Configurável via cron string + filtro de hora local nos ticks.

### Mudanças aplicadas

- Total de RFs finais: **13** (RF-01 a RF-13, sem alteração de numeração — RF-13 (docs) absorveu as renumerações triviais).
- RF-02 (`bulk_propose_grade`) ganhou cap N=20 no zod input.
- RF-05 (`mark_off_day`) confirmou tabela `user_off_days`.
- RF-06.5 (`query_pool_intelligence`) ganhou bloco com os 12 torneios seed propostos.
- RF-08 (B-DOWNSWING) trocou regra "5 sessões negativas consecutivas OU drawdown >= 15%" por "drawdown >= 15% em janela 7d" (single signal). Env vars renomeadas: `COACH_DOWNSWING_DRAWDOWN_PCT` + `COACH_DOWNSWING_WINDOW_DAYS` (deprecadas `COACH_DOWNSWING_THRESHOLD_SESSIONS` + `COACH_DOWNSWING_THRESHOLD_PCT`).
- RF-09 (B-VOLUME) confirmou terça 11h local.
- RF-10 (B-GRADE) confirmou domingo 18h local (era "sábado" no plano canônico — pm-spec sugere domingo 18h por alinhar com planning; founder confirmou aceitar default).
- Requisitos Não-Funcionais §Tier gating estrito: formalizado helper novo `isToolEligibleTier(user, tool)` que inclui Trial.
- Seção "Decisoes Pendentes do Founder (BLOCKER)" removida (todas resolvidas).
- Bloco "Fora de Escopo" mantém `define_career_goal` em AI-2B (sem mudança — já estava lá).

---

## Resumo
Primeiro sprint da **Fase 2** ("Tecnico de carreira"). Da ao Coach AI 4 capacidades que faltam:

1. **Write tools de grade/estudo (D3 do plano) — 3 tools:** o agente passa a **montar/editar a grade semanal e a rotina de estudo via conversa** — `bulk_propose_grade` (propoe N torneios em 1 confirmacao em massa, cap 20, modo `strict` recusa em conflito), `schedule_study_block` (agenda bloco de estudo em `study_sessions_v2` status `planned`), `create_study_theme` (cria `study_theme` novo, com `linkedStats?`/`linkedSpots?`; duplicado recusa), `mark_off_day` (registra dia de folga em `user_off_days`). **NOTA:** apesar do bullet listar 4 entries, o sprint final entrega 3 write tools "core" (`bulk_propose_grade`, `schedule_study_block`, `create_study_theme`) + 1 utilidade leve (`mark_off_day`) = 4 write handlers; o briefing original tinha `define_career_goal` como 5a tool e foi removido (foi pra AI-2B). Confirmacao SEMPRE v1 (ADR-146) + auditavel + reverso via `coach_actions.undo` (padrao Coach-2B).
2. **Tools de diagnostico (D4 do plano):** `analyze_variance`, `diagnose_plateau`, `compute_grind_study_ratio`, `calculate_effective_rake`, `query_pool_intelligence`. Read-only, `auditLevel: 'log'`, gateadas por tier `['pro','premium','admin']`. Cruzam dados que hoje ninguem cruza (variancia + leak + rake + estudo).
3. **Nudges B-DOWNSWING / B-VOLUME / B-GRADE:** crons novos em `cronRunner.ts` + jobs em `server/coach/jobs/`. Toggles e categorias **ja existem** em `user_coach_preferences` + `nudgeEngine.ts` (AI-1A/1B). So falta o detector + cycleKey + integracao.
4. **Tool-bridge OCR de stats (D6 + I2 do plano):** o `/grind-live` / `/stats` ja tem OCR de prints de HUD via Claude vision (ADR-064/067). Quando o user sobe um print, **o Coach reage automaticamente** — page-context novo (`stats_ocr_recent_upload`) sinaliza upload nas ultimas 24h + 1 sugestao contextual em `quickSuggestions` ("Voce subiu um print agora ha pouco. Quer que eu analise os stats?").

**NAO entram** (AI-2B):
- `define_career_goal` / `evaluate_career_goal` / `generate_career_plan` (carreira).
- Quarterly Career Review (relatorio trimestral).
- C-game tracker / Inchworm / Mental Hand History / `log_mental_state` / `log_cgame_split`.
- Wellbeing prompts / schedule pattern detection.
- Disclaimer regulatorio reforcado em outputs financeiros (vem em AI-2B junto com tools financeiras de carreira).

**Decisao do plano:** o briefing do founder lista `define_career_goal` em AI-2A, **mas o plano canonico** (`Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` linhas 493 + 500) coloca `define_career_goal` em AI-2B. **Spec segue o plano canonico** (carreira em AI-2B). Item para o founder confirmar (decisao Q-A).

---

## Contexto

### Estado atual (o que ja existe)

- **AI-0A (`8796e26`):** 6 write tools religadas com confirmacao SEMPRE v1 (`registerTournamentInGrade`, `recordWalletTransaction`, `startGrindSession`, `logSessionCompleted`, `logLeakFocus`, `logStudySession`); 5 read tools (`queryDimension`, `findTopLeaks`, `simulateBankrollScenario`, `getTournamentSuggestions`, `explainTournamentScore`); + `verifyLeakProgress`. Padrao `coachToolRunner` (preview/confirm/undo via `coach_actions`) — ADRs 145/146/147.
- **AI-0B (`5ffc95a`):** agente unico "Grindfy AI" + page context plugado em `coachContext.ts` (bloco DINAMICO `## Pagina Atual`).
- **AI-1A:** `users.ai_structured_profile` JSONB (`metas`, `focoDoMes`, `tomPreferido`, `nivel`) + `COACH_NUDGES_ENABLED` kill switch global + `nudgeAutoFreeze`.
- **AI-1B:** `report_jobs`/`reports` + `report_job_runner` + B-GAPCHECK + B-IMPORT (categorias novas em `nudgeEngine.ts`). `planEligibility.ts` (`resolveEligiblePlanTier`, `isProPlusEligible`, `LIST_USERS_FOR_CRON_PRO_PLUS`).
- **AI-1C:** `reportEligibility.ts` (`getReportTier`/`isReportEligible`), Daily Debrief event-driven em `handleUpdateGrindSession`, Monthly Report dia 1 7h tz, `bulk_query_dimensions` (RF-06 — tool batching ja precedente que serve de molde), follow-ups em `ReportContent.followUp` + bloco `## Follow-ups abertos` em `coachContext.ts`, sumarizacao hierarquica Haiku via `reportSummarizer.ts`.
- **Nudge categorias / toggles ja criados (AI-1A):** `nudgeEngine.ts` ja conhece `'B-DOWNSWING' | 'B-VOLUME' | 'B-GRADE'`. `user_coach_preferences` ja tem `nudgeBDownswing`/`nudgeBVolume`/`nudgeBGrade` (NOT NULL default true — `shared/schema.ts:4502-4504`). **Nao precisa de migration nova para os toggles dos nudges deste sprint.**
- **`coach_actions` table (ADRs 145/146) + `coachToolRunner`** — fonte canonica para preview→confirm→execute→undo. Toda write tool deste sprint reusa esse runner.
- **OCR de stats existente:** `client/src/pages/StatsAnalyzer*.tsx` + `server/routes/stats-analyzer.ts` chamam Claude Vision (ADRs 064/067) — ja persiste `hud_stats_uploads` (ou tabela equivalente — confirmar nome). NAO ha hoje sinal disso no page-context do Coach.
- **Storage de signals (`coachSignalsStorage.ts`):** ja tem `getLastUploadAt`, `countGrindSessionsSince`, `hasImportThisWeek`, `countGrindSessionsThisWeek`. **Falta** helpers para downswing / volume planejado vs jogado / grade aderencia que os novos nudges precisam.

### O que falta (objeto deste sprint)

| Capacidade | Estado | Sprint AI-2A entrega |
|---|---|---|
| Write tools grade/estudo (4) | Nao existem | `bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `mark_off_day` |
| Tools diagnostico (5) | Nao existem | `analyze_variance`, `diagnose_plateau`, `compute_grind_study_ratio`, `calculate_effective_rake`, `query_pool_intelligence` |
| Nudges B-DOWNSWING/B-VOLUME/B-GRADE | Categorias + toggles existem; **detectores nao existem** | Crons + jobs em `server/coach/jobs/` |
| Tool-bridge OCR | OCR existe, Coach nao sabe | Sinal no page-context + quick suggestion |
| Pool intelligence BR | Nao existe | Tabela seed `tournament_pool_intelligence` (read-only, manual seed) — escopo minimo |
| Off-days storage | Nao existe | Decisao Q-D — `user_off_days` table OU `plannedTournaments` com flag OU `ai_structured_profile.offDays[]` |
| Career goals | NAO ESCOPO (AI-2B) | — |

---

## Usuarios

- **Pro+ (Pro/Premium/Admin) e Trial elegivel:** ganham as 8 tools novas (3 write core + 1 utility + 5 diagnostico = 4 write handlers + 5 read handlers) + tool-bridge OCR + recebem os 3 nudges novos (com toggles ON default). Trial usa o helper `isToolEligibleTier` (Q-E locked) — passa direto.
- **Free:** **NAO ve** as 8 tools novas (`isToolEligibleTier` retorna `false`; registry filtra). NAO recebe nudges deste sprint (consistente com `LIST_USERS_FOR_CRON_PRO_PLUS`).
- **Admin:** mesmas tools + acesso a kill switch por categoria (`POST /api/admin/coach/freeze-category` ja existe).

---

## Requisitos Funcionais

### RF-01: Migration 0070 — `user_off_days` + `tournament_pool_intelligence` + helpers de telemetria de tool

**Descricao:** Migration `0070_ai_2a_offdays_pool_intel.sql`. **Nao mexe** em `user_coach_preferences` (toggles dos 3 nudges ja existem — schema lines 4501-4504).

#### RF-01.1 — Tabela `user_off_days` (decisao Q-D opcao [a])
```sql
CREATE TABLE user_off_days (
  id varchar PRIMARY KEY,                    -- nanoid
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  off_date date NOT NULL,                    -- YYYY-MM-DD no fuso do user (snapshot na criacao)
  reason text,                               -- texto livre opcional ("ferias", "evento familiar")
  source varchar(32) NOT NULL DEFAULT 'coach_tool',  -- 'coach_tool' | 'manual_ui' | 'cron_default'
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT user_off_days_user_date_unique UNIQUE (user_id, off_date)
);
CREATE INDEX idx_user_off_days_user_date ON user_off_days(user_id, off_date);
```
- UNIQUE `(user_id, off_date)` → `mark_off_day` idempotente (`ON CONFLICT DO NOTHING`).
- `source` snapshot da origem (auditoria); nao gateia delete.

#### RF-01.2 — Tabela `tournament_pool_intelligence` (seed manual)
```sql
CREATE TABLE tournament_pool_intelligence (
  id varchar PRIMARY KEY,
  site varchar(32) NOT NULL,                 -- 'WPN' | 'GG' | 'Stars' | 'Party' | 'Bodog' | ...
  tournament_pattern varchar(120) NOT NULL,  -- pattern para matchar nome ('Bounty Builder', 'Sunday Million', ...)
  buy_in_min numeric,
  buy_in_max numeric,
  field_avg integer,                         -- media historica de field
  field_volatility numeric,                  -- stddev
  pool_quality varchar(16),                  -- 'soft' | 'medium' | 'tough'
  notes text,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX idx_pool_intel_site ON tournament_pool_intelligence(site);
```
- Seed manual via SQL (escopo minimo — 10-30 rows BR para os top torneios; founder seed). NAO ha endpoint de admin para CRUD neste sprint.
- `query_pool_intelligence` tool faz `LIKE` no `tournament_pattern`.

#### RF-01.3 — Indexes auxiliares para B-VOLUME / B-DOWNSWING
Se as queries dos detectores (RF-08/09) forem caras em users com historico grande, adicionar 1-2 indexes em `tournaments` (analise do system-architect — provavelmente `idx_tournaments_user_date_gs_null` ja existe via migration 0064 perf-indexes). **Nao adicionar index novo** sem o system-architect medir.

**Criterio de aceitacao:**
- [ ] Migration `0070_ai_2a_offdays_pool_intel.sql` cria `user_off_days` + `tournament_pool_intelligence` + indexes; rollback sql provido (`migrations/0070_ai_2a_offdays_pool_intel_rollback.sql`).
- [ ] `shared/schema.ts` declara as 2 tabelas + Zod (`insertUserOffDaySchema`, `insertTournamentPoolIntelligenceSchema`).
- [ ] `db:push` aplica sem erro; INSERT/SELECT funcionam.
- [ ] **Nenhuma** ALTER em `user_coach_preferences` (toggles dos 3 nudges ja existem).

---

### RF-02: Tool `bulk_propose_grade` — gera N torneios para a grade semanal em 1 confirmacao em massa

**Descricao:** Tool write que gera um array de propostas (~8-12 torneios) para uma data/profile/horas-alvo, e o user confirma TODO o pacote ou cancela. Suporta modo `strict` que **recusa** a proposta inteira se houver conflito (horario sobreposto, torneio ja registrado).

#### RF-02.1 — Localizacao e shape
- Handler: `server/coachTools/handlers/bulkProposeGrade.ts`.
- Registry: `coachTools/index.ts` `safeRegister(bulkProposeGradeTool)`.
- **Input schema (zod):**
```ts
{
  weekStartDate: string,         // 'YYYY-MM-DD' (BRT — getCurrentWeekStartBRT)
  profile: 'A' | 'B' | 'C',
  hoursTargetPerDay?: number,    // default 4
  daysOfWeek?: number[],         // default [1..6] (Mon-Sat); 0=Sun
  filters?: {
    sites?: string[],            // ['WPN','GG','Stars']
    buyInMin?: number,
    buyInMax?: number,
    excludeTypes?: ('Vanilla'|'PKO'|'Mystery'|'Satellite')[],
  },
  strict?: boolean,              // default false; true = recusa se conflito
  maxTournaments?: number,       // default 20, cap absoluto 20 (Q-G locked 2026-05-20)
}
```
- **Cap N=20 (Q-G locked):** zod enforce `maxTournaments <= 20` no input; o algoritmo de geração também respeita o cap após dedup (mesmo que o usuário peça mais via prompt LLM, o tool refuta com erro `max_tournaments_exceeded`).
- **Output preview (`coachToolRunner.preview`):**
```ts
{
  proposed: Array<{
    dayOfWeek: number;
    site: string;
    name: string;
    time: string;             // 'HH:MM'
    type: string;
    speed: string;
    buyIn: number;
    guaranteed?: number;
    libraryTemplateId?: string;
    profile: 'A'|'B'|'C';
    prioridade: 1|2|3;
  }>,
  conflicts: Array<{ dayOfWeek: number; time: string; reason: 'time_overlap'|'already_in_grade'|'wallet_below_threshold'; details?: any }>,
  strictWouldReject: boolean,
  summary: { totalTournaments: number, totalBuyIn: number, estimatedHours: number }
}
```
- **Execute (`executeConfirmed`):** registra **TODOS** os `proposed` em `planned_tournaments` numa **transacao** (`db.transaction` — lesson #32 fallback gentil quando `db` indef.). Se `strict===true` E `conflicts.length>0` → falha na fase preview, nem chega a execute. Se `strict===false` → registra os nao-conflituosos e retorna `{ registered: N, skipped: M, skippedReasons: [...] }`.
- **`requiresConfirmation: true`** (sempre); `auditLevel: 'persist'` (write tool); `gateByTier: ['pro','premium','admin']`.
- **Undo:** `coach_actions.undo` registra os IDs dos `planned_tournaments` criados → undo = `DELETE` em lote (mesmo padrao Coach-2B `registerTournamentInGrade`).

#### RF-02.2 — Algoritmo de geracao
Reusa `server/scoring/` (tournament selector — score 0-100, grade S/A/B/C/D) e `storage.getTournamentSuggestions` (a base do `get_tournament_suggestions` tool — AI-0A). Pipeline:
1. Para cada `dayOfWeek` em `daysOfWeek`: chama `getTournamentSuggestions({ userId, dayOfWeek, profile, filters, hoursTarget })` → top N por score.
2. Filtra conflitos: torneios ja em `planned_tournaments` no mesmo `weekStartDate`/`dayOfWeek`/`time`; horarios sobrepostos dentro do pacote proposto (ex: 19:00 + 19:00 = conflito).
3. Aplica `hoursTargetPerDay` como cap (somando duracao estimada).
4. Retorna o array + `conflicts`.

**System-architect decisao:** se a logica de scoring/selecao ja esta em `server/scoring/`, **reusar** (nao reimplementar). Se nao houver helper batch, criar `proposeGradeForWeek(userId, opts)` em `server/coach/proposeGrade.ts`.

#### RF-02.3 — Detecao de wallet / risco bankroll (opcional, gated)
Se `walletService.getConsolidatedBalance(userId)` retornar saldo < `sum(buyIn) * 2` (conservador), o preview marca `conflicts: [{ reason: 'wallet_below_threshold', details: { balance, totalBuyIn } }]` — strict recusa, nao-strict avisa mas permite. **Threshold** configuravel via env `COACH_GRADE_BANKROLL_THRESHOLD_MULT` (default `2`).

**Criterio de aceitacao:**
- [ ] `bulkProposeGradeTool` registrada em `coachTools/index.ts`; `coachTools` (export) inclui ela (lesson #8 — testes verificam presenca individual).
- [ ] Preview com `daysOfWeek=[1,2,3]` retorna `proposed.length ≤ 3*N` torneios (N = sugestoes/dia, calibravel), todos com `dayOfWeek ∈ {1,2,3}`; `conflicts` lista colisoes; `summary` correto (`totalBuyIn`, `estimatedHours`).
- [ ] `strict: true` + 1 conflito → preview retorna `strictWouldReject: true`; o `coachToolRunner.confirm` recusa o execute com erro `strict_conflict`.
- [ ] `strict: false` + 2 conflitos → execute registra `proposed - 2` rows em `planned_tournaments`; retorna `{ registered: N-2, skipped: 2 }`.
- [ ] Wallet abaixo do threshold → `conflicts` inclui `wallet_below_threshold`; strict recusa.
- [ ] Undo via `coach_actions` deleta TODOS os `planned_tournaments` criados na execute (lookup por IDs no `payloadAfter`).
- [ ] Free → tool nao aparece no `listToolsForUser(tier='free')`.
- [ ] Transacao DB respeita lesson #32 (`db.transaction` se disponivel, fallback sem tx em testes).
- [ ] Erro de scoring em 1 `dayOfWeek` → registrado em `conflicts`/log + segue para os outros (lesson #9).

---

### RF-03: Tool `schedule_study_block` — agenda bloco de estudo

**Descricao:** Tool write que cria 1 bloco de estudo no calendario do user (em `study_sessions_v2` com status `planned`, OU em `calendar_events` com `categoryId` de estudo — **decisao Q-B do founder**).

- Handler: `server/coachTools/handlers/scheduleStudyBlock.ts`.
- **Input schema (zod):**
```ts
{
  topic: string,                   // texto livre ou linkagem com study_theme
  studyThemeId?: string,           // FK opcional para study_themes
  lessonId?: string,               // FK opcional para lessons (biblioteca)
  startAt: string,                 // ISO datetime
  durationMinutes: number,         // 15 ≤ x ≤ 240
  notes?: string,
}
```
- **Validacao:** se `studyThemeId` presente, verificar ownership (`study_themes.user_id === userId`); se `lessonId` presente, verificar acesso via `lessonEntitlement` (idem `recommend_lesson` AI-0A).
- **Output preview:** o que sera criado + conflito (se ja houver bloco no mesmo horario).
- **Execute:** INSERT em `study_sessions_v2` (status `planned`, `scheduled_for`, `lesson_id`, `theme_id`, `notes`) **OU** em `calendar_events` (depende Q-B).
- **`requiresConfirmation: true`**; `auditLevel: 'persist'`; `gateByTier: ['pro','premium','admin']`.
- **Undo:** DELETE da row criada.

**Criterio de aceitacao:**
- [ ] Tool registrada; `confirm` cria 1 row em `<tabela escolhida em Q-B>`; undo deleta.
- [ ] `studyThemeId` de outro user → erro `theme_not_accessible` (ownership).
- [ ] `lessonId` sem acesso → erro `lesson_not_accessible`.
- [ ] `durationMinutes < 15` ou `> 240` → 400 validation.
- [ ] Conflito de horario (outro bloco overlapping) → preview avisa, execute permite (nao bloqueia — risco contido).

---

### RF-04: Tool `create_study_theme` — cria tema de estudo

**Descricao:** Tool write que cria 1 row em `study_themes` com `linkedStats?` / `linkedSpots?` (JSONB — lesson #33 / ADR-141).

- Handler: `server/coachTools/handlers/createStudyTheme.ts`.
- **Input:**
```ts
{
  name: string,                    // max 50 (constraint da tabela)
  description?: string,
  linkedStats?: string[],          // array de stat codes (ex: ['3bet','cbet_flop'])
  linkedSpots?: string[],          // array de spot screenshot ids
  category?: 'preflop'|'postflop'|'multiway',  // ADR Themes-V2
}
```
- **Output preview:** o tema que sera criado + validacao de `linkedStats`/`linkedSpots` (codes/IDs existentes no catalogo).
- **Execute:** INSERT em `study_themes` + (RF do Sprint stats-themes-linking-1) sync bidirecional com `user_focus_stats` se `linkedStats` presente.
- **`requiresConfirmation: true`**; `auditLevel: 'persist'`; `gateByTier: ['pro','premium','admin']`.
- **Undo:** DELETE do tema + reverte o sync de `user_focus_stats` (lesson #33 — JSONB array remove via `jsonb_array_elements_text`).

**Criterio de aceitacao:**
- [ ] Tool registrada; `confirm` cria 1 `study_themes` row; sync de `linkedStats` propaga para `user_focus_stats.linked_themes` (mesmo padrao stats-themes-linking-1).
- [ ] `name` duplicado para o mesmo user → erro `theme_name_duplicate` (idempotencia ou recusa — Q-C decide; recomendacao: recusa, user re-prompta).
- [ ] `linkedStats` com codes invalidos → preview rotula como invalidos; execute pula esses + registra os validos.
- [ ] Undo deleta o tema + remove o code de `user_focus_stats.linked_themes`.

---

### RF-05: Tool `mark_off_day` — registra dia de folga

**Descricao:** Tool write que cria 1 row em `user_off_days` (RF-01.1).

- Handler: `server/coachTools/handlers/markOffDay.ts`.
- **Input:**
```ts
{
  offDate: string,                 // 'YYYY-MM-DD' no fuso do user
  reason?: string,
}
```
- **Output preview:** confirmacao do dia + aviso se ja ha `planned_tournaments` nesse dia ("Voce ja tem N torneios marcados — quer remover?").
- **Execute:** INSERT em `user_off_days` (`ON CONFLICT (user_id, off_date) DO NOTHING` — idempotente). **NAO remove** torneios planejados automaticamente — so registra o dia. Se quiser remover, eh outra tool/acao (`bulk_remove_grade_for_day` — fora de escopo).
- **`requiresConfirmation: true`**; `auditLevel: 'persist'`; `gateByTier: ['pro','premium','admin']`.
- **Undo:** DELETE da row.
- **Efeito colateral:** `bulk_propose_grade` (RF-02) **deve** pular dias em `user_off_days` ao gerar propostas.

**Criterio de aceitacao:**
- [ ] Tool registrada; `confirm` cria 1 `user_off_days` row; UNIQUE garante idempotencia.
- [ ] `bulk_propose_grade` para semana com `mark_off_day(2026-05-23)` (sabado) → nao propoe nada para `dayOfWeek=6`.
- [ ] Undo deleta a row.

---

### RF-06: Tools de diagnostico (5 read tools)

**Descricao:** 5 tools read-only que cruzam dados do user. Todas com `requiresConfirmation: false`, `auditLevel: 'log'`, `gateByTier: ['pro','premium','admin']`.

#### RF-06.1 — `analyze_variance`
- Handler: `server/coachTools/handlers/analyzeVariance.ts`.
- **Input:** `{ period?: '30d'|'90d'|'6m'|'12m', dimension?: 'overall'|'stake'|'site' }` (default `period='90d'`, `dimension='overall'`).
- **Output:**
```ts
{
  period: string,
  sampleSize: number,                // n torneios
  observedRoi: number | null,        // %
  expectedRoi: number | null,        // %
  stddevBuyIns: number | null,
  confidenceInterval95: { lower: number, upper: number } | null,
  estimatedBySkillUsd: number | null,     // heuristica
  estimatedByVarianceUsd: number | null,  // heuristica
  method: 'heuristic' | 'primedope',
  narrative: string,                 // 1-2 frases interpretativas
  confidence: 'high'|'medium'|'low',  // baseado em sample size
}
```
- **Fonte:** `storage.getPerformanceByPeriod`, `storage.getVarianceVsExpected` (retorna `null` hoje — fallback heuristico igual ao Monthly Report AI-1C RF-05), `shared/primedopeDefaults.ts`.
- **Reusa logica do Monthly Report:** se o gerador mensal ja tem essa heuristica, **extrair para `server/coach/varianceAnalysis.ts`** + reusar.

#### RF-06.2 — `diagnose_plateau`
- Handler: `server/coachTools/handlers/diagnosePlateau.ts`.
- **Input:** `{ months?: number }` (default 3).
- **Output:**
```ts
{
  isPlateau: boolean,
  signal: 'roi_flat' | 'volume_flat' | 'no_study' | 'selection_drift' | 'unknown',
  roiTrend: Array<{ month: string, roi: number | null }>,
  studyMinutesTrend: Array<{ month: string, minutes: number }>,
  leaksActive: string[],                  // codes dos leaks ativos
  narrative: string,
  recommendation: { kind: 'tool'|'link', target: string },   // ex: 'log_leak_focus' ou '/biblioteca/curso/...'
}
```
- **Logica:** combina sinais — ROI sem variacao significativa (stddev/media < threshold) + estudo baixo + leaks ativos. ADR-propostos numero 165 ("metodologia diagnose_plateau").

#### RF-06.3 — `compute_grind_study_ratio`
- Handler: `server/coachTools/handlers/computeGrindStudyRatio.ts`.
- **Input:** `{ period?: '30d'|'90d' }` (default `30d`).
- **Output:**
```ts
{
  grindHours: number,
  studyHours: number,
  ratio: number,                          // grind/study; null se study=0
  benchmark: { range: '5:1 a 10:1', interpretation: string },
  narrative: string,
}
```
- **Fonte:** sessoes de grind (`getGrindSessions`) — soma `(completedAt - startTime)` em horas; estudo (`getStudySessionsV2`) — soma `durationMinutes/60`.

#### RF-06.4 — `calculate_effective_rake`
- Handler: `server/coachTools/handlers/calculateEffectiveRake.ts`.
- **Input:** `{ period?: '30d'|'90d'|'6m', site?: string, buyInRange?: { min: number, max: number } }`.
- **Output:**
```ts
{
  totalBuyIn: number,
  totalRake: number,                      // calculado se houver rake field nos tournaments; senao estimado por % padrao (10% MTT)
  totalRakeback: number | null,           // de wallet_transactions rakeback reason
  effectiveRakePct: number,
  netRakePct: number,                     // rake - rakeback
  bySite: Array<{ site: string, rakePct: number, rakebackPct: number, netRakePct: number }>,
  narrative: string,
}
```

#### RF-06.5 — `query_pool_intelligence`
- Handler: `server/coachTools/handlers/queryPoolIntelligence.ts`.
- **Input:** `{ site?: string, namePattern?: string }`.
- **Output:** rows de `tournament_pool_intelligence` (RF-01.2) filtradas. Read-only.
- **Decisao:** se a tabela esta vazia, retorna `{ rows: [], note: 'pool_intelligence_not_seeded' }` — o LLM diz "nao tenho info do pool desse torneio".

##### Seed inicial — 12 torneios BR curados (Q-F locked)

Founder confirmou seed de 12 rows BR no `scripts/seed-pool-intelligence.sql` (rodado uma vez em prod). Lista proposta pelo pm-spec — system-architect/founder podem ajustar valores antes de aplicar:

| # | Site | tournament_pattern | buy_in_min | buy_in_max | field_avg | field_volatility | pool_quality | notes |
|---|---|---|---|---|---|---|---|---|
| 1 | WPN | `Sunday Million` | 200 | 250 | 1800 | 250 | medium | Domingo 19h BRT. Field BR consistente |
| 2 | WPN | `Venom` | 500 | 2650 | 2500 | 800 | tough | Saturday warmup; recreational mix baixo |
| 3 | WPN | `Big 100K` | 100 | 109 | 1200 | 200 | medium | Diário, anchor de grind BR |
| 4 | WPN | `Mystery Bounty` | 50 | 530 | 900 | 180 | soft | KO multi-tier; recreational alto |
| 5 | GG | `Bounty Builder` | 22 | 525 | 3500 | 1200 | medium | Daily; field grande, casual >40% |
| 6 | GG | `Sunday Bounty Builder` | 210 | 215 | 4800 | 700 | medium | Anchor weekend GG |
| 7 | GG | `Global MILLION$` | 5 | 10 | 12000 | 2500 | soft | Field gigante; ROI bom mas variancia alta |
| 8 | GG | `Mystery Bounty Special` | 55 | 525 | 2200 | 500 | soft | KO highlight |
| 9 | Stars | `Sunday Million` | 109 | 109 | 6000 | 800 | tough | Veterano; field experiente |
| 10 | Stars | `Bounty Builder HR` | 215 | 215 | 1500 | 300 | tough | HR Stars; pro-heavy |
| 11 | Party | `Big Game` | 215 | 215 | 600 | 100 | medium | Domingo, field menor mas regs |
| 12 | Bodog | `Mystery Bounty` | 25 | 100 | 800 | 150 | soft | Recreational rede latam |

**Criterios:**
- Seed via `scripts/seed-pool-intelligence.sql` (não via migration — não-essencial para schema).
- `tournament_pattern` usa `LIKE` (case-insensitive) no handler — pattern simples sem regex.
- `notes` em pt-BR, curto (1 frase).
- `field_avg` / `field_volatility` valores ilustrativos — system-architect e founder podem refinar com dados Sharkscope antes do seed real.

**Criterio de aceitacao:**
- [ ] Cada uma das 5 tools registrada + listada em `coachTools` (lesson #8).
- [ ] `analyze_variance` com `period='90d'` para user com 100 torneios → retorna `sampleSize: 100`, `method: 'heuristic'`, `confidence: 'medium'`/`'high'`, narrative nao-vazia.
- [ ] `diagnose_plateau` com user de ROI flat 3m + 0 estudo → `isPlateau: true`, `signal ∈ {'roi_flat','no_study'}`, `recommendation.kind='link'` ou `'tool'`.
- [ ] `compute_grind_study_ratio` com `grindHours=80`, `studyHours=4` → `ratio=20`, `benchmark.interpretation` indica "acima do range saudavel".
- [ ] `calculate_effective_rake` agrupa por site se filtro nao especificado.
- [ ] `query_pool_intelligence` com tabela vazia → `{ rows: [], note: ... }`.
- [ ] Todas as 5: free → nao listadas; pro+ → listadas e executaveis.

---

### RF-07: Tool-bridge OCR — page-context novo + quick suggestion contextual

**Descricao:** O `/grind-live` ou `/stats` (StatsAnalyzer) ja faz upload de print de HUD + roda Claude vision (ADRs 064/067). Plugar:

#### RF-07.1 — Sinal no page context
- Em `server/coachContext.ts` `assembleContext`, no bloco DINAMICO, adicionar `## Upload Recente`: se o user fez upload de stats OCR nas ultimas **24h** (`hud_stats_uploads.created_at > now - 24h` — confirmar nome da tabela em `Docs/architecture/data-model-index.md`), incluir:
  ```
  ## Upload Recente
  - O usuario subiu 1 print de HUD em [HH:MM] (~Xh atras). Stats extraidos: [3bet=X%, cbet_flop=Y%, ...] (top 5).
  ```
- Reusa storage helper novo `getRecentStatsUpload(userId, withinHours): Promise<{ uploadedAt, statsExtracted } | null>` em `server/storage/coachSignalsStorage.ts`.

#### RF-07.2 — Quick suggestion contextual
- `server/coach/quickSuggestions.ts` (do AI-1B, ADR-158) ja serve sugestoes contextuais por rota. Adicionar:
  - Quando `pageContext.route === '/stats'` ou `'/grind-live'` E ha upload recente → sugestao `"Voce subiu um print agora ha pouco. Quer que eu analise os stats?"` com `kind='link'` para `/coach-ai/chat?seed=analisar%20stats%20do%20ultimo%20upload`.

**Criterio de aceitacao:**
- [ ] `assembleContext` para user com upload < 24h → systemParts inclui `## Upload Recente` com timestamp + top stats.
- [ ] Upload > 24h ou nenhum upload → bloco omitido (nao polui contexto).
- [ ] `/api/coach/suggestions?route=/stats` para user com upload recente → inclui 1 sugestao "analisar stats do ultimo upload".
- [ ] Nenhuma tool nova precisa ser registrada — o LLM usa `read_user_hud_stats` (AI-0A) para puxar os stats e analisar.

---

### RF-08: Nudge B-DOWNSWING — detecta drawdown em janela 7d e oferece reframe

**Descricao:** Detecta downswing tecnico via **drawdown >= 15% em janela 7d** (single signal — locked Q-H 2026-05-20). NÃO usa mais "N sessões consecutivas" — sinal único de drawdown é mais robusto e cobre os casos onde sessões pequenas mascaram drawdown grande (ou vice-versa).

- Job: `server/coach/jobs/bDownswing.ts`. Cron em `cronRunner.ts`: `0 * * * *` (hourly, filtra hora local — recomendacao 11h local; system-architect calibra).
- **Categoria:** `'B-DOWNSWING'` (ja existe em `nudgeEngine.ts` linha 28).
- **Toggle:** `nudgeBDownswing` (ja existe).
- **Logica:**
  1. Filtra users elegiveis (`LIST_USERS_FOR_CRON_PRO_PLUS`).
  2. Para cada user: calcula bankroll de referência no **início da janela 7d** (snapshot consolidado em USD via `walletService.getConsolidatedBalanceAt(userId, now - 7d)`) + bankroll atual (`getConsolidatedBalance(userId)`).
  3. `drawdownPct = (refBankroll - currentBankroll) / refBankroll * 100`. Considera apenas drawdown positivo (perda).
  4. Trigger: `drawdownPct >= 15%`. Threshold configurável via `COACH_DOWNSWING_DRAWDOWN_PCT` (default 15) + `COACH_DOWNSWING_WINDOW_DAYS` (default 7).
  5. cycleKey = `'YYYY-MM-WW'` (1 nudge/semana max — anti-fadiga).
  6. Chama `shouldSendNudge({ category:'B-DOWNSWING', cycleKey, now })` → se OK, persiste em `coach_nudge_log` com `body` interpretativo ("Sua banca caiu X% nos últimos 7 dias. Vamos analisar se é variância ou leak?") + `cta: { kind:'tool', target:'analyze_variance' }`.
- **Helpers novos em `coachSignalsStorage.ts`:**
  - `getDrawdownInWindow(userId, windowDays): Promise<{ refBankrollUsd, currentBankrollUsd, drawdownPct, refDate, sampleConfidence: 'high'|'low' }>`. Se não há snapshot histórico no início da janela, usa o snapshot mais antigo disponível ou retorna `sampleConfidence='low'` → tick skipa.

**Criterio de aceitacao:**
- [ ] Cron registrado em `cronRunner.ts` apos os existentes; gateado por `COACH_NUDGES_ENABLED !== 'false'` (igual aos outros, padrao consolidado).
- [ ] `bDownswingTick({ now, injectedStorage })` injetavel; testavel.
- [ ] User com drawdown 7d >= 15% → nudge enfileirado 1x/semana; 14.9% → no-op.
- [ ] User sem snapshot histórico em `now - 7d` E sem fallback razoável → no-op (`sampleConfidence='low'`).
- [ ] FX normalizado para USD antes de comparar (lesson #6).
- [ ] Free → no-op (filtro `LIST_USERS_FOR_CRON_PRO_PLUS`).
- [ ] `COACH_NUDGES_ENABLED=false` → cron nao registrado.
- [ ] Env vars antigos (`COACH_DOWNSWING_THRESHOLD_SESSIONS` / `COACH_DOWNSWING_THRESHOLD_PCT`) **NÃO** são lidos — substituídos por `COACH_DOWNSWING_DRAWDOWN_PCT` + `COACH_DOWNSWING_WINDOW_DAYS`.

---

### RF-09: Nudge B-VOLUME — alerta queda de volume vs baseline

**Descricao:** Detecta queda de volume — torneios/semana < baseline (media das ultimas 4-12 semanas).

- Job: `server/coach/jobs/bVolume.ts`. Cron: `0 * * * *` (hourly — filtra terça-feira + hora local **11h** no fuso do user; Q-I locked 2026-05-20).
- **Categoria:** `'B-VOLUME'`.
- **Toggle:** `nudgeBVolume`.
- **Logica:**
  1. Para cada user elegivel: pega volume da semana corrente (`countTournamentsThisWeek` — novo helper) + media das ultimas 4 semanas anteriores (`avgWeeklyTournaments(userId, weeks=4)` — novo).
  2. Trigger: `currentWeekVolume < baseline * 0.5` (50% abaixo). Threshold configuravel `COACH_VOLUME_DROP_PCT` (default 50).
  3. Caveat: terca eh meio de semana — pode ser que ainda nao tenha jogado. Usar **projecao** linear pro fim de semana (`projectedWeekVolume = currentSoFar * (7 / daysElapsed)`) e comparar isso com baseline. Conservador.
  4. cycleKey = `'YYYY-WW'`.
  5. Body: "Sua semana esta projetada em X torneios — sua media e Y. Esta tudo bem? Quer ajustar a grade?" CTA: `{ kind:'tool', target:'bulk_propose_grade' }` ou `{ kind:'link', target:'/coach' }`.

**Criterio de aceitacao:**
- [ ] Cron registrado; tick injetavel.
- [ ] User com baseline 100 torneios/semana, projecao 30 → nudge; projecao 80 → no-op.
- [ ] User com 0 historico (sem baseline) → no-op (`baselineSampleSize < 2` skip).
- [ ] 1 nudge/semana max.

---

### RF-10: Nudge B-GRADE — sugere montar grade quando vazia/desatualizada

**Descricao:** Detecta grade vazia ou nao-aderente.

- Job: `server/coach/jobs/bGrade.ts`. Cron: `0 * * * *` (hourly — filtra **domingo** + hora local **18h** no fuso do user; Q-I locked 2026-05-20). NOTA: plano canônico (linha 435) dizia "sábado", pm-spec sugeriu domingo 18h para alinhar com planning da semana seguinte; founder aceitou default.
- **Categoria:** `'B-GRADE'`.
- **Toggle:** `nudgeBGrade`.
- **Logica:**
  1. Para cada user elegivel: conta `planned_tournaments` na proxima semana (`weekStart = next monday`). Se `< 3` → "grade vazia".
  2. Alternativa: aderencia da semana que passou — `tournaments` jogados vs `planned_tournaments` na mesma semana — se aderencia < 30%, mencionar.
  3. cycleKey = `'YYYY-WW'`.
  4. Body: "Sua proxima semana esta com N torneios planejados. Quer que eu sugira uma grade?" CTA: `{ kind:'tool', target:'bulk_propose_grade' }`.

**Criterio de aceitacao:**
- [ ] Cron registrado; tick injetavel.
- [ ] User com 0 `planned_tournaments` proxima semana → nudge; 5+ → no-op.
- [ ] Free → no-op.

---

### RF-11: Helpers novos em `coachSignalsStorage.ts`

**Descricao:** Reusar pattern do AI-1B (helpers livres exportados, mockaveis em testes lesson #3). Helpers necessarios:
- `getRecentSessionsForDownswing(userId, limit): Promise<...>` (RF-08).
- `getDrawdownVsPeak(userId, windowDays): Promise<...>` (RF-08).
- `countTournamentsThisWeek(userId): Promise<number>` (RF-09).
- `avgWeeklyTournaments(userId, weeks): Promise<{ avg, sampleSize }>` (RF-09).
- `countPlannedTournamentsForWeek(userId, weekStart): Promise<number>` (RF-10).
- `getGradeAdherenceForWeek(userId, weekStart): Promise<{ planned, played, adherencePct }>` (RF-10).
- `getRecentStatsUpload(userId, withinHours): Promise<{ uploadedAt, statsExtracted } | null>` (RF-07).
- `listOffDaysForUser(userId, range): Promise<Date[]>` (RF-02 — `bulk_propose_grade` consulta).

**Todos:**
- Filtram historico via `grind_session_id IS NULL` quando aplicavel (§6.1).
- Safe-deny em erro (lesson #9) — log antes do fallback.
- Aceitam `injectedDb`/`injectedStorage` quando necessario.

**Criterio de aceitacao:**
- [ ] Cada helper testavel em isolamento; mocks integration validam shape REAL (lesson #3 — NAO mockar `drizzle-orm` parcialmente sem testar com storage real ao menos 1x).

---

### RF-12: System prompt update — sumario das tools novas

**Descricao:** O bloco STATIC `GRINDFY_AI_BASE` (em `coachSystemBuilder.ts`) ganha 2-3 linhas no inventario de tools mencionando as 9 novas (lesson #10 — fonte unica do prompt; lesson #11 — descricao curta, sem inventar uso). Exemplo:
```
Tools de planejamento (Pro+): bulk_propose_grade (monta grade semanal em massa, com confirmacao),
schedule_study_block (agenda estudo), create_study_theme (cria tema), mark_off_day (registra dia off).
Tools de diagnostico (Pro+): analyze_variance, diagnose_plateau, compute_grind_study_ratio,
calculate_effective_rake, query_pool_intelligence.
```
- Cache `ephemeral` mantido nos blocos estaveis. Snapshot do prompt reflete (test snapshot pode quebrar — atualizar).

**Criterio de aceitacao:**
- [ ] Snapshot do prompt STATIC contem mencao as 9 tools novas + tool-bridge OCR (referencia curta).
- [ ] LLM nao recebe descricao duplicada (a descricao detalhada vem do registry via `description` da tool — instrucao no prompt eh so o inventario).

---

### RF-13: Documentacao — CLAUDE.md, lessons-learned, data-model-index, endpoints-index, coach-tools.md, ADRs

**Descricao:**
- `CLAUDE.md` §4 — env vars novas (`COACH_GRADE_BANKROLL_THRESHOLD_MULT`, `COACH_DOWNSWING_DRAWDOWN_PCT`, `COACH_DOWNSWING_WINDOW_DAYS`, `COACH_VOLUME_DROP_PCT`). §6 — tabelas novas (`user_off_days`, `tournament_pool_intelligence`). §7 — confirma que nao ha endpoints HTTP novos (tools sao via `/api/coach/chat` + `/api/coach/actions/*`). §9 — lessons novas se houver. §10 — Fase 2 / AI-2A.
- `Docs/api/coach-tools.md` — documentar as 9 tools (input/output/gating/exemplo). Atualizar `tools-index.md` se existir.
- `Docs/architecture/data-model-index.md` — `user_off_days` + `tournament_pool_intelligence`.
- `Docs/architecture/endpoints-index.md` — confirmar que nenhum endpoint novo HTTP (so tools).
- ADRs (system-architect cria — proximos numeros a partir de **165**):
  - **ADR-165** — `bulk_propose_grade` (modo strict, transacao em massa, undo lookup por IDs no `payloadAfter`, integracao com `user_off_days`).
  - **ADR-166** — Metodologia `analyze_variance` (heuristica vs PrimeDope; confidence por sample size; reuso do calculo do Monthly Report AI-1C).
  - **ADR-167** — `diagnose_plateau` — combinacao de sinais (ROI flat + study minutes + leaks ativos + selection drift).
  - **ADR-168** — Pool intelligence BR — schema + politica de seed manual + roadmap para feed automatico.
  - **ADR-169** — Tool-bridge OCR — Coach reage a upload via page-context + quick suggestion (nao via tool nova).
  - **ADR-170** — Nudges B-DOWNSWING / B-VOLUME / B-GRADE — detectores + thresholds + cycleKeys.
- Diagramas Mermaid em `Docs/architecture/coach-ai-2a/`: sequencia `bulk_propose_grade` (LLM → preview → user confirma → execute em transacao → undo); fluxo de detector B-DOWNSWING; fluxo tool-bridge OCR.

**Criterio de aceitacao:**
- [ ] CLAUDE.md / data-model-index / coach-tools.md / lessons-learned atualizados.
- [ ] ADRs 165-170 criados (system-architect ajusta numeracao).
- [ ] Diagramas em `Docs/architecture/coach-ai-2a/`.

---

## Requisitos Nao-Funcionais

- **Confirmacao SEMPRE v1 (ADR-146):** todas as 4 write tools (`bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `mark_off_day`) passam por `coachToolRunner.preview → confirm → execute`. **Nunca** auto-executam.
- **Undo:** todas as 4 write tools tem entrada em `coach_actions.undo` reverso (ADR-145). `bulk_propose_grade` undo eh em lote.
- **Idempotencia:** `mark_off_day` via UNIQUE `(user_id, off_date)`; `bulk_propose_grade` sem UNIQUE no DB mas o preview detecta `already_in_grade` antes do execute; `schedule_study_block` permite multiplos blocos no mesmo dia (intencional — user pode estudar 2x).
- **Performance:** `bulk_propose_grade` envolve scoring de N torneios — caro. Cache de scoring por `weekStart`+`profile` por 5min em memoria (opcional). Detectores B-DOWNSWING/B-VOLUME/B-GRADE rodam em ticks horarios com pacing (igual B-IMPORT — pacing 200ms entre users).
- **Tier gating estrito (Q-E locked 2026-05-20):** todas as 8 tools `gateByTier: ['pro','premium','admin']` + Trial elegível via helper novo. Criar `server/coach/toolEligibility.ts` com `isToolEligibleTier(user, tool): boolean` — Trial passa direto (subscription_plan='trial'), `'active'` re-resolve via `resolveUserTier` ∈ {pro,premium,admin}, Free/expired nega. `resolveUserTier` em si **não muda** (continua gateando rate limit estrito de Free, Trial→free lá). `listToolsForUser` passa a chamar `isToolEligibleTier` em vez de `resolveUserTier` para filtrar a lista de tools enviada ao LLM. Rate limit do Trial nas chamadas das tools deste sprint = Pro-like (mais generoso que Free); o rate limit geral de chat do Trial permanece como hoje. Padrão simétrico ao `getReportTier` (AI-1C `reportEligibility.ts`).
- **Kill switch:** `COACH_NUDGES_ENABLED=false` desliga os 3 crons novos (B-DOWNSWING/B-VOLUME/B-GRADE) — consistente com B-STUDY/B-SNAPSHOT/B-GAPCHECK/B-IMPORT.
- **Fail-soft:** todos os detectores em try/catch + log antes de skip (lesson #9). Erro em 1 user nao trava os outros.
- **Lessons aplicadas:** #3 (mocks integration validam shape REAL), #9 (log antes de fallback), #10 (DRY prompt), #11 (default minimo em CTAs), #32 (`db.transaction` com fallback gentil), #33 (JSONB array remove via `jsonb_array_elements_text`), #34 (handlers aceitam `injectedStorage?`), #36 (`@shared/schema` lazy import em modulos de storage testados isoladamente).
- **Compatibilidade:** AI-1C continua funcionando. `getReportTier` nao muda. Os relatorios (weekly/daily/monthly) podem agora referenciar as tools novas em `cta` (AI-1C RF-05 permite — `cta.kind:'tool'`), mas isso eh decisao de prompt do gerador (nao escopo deste sprint mudar os geradores existentes — eles podem mencionar via texto livre / o pos-AI-2A pode atualizar prompts).
- **Seguranca:** ownership validado em `studyThemeId`/`lessonId`; `requireAuth` na rota `/api/coach/chat`; `coachActions.confirm` valida ownership do action (ja existe).

---

## Endpoints Previstos

**Nenhum endpoint HTTP novo.** Tudo via os existentes do Coach:
| Metodo | Rota | Uso |
|---|---|---|
| POST | `/api/coach/chat` (existente) | LLM chama as 9 tools via tool-use; preview retorna ao cliente |
| POST | `/api/coach/actions/:id/confirm` (existente, ADR-146) | User confirma execute das 4 write tools |
| POST | `/api/coach/actions/:id/undo` (existente, ADR-145) | Undo |
| GET | `/api/coach/suggestions` (AI-1B, ADR-158) | Inclui sugestao "analisar stats do ultimo upload" (RF-07.2) |
| GET | `/api/coach/timeline` (AI-1B) | Inclui nudges B-DOWNSWING/B-VOLUME/B-GRADE |

---

## Modelos de Dados Afetados

### Novas
- `user_off_days` (RF-01.1) — `(id, user_id, off_date UNIQUE, reason?, source, created_at)`.
- `tournament_pool_intelligence` (RF-01.2) — `(id, site, tournament_pattern, buy_in_min, buy_in_max, field_avg, field_volatility, pool_quality, notes, updated_at)`.

### Sem alteracao
- `user_coach_preferences` — toggles dos 3 nudges ja existem (linhas 4501-4504).
- `planned_tournaments`, `study_themes`, `study_sessions_v2` / `calendar_events`, `coach_actions`, `coach_nudge_log` — reuso direto.
- `users.ai_structured_profile` — sem mudanca neste sprint (AI-2B mexe quando adiciona `careerGoals`).

---

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Anthropic (Claude Sonnet 4.6) | Tool-use loop (chamadas as 9 tools novas) | Em cada turn de chat que aciona tool |
| Anthropic (Claude vision) | OCR de stats (ja existente ADRs 064/067) | Tool-bridge so consome o resultado; nao chama vision |

---

## Cenarios de Teste Derivados

### Happy path
- [ ] `bulk_propose_grade` com profile A, 6 dias, hoursTarget 4 → preview com ~8-12 torneios; confirm → 8-12 rows em `planned_tournaments`; undo → 0 rows.
- [ ] `schedule_study_block` com `studyThemeId` valido, 60min → 1 row em `study_sessions_v2` (ou `calendar_events`); undo → 0 rows.
- [ ] `create_study_theme` com `linkedStats:['3bet']` → tema criado + `user_focus_stats.linked_themes` atualizado.
- [ ] `mark_off_day` com `2026-05-23` → row criada; `bulk_propose_grade` da mesma semana pula sabado.
- [ ] `analyze_variance` para user com 100 torneios → narrative + confidence calculados.
- [ ] B-DOWNSWING tick com user em 5 sessoes negativas → 1 nudge persistido.
- [ ] Upload OCR < 24h → `assembleContext` inclui bloco `## Upload Recente`; `/api/coach/suggestions?route=/stats` inclui sugestao.

### Validacao de input
- [ ] `bulk_propose_grade` com `daysOfWeek:[8]` → 400 validation.
- [ ] `schedule_study_block` com `durationMinutes:5` → 400.
- [ ] `create_study_theme` com `name` > 50 chars → 400.
- [ ] `mark_off_day` com `offDate:'invalid'` → 400.

### Regras de negocio / edge cases
- [ ] `bulk_propose_grade` `strict:true` + conflito → recusa execute com `strict_conflict`.
- [ ] `bulk_propose_grade` user com wallet abaixo do threshold → `conflicts` inclui `wallet_below_threshold`; strict recusa.
- [ ] `schedule_study_block` com `studyThemeId` de outro user → `theme_not_accessible`.
- [ ] `create_study_theme` com `name` duplicado → recusa (Q-C — recomendacao).
- [ ] `mark_off_day` 2x mesmo dia → 2o execute eh no-op (UNIQUE + ON CONFLICT DO NOTHING); coach_action audita ambos.
- [ ] `query_pool_intelligence` com tabela vazia → `{ rows: [], note: 'pool_intelligence_not_seeded' }`.
- [ ] `diagnose_plateau` user sem historico (< 30 torneios) → `isPlateau: false`, `signal: 'unknown'`.
- [ ] `compute_grind_study_ratio` user sem estudo → `ratio: null`, narrative explicita.
- [ ] B-DOWNSWING user com 4 sessoes negativas → no-op.
- [ ] B-VOLUME user sem baseline (< 2 semanas historico) → no-op.
- [ ] B-GRADE user com grade cheia → no-op.
- [ ] `COACH_NUDGES_ENABLED=false` → 3 crons novos nao registrados; tools write **continuam funcionando** (write tools nao sao "proatividade" — sao explicitas do user).
- [ ] Free → `listToolsForUser` nao inclui as 9 tools; chamar via `/api/coach/chat` com tool-use → erro de gating (LLM nao tem essas tools listadas).
- [ ] Trial → recebe as 9 tools (Q-E confirmada).
- [ ] Sumarizacao OCR upload retorna shape inesperado → bloco `## Upload Recente` cai para `"upload detectado, sem detalhes"` (lesson #9 — log + fallback).
- [ ] Erro de scoring em `bulk_propose_grade` para `dayOfWeek=3` → `conflicts` inclui `{ dayOfWeek:3, reason:'scoring_error' }`; outros dias seguem.

---

## Fora de Escopo (explicito)

- **Tools de carreira:** `define_career_goal`, `evaluate_career_goal`, `generate_career_plan` (vao em AI-2B).
- **Quarterly Career Review:** relatorio trimestral (AI-2B).
- **C-game tracker + Inchworm visualization** (AI-2B).
- **Mental Hand History** (AI-2B).
- **`log_mental_state` / `log_cgame_split`** (AI-2B).
- **Wellbeing prompts / schedule pattern detection** (AI-2B).
- **Disclaimer regulatorio reforcado em outputs financeiros** (AI-2B junto com tools financeiras de carreira).
- **Pool intelligence — feed automatico** (so seed manual neste sprint; feed automatico = follow-up futuro).
- **Endpoint admin para CRUD de `tournament_pool_intelligence`** (so SQL manual neste sprint).
- **`bulk_remove_grade_for_day`** (complemento de `mark_off_day` — fora de escopo; user faz manualmente pela UI ou via tool individual `register_tournament_in_grade` invertido).
- **Calendario integrado (Google Calendar / iCal)** para `schedule_study_block` (so storage interno).
- **AI confidence calibration** (nao calibrar `confidence` das tools de diagnostico com dados reais — fica heuristico fixo).

---

## Dependencias

- AI-0A (write tools precedentes + `coachToolRunner` + `coach_actions`).
- AI-0B (page context + agente unico).
- AI-1A (kill switch global + perfil estruturado + `LIST_USERS_FOR_CRON_PRO_PLUS`).
- AI-1B (categorias nudge + toggles + `quickSuggestions` + `coach_nudge_log`).
- AI-1C (`getReportTier` / `isReportEligible` / `bulk_query_dimensions` molde / sumarizacao Haiku reaproveitavel se a heuristica de variancia for grande).

---

## Notas de Implementacao (sugestoes para o Implementer)

- Reusar `buildScoringInput.ts` (AI-0A) para `bulk_propose_grade` — nao reimplementar scoring.
- Extrair a heuristica de variancia do `monthlyReportGenerator.ts` (AI-1C) para um modulo `server/coach/varianceAnalysis.ts` reusavel por `analyze_variance` + `monthlyReportGenerator`.
- O `coachToolRunner` ja sabe lidar com `payloadAfter` array — `bulk_propose_grade` undo pode listar IDs no `payloadAfter.createdIds: string[]` e o undo handler deleta em lote.
- Tool-bridge OCR (RF-07) eh **apenas** mudanca em `coachContext.ts` + `quickSuggestions.ts` — **nao** registra tool nova. O LLM ja tem `read_user_hud_stats` para puxar os stats.
- Tabelas seed de `tournament_pool_intelligence` — sugestao founder gerar SQL inicial em `scripts/seed-pool-intelligence.sql` com 10-15 torneios BR top (Sunday Million WPN, Bounty Builder, etc.).

---

## Criterios de Aceite Globais

- [ ] 9 tools novas registradas em `coachTools/index.ts`; cada uma testada (unit + integration com storage real — lesson #3).
- [ ] 3 nudges novos com cron + tick + helpers + testes.
- [ ] Tool-bridge OCR plugado em `assembleContext` + `quickSuggestions`.
- [ ] Migration 0070 aplicada (founder roda manual via `db:push` ou psql — autonomy_db memory).
- [ ] ADRs 165-170 (numeracao a confirmar com system-architect — 162-164 ja existem para outros sprints).
- [ ] tsc 0; vitest verde (sprint + zero regressao no AI-0A/0B/1A/1B/1C).
- [ ] Reviewer APPROVED.
- [ ] CLAUDE.md / data-model / coach-tools / lessons-learned atualizados.

---

## Decisoes do Founder — RESOLVIDAS (locked 2026-05-20)

Todas as 9 questões (Q-A a Q-I) foram resolvidas e estão registradas no topo deste documento na seção **"Decisões do founder (locked 2026-05-20)"**. Sem blockers pendentes. System-architect pode prosseguir.
