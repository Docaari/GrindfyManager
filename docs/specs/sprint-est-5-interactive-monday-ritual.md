# Spec: EST-5 — Interactive Monday Ritual (sharkscope-gated weekly review)

## Status
Proposta

## Resumo
Toda segunda de manhã o mentor (Coach AI) inicia um **ritual interativo multi-step** no chat: envia o recap da semana anterior (dados EST-2), pede ao jogador o upload do histórico sharkscope dos últimos 7 dias, e — quando o jogador **confirma** o upload — roda uma **análise profunda 7d** combinando histórico + grind reports + estudo, encerrando com o handoff para o planejamento da próxima semana (EST-6). É governado por uma **máquina de estados "Weekly Review"** persistida por usuário/semana (idempotente, 1/semana). Como responsabilidade extra, monta o `PlanningWizard` (EST-6, hoje dark) numa superfície alcançável em `/coach-ai`, garantindo que o jogador **chegue ao wizard pelo ritual**.

## Contexto
EST-1 (entrega tripla), EST-2 (report enriquecido com `mentalState`+`studyWeek`), EST-3 (`stat_analysis`) e EST-6 (planning flow / orquestrador) já shiparam. O que falta para fechar o overhaul de Estudos+Mentor (master-plan §EST-5, D3) é **costurar tudo num ritual de segunda**: o mentor deixa de ser um conjunto de relatórios passivos e passa a conduzir uma conversa guiada que termina num plano. EST-5 é a penúltima peça do grafo (`EST-1 + EST-2 → EST-5 → EST-6`), depende dos dados enriquecidos do EST-2 e do canal de chat do EST-1, e pluga o orquestrador EST-6 já existente no estado final `planning`.

