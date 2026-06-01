# ADR-226: Interactive Monday Ritual (EST-5) — máquina de estados "Weekly Review" + montagem do PlanningWizard

## Status
Aceito

## Data
2026-06-01

## Contexto

EST-1 (entrega tripla), EST-2 (Weekly Report enriquecido com `mentalState`/`studyWeek`),
EST-3 (`stat_analysis`) e EST-6 (Next-Week Planning Flow) já shiparam. Falta a peça
que costura tudo num **ritual de segunda-feira**: o mentor deixa de ser um conjunto
de relatórios passivos e passa a conduzir uma conversa guiada que termina num plano
(`EST-1 + EST-2 → EST-5 → EST-6`).

O fluxo-alvo: toda segunda de manhã o Coach posta no chat o recap da semana anterior
(dados EST-2), pede o upload do histórico sharkscope dos últimos 7 dias e — quando o
jogador **confirma** o upload — roda uma análise profunda 7d (histórico + grind reports
+ estudo), encerrando com o handoff para o `weeklyPlanningOrchestrator.startPlanning`
do EST-6.

Forças em jogo:

1. **Idempotência semanal.** O ritual roda toda segunda, hourly, para todos os elegíveis.
   Precisa de **um** registro por usuário/semana, **um** recap, **uma** análise, **uma**
   planning session — sem re-postar nem re-processar.
2. **Custo.** Um LLM por usuário/semana escalaria custo linearmente. O EST-2 já provou
   que a maior parte do valor analítico (mental via `break_feedbacks`, estudo, performance)
   é determinística via `gatherBundle`/`buildMentalState`/`buildStudyWeek`.
3. **Chaves de semana.** O projeto convive com chaves UTC (`weekly_planning_sessions`,
   `study_weekly_plans`) e BRT (`coach_lesson_recommendations`) que **não devem ser
   unificadas** (CLAUDE.md §10). O handoff a `startPlanning` precisa passar a mesma chave
   que o orquestrador EST-6 já usa.
