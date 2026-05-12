# ADR-156: Aposentadoria dos 2 crons de segunda (`generateCoachRecommendations` 6h BRT + `generateWeeklyStudyPlan` 9h UTC) — absorvidos pelo Weekly Report; `coach_lesson_recommendations` e `study_weekly_plans` continuam preenchidas pelo gerador do report; chaves de semana mantidas (BRT pra rec, UTC pra plano); Free perde a rec de lesson automática semanal

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1B (`Docs/specs/sprint-ai-1b.md`, RF-05/07)

## Decision owner
system-architect (founder Q10 — "aposentar os 2 crons de segunda → absorver no Weekly Report")

## Related
- Depende de: ADR-155 (o gerador do Weekly Report — `generateWeeklyReport({ userId, periodStart, periodEnd })` — é onde os back-fills acontecem; o runner que aciona).
- Substitui o agendamento de: ADR-112 (`generateCoachRecommendations` — cron segunda 6h BRT, `coach_lesson_recommendations`), ADR-134 + estudos-coach-biblio-2 RF-3.3 (`generateWeeklyStudyPlan` — cron segunda 9h UTC, `study_weekly_plans`). **A lógica desses módulos é reaproveitada** (`recommendLessonForUser`, `generateWeeklyStudyPlan` o service) — só o `cron.schedule(...)` deles é desligado.
- Reusa: `getCurrentWeekStartBRT()` (`server/coach/weekHelper.ts`), `utcMondayOfWeek(...)` (em `server/jobs/generateWeeklyStudyPlan.ts`), `recommendLessonForUser` + `storage.createCoachRecommendation` (idempotente por `(userId, weekStartDate)`), `generateWeeklyStudyPlan` service + `storage.getStudyWeeklyPlan`/UPSERT, `coachMemory.ts` (sumarização Haiku), `coachSystemBuilder.ts` (STATIC + CITATIONS_RULES), `aiStructuredProfile.ts` (`tomPreferido`/`nivel`/`focoDoMes`), `detectLeaks`, `warmupService`, `walletService`/`bankrollService`, métodos de dashboard/analytics do `storage.ts` (filtram §6.1).
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{weekly-report-structure,report-job-runner-flow}.mermaid`.

---

## 1. Contexto

Hoje rodam 2 crons "de segunda":

1. **`generateCoachRecommendationsTick`** (`server/coach/jobs/generateCoachRecommendations.ts`) — schedule `0 6 * * 1` tz `America/Sao_Paulo` (registrado em `server/coach/cronRunner.ts`, gated por `COACH_NUDGES_ENABLED !== 'false'`). Itera users `subscription_plan IN ('free','pro','premium')`, gera 1 rec de lesson por user via `recommendLessonForUser` (5 tiers em cascata: short-circuit sem dados → Coach IA Anthropic → leak→tag → popular → recente → null), grava em `coach_lesson_recommendations` via `storage.createCoachRecommendation` (idempotente por `(userId, weekStartDate)` onde `weekStartDate = getCurrentWeekStartBRT()`). **Consumido** pelo frontend: `GET /api/home/coach-recommendation` (`server/routes/home-coach-recommendation.ts`) → `CoachRecommendationCard.tsx`, `EmptyPerformanceCluster.tsx`, `ImmediateAction.tsx`, `HomeSettingsGear.tsx` na página `/inicio`.

2. **`runWeeklyStudyPlan`** (`server/jobs/generateWeeklyStudyPlan.ts`, registrado via `server/jobs/index.ts`) — schedule `0 9 * * 1` UTC (= 06h BRT). Itera users elegíveis (`listUsersForWeeklyStudyPlanCron`, Pro+ com quota de coach), gera 1 plano semanal de estudo por user via `generateWeeklyStudyPlan` (`server/services/studyWeeklyPlanService.ts`), UPSERT em `study_weekly_plans` por `(userId, weekStartDate)` onde `weekStartDate = utcMondayOfWeek(new Date())`. **Consumido** pelo frontend: `StudyWeeklyPlanCard.tsx` (rota `server/routes/study-weekly-plan.ts`).

O founder (Q10) decidiu **aposentar os 2 crons de segunda** porque o Weekly Report (ADR-155) já cobre semanalmente os mesmos territórios: a seção 4 (Estudos) inclui a rec de lesson da semana; a seção 7 (Plano da próxima semana) inclui o plano de estudo. Manter 3 crons fazendo trabalho sobreposto na segunda-feira é redundância (e custo Anthropic ×2 desnecessário). **Mas:** o frontend de `/inicio` e o `StudyWeeklyPlanCard` consomem essas tabelas e **não mudam neste sprint** — então as tabelas precisam continuar sendo preenchidas, só que por outro acionador.

A pergunta central: **o que desliga; o que migra; o destino dos dados (`coach_lesson_recommendations` / `study_weekly_plans` continuam preenchidos pelo gerador do report — quem consome no frontend); as chaves de semana; o trade-off (Free perde a rec de lesson automática semanal — aceitável?).**

### Restrições

- **Não regredir os consumidores existentes** — `GET /api/home/coach-recommendation` lê `coach_lesson_recommendations` com a chave `getCurrentWeekStartBRT()`; `StudyWeeklyPlanCard` lê `study_weekly_plans` com a chave `utcMondayOfWeek`. As tabelas precisam continuar preenchidas **com as mesmas chaves de semana** — senão os reads quebram.
- **Não migrar as chaves de semana pro fuso do user** — fora de escopo (risco de regressão nos consumidores; o Weekly Report usa `period_start` no fuso do user, mas a rec de lesson e o plano de estudo continuam gravados com BRT/UTC respectivamente, por back-compat). Duas noções de "semana" coexistem (documentado).
- **Idempotência** — todas as gravações são idempotentes por chave de semana; se por algum motivo um cron antigo ainda rodar (rollback parcial), nada duplica.
- **Não deletar os módulos antigos** — `generateCoachRecommendations.ts` e `generateWeeklyStudyPlan.ts` viram dead code agendado (com comentário "DEPRECATED — agendamento removido no AI-1B; lógica reaproveitada pelo Weekly Report") — reduz risco de quebra; a lógica continua sendo importada/usada pelo gerador do report.
- **Lessons:** #5/#35 (`new AnthropicCtor` mock — try/catch + fallback factory), #9 (logar antes de fallback / `try/catch` por user no batch), #10 (DRY de prompts — prompt do gerador num módulo único), #6 (conversão USD), CLAUDE.md §6.1 (queries de histórico filtram `grind_session_id IS NULL`).

---

## 2. Opções consideradas

### 2.1 Quem preenche `coach_lesson_recommendations` e `study_weekly_plans` depois da aposentadoria

**Opção A — o gerador do Weekly Report (`generateWeeklyReport`) chama `recommendLessonForUser` + `storage.createCoachRecommendation` (na seção 4) e `generateWeeklyStudyPlan` o service + UPSERT (na seção 7), com as chaves de semana antigas (ESCOLHIDA).**
- **Prós:** o frontend de `/inicio` e o `StudyWeeklyPlanCard` continuam funcionando sem mudança nenhuma; reaproveita 100% da lógica existente (`recommendLessonForUser` com seus 5 tiers + fallbacks determinísticos, `generateWeeklyStudyPlan` o service); o gerador do report **já** vai chamar essas funções pra montar as seções 4 e 7 — gravar o resultado nas tabelas é "de gracinha"; consolidação real (1 cron de segunda em vez de 3); custo Anthropic não sobe (a rec de lesson Tier 1 e o plano de estudo já chamariam o Anthropic dentro do gerador).
- **Contras:** quem **não** recebe o Weekly Report (Free; Pro+ sem opt-in) deixa de ter a rec de lesson automática semanal e o plano de estudo automático. Trade-off (ver §2.2).

**Opção B — manter um cron leve "de segunda" que gera só a rec de lesson + o plano de estudo pra todos os users elegíveis dos crons antigos (sem o relatório), e o Weekly Report apenas reaproveita o que já foi gravado.**
- **Prós:** zero regressão pros consumidores existentes (todo mundo continua tendo a rec/plano).
- **Contras:** não consolida nada — ainda há um cron de segunda fazendo trabalho de geração (chama o Anthropic); a "aposentadoria" vira "renomeação"; mais código pra manter. **Rejeitada como solução de partida** — fica documentada como **follow-up** se o founder considerar a regressão (Free perde a rec) inaceitável (é trocar uma constante de filtro + re-ativar um tick leve).

**Opção C — deletar os módulos antigos e não preencher mais as tabelas; mudar o frontend pra ler do `reports.content`.**
- **Contras:** mexe no frontend de `/inicio` e no `StudyWeeklyPlanCard` (fora de escopo deste sprint; risco de regressão grande); o `reports` row só existe pra quem recebe o Weekly Report (Pro+ opt-in) — os outros ficariam sem nada. **Rejeitada.**

### 2.2 Trade-off — Free perde a rec de lesson automática semanal

**Decisão:** começar com a versão simples (Opção A — a rec de lesson e o plano de estudo passam a ser gerados **só pra quem recebe o Weekly Report**, ou seja Pro+ opt-in). Consequência: **Free deixa de ter a rec de lesson automática semanal** (hoje o `generateCoachRecommendations` rodava pra `'free','pro','premium'`); **Pro+ que não optou pelo report deixa de ter a rec automática**. Mitigação: a rec de lesson volta a aparecer pro user via o chat / a tool `recommend_lesson` quando ele pede; o `GET /api/home/coach-recommendation` simplesmente não terá row pra esses users (o frontend já trata "sem rec" → mostra outro card / fallback). **Founder autorizou aposentar os crons** — o trade-off está dentro do espírito de Q10. Se for considerado regressão inaceitável, a Opção B (cron leve pra todos) está documentada como follow-up barato.

### 2.3 Como desligar os crons antigos

**Decisão:** remover (ou comentar com referência a este ADR/sprint) o `cron.schedule("0 6 * * 1", ...)` de `generateCoachRecommendationsTick` em `server/coach/cronRunner.ts`; remover (ou no-op com log "deprecated — absorbed by Weekly Report") a chamada `registerWeeklyStudyPlanCron()` de `server/jobs/index.ts`. Os módulos `generateCoachRecommendations.ts` e `generateWeeklyStudyPlan.ts` **não são deletados** (a lógica é reaproveitada pelo gerador do report; um comentário "DEPRECATED — agendamento removido no AI-1B" no topo). O `generateCoachRecommendationsTick` (a função de tick) pode continuar exportada e até ser chamada manualmente/em testes, mas não está mais agendada.

### 2.4 Chaves de semana

**Decisão:** mantidas como estão, por back-compat com os consumidores:
- `coach_lesson_recommendations.week_start_date` = `getCurrentWeekStartBRT()` (segunda 00:00 BRT da semana corrente). O `GET /api/home/coach-recommendation` lê com essa chave — não mudar.
- `study_weekly_plans.week_start_date` = `utcMondayOfWeek(new Date())` (segunda 00:00 UTC). O `StudyWeeklyPlanCard` lê com essa chave — não mudar.
- O Weekly Report usa `period_start` = segunda da semana que acabou **no fuso do user** (date). **Três noções de "semana" coexistem** — a do report (fuso do user, semana que acabou), a da rec de lesson (BRT, semana corrente), a do plano de estudo (UTC, semana corrente). O gerador, ao montar as seções 4 e 7, computa as chaves BRT/UTC a partir do `now` (não do `periodStart` do report) e grava com essas chaves. Documentado no ADR + nas notas de implementação.

---

## 3. Decisão

### 3.1 Desligamento

- `server/coach/cronRunner.ts` — remove/comenta o `cron.schedule("0 6 * * 1", ..., { timezone: "America/Sao_Paulo" })` que chamava `generateCoachRecommendationsTick` (com comentário "AI-1B / ADR-156 — absorbido pelo Weekly Report").
- `server/jobs/index.ts` — remove a chamada `await registerWeeklyStudyPlanCron()` de `registerAllJobs()` (ou faz `registerWeeklyStudyPlanCron` virar no-op com `console.info("[cron/weeklyStudyPlan] DEPRECATED — agendamento removido no AI-1B; absorbido pelo Weekly Report")`).
- `server/coach/jobs/generateCoachRecommendations.ts` e `server/jobs/generateWeeklyStudyPlan.ts` — comentário "DEPRECATED — agendamento removido no AI-1B (ADR-156); lógica reaproveitada por `generateWeeklyReport`". Não deletados.

### 3.2 Back-fills no gerador do Weekly Report (`server/services/weeklyReportGenerator.ts` — ver ADR-155)

Dentro de `generateWeeklyReport({ userId, periodStart, periodEnd, injectedStorage? })`, ao montar:
- **Seção 4 (Estudos)** — chama `recommendLessonForUser({ userId, leaks, analytics, activeProfile, lastConsumedLessonIds, catalogLessons, weekStartDate: weekStartIso(getCurrentWeekStartBRT(now)) })` (mesmos inputs que o `generateCoachRecommendationsTick` montava — reusar o helper `gatherInput` desse módulo se possível); grava o resultado via `storage.createCoachRecommendation({ userId, lessonId, weekStartDate: weekStartIso(getCurrentWeekStartBRT(now)), reason, source, inputSummary, chatSessionId })` — idempotente (o storage faz pré-check ou ON CONFLICT por `(userId, weekStartDate)`). O `content.sections.study.recommendedLesson` carrega `{ lessonId, title, reason, ctaHref }`.
- **Seção 7 (Plano da próxima semana)** — chama `generateWeeklyStudyPlan({ userId, source: 'coach_auto', weekStartDate: utcMondayOfWeek(now) })` (UPSERT idempotente). O `content.nextWeekPlan.weeklyStudyPlanRef` carrega `{ weekStartDate: utcMondayOfWeek(now).toISOString().slice(0,10) }`.

Ambos com `try/catch` granular (lesson #9 — falha de back-fill não deve derrubar o relatório inteiro; loga e segue com `recommendedLesson: null` / `weeklyStudyPlanRef: null`). Os fallbacks determinísticos de `recommendLessonForUser` (Tier 3 popular, Tier 4 recente) e `generateWeeklyStudyPlan` (se tiver) garantem conteúdo mesmo quando o Anthropic falha — então **mesmo no fail-soft do report** (ADR-155 §3.2), as seções 4 e 7 podem ter conteúdo via os fallbacks deles.

### 3.3 Idempotência cruzada

Se um cron antigo ainda rodar (rollback parcial), o gerador do report não duplica nada — `createCoachRecommendation` é idempotente por `(userId, weekStartDate)`, `generateWeeklyStudyPlan` faz UPSERT por `(userId, weekStartDate)`. Sem risco de duplicação.

### 3.4 Quem gera pra quem

A rec de lesson + o plano de estudo passam a ser gerados **só pra quem recebe o Weekly Report** (Pro+ com `reportWeeklyEnabled === true`). Free e Pro+ sem opt-in deixam de ter a geração automática semanal (trade-off documentado — §2.2). Follow-up barato disponível (Opção B) se o founder reclamar.

---

## 4. Consequências

### Positivas
- 1 cron de segunda em vez de 3 — consolidação real; menos código agendado pra manter.
- Custo Anthropic não sobe (a rec de lesson Tier 1 e o plano de estudo já chamariam o Anthropic dentro do gerador do report; gerar nas tabelas é "de gracinha").
- Os consumidores existentes (`/inicio` cards, `StudyWeeklyPlanCard`) continuam funcionando sem mudança — as tabelas continuam preenchidas com as mesmas chaves.
- Reaproveita 100% da lógica existente (`recommendLessonForUser`, `generateWeeklyStudyPlan` o service) — sem reescrever nada.
- Idempotência cruzada — rollback parcial não duplica.

### Negativas / trade-offs
- **Free perde a rec de lesson automática semanal**; Pro+ sem opt-in também. Mitigação: rec via chat / tool `recommend_lesson` on-demand; o frontend já trata "sem rec". Follow-up (Opção B — cron leve pra todos) documentado se inaceitável.
- **Três noções de "semana" coexistem** (report = fuso do user/semana que acabou; rec de lesson = BRT/semana corrente; plano de estudo = UTC/semana corrente) — confunde quem lê o código de relance. Documentado no ADR e nas notas; o ADR-155/156 + os comentários no gerador deixam explícito. Migrar tudo pra um padrão único é fora de escopo (risco de regressão).
- Os módulos antigos viram dead code agendado (mas a lógica deles é reaproveitada) — limpeza completa (deletar) fica pra um sprint futuro quando o frontend migrar pra ler do `reports.content`.

### Neutras
- O `cronRunner.ts` mantém os outros 3 schedules de proatividade (cleanup pending, B-SNAPSHOT, B-STUDY) + ganha referência ao ADR-157 (B-GAPCHECK/B-IMPORT) — ou esses ficam no `reportJobRunner.ts`/`server/coach/jobs/` (system-architect/implementer decide o lugar; ver ADR-157).

---

## 5. Notas para o test-writer

- **Aposentadoria:** verificar que `cronRunner.ts` não chama mais `cron.schedule("0 6 * * 1", ...)` (o `generateCoachRecommendationsTick` não está agendado); que `registerAllJobs()` não registra mais o `registerWeeklyStudyPlanCron` ativo (removido ou no-op com log "deprecated").
- **Back-fills:** o gerador do Weekly Report, rodado pra um user Pro+ opt-in, cria/UPSERTa uma row em `coach_lesson_recommendations` (chave `(userId, getCurrentWeekStartBRT(now))`) e uma row em `study_weekly_plans` (chave `(userId, utcMondayOfWeek(now))`) — verificável via mocks de `storage.createCoachRecommendation` / `storage.getStudyWeeklyPlan` / `generateWeeklyStudyPlan`. Rodar 2× pro mesmo user/semana → nenhuma duplicata (idempotência).
- **Back-compat:** `GET /api/home/coach-recommendation` continua retornando a rec da semana corrente após o report rodar; `StudyWeeklyPlanCard` continua funcionando (a row em `study_weekly_plans` existe).
- **Mock do Anthropic no gerador:** lesson #5/#35 — `new AnthropicCtor(...)` que é um `vi.fn()` mock não pode quebrar (try/catch + fallback factory; mesmo padrão de `recommendLessonForUser.tryCoachIA`). Sem `ANTHROPIC_API_KEY` → o gerador cai pro determinístico direto (ADR-155); mas as seções 4 e 7 ainda podem ter conteúdo via os fallbacks determinísticos de `recommendLessonForUser` (Tier 3/4) e `generateWeeklyStudyPlan`.
- **`try/catch` por back-fill:** falha de `createCoachRecommendation` / `generateWeeklyStudyPlan` não derruba o relatório — loga (lesson #9) e segue com `recommendedLesson: null` / `weeklyStudyPlanRef: null`.
- **(Documentado, não necessariamente testado):** Free não recebe mais a rec de lesson automática semanal — comportamento esperado.
- **Lessons:** #3 (mock valida shape real — `recommendLessonForUser`/`generateWeeklyStudyPlan` têm shapes específicos), #9, #10 (prompt do gerador num módulo único — não duplicar o prompt do `recommendLessonForUser`), #6 (USD), CLAUDE.md §6.1.

## 6. Referências

- Spec: `Docs/specs/sprint-ai-1b.md` (RF-05/07)
- Decisões do founder: `memory/ai_agents_improvement_plan_2026-05-11.md` (Q10)
- ADR-155 (report_jobs/reports + runner + gerador), ADR-112 (`generateCoachRecommendations` original), ADR-134 (studyWeeklyPlanService orquestrador), ADR-113 (`recommendLessonForUser`)
- Módulos: `server/coach/jobs/generateCoachRecommendations.ts`, `server/jobs/generateWeeklyStudyPlan.ts`, `server/coach/recommendLessonForUser.ts`, `server/services/studyWeeklyPlanService.ts`, `server/coach/weekHelper.ts`, `server/routes/home-coach-recommendation.ts`, `server/routes/study-weekly-plan.ts`
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{weekly-report-structure,report-job-runner-flow}.mermaid`
- CLAUDE.md §6.1, §9