Problema secundário que EST-5 resolve: o `PlanningWizard.tsx` shipou no EST-6 mas **não está montado em rota alcançável** (lesson #19 — CTA/rota órfã). EST-5 é o ponto natural para dar-lhe uma superfície.

## Usuários
- **Jogador elegível (Trial / Pro / Premium / admin — `getReportTier !== 'free'`)**: recebe o recap de segunda no chat, confirma upload, lê a análise profunda, é levado ao wizard de planejamento.
- **Jogador Free / expired**: não recebe o ritual (gate de tier + kill-switch). Nenhuma mudança de comportamento.
- **Cron / sistema**: dispara o tick de segunda (hourly, local-hour-filtered), gated por `COACH_NUDGES_ENABLED`.

---

## Requisitos Funcionais

### RF-01: Máquina de estados "Weekly Review" persistida (idempotente)
**Descrição:** existe um registro de revisão semanal por usuário/semana com um `status` que progride por uma máquina de estados linear. Persistência em tabela nova `weekly_reviews` (ver §Schema), espelhando a convenção de `weekly_planning_sessions` (migration 0088): chave de semana **UTC** (`ymdUtc` de `server/coach/planning/weekKeys.ts`), `UNIQUE (user_id, week_start_date)`, sem CHECK de status no DB (validação Zod-only em `shared/coach-weekly-review.ts`).

**Estados:** `recap_sent → awaiting_upload → upload_confirmed → deep_analysis_done → planning`.

**Regras de negócio:**
- Estado inicial ao criar = `recap_sent` (o recap é postado no mesmo ato da criação). Logo após postar o CTA, transiciona para `awaiting_upload`.
- Transições válidas (somente "avançar", nunca pular nem retroceder): `recap_sent→awaiting_upload`, `awaiting_upload→upload_confirmed`, `upload_confirmed→deep_analysis_done`, `deep_analysis_done→planning`. Qualquer outra transição lança `invalid_weekly_review_transition`.
- `weekStartDate` = `ymdUtc(nextMondayUtc())` **da semana que está começando** (o recap é sobre a semana anterior, mas a chave da review é a semana corrente — alinha com o `weekStartDate` que será passado a `startPlanning` no handoff). Documentar explicitamente para o test-writer não confundir período-do-recap vs chave-da-review.
- Idempotência: criar a review da mesma semana 2x retorna a existente (`onConflictDoNothing` + re-leitura, espelhando `createWeeklyPlanningSession`). O cron de segunda nunca cria 2 reviews/semana para o mesmo user.
- O status nunca regride. Re-confirmar upload com a review já em `deep_analysis_done`/`planning` é no-op (retorna a review como está, sem reprocessar análise).

**Critério de aceitação:**
- [ ] `createWeeklyReview(userId, weekStartDate)` é idempotente: 2 chamadas → 1 row, status preservado, mesmo `id`.
- [ ] `advanceWeeklyReview(userId, weekStartDate, fromStatus, toStatus)` rejeita transição inválida com erro nomeado `invalid_weekly_review_transition` e código `invalid_weekly_review_transition`.
- [ ] `getWeeklyReview(userId, weekStartDate)` retorna `null` quando não existe (não lança).
- [ ] `UNIQUE (user_id, week_start_date)` impede 2 rows; teste de concorrência (2 inserts simultâneos) resolve para 1 row.

### RF-02: Trigger de segunda (cron tick hourly, local-hour-filtered, kill-switch + tier)
**Descrição:** novo tick `weeklyReviewMondayTick({ now?, injectedStorage? })` em `server/coach/jobs/weeklyReviewMonday.ts`, espelhando `server/coach/jobs/bImport.ts`. Roda hora-em-hora (cron `0 * * * *`), itera `listUsersForCron(LIST_USERS_FOR_REPORTS_FILTER)` e, para cada user, dispara o ritual apenas no horário-alvo local de segunda-feira.

**Regras de negócio:**
- Gate absoluto: se `process.env.COACH_NUDGES_ENABLED === "false"` → skip imediato com log `weekly_review_monday.skip { reason: "nudges_globally_disabled" }` (espelha `isNudgesDisabled()` do bImport). Nenhum bypass (nem `isCritical`).
- Filtro de dia/hora: só executa para o user quando, no fuso do user (`getLocalHour(now, tz)` + dia da semana local), for **segunda-feira** e a **hora-alvo** (constante `MONDAY_HOUR = 9`, hora útil; reutilizar/estender `server/coach/timezone.ts` para expor o dia-da-semana local). Justificar a hora no design.
- Gate de tier: `getReportTier(user)` (de `server/coach/reportEligibility.ts`) deve ser `!== 'free'`. Free/expired → skip. (O filtro SQL `LIST_USERS_FOR_REPORTS_FILTER` já reduz o conjunto; `getReportTier` re-resolve `active`.)
- Gate de opt-in: respeitar `reportWeeklyEnabled` da pref (o ritual de segunda É a entrega do weekly — não criar pref nova; reusar a existente). Se `reportWeeklyEnabled !== true` → skip.
- Idempotência da semana: se já existe `weekly_review` para `(user, weekStartDate)` → skip (não re-posta recap). `weekStartDate = ymdUtc(nextMondayUtc(now))` no fuso UTC (mesma chave que o handoff usará). **Risco/decisão**: como a chave é UTC mas o disparo é por hora-local-de-segunda, documentar que o pre-check UTC de `nextMondayUtc` mais o filtro local-Monday pode, em fusos extremos, mapear o "segunda local" para uma `weekStartDate` UTC adjacente — ver §Riscos R-1.
- Ao disparar: cria a review (`recap_sent`), monta o recap a partir dos dados EST-2 (RF-04), posta no chat do Coach (RF-03), transiciona para `awaiting_upload`.

**Critério de aceitação:**
- [ ] `COACH_NUDGES_ENABLED=false` → tick retorna sem iterar users (log de skip).
- [ ] User Free → skip (nenhuma review criada, nenhuma mensagem postada).
- [ ] User elegível com `reportWeeklyEnabled=false` → skip.
- [ ] User elegível, segunda 9h local, `reportWeeklyEnabled=true`, sem review prévia → cria 1 review em `awaiting_upload` + 1 mensagem no chat.
- [ ] Segundo tick na mesma hora/semana → no-op (review já existe; 0 mensagens novas).
- [ ] Horário diferente de 9h local OU dia ≠ segunda → skip.
- [ ] `now` é injetável (`opts.now`) e o storage é injetável (`opts.injectedStorage`) para teste determinístico (lesson #34).

### RF-03: Recap + CTA postados no chat do Coach (canal EST-1)
**Descrição:** o recap e todas as mensagens do ritual são postadas no **chat de relatórios do mentor** reusando `storage.getOrCreateReportChatSession(userId)` + `storage.insertChatMessage({ chatSessionId, role:'assistant', content })` (mesmo canal usado por `reportDelivery.ts` e pelo `postPlanningSummaryToChat` do EST-6).

**Regras de negócio:**
- Mensagem de recap (role=assistant) com o resumo da semana anterior + um **CTA explícito**: "Você já importou o histórico do sharkscope dos últimos 7 dias?" com call-to-action para `/upload` e um botão/sinal de confirmação (ver RF-05).
- Nunca abrir nova `coach_conversations` por ritual: reusar a sessão de relatórios (1 por user) para manter o histórico do mentor coeso.
- Falha ao postar no chat NÃO derruba o tick (lesson #9 — logar antes do fallback). Se o chat falha mas a review foi criada, a review fica em `recap_sent` e o próximo tick (já com review existente) não re-cria — documentar como limitação aceitável (R-2).

**Critério de aceitação:**
- [ ] Mensagem de recap aparece em `getOrCreateReportChatSession(userId).id` com `role='assistant'` e contém o CTA de upload + link `/upload`.
- [ ] Não cria `coach_conversations` nova (reusa a sessão de relatórios).
- [ ] `insertChatMessage` lançar → log `weekly_review_monday.post_recap.error` + tick continua para o próximo user.

### RF-04: Recap da semana anterior derivado dos dados EST-2
**Descrição:** o conteúdo do recap reusa os builders determinísticos do `weeklyReportGenerator.ts` — `gatherBundle(storage, userId, periodStart, periodEnd)`, `buildMentalState(bundle)`, `buildStudyWeek(bundle)` — para montar um resumo da **semana anterior** (performance + estado mental via `break_feedbacks` + estudo). Período = a semana que terminou (segunda anterior a domingo anterior).

**Regras de negócio:**
- Histórico: `gatherBundle` já filtra `grind_session_id IS NULL` (§6.1 CLAUDE.md) e já agrega `break_feedbacks` + estudo (EST-2). Reusar sem reimplementar.
- O recap é **texto determinístico** (sem LLM neste RF — ver DEC-1). Montar a partir de `buildMentalState`/`buildStudyWeek` + dashStats da semana.
- FX: qualquer número monetário cruzado deve estar normalizado para USD antes de comparar (lesson #6) — `gatherBundle`/builders já fazem; não reintroduzir comparação em moeda nativa.
- Se a semana anterior não tem dados suficientes (volume 0, sem sessões, sem estudo): recap minimalista ("semana sem dados — bora importar") + ainda assim segue para `awaiting_upload` (o pedido de upload é o ponto).

**Critério de aceitação:**
- [ ] Recap inclui ao menos: linha de performance (volume/profit/ROI da semana anterior), linha de estado mental (de `buildMentalState`, quando presente), linha de estudo (de `buildStudyWeek`, quando presente).
- [ ] Período do recap = semana anterior; chave da review = semana corrente (RF-01) — assert distinto.
- [ ] Semana sem dados → recap minimalista, sem crash, status avança para `awaiting_upload`.

### RF-05: Confirmação de upload (sinal explícito + fallback heurístico)
**Descrição:** o jogador confirma que importou o sharkscope dos últimos 7d via **sinal explícito** (botão na UI → `POST /api/coach/weekly-review/:weekStartDate/confirm-upload`). Fallback heurístico: se `storage.getLastUploadAt(userId)` for `< 24h` no momento da confirmação, considera confirmado mesmo sem sinal. **Sinal explícito vence** (sempre confirma quando o endpoint é chamado, independente do heurístico).

**Regras de negócio:**
- Só confirma quando a review está em `awaiting_upload`. Se em `recap_sent` (recap postado mas CTA não), confirmar avança `recap_sent→awaiting_upload→upload_confirmed` apenas se o estado permitir; caso contrário rejeita com `invalid_weekly_review_transition`. (Manter simples: o endpoint exige `awaiting_upload`.)
- Na confirmação válida: transiciona `awaiting_upload→upload_confirmed`, depois dispara a deep analysis (RF-06) de forma síncrona-best-effort, depois transiciona `upload_confirmed→deep_analysis_done`. Se a deep analysis falhar, a review permanece em `upload_confirmed` (re-confirmar reprocessa) — logar (lesson #9).
- Heurístico: registrar no payload de resposta qual sinal foi usado (`source: 'explicit' | 'recent_import'`). Se nem explícito (endpoint sempre é explícito) — o heurístico só decide quando NÃO houve import recente: nesse caso ainda confirma (o jogador clicou o botão), mas a resposta sinaliza `uploadDetected: false` para a UI poder avisar "não detectei import recente, confirme que importou mesmo".
- Idempotência: confirmar com review já em `deep_analysis_done`/`planning` → no-op, retorna review atual (não reprocessa análise).

**Critério de aceitação:**
- [ ] `POST .../confirm-upload` em `awaiting_upload` → review em `deep_analysis_done` (caminho feliz) + análise postada.
- [ ] `getLastUploadAt < 24h` → resposta `{ uploadDetected: true, source: 'recent_import' }`.
- [ ] `getLastUploadAt` ausente/antigo → ainda confirma (botão), resposta `{ uploadDetected: false, source: 'explicit' }`.
- [ ] Confirmar com review inexistente → 404 `weekly_review_not_found`.
- [ ] Confirmar 2x → segunda é no-op (sem segunda análise, sem segunda mensagem de análise).
- [ ] Deep analysis falha → review fica em `upload_confirmed`; re-confirmar reprocessa.

### RF-06: Deep analysis 7d (determinística-first) postada no chat
**Descrição:** na confirmação de upload, o mentor roda a análise profunda 7d combinando: histórico (`tournaments WHERE grind_session_id IS NULL`, últimos 7d), grind reports (`break_feedbacks` + `finalNotes`), e estudo (tempo/mãos/filtros/tempo-por-tema/entradas `stat_analysis` do EST-3). Reusa `gatherBundle` + `buildMentalState` + `buildStudyWeek` (já combinam as 3 fontes). Posta um turno do mentor no chat (RF-03) com a síntese.

**Regras de negócio (DEC-1 — determinística-first):**
- Construir a análise a partir dos builders determinísticos do EST-2 + os deltas vs a semana anterior. **Sem chamada LLM neste sprint** (ver DEC-1 tradeoff). A narrativa do mentor é montada por template PT-BR a partir dos números (fadiga, leak, ratio grind/estudo, top temas).
- §6.1: a deep analysis usa o **histórico** (`grind_session_id IS NULL`), não `session_tournaments` (esta é a fonte do Daily Debrief, não do weekly/7d). Documentar para o test-writer.
- FX→USD (lesson #6) — herdado dos builders.
- Falha de qualquer gather degrada para `[]` (lesson #9 — `safe()` já existe no generator); a análise nunca crasha o endpoint.

**Critério de aceitação:**
- [ ] Análise postada no chat contém: bloco de performance 7d, bloco mental (de `break_feedbacks`), bloco de estudo (counts/tempo/temas + entradas `stat_analysis`).
- [ ] Usa fonte de histórico `grind_session_id IS NULL` (não `session_tournaments`).
- [ ] Nenhuma chamada Anthropic é feita (assert: o mock do `callReportLlm`/cliente Anthropic não é invocado).
- [ ] Gather parcial (uma fonte vazia) → análise ainda é postada com a fonte disponível.

### RF-07: Handoff para planning (EST-6)
**Descrição:** ao concluir a deep analysis (`deep_analysis_done`), o mentor encaminha para o planejamento da próxima semana chamando `startPlanning(userId, weekStartDate, { source: 'est5_ritual' })` (orquestrador EST-6 em `server/coach/planning/weeklyPlanningOrchestrator.ts`) e transiciona a review para `planning`.

**Regras de negócio:**
- `weekStartDate` passado a `startPlanning` = a mesma chave UTC da review (RF-01). Não recriar chaves; reusar `ymdUtc`/`nextMondayUtc`.
- `startPlanning` é idempotente (UNIQUE em `weekly_planning_sessions`) — chamar 2x retorna a sessão existente. EST-5 não precisa guardar contra isso, mas a transição `deep_analysis_done→planning` em si é guardada por RF-01.
- `source: 'est5_ritual'` (já é um `PlanningSource` válido em `shared/coach-planning.ts`).
- Postar no chat um turno do mentor "vamos montar o plano da semana?" linkando a aba de planejamento (RF-08) — CTA para a superfície do wizard, não uma rota inexistente (lesson #19).
- Tier defense-in-depth: `startPlanning` já revalida `getReportTier` e lança `tier_not_eligible`. Se o user deixou de ser elegível entre o tick e o handoff, capturar e logar; a review fica em `deep_analysis_done` (não avança para `planning`).

**Critério de aceitação:**
- [ ] Em `deep_analysis_done`, o handoff chama `startPlanning(userId, weekStartDate, { source: 'est5_ritual' })`.
- [ ] Review transiciona para `planning`.
- [ ] `startPlanning` chamado 2x (re-handoff) não cria 2 planning sessions (UNIQUE).
- [ ] `startPlanning` lança `tier_not_eligible` → review fica em `deep_analysis_done`, log emitido, sem crash.

### RF-08: Superfície "Revisão semanal" em `/coach-ai` + montagem do PlanningWizard (resolve o dark do EST-6)
**Descrição:** nova tab **"Revisão semanal"** no hub `/coach-ai` (`client/src/pages/CoachAI.tsx`, hoje `chat|reports|audit|prefs`). A tab renderiza a UI da máquina de estados do ritual e, no estado `planning`, monta `<PlanningWizard weekStartDate={...} />` (`client/src/components/coach/planning/PlanningWizard.tsx`). Critério-chave: **ao fim do EST-5, o usuário CHEGA ao wizard pelo ritual** (sem rota órfã).

**Regras de negócio:**
- Adicionar `'review'` ao array `HUB_TABS` + entrada em `TAB_META` (label "Revisão semanal", ícone p.ex. `CalendarCheck`). O hub usa `useTabFromUrl` → a tab é URL-persisted (`?tab=review`); confirmar que `useTabFromUrl` aceita o novo valor sem ajuste de config.
- `TabsTrigger` da nova tab precisa do `onClick` redundante (lesson #27 — Radix Tabs reage a `onMouseDown`; `fireEvent.click` em RTL não alterna sem o `onClick`). Espelhar o padrão já presente no `CoachAI.tsx`.
- O painel da tab consome `GET /api/coach/weekly-review/:weekStartDate` via `useQuery`. Se renderizado standalone sem `QueryClientProvider` em algum teste, isolar via ErrorBoundary local (lesson #29) — o `PlanningWizard` já faz isso; o painel novo deve seguir o mesmo padrão.
- Renderização por estado:
  - sem review (404): empty state "sua revisão de segunda aparece aqui" + (opcional) botão "iniciar revisão agora" → `POST /api/coach/weekly-review/start` (RF-09).
  - `recap_sent`/`awaiting_upload`: mostra o recap + CTA "confirmar upload" (→ `POST .../confirm-upload`).
  - `upload_confirmed`/`deep_analysis_done`: mostra a análise + CTA "montar plano da semana".
  - `planning`: monta `<PlanningWizard weekStartDate={review.weekStartDate} />`.
- O `weekStartDate` consumido pela UI = `ymdUtc(nextMondayUtc())` calculado no client a partir de um helper compartilhado OU lido de um endpoint "current review" (ver DEC-3). Não duplicar a lógica de chave de semana no client de forma divergente do server.
- Wouter: a rota `/coach-ai` já existe em `client/src/App.tsx:143`. **Nenhuma rota nova é necessária** — a tab vive dentro de `/coach-ai`. Confirmar (lesson #19) que nenhum CTA aponta para rota não-registrada.

**Critério de aceitação:**
- [ ] Tab "Revisão semanal" aparece no `/coach-ai` e é selecionável via `fireEvent.click` (onClick redundante presente).
- [ ] `?tab=review` persiste a tab no reload.
- [ ] Estado `planning` da review → `<PlanningWizard>` é renderizado e visível.
- [ ] CTA "montar plano da semana" leva ao wizard sem 404 (rota/superfície existe).
- [ ] Painel renderiza sem crashar quando a query falha (ErrorBoundary/empty state).
- [ ] Nenhum `data-href`/CTA aponta para rota fora de `client/src/App.tsx` (guard lesson #19).

### RF-09: Endpoints HTTP da Weekly Review
**Descrição:** novo módulo de rotas `server/routes/coachWeeklyReview.ts` registrado via `registerCoachWeeklyReviewRoutes(app, requireAuth)`, chamado dentro de `registerCoachRoutes` **ANTES** de `registerCoachAi1bRoutes` e do GET genérico de coach (prefixo `weekly-review` disjunto; guard test de colisão de rota, espelhando o que o EST-6 fez com `planning`). Handlers seguem o padrão `injectedStorage` 3º arg (lesson #34) — nunca vazam `next` do Express.

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/api/coach/weekly-review/start` | Cria/retorna a review da semana corrente (idempotente). Body: `{ weekStartDate?: YMD }` (default `nextMondayUtc`). 403 se tier `free`. | JWT |
| GET | `/api/coach/weekly-review/:weekStartDate` | Lê a review (estado + recap + análise). 404 se não existe. 400 se YMD inválido. | JWT |
| POST | `/api/coach/weekly-review/:weekStartDate/confirm-upload` | Confirma upload (sinal explícito), dispara deep analysis + handoff. Resp: `{ review, uploadDetected, source }`. 404 se review inexistente. 409/400 se transição inválida. | JWT |

**Regras de negócio:**
- `userId` resolvido de `req.user.userPlatformId ?? req.user.id` (mesmo helper do `coachPlanning.ts`).
- YMD validado por `YMD_REGEX` (reusar de `shared/coach-weekly-review.ts`, espelhando `coach-planning.ts`).
- Erro de tier (`tier_not_eligible`) → 403; transição inválida → 409 (`invalid_weekly_review_transition`); review inexistente → 404; ZodError de body → 400; resto → 500 com `console.error`.
- A confirmação NÃO precisa receber o CSV (o upload já aconteceu via `/upload`); é apenas o sinal de "já importei".

**Critério de aceitação:**
- [ ] `POST .../start` Free → 403 `tier_not_eligible`.
- [ ] `GET .../:weekStartDate` inexistente → 404; YMD inválido → 400.
- [ ] `POST .../confirm-upload` caminho feliz → 200 `{ review.status: 'planning'|'deep_analysis_done', uploadDetected, source }`.
- [ ] Guard test confirma que `weekly-review` não é shadowado por rota genérica registrada antes.
- [ ] Handlers testáveis sem `vi.mock('../storage')` (injectedStorage 3º arg).

---

## Requisitos Não-Funcionais
- **Custo:** deep analysis é determinística (sem LLM) neste sprint — custo Anthropic = 0 para o ritual (DEC-1). O recap também é determinístico.
- **Idempotência:** 1 review/semana/user (UNIQUE), 1 recap, 1 deep analysis, 1 planning session (UNIQUE do EST-6). Reprocessamento controlado por estado.
- **Resiliência:** todo gather/post é `safe`/`try-catch` com log antes do fallback (lesson #9). Falha parcial não derruba o tick nem o endpoint.
- **Performance:** o tick hourly itera apenas `LIST_USERS_FOR_REPORTS_FILTER` + pre-check local-Monday/hora antes de qualquer query pesada (espelha bImport — barato por padrão).
- **Segurança:** ownership por `userId` (sem FK obrigatória, padrão do projeto). Endpoints sob `requireAuth`. Confirmar upload não aceita CSV (sem multipart novo).
- **Kill-switch:** `COACH_NUDGES_ENABLED=false` desliga o tick por completo (RF-02).

## Endpoints Previstos
Ver RF-09. Resumo: 3 endpoints sob `/api/coach/weekly-review/*`. Nenhuma rota frontend nova (vive dentro de `/coach-ai`).

## Modelos de Dados Afetados

### `weekly_reviews` (tabela nova) — migration `0089_weekly_reviews.sql`
Espelha `weekly_planning_sessions` (0088): chave UTC, UNIQUE user+week, sem CHECK de status no DB (Zod-only), nasce vazia (sem back-fill), sem FK (app valida ownership).

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PRIMARY KEY | `nanoid()` |
| user_id | varchar | NOT NULL | `userPlatformId` |
| week_start_date | date | NOT NULL | chave UTC via `ymdUtc` (semana corrente) |
| status | varchar(24) | NOT NULL DEFAULT `'recap_sent'` | `recap_sent\|awaiting_upload\|upload_confirmed\|deep_analysis_done\|planning` (Zod-only) |
| recap_content | jsonb | NULL | snapshot do recap (texto + métricas da semana anterior) |
| analysis_content | jsonb | NULL | snapshot da deep analysis 7d (preenchido em `deep_analysis_done`) |
| upload_source | varchar(16) | NULL | `'explicit'\|'recent_import'` (qual sinal confirmou) |
| planning_session_id | varchar | NULL | id da `weekly_planning_sessions` criada no handoff (rastreabilidade) |
| chat_session_id | varchar | NULL | id da sessão de chat de relatórios onde o ritual foi postado |
| created_at | timestamp | NOT NULL DEFAULT now() | |
| updated_at | timestamp | NOT NULL DEFAULT now() | |

**Constraint:** `UNIQUE (user_id, week_start_date)` (idempotência — reabrir mesma semana retorna existente).
**Índice:** o UNIQUE já cobre as queries por `(user_id, week_start_date)`. Não precisa índice extra (paridade 0088).
**Migration:** `migrations/0089_weekly_reviews.sql` + `_rollback.sql`. Aplicar via psql local (localhost:5433); **PENDENTE PROD (Neon) no deploy** — documentar em CLAUDE.md §6 (mesmo padrão de 0086/0087/0088). Sem `db:push` em prod sem aprovação.

### `shared/coach-weekly-review.ts` (arquivo novo)
Fonte única de verdade (espelha `shared/coach-planning.ts`): `WEEKLY_REVIEW_STATUSES`, type `WeeklyReviewStatus`, transições válidas (`VALID_TRANSITIONS` map), `WeeklyReview` interface, `YMD_REGEX` (reexport ou local), Zod schemas dos bodies (`startWeeklyReviewBodySchema`).

### `user_coach_preferences`
**Nenhuma coluna nova.** O ritual de segunda reusa `reportWeeklyEnabled` (já existe) como gate de opt-in (RF-02). Não criar pref nova (decisão de produto — o weekly É o ritual).

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| (nenhuma nova) | — | A deep analysis é determinística (DEC-1). O upload sharkscope usa o pipeline `/upload` já existente. |

## Cenários de Teste Derivados

### Happy Path
- [ ] Segunda 9h local, user elegível opt-in → review criada (`awaiting_upload`) + recap no chat → confirm-upload → deep analysis no chat (`deep_analysis_done`) → handoff `startPlanning` (`planning`) → tab "Revisão semanal" mostra `<PlanningWizard>`.

### Máquina de estados
- [ ] Transição inválida (`recap_sent`→`planning`) → `invalid_weekly_review_transition`.
- [ ] Status nunca regride; re-confirmar em `planning` = no-op.
- [ ] 2 inserts concorrentes da mesma semana → 1 row (UNIQUE).

### Gates
- [ ] `COACH_NUDGES_ENABLED=false` → tick no-op.
- [ ] Free/expired → skip (tick) / 403 (endpoint start).
- [ ] `reportWeeklyEnabled=false` → tick skip.
- [ ] Dia ≠ segunda OU hora ≠ alvo local → skip.

### Confirmação de upload
- [ ] Sinal explícito sem import recente → confirma, `uploadDetected: false`, `source: 'explicit'`.
- [ ] Import < 24h → `uploadDetected: true`, `source: 'recent_import'`.
- [ ] Confirmar review inexistente → 404.
- [ ] Confirmar 2x → segunda é no-op.

### Deep analysis
- [ ] Combina histórico (`grind_session_id IS NULL`) + `break_feedbacks`/`finalNotes` + estudo (incl. `stat_analysis` EST-3).
- [ ] Nenhuma chamada Anthropic (assert mock não invocado).
- [ ] Gather parcial → análise ainda postada.
- [ ] Deep analysis falha → review fica em `upload_confirmed`, re-confirmar reprocessa.

### Handoff
- [ ] `startPlanning(..., { source: 'est5_ritual' })` chamado com a chave UTC correta.
- [ ] Re-handoff não duplica planning session (UNIQUE).
- [ ] `tier_not_eligible` no handoff → review fica em `deep_analysis_done`, log.

### UI (`/coach-ai`)
- [ ] Tab "Revisão semanal" selecionável via `fireEvent.click` (lesson #27).
- [ ] `?tab=review` persiste.
- [ ] Estado `planning` → `<PlanningWizard>` montado e visível.
- [ ] Query falha → ErrorBoundary/empty state, sem crash (lesson #29).
- [ ] Guard: nenhum CTA aponta para rota não-registrada (lesson #19).

### Endpoints / colisão de rota
- [ ] `weekly-review` registrado ANTES das rotas genéricas; guard test de colisão.
- [ ] Handlers usam injectedStorage 3º arg (lesson #34).
- [ ] Mocks validados contra shape real do storage (lesson #3 — `getLastUploadAt`, `getOrCreateReportChatSession`, `insertChatMessage`, `createWeeklyReview`).

## Decisões de Design

### DEC-1: Deep analysis determinística-first, LLM deferido
**Decisão:** a deep analysis 7d (RF-06) é **determinística** — reusa `gatherBundle`/`buildMentalState`/`buildStudyWeek` (EST-2) e monta a narrativa do mentor por template PT-BR a partir dos números. **Sem chamada Anthropic neste sprint.**
**Tradeoff:**
- *Prós:* custo zero (cost discipline — o ritual roda toda segunda para todos os elegíveis; um LLM por user/semana escalaria custo linearmente). Determinismo facilita o TDD (assert sem mockar streaming Anthropic). Os builders EST-2 já combinam histórico+break+estudo, então a maior parte do valor analítico já é determinística. Latência baixa (síncrono no confirm-upload sem esperar LLM, evitando o cap de 60s do `COACH_LLM_TIMEOUT_MS`).
- *Contras:* narrativa menos "conversacional"/insight-rich que um LLM produziria. Sem correlação qualitativa automática (ex: "seu foco caiu no fim das sessões de PKO").
- *Mitigação / follow-up:* deixar um ponto de extensão claro (`buildDeepAnalysisNarrative(bundle)` puro) que um sprint futuro (EST-5.1) pode trocar por `callReportLlm` com fail-soft determinístico (mesmo padrão do `weeklyReportGenerator`). Documentar como pendência. O EST-2 já fez exatamente esse caminho (append de prompt, não ligou o `reportSummarizer` no weekly) — paridade.

### DEC-2: Onde montar o PlanningWizard — nova tab "Revisão semanal" em `/coach-ai`
**Decisão:** montar o wizard numa **nova tab do hub `/coach-ai`** (RF-08), não numa rota nova nem na aba `reports` existente.
**Tradeoff:**
- *Alternativa A (rota nova `/coach-ai/revisao`):* exigiria registrar rota em `App.tsx` + navegação; mais superfície, mais risco de CTA órfão (lesson #19). Rejeitada.
- *Alternativa B (dentro da aba `reports`):* a aba reports é uma timeline read-only de relatórios/nudges; misturar o ritual interativo lá polui a semântica. Rejeitada.
- *Escolhida (tab nova):* `/coach-ai` já é o hub do mentor, já é URL-persisted via `useTabFromUrl`, já tem o padrão de tabs com `onClick` redundante (lesson #27). A tab é a casa natural do ritual e do wizard. O ritual (recap→upload→análise→planning) tem uma progressão de estado que merece sua própria superfície. Custo: 1 entrada em `HUB_TABS`/`TAB_META` + 1 painel.

### DEC-3: Chave de semana no client — endpoint "current" vs cálculo client
**Decisão:** a UI obtém a `weekStartDate` corrente preferencialmente de `POST /api/coach/weekly-review/start` (que retorna a review com `weekStartDate` calculado no server) ou de um `GET` equivalente, evitando duplicar `nextMondayUtc` no client de forma divergente do server (CLAUDE.md §10 — não unificar/duplicar chaves de forma inconsistente).
**Tradeoff:** um helper client puro seria mais simples, mas arrisca drift UTC/local. Preferir o server como fonte da chave. O painel pode chamar `start` (idempotente) no mount para obter a review corrente.

### DEC-4: Chave UTC para a review (não BRT)
**Decisão:** `weekly_reviews.week_start_date` usa chave **UTC** (`ymdUtc`/`nextMondayUtc`), igual a `weekly_planning_sessions`/`study_weekly_plans`. O handoff a `startPlanning` passa a mesma chave UTC sem conversão.
**Tradeoff:** `coach_lesson_recommendations` usa BRT (CLAUDE.md §10) — mas o EST-6 já lida com a conversão UTC→BRT internamente (`brtMondayYmd` em `confirmLessons`). EST-5 nunca toca a chave BRT diretamente; só passa a chave UTC ao orquestrador, que faz a ponte. Não unificar.

## State Machine

```
        (cron tick segunda / POST start)
                    │
                    ▼
            ┌──────────────┐  postar recap+CTA no chat
            │  recap_sent  │──────────────────────────┐
            └──────────────┘                          ▼
                                            ┌────────────────────┐
                                            │  awaiting_upload   │
                                            └────────────────────┘
                                                      │ POST confirm-upload
                                                      ▼  (explicit | recent_import)
                                            ┌────────────────────┐
                                            │  upload_confirmed  │
                                            └────────────────────┘
                                                      │ deep analysis ok (RF-06)
                                                      ▼
                                            ┌────────────────────┐
                                            │ deep_analysis_done │
                                            └────────────────────┘
                                                      │ startPlanning (RF-07)
                                                      ▼
                                            ┌────────────────────┐
                                            │     planning       │ → <PlanningWizard>
                                            └────────────────────┘
```

**Transições válidas (somente avançar):**
`recap_sent→awaiting_upload`, `awaiting_upload→upload_confirmed`, `upload_confirmed→deep_analysis_done`, `deep_analysis_done→planning`.
**Inválidas:** qualquer salto, qualquer retrocesso, qualquer auto-loop → `invalid_weekly_review_transition`.
**Idempotência:** criar review (UNIQUE) é no-op se já existe; confirmar em estado terminal (`deep_analysis_done`/`planning`) é no-op; handoff em `planning` é no-op.

## Riscos
- **R-1 (chave UTC vs disparo local-Monday):** o tick dispara por "segunda 9h local" mas a chave é UTC (`nextMondayUtc`). Em fusos extremos (UTC+13/UTC-11) o "segunda local" pode mapear para uma `weekStartDate` UTC adjacente, causando recap numa semana-chave "deslocada". *Mitigação:* documentar; o EST-6 já vive com essa convenção UTC; aceitar o mesmo trade-off para paridade. Architect deve confirmar a borda no diagrama de sequência.
- **R-2 (review criada mas chat falhou):** se `insertChatMessage` falha após criar a review, a review fica em `recap_sent` e o próximo tick (review já existe) não re-posta. *Mitigação:* a UI da tab "Revisão semanal" mostra a review mesmo sem mensagem no chat (lê `recap_content` da própria review); aceitar como limitação. Alternativa futura: re-post no GET se `recap_sent` sem mensagem.
- **R-3 (deep analysis síncrona no confirm-upload):** rodar a análise no request HTTP adiciona latência. *Mitigação:* determinística (DEC-1) → rápida; sem LLM, sem cap de timeout. Se virar LLM no futuro, mover para enfileiramento (`report_jobs`).
- **R-4 (lesson #3 — mock shape real):** `getLastUploadAt` retorna `Date | null`; `getOrCreateReportChatSession` retorna `{ id, ... }`; `getBreakFeedbacksBySessionIds(userId, ids)` retorna array. Test-writer deve validar shapes reais (vistos em `coachSignalsStorage.ts`, `reportDelivery.ts`, `weeklyReportGenerator.ts`) — não mock idealizado.
- **R-5 (colisão de rota):** GET `/api/coach/...` genéricos registrados antes podem shadowar `/weekly-review/:weekStartDate`. *Mitigação:* registrar `registerCoachWeeklyReviewRoutes` ANTES + guard test de colisão (espelha EST-6/EST-3).
- **R-6 (PlanningWizard montado mas vazio):** se o handoff `startPlanning` falhar (tier downgrade), a review fica em `deep_analysis_done` e a tab não monta o wizard — mostra CTA "montar plano" que re-tenta. Aceitável.

## Fora de Escopo
- Lógica do plano detalhado (grind days/tempo/estudo/aulas/temas) — **EST-6 já shipou**. EST-5 só pluga o orquestrador no estado `planning`. NÃO recriar tools de planning (`bulk_propose_grade`, `schedule_study_block`, `recommend_lesson`, etc.).
- Chamada LLM na deep analysis (DEC-1 — deferido a EST-5.1).
- Mudança no conteúdo/estrutura do Weekly Report do EST-2 (reusar `gatherBundle`/builders como estão).
- Novo pipeline de upload/parse de sharkscope (reusar `/upload` + `parseSharkScopeFormat` existentes).
- Coluna de pref nova (reusa `reportWeeklyEnabled`).
- Entrega por email/in-app notif do ritual (EST-1 já cobre a entrega tripla dos relatórios; o ritual vive no chat + tab). Se desejado, follow-up.
- Email do recap de segunda como peça separada.

## Dependências
- **EST-1** (shipped): canal de chat de relatórios (`getOrCreateReportChatSession` + `insertChatMessage`), `reportDelivery.ts`.
- **EST-2** (shipped): `gatherBundle`, `buildMentalState`, `buildStudyWeek` em `server/services/weeklyReportGenerator.ts`; `break_feedbacks` enrichment.
- **EST-3** (shipped, migration 0087 pendente PROD): `study_sessions_v2` com `stat_analysis` (consumido pela deep analysis via study metrics).
- **EST-6** (shipped, migration 0088 pendente PROD): `weeklyPlanningOrchestrator.startPlanning`, `weekly_planning_sessions`, `PlanningWizard.tsx`, `shared/coach-planning.ts`, `weekKeys.ts`.
- **Infra cron:** `server/coach/cronRunner.ts` (registrar o novo `weeklyReviewMondayTick`), `server/coach/timezone.ts` (`getLocalHour` + helper de dia-da-semana local), `withAdvisoryLock`.
- **Eligibility:** `server/coach/reportEligibility.ts` (`getReportTier`, `LIST_USERS_FOR_REPORTS_FILTER`).
- **Storage signals:** `server/storage/coachSignalsStorage.ts` (`getLastUploadAt`, `listUsersForCron`), `getOrCreateReportChatSession`/`insertChatMessage`.

## Notas de Implementação (arquivos a tocar)

**Novos:**
- `migrations/0089_weekly_reviews.sql` + `migrations/0089_weekly_reviews_rollback.sql`
- `shared/coach-weekly-review.ts` (statuses, transições, types, Zod, YMD_REGEX)
- `server/coach/weeklyReview/weeklyReviewOrchestrator.ts` (máquina de estados: `createWeeklyReview`, `getWeeklyReview`, `advanceWeeklyReview`, `confirmUpload`, `runDeepAnalysis`, `handoffToPlanning`) — espelha `weeklyPlanningOrchestrator.ts`, `injectedStorage` 3º arg.
- `server/coach/weeklyReview/buildRecap.ts` + `buildDeepAnalysisNarrative.ts` (helpers puros; reusam builders EST-2; ponto de extensão LLM em DEC-1).
- `server/coach/jobs/weeklyReviewMonday.ts` (tick hourly; espelha `bImport.ts`).
- `server/routes/coachWeeklyReview.ts` (`registerCoachWeeklyReviewRoutes`).
- `server/storage/weeklyReviewStorage.ts` (CRUD `weekly_reviews`; `createWeeklyReview` com `onConflictDoNothing`+re-leitura, espelha `createWeeklyPlanningSession`).
- `client/src/components/coach/weekly-review/WeeklyReviewPanel.tsx` (UI da máquina de estados + monta `<PlanningWizard>` no estado `planning`; ErrorBoundary local).
- Schema Drizzle: adicionar `weeklyReviews` table + zod em `shared/schema.ts` (`weekly_reviews`).

**Alterados:**
- `client/src/pages/CoachAI.tsx` — `HUB_TABS` += `'review'`, `TAB_META` += entrada, `TabsContent value="review"`, `TabsTrigger` com `onClick` redundante (lesson #27).
- `server/coach/cronRunner.ts` — registrar `cron.schedule("0 * * * *", ...)` chamando `weeklyReviewMondayTick({})` via `withAdvisoryLock("cron:coach-weekly-review", ...)`.
- `server/coach/timezone.ts` — expor dia-da-semana local (se não existir) para o filtro local-Monday.
- registro de rotas do coach (onde `registerCoachPlanningRoutes` é chamado) — adicionar `registerCoachWeeklyReviewRoutes` ANTES de `registerCoachAi1bRoutes`.
- `CLAUDE.md` §6 — documentar migration 0089 PENDENTE PROD.

**Guard tests obrigatórios:**
- colisão de rota `weekly-review` (espelha `tests/integration/routes/est-3-route-collision.test.ts`).
- CTA→rota registrada (lesson #19) no painel novo.

**Pipeline:** este sprint vai para `system-architect` (diagrama de sequência do ritual + state machine + ADR-226 [224=EST-6, 225=EST-2; confirmar próximo livre] + diagrama de componentes da tab) antes do `test-writer`.