4. **PlanningWizard órfão.** O `PlanningWizard.tsx` shipou no EST-6 mas **não está montado
   em rota/superfície alcançável** (lesson #19). EST-5 é o ponto natural para dar-lhe casa.
5. **Paridade de infra.** EST-6 estabeleceu um molde (orquestrador + rotas + shared + storage
   + tick) que EST-5 deve espelhar para reduzir superfície de erro e custo cognitivo.

Achados da leitura do código (que travam decisões deste ADR):

- **`server/coach/timezone.ts` já expõe `getLocalWeekday(date, tz)`** (0=domingo) e
  `getLocalHour(date, tz)`. O filtro local-Monday **não precisa estender** o módulo —
  reusa os dois helpers. (A spec dizia "reutilizar/estender"; a realidade é só reutilizar.)
- **`gatherBundle` é module-private** em `server/services/weeklyReportGenerator.ts`
  (`async function gatherBundle(...)`, sem `export`). `buildMentalState`/`buildStudyWeek`
  **são** exportados. Para EST-5 reusar `gatherBundle` sem reimplementar, é necessário
  **exportá-lo** (mudança aditiva, sem alterar comportamento) ou expor um wrapper
  `gatherWeekBundle(storage, userId, periodStart, periodEnd)` no mesmo módulo. Ver §Consequências.
- **`weeklyPlanningOrchestrator`/`coachPlanning`/`weeklyPlanningStorage`** já estabelecem:
  `injectedStorage` 3º arg (lesson #34), `createWeeklyPlanningSession` com
  `onConflictDoNothing` + re-leitura (idempotência por UNIQUE), tier gate via
  `assertTierEligible` → `getReportTier`, erros nomeados com `err.code`.
- **Registro de rotas:** `registerCoachPlanningRoutes(app, requireAuth)` é chamado em
  `server/routes/coach.ts:1074`, **antes** de `registerCoachAi1bRoutes` (L1076).

---

## Decisão

Criar EST-5 espelhando EST-6, em camadas isoladas, com uma **máquina de estados linear
"Weekly Review"** persistida em tabela nova `weekly_reviews`. Quatro decisões de design
(DEC-1..DEC-4) + a definição da máquina de estados, idempotência, gates e colisão de rota.

### Arquivos (paridade EST-6)

| Camada | EST-6 (referência) | EST-5 (novo) |
|---|---|---|
| Shared (SSoT) | `shared/coach-planning.ts` | `shared/coach-weekly-review.ts` |
| Schema Drizzle | `weeklyPlanningSessions` em `shared/schema.ts` | `weeklyReviews` em `shared/schema.ts` |
| Orquestrador | `server/coach/planning/weeklyPlanningOrchestrator.ts` | `server/coach/weeklyReview/weeklyReviewOrchestrator.ts` |
| Helpers puros | (inline) | `server/coach/weeklyReview/buildRecap.ts` + `buildDeepAnalysisNarrative.ts` |
| Storage | `server/storage/weeklyPlanningStorage.ts` | `server/storage/weeklyReviewStorage.ts` |
| Rotas | `server/routes/coachPlanning.ts` | `server/routes/coachWeeklyReview.ts` |
| Tick cron | (n/a) | `server/coach/jobs/weeklyReviewMonday.ts` (molde = `bImport.ts`) |
| UI | `PlanningWizard.tsx` | `WeeklyReviewPanel.tsx` (monta `<PlanningWizard>` no estado `planning`) |
| Migration | `0088_weekly_planning_sessions.sql` | `0089_weekly_reviews.sql` |

### DEC-1: Deep analysis determinística-first, com ponto de extensão LLM

A deep analysis 7d (RF-06) e o recap (RF-04) são **determinísticos** — reusam
`gatherBundle` + `buildMentalState` + `buildStudyWeek` (EST-2) e montam a narrativa do
mentor por **template PT-BR** a partir dos números. **Nenhuma chamada Anthropic neste
sprint.**

Ponto de extensão definido **agora** para não pré-comprometer o test-writer: a função pura

```ts
// server/coach/weeklyReview/buildDeepAnalysisNarrative.ts
export function buildDeepAnalysisNarrative(bundle: DeepAnalysisInput): DeepAnalysisContent
```

é **síncrona e pura** (entrada = bundle já coletado + deltas vs semana anterior; saída =
`{ markdown, metrics }`). Um sprint futuro (EST-5.1) troca o corpo por `callReportLlm`
com fail-soft determinístico (mesmo padrão do `weeklyReportGenerator`), **sem mudar a
assinatura nem os callsites**. O `buildRecap.ts` segue a mesma forma
(`buildRecap(bundle): RecapContent`).

- *Prós:* custo zero (cost discipline); determinismo facilita TDD (assert sem mockar
  streaming Anthropic); latência baixa (síncrono no `confirm-upload`, sem o cap de 60s
  de `COACH_LLM_TIMEOUT_MS`); o valor analítico do EST-2 já é determinístico.
- *Contras:* narrativa menos "conversacional"; sem correlação qualitativa automática.
- *Mitigação:* o ponto de extensão acima; o EST-2 fez exatamente esse caminho (append de
  prompt, não ligou o `reportSummarizer` no weekly) — paridade.

### DEC-2: Montar o PlanningWizard numa nova tab "Revisão semanal" em `/coach-ai`

Nova tab `'review'` no hub `/coach-ai` (`client/src/pages/CoachAI.tsx`, hoje
`chat|reports|audit|prefs`). A tab renderiza `WeeklyReviewPanel` (UI da máquina de estados)
e, no estado `planning`, monta `<PlanningWizard weekStartDate={...} />`.

- *Alternativa A (rota nova `/coach-ai/revisao`):* exigiria registrar rota em `App.tsx` +
  navegação; mais superfície, mais risco de CTA órfão (lesson #19). **Rejeitada.**
- *Alternativa B (dentro da aba `reports`):* `reports` é timeline read-only de
  relatórios/nudges; misturar o ritual interativo lá polui a semântica. **Rejeitada.**
- *Escolhida (tab nova):* `/coach-ai` já é o hub do mentor, já é URL-persisted via
  `useTabFromUrl` (`?tab=review`), já tem o padrão de `TabsTrigger` com `onClick`
  redundante (lesson #27 — Radix Tabs reage a `onMouseDown`; `fireEvent.click` não alterna
  sem o `onClick`). Custo: 1 entrada em `HUB_TABS`/`TAB_META` + 1 painel. **Nenhuma rota
  Wouter nova** (lesson #19 — o CTA "montar plano" aponta para a própria tab, não para
  rota inexistente).

### DEC-3: A chave de semana é resolvida pelo server, nunca duplicada no client

A UI obtém a `weekStartDate` corrente de **`POST /api/coach/weekly-review/start`** (idempotente,
retorna a review com `weekStartDate` calculado no server via `ymdUtc(nextMondayUtc())`).
O painel chama `start` no mount para obter a review corrente; o `GET .../:weekStartDate`
serve a leitura subsequente.

- *Alternativa (helper client puro recalculando `nextMondayUtc`):* mais simples, mas
  arrisca drift UTC/local entre client e server. **Rejeitada.** Server é a fonte da chave
  (CLAUDE.md §10 — não duplicar/divergir chaves).

### DEC-4: Chave UTC para a review (não BRT)

`weekly_reviews.week_start_date` usa chave **UTC** (`ymdUtc`/`nextMondayUtc` de
`server/coach/planning/weekKeys.ts`), igual a `weekly_planning_sessions`/`study_weekly_plans`.
O handoff a `startPlanning` passa a **mesma** chave UTC sem conversão.

- `coach_lesson_recommendations` usa BRT (CLAUDE.md §10) — mas o EST-6 já faz a ponte
  UTC→BRT internamente (`brtMondayYmd` em `confirmLessons`). **EST-5 nunca toca a chave BRT
  diretamente**; só passa a chave UTC ao orquestrador, que faz a conversão. **Não unificar.**

### Máquina de estados

Linear, somente "avançar", nunca pular nem retroceder:

```
recap_sent → awaiting_upload → upload_confirmed → deep_analysis_done → planning
```

| De | Para | Gatilho |
|---|---|---|
| (criação) | `recap_sent` | `createWeeklyReview` (recap postado no mesmo ato) |
| `recap_sent` | `awaiting_upload` | logo após postar o CTA de upload |
| `awaiting_upload` | `upload_confirmed` | `POST .../confirm-upload` (sinal explícito) |
| `upload_confirmed` | `deep_analysis_done` | `runDeepAnalysis` concluída + postada |
| `deep_analysis_done` | `planning` | `handoffToPlanning` → `startPlanning` |

`VALID_TRANSITIONS` vive em `shared/coach-weekly-review.ts` (mapa `from → Set<to>`).
Qualquer transição fora do mapa → erro nomeado **`invalid_weekly_review_transition`**
(`err.code = 'invalid_weekly_review_transition'`). O status **nunca regride**.

### Contrato do orquestrador (`weeklyReviewOrchestrator.ts`)

`injectedStorage` 3º arg em todo método (lesson #34); em prod resolve `../../storage` lazy.
Erros nomeados com `err.code` (espelha EST-6).

```ts
// idempotente: 2 chamadas → 1 row, mesmo id, status preservado.
createWeeklyReview(userId: string, weekStartDate?: string,
  opts?: { injectedStorage?: any }): Promise<{ review: WeeklyReview }>
// resolve wsd = weekStartDate ?? ymdUtc(nextMondayUtc()); cria em 'recap_sent',
// monta+persiste recap_content (buildRecap), posta no chat (RF-03), avança p/ 'awaiting_upload'.

getWeeklyReview(userId: string, weekStartDate: string,
  injectedStorage?: any): Promise<WeeklyReview | null>   // null se não existe (NÃO lança)

// transição guardada por VALID_TRANSITIONS; rejeita inválida com invalid_weekly_review_transition.
advanceWeeklyReview(userId, weekStartDate, fromStatus, toStatus,
  injectedStorage?): Promise<WeeklyReview>

// awaiting_upload→upload_confirmed→(runDeepAnalysis)→deep_analysis_done→(handoff)→planning.
// no-op se já em deep_analysis_done/planning (retorna review como está).
confirmUpload(userId, weekStartDate,
  ctx?: { injectedStorage?: any }): Promise<{ review, uploadDetected: boolean, source: 'explicit'|'recent_import' }>

// determinística (DEC-1): gather + buildDeepAnalysisNarrative; posta no chat; persiste analysis_content.
runDeepAnalysis(userId, weekStartDate, ctx?): Promise<WeeklyReview>

// startPlanning(userId, weekStartDate, { source:'est5_ritual' }) + transição p/ 'planning';
// captura tier_not_eligible → review fica em deep_analysis_done, log (lesson #9).
handoffToPlanning(userId, weekStartDate, ctx?): Promise<WeeklyReview>
```

**Erros nomeados** (códigos em `err.code`):
- `invalid_weekly_review_transition` — transição fora do mapa (→ HTTP 409).
- `weekly_review_not_found` — review inexistente em confirm/get-on-mutate (→ HTTP 404).
- `tier_not_eligible` — propagado de `startPlanning`/gate de entrada (→ HTTP 403).
- `weekly_review_persist_failed` — `createWeeklyReview` re-leitura veio null sob race
  (espelha `planning_session_persist_failed`).

### Shape de `recap_content` e `analysis_content` (jsonb)

```ts
// recap_content — snapshot determinístico da SEMANA ANTERIOR.
interface RecapContent {
  schemaVersion: 1;
  periodStart: string;            // YYYY-MM-DD (segunda anterior)
  periodEnd: string;              // YYYY-MM-DD (domingo anterior)
  markdown: string;              // texto PT-BR postado no chat (recap + CTA)
  performance: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState: ReportMentalState | null;   // de buildMentalState (EST-2)
  studyWeek: ReportStudyWeek | null;       // de buildStudyWeek (EST-2)
  hasData: boolean;              // false → recap minimalista
}

// analysis_content — snapshot determinístico da DEEP ANALYSIS 7d.
interface AnalysisContent {
  schemaVersion: 1;
  periodStart: string;           // YYYY-MM-DD (hoje - 7d)
  periodEnd: string;             // YYYY-MM-DD (hoje)
  markdown: string;              // síntese PT-BR postada no chat
  performance7d: { volume: number; profitUsd: number; roiPct: number | null };
  mentalState: ReportMentalState | null;
  studyWeek: ReportStudyWeek | null;
  deltaVsPrevWeek: { volume: number; profitUsd: number; roiPct: number | null } | null;
  llmGenerated: false;           // ponto de extensão DEC-1: vira true em EST-5.1
}
```

Ambos reusam os tipos `ReportMentalState`/`ReportStudyWeek` já exportados pelo
`weeklyReportGenerator.ts` (não redeclarar). `markdown` é o texto canônico postado no
chat e renderizado pela tab — a tab lê `recap_content`/`analysis_content` da própria review
(mitiga R-2: review existe mesmo se o chat falhou).

### Idempotência

- **1 review/semana/user:** UNIQUE `(user_id, week_start_date)` + `createWeeklyReview` com
  `onConflictDoNothing` + re-leitura (espelha `createWeeklyPlanningSession`). 2 inserts
  concorrentes → 1 row.
- **1 recap:** o tick checa `getWeeklyReview` antes de criar; review existente → skip
  (não re-posta).
- **1 deep analysis:** `confirmUpload` em `deep_analysis_done`/`planning` é no-op.
- **1 planning session:** `startPlanning` é idempotente (UNIQUE em `weekly_planning_sessions`).

### Tick de segunda (RF-02) — gates e resolução de "segunda local"

`weeklyReviewMondayTick({ now?, injectedStorage? })` em `server/coach/jobs/weeklyReviewMonday.ts`,
molde = `bImport.ts`. Cron `0 * * * *` registrado em `server/coach/cronRunner.ts` via
`withAdvisoryLock("cron:coach-weekly-review", ...)`.

Ordem de gates (barato → caro, espelha bImport):

1. **Kill-switch absoluto:** `process.env.COACH_NUDGES_ENABLED === "false"` → skip imediato,
   log `weekly_review_monday.skip { reason: "nudges_globally_disabled" }`. Nenhum bypass.
2. **Conjunto de users:** `listUsersForCron(LIST_USERS_FOR_REPORTS_FILTER)`
   (`"subscription_plan IN ('trial','active','admin')"` — de `reportEligibility.ts`).
3. **Por user, pre-check local-Monday (sem query pesada):**
   `getLocalWeekday(now, tz) === 1` (segunda) **&&** `getLocalHour(now, tz) === MONDAY_HOUR`.
   `MONDAY_HOUR = 9` (manhã útil — o jogador planeja a semana antes de grindar; 9h evita
   quiet hours e dá folga ao filtro hourly). Caso contrário → `continue`.
4. **Tier:** `getReportTier(user) !== 'free'`. Free/expired → skip.
5. **Opt-in:** `reportWeeklyEnabled === true` (reusa pref existente — o ritual É a entrega do
   weekly; **nenhuma pref nova**). Caso contrário → skip.
6. **Idempotência da semana:** `weekStartDate = ymdUtc(nextMondayUtc(now))`. Se já existe
   `weekly_review` para `(user, weekStartDate)` → skip.
7. Ao disparar: `createWeeklyReview` (cria `recap_sent`, monta recap, posta no chat, avança
   para `awaiting_upload`). Falha de post NÃO derruba o tick (lesson #9 — log antes do
   fallback; `try/catch` por user, segue para o próximo).

### Endpoints (RF-09) e colisão de rota

Módulo `server/routes/coachWeeklyReview.ts` → `registerCoachWeeklyReviewRoutes(app, requireAuth)`,
chamado em `server/routes/coach.ts` **ANTES** de `registerCoachAi1bRoutes` (e antes de
`registerCoachPlanningRoutes` é indiferente — prefixos disjuntos). Prefixo `weekly-review`
é disjunto de `planning` e dos GET genéricos de coach.

| Método | Rota | Status / erros |
|---|---|---|
| POST | `/api/coach/weekly-review/start` | 200 `{ review }`; 403 `tier_not_eligible` (Free); 400 ZodError de body |
| GET | `/api/coach/weekly-review/:weekStartDate` | 200 `{ review }`; 404 `weekly_review_not_found`; 400 YMD inválido |
| POST | `/api/coach/weekly-review/:weekStartDate/confirm-upload` | 200 `{ review, uploadDetected, source }`; 404; 409 `invalid_weekly_review_transition`; 403 `tier_not_eligible`; 400 YMD inválido |

- `userId = req.user.userPlatformId ?? req.user.id` (helper `userIdFrom`, igual a `coachPlanning.ts`).
- `YMD_REGEX` reexportado de `shared/coach-weekly-review.ts` (ou reusado de `coach-planning.ts`).
- Mapeamento de erro: `tier_not_eligible`→403, `invalid_weekly_review_transition`→409,
  `weekly_review_not_found`→404, ZodError→400, resto→500 com `console.error`.
- `confirm-upload` **não** recebe CSV (o upload já aconteceu via `/upload`); é só o sinal.
- **Guard test obrigatório** (espelha `tests/integration/routes/est-6-route-collision.test.ts`):
  prova que `weekly-review` não é shadowado por rota genérica registrada antes.

### Confirmação de upload (RF-05) — sinal explícito vence

`confirmUpload` consulta `getLastUploadAt(userId)` (`Date | null`):
- import `< 24h` → `{ uploadDetected: true, source: 'recent_import' }`.
- ausente/antigo → ainda confirma (o jogador clicou o botão) →
  `{ uploadDetected: false, source: 'explicit' }`.
- Só confirma quando a review está em `awaiting_upload`; estado terminal → no-op.
- Após `upload_confirmed`: `runDeepAnalysis` síncrona-best-effort; sucesso → `deep_analysis_done`
  + `handoffToPlanning`. Falha da análise → review permanece em `upload_confirmed`
  (re-confirmar reprocessa); log antes do fallback (lesson #9).

---

## Consequências

### Positivas
- Custo Anthropic = **0** para o ritual (DEC-1). Determinismo → TDD direto (assert que o
  mock do cliente Anthropic **não** é invocado).
- Paridade total com EST-6 reduz superfície de erro: mesma idempotência, mesmo tier gate,
  mesmo `injectedStorage`, mesmo canal de chat (`getOrCreateReportChatSession` +
  `insertChatMessage`), mesmo molde de tick (`bImport.ts`), mesmo guard de colisão de rota.
- O **PlanningWizard deixa de ser órfão** (lesson #19): o jogador chega ao wizard pelo
  ritual, dentro de `/coach-ai?tab=review`, sem rota nova.
- `getLocalWeekday` já existir significa **zero mudança** em `server/coach/timezone.ts`.

### Negativas / custos
- **`gatherBundle` precisa virar exportado** em `weeklyReportGenerator.ts` (ou ganhar um
  wrapper `gatherWeekBundle`). É mudança **aditiva** (só adiciona `export`), mas toca um
  arquivo compartilhado — o implementer deve `grep` por usos antes e o reviewer deve
  confirmar que não há divergência de comportamento. O test-writer deve mockar o **shape
  real** do bundle (lesson #3).
- A deep analysis roda **síncrona** no request HTTP do `confirm-upload` (R-3). Determinística
  → rápida; mas se virar LLM (EST-5.1) deve migrar para `report_jobs` (enfileiramento).
- Borda **R-1 (chave UTC vs disparo local-Monday):** o tick dispara por "segunda 9h local"
  mas a chave é `ymdUtc(nextMondayUtc(now))` (UTC). Em fusos extremos (UTC+13/UTC-11) o
  "segunda local 9h" pode mapear `now` para um instante UTC que cai em domingo ou terça UTC,
  fazendo `nextMondayUtc` apontar para uma `weekStartDate` UTC adjacente à esperada. **Aceito
  por paridade:** EST-6 já vive com a mesma convenção UTC, e o handoff usa a mesma chave que
  a review — então review e planning session ficam coerentes entre si (a chave UTC é a SSoT
  do par). Documentado no diagrama de sequência (nota R-1).

### Neutras / limitações aceitas
- **R-2:** se `insertChatMessage` falha após criar a review, a review fica em `recap_sent` e
  o próximo tick (review já existe) não re-posta. Mitigação: a tab lê `recap_content` da
  própria review (a UI mostra o recap mesmo sem mensagem no chat).
- **R-6:** se o handoff `startPlanning` falhar (tier downgrade entre tick e confirmação), a
  review fica em `deep_analysis_done` e a tab mostra o CTA "montar plano" que re-tenta.
- **Sem pref nova:** reusa `reportWeeklyEnabled` como gate de opt-in (decisão de produto — o
  weekly É o ritual). Nenhuma coluna em `user_coach_preferences`.

### Migration 0089 — `weekly_reviews`
Tabela nova `weekly_reviews` (espelha 0088): chave UTC, UNIQUE `(user_id, week_start_date)`,
status `varchar(24) DEFAULT 'recap_sent'` **sem CHECK** (Zod-only em `shared/coach-weekly-review.ts`),
sem FK (app valida ownership por `userId`), nasce vazia (sem back-fill). Colunas:
`id, user_id, week_start_date, status, recap_content (jsonb), analysis_content (jsonb),
upload_source (varchar(16)), planning_session_id (varchar), chat_session_id (varchar),
created_at, updated_at`. O UNIQUE já cobre as queries; sem índice extra.
**Aplicar via psql local (localhost:5433); PENDENTE PROD (Neon) no deploy** — documentar em
CLAUDE.md §6 (mesmo padrão de 0086/0087/0088). Sem `db:push` em prod sem aprovação.

## Confiança
Alta. EST-5 é majoritariamente costura de peças já shipadas (EST-1/2/3/6) com um molde
de infra já validado (EST-6). Os dois riscos reais — exportar `gatherBundle` e a borda R-1
de fuso — estão documentados e são de baixo impacto. A única decisão não-trivial (DEC-1
determinística-first) já tem precedente no EST-2.
