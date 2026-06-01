# Spec: EST-6 — Next-Week Planning Flow

> Parte do overhaul Estudos + Mentor IA. Master plan: `Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md` §EST-6 + §0.
> Pipeline TDD: `pm-spec (este) → system-architect → test-writer → implementer → /simplify → reviewer`.

## Status
Proposta

## Resumo
O mentor (Coach AI) guia o jogador, passo a passo, a montar o plano da **próxima** semana: quais dias e quantas horas de grind, quais blocos de estudo e por quanto tempo, quais aulas assistir e quais temas focar. EST-6 é a etapa final do ritual de segunda (EST-5, estado `planning`), mas entrega **standalone e pluggável**: existe e roda mesmo sem EST-5, expondo um ponto de entrada que o estado `planning` chamará quando EST-5 existir.

## Contexto
O founder quer que o mentor não pare na análise — depois de revisar a semana passada, ele deve **conduzir a construção do plano da próxima**. Hoje:
- O `weeklyReportGenerator` já gera um `study_weekly_plans` (UPSERT idempotente por `(user_id, week_start_date)` UTC) e `coach_lesson_recommendations` (UNIQUE `(user_id, week_start_date)` BRT), mas o jogador não tem um fluxo **interativo** que combine grade + estudo + aulas + temas-foco em uma sessão guiada.
- As 4 ações de escrita necessárias **já existem como write-tools** (AI-2A): `bulk_propose_grade`, `schedule_study_block`, `recommend_lesson`, `mark_off_day`. EST-6 **orquestra** esses tools, não os recria.

EST-6 amarra essas peças em um fluxo conversacional de 4 sub-decisões, idempotente por semana, sem duplicar chaves de semana já existentes.

## Usuários
- **Jogador (Trial / Pro / Premium / Admin):** conduz o plano respondendo ao mentor. Tier gating herdado dos tools de escrita (`gateByTier: ['pro','premium','admin']` + Trial passa via `getReportTier`/`isToolEligibleTier`).
- **Coach AI (mentor):** propõe cada sub-decisão (com base em leaks, histórico, focus stats e análise da semana), executa via os tools existentes mediante confirmação do jogador.
- **EST-5 (futuro, consumidor):** o estado `planning` da máquina de estados Weekly Review chamará o ponto de entrada de EST-6 (`POST /api/coach/planning/start`).

---

## Decisões de design recomendadas (para o architect refinar)

### DEC-1 — Forma do flow: orquestrador backend stateless + UI conversacional (RECOMENDADO)
**Escolha:** Orquestrador **backend** que define os 4 passos do flow + um **estado leve persistido** (tabela `weekly_planning_sessions`), consumido por uma **UI conversacional/wizard embutida no chat do Coach** em `/coach-ai`. NÃO uma máquina de estados própria duplicando EST-5; NÃO um wizard puramente client-side.

**Justificativa:**
- **Pluggabilidade EST-5:** o estado `planning` do EST-5 precisa "abrir" o flow de EST-6 e saber quando ele terminou. Um ponto de entrada backend (`startPlanning`) + um estado consultável (`getPlanningSession`) dão esse contrato sem acoplar EST-6 à máquina de estados do EST-5.
- **Idempotência por semana** (DEC-3) precisa de servidor — não dá pra confiar só no client.
- **A UI vive no chat** porque D3 (master plan) definiu o ritual como conversacional. O wizard é renderizado **dentro** do chat do Coach (cards de step com CTAs), não uma página separada — evita lesson #19 (CTA → rota Wouter inexistente) e reusa a superfície que o jogador já vê.
- **Os 4 passos não são uma state machine pesada:** são uma lista ordenada de sub-decisões (grind → estudo → aulas → temas) com status por passo (`pending|proposed|confirmed|skipped`). O orquestrador só rastreia "em que passo estamos + o que já foi confirmado". A execução de cada passo delega aos tools AI-2A (que têm seu próprio confirm/undo).

**Rejeitado:** state machine própria persistida com transições rígidas (over-engineering para 4 passos lineares + colide conceitualmente com a máquina do EST-5). Rejeitado também stateless puro derivando de `study_weekly_plans`+`planned_tournaments` (DEC-5 explica por quê: não dá pra distinguir "passo pulado" de "ainda não feito", nem reentrada idempotente confiável).

### DEC-2 — Mapa das 4 sub-decisões → tools existentes
| Passo | Sub-decisão | Tool / persistência | Confirmação |
|---|---|---|---|
| 1 | Dias + horas de grind | `bulk_propose_grade` → `planned_tournaments` | requiresConfirmation (preview → confirm) |
| 2 | Blocos de estudo | `schedule_study_block` → `study_sessions_v2` (status=`planned`), N blocos + **UPSERT `study_weekly_plans`** (snapshot do plano) | requiresConfirmation por bloco |
| 3 | Aulas a assistir | `recommend_lesson` → `coach_lesson_recommendations` (UNIQUE `(user_id, week_start_date)` BRT) | sem confirm destrutiva (write leve) |
| 4 | Temas-foco | derivados de `getStatsLeaks(userId, n)` + `user_focus_stats` (read-only; sugestão exibida, sem write novo — ou opcionalmente `mark_off_day` se o jogador pedir folga) | seleção exibida no resumo |

> `mark_off_day` entra como **ação auxiliar** dentro do passo 1 (se o jogador disser "quero folga na quarta", o mentor chama `mark_off_day` antes do `bulk_propose_grade`).

### DEC-3 — Idempotência: 1 planning session por semana, reusando chaves existentes
- `weekly_planning_sessions` tem UNIQUE `(user_id, week_start_date)`. `week_start_date` armazenado como **DATE UTC** via `ymdUtc()` (mesma convenção de `study_weekly_plans` — `studyWeeklyPlanService.ts:85`). Reabrir a mesma semana retorna a sessão existente (não cria nova).
- O passo 2 faz **UPSERT** em `study_weekly_plans` pela chave UTC existente — **não cria chave nova**. Os blocos individuais (`study_sessions_v2` planned) são criados via `schedule_study_block` e o `study_weekly_plans.planJsonb` é re-sincronizado como snapshot.
- O passo 3 grava `coach_lesson_recommendations` pela chave **BRT** existente (CLAUDE.md §10: rec usa BRT, study plan usa UTC — EST-6 respeita ambas, não unifica).
- Re-executar um passo já confirmado **substitui** a proposta anterior daquele passo (não acumula). `bulk_propose_grade`/`schedule_study_block` já têm `undo`; EST-6 deve chamar undo do passo antes de re-propor (ou confiar no `already_in_grade`/dedup intra-pacote do `bulk_propose_grade`).

### DEC-4 — Tier gating herdado
- O ponto de entrada `startPlanning` valida `getReportTier(user) !== 'free'` (Trial/Pro/Premium/Admin = `eligible`; free/expired negado), **espelhando** a elegibilidade do ritual EST-5/reports.
- Cada tool de escrita revalida seu próprio `gateByTier` no `executeConfirmed` (não confiar só no gate de entrada — defense in depth). Free nunca chega aqui, mas o tool nega de qualquer forma.

### DEC-5 — Persistência do estado: tabela nova `weekly_planning_sessions` (migration) — RECOMENDADO
**Escolha:** migration nova. NÃO stateless.

**Tradeoff avaliado:**
- *Stateless* (derivar de `study_weekly_plans` + `planned_tournaments`): barato (zero migration) mas **não distingue "passo pulado conscientemente" de "ainda não feito"**, não rastreia ordem/progresso do flow, não dá reentrada idempotente confiável, e não expõe um sinal limpo de "planning concluído" pro EST-5. Reconstruir o estado do flow a cada request é frágil e ambíguo.
- *Tabela nova* (recomendado): custo de 1 migration + rollback, mas dá estado explícito, idempotência por `(user_id, week_start_date)`, e o contrato `status` que EST-5 consome (`planning_complete`). Tabela é pequena (1 row/usuário/semana).

---

## Requisitos Funcionais

### RF-01: Iniciar uma planning session (ponto de entrada pluggável)
**Descrição:** expõe um ponto de entrada que cria (ou retorna idempotentemente) a planning session da próxima semana. Chamável pela UI do `/coach-ai` E pelo estado `planning` do EST-5 (futuro).
**Regras de negócio:**
- `week_start_date` = próxima segunda (default) ou a fornecida pelo caller (EST-5 passa a semana do ritual). Normalizada para DATE UTC via `ymdUtc`.
- Gate: `getReportTier(user) !== 'free'`. Free/expired → 403.
- Idempotente: se já existe sessão para `(user_id, week_start_date)`, retorna a existente com seu estado atual (não recria, não reseta passos confirmados).
- Cria os 4 passos com status inicial `pending`.
**Critério de aceitação:**
- [ ] `POST /api/coach/planning/start` com tier elegível cria 1 row em `weekly_planning_sessions` e retorna os 4 passos `pending`.
- [ ] Chamar 2x na mesma semana retorna a MESMA sessão (mesmo id, passos preservados) — não duplica row (UNIQUE viola → retorna existente).
- [ ] Tier `free`/`expired` → 403 sem criar row.
- [ ] EST-5 (mock) consegue chamar a função orquestradora `startPlanning(userId, weekStartDate)` diretamente (export reutilizável, não só via HTTP).

### RF-02: Passo 1 — propor dias + horas de grind
**Descrição:** o mentor propõe a grade da semana (dias + torneios) via `bulk_propose_grade`. O jogador confirma, ajusta dias, ou pede folga (`mark_off_day`).
**Regras de negócio:**
- A proposta usa `bulk_propose_grade.fetchPayloadBefore` (preview, não persiste) → exibida como card no chat.
- Confirmação → `bulk_propose_grade.executeConfirmed` cria `planned_tournaments` da semana.
- "Quero folga no dia X" → `mark_off_day` antes de re-propor (o off-day vira `off_day` conflict no preview seguinte).
- Re-propor após confirmar: chama `undo` da proposta anterior OU confia no dedup `already_in_grade` do tool. Documentar a escolha no architect.
- Marca `step.grind.status = 'confirmed'` (ou `skipped` se o jogador pular).
**Critério de aceitação:**
- [ ] Preview do passo 1 retorna `proposed[]` + `conflicts[]` + `summary` sem persistir (assert: nenhum `planned_tournaments` criado no preview).
- [ ] Confirmar persiste via `executeConfirmed`; `step.grind.status='confirmed'` + `createdIds` registrados na planning session.
- [ ] `mark_off_day('quarta')` faz a próxima proposta excluir a quarta (conflict `off_day`).
- [ ] Pular o passo seta `status='skipped'` sem criar `planned_tournaments`.

### RF-03: Passo 2 — propor blocos de estudo + sincronizar study_weekly_plans
**Descrição:** o mentor propõe N blocos de estudo (tópico, dia/hora, duração, tema/aula opcional) via `schedule_study_block`; ao confirmar, cria os blocos `planned` e **faz UPSERT do snapshot em `study_weekly_plans`** pela chave UTC existente.
**Regras de negócio:**
- Cada bloco → `schedule_study_block.executeConfirmed` (valida ownership de tema + entitlement de aula; nega `theme_not_accessible`/`lesson_not_accessible`).
- Após confirmar os blocos, EST-6 monta o `planJsonb` no shape de `study_weekly_plans` (`{days:[{dayLabel,date,activities:[{itemId,type,title,description,estimatedMinutes,ctaTarget,themeId,lessonId,handIds,reasoning}]}]}`) e chama `storage.upsertStudyWeeklyPlan({userId, weekStartDate, planJsonb, source:'coach_manual'})`.
- **NÃO duplica chave de semana:** usa `weekStartDate` UTC já existente; `source='coach_manual'` distingue do `coach_auto` do weekly report.
- `ctaTarget` de cada activity DEVE casar com rota Wouter registrada (lesson #19 — architect/impl: grep `Route path` em `client/src/App.tsx`; aula → `/biblioteca/curso/:courseSlug/:lessonSlug/play`).
**Critério de aceitação:**
- [ ] Confirmar um bloco cria `study_sessions_v2` com `status='planned'` + os campos `topic/startAt/durationMinutes/themeId/lessonId`.
- [ ] Bloco com `studyThemeId` de outro usuário → erro `theme_not_accessible`, nenhum row criado.
- [ ] Bloco com `lessonId` sem entitlement → erro `lesson_not_accessible`.
- [ ] Após confirmar os blocos, `study_weekly_plans` tem 1 row para `(user_id, weekStartDate UTC)` com `source='coach_manual'` — UPSERT (não 2 rows ao re-confirmar).
- [ ] `ctaTarget` das activities resolve para rota Wouter existente (guard test).

### RF-04: Passo 3 — recomendar aulas
**Descrição:** o mentor sugere aulas (curated/entitled) e grava via `recommend_lesson` em `coach_lesson_recommendations`.
**Regras de negócio:**
- Aulas sugeridas vêm da whitelist curated (mesma fonte do `studyWeeklyPlanService`: `listLibraryLessonsCurated` / `listCuratedStudyThemes`) — anti-alucinação (whitelist enforce de `lessonId`, lesson aplicada no `studyWeeklyPlanService.validateWhitelist`).
- Grava pela chave **BRT** `(user_id, week_start_date)` existente de `coach_lesson_recommendations` (UPSERT, não duplica).
- `step.lessons.status='confirmed'` após gravar.
**Critério de aceitação:**
- [ ] Recomendar aulas grava/atualiza `coach_lesson_recommendations` na chave BRT da semana (UPSERT — re-recomendar não duplica row).
- [ ] `lessonId` fora da whitelist curated é rejeitado (não gravado).
- [ ] `ctaTarget`/link da aula resolve para rota Wouter existente.

### RF-05: Passo 4 — temas-foco derivados dos leaks
**Descrição:** o mentor apresenta os temas-foco sugeridos da próxima semana, derivados dos leaks + focus stats + análise da semana (EST-2/EST-5 quando existirem).
**Regras de negócio:**
- Read-only: deriva de `storage.getStatsLeaks(userId, n)` (top leaks) + `user_focus_stats` (mês corrente) + (degradação graciosa) sinais de EST-2/EST-5 se disponíveis.
- **Degrade gracioso:** se `getStatsLeaks` falhar/vazio, exibe focus stats; se ambos vazios, exibe mensagem "sem leaks detectados — foque no plano de aulas" (não quebra o flow). Logar antes do fallback (lesson #9).
- Não cria write novo neste passo (temas-foco já estão representados nos `themeId` das activities do passo 2 + nas recomendações). Apenas consolida e exibe no resumo final.
**Critério de aceitação:**
- [ ] Com leaks disponíveis, o passo 4 retorna os top-N temas-foco (statId/statName/severity).
- [ ] `getStatsLeaks` lança/retorna vazio → fallback para focus stats sem quebrar o flow (assert: passo 4 retorna `[]` ou focus stats, status não vira `error`).
- [ ] Nenhum write novo é executado no passo 4.

### RF-06: Resumo + conclusão do flow (sinal pro EST-5)
**Descrição:** ao concluir os 4 passos (cada um `confirmed` ou `skipped`), a planning session vira `status='completed'` e o mentor posta um resumo no chat. Esse estado é o sinal que o EST-5 (estado `planning`) consome para fechar o ritual.
**Regras de negócio:**
- `status` da sessão: `in_progress` → `completed` quando todos os 4 passos ∈ {`confirmed`,`skipped`}.
- Resumo consolida: dias de grind, total de blocos de estudo + minutos, aulas recomendadas, temas-foco.
- O resumo é postado como turno do mentor em `coach_conversations`/`coach_messages` (reusa o padrão de entrega de EST-1, sem novo canal).
**Critério de aceitação:**
- [ ] Quando os 4 passos estão confirmados/pulados, `GET /api/coach/planning/:weekStartDate` retorna `status='completed'`.
- [ ] O resumo é persistido como mensagem do mentor no chat.
- [ ] EST-5 (mock) consegue ler `status='completed'` via a função orquestradora.

## Requisitos Não-Funcionais
- **Idempotência:** UNIQUE `(user_id, week_start_date)` em `weekly_planning_sessions`; UPSERT em `study_weekly_plans` (UTC) e `coach_lesson_recommendations` (BRT). Reprocessar não duplica.
- **Tier gating:** entrada + cada tool revalidam (defense in depth).
- **Degradação graciosa:** falha de leaks/focus stats não quebra o flow (log antes do fallback — lesson #9).
- **Sem execução automática:** EST-6 NUNCA executa a grade sozinho — toda ação de escrita exige confirmação do jogador (founder travou execução automática).
- **Performance:** o `start` + cada passo são chamadas curtas; só o passo 1/2 disparam LLM (preview de grade / sugestão de blocos), reusando os tools já cacheados.

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | /api/coach/planning/start | Cria/retorna planning session da semana (idempotente) | JWT + tier eligible |
| GET | /api/coach/planning/:weekStartDate | Lê estado da planning session (passos + status) | JWT + tier eligible |
| POST | /api/coach/planning/:weekStartDate/step/:step/propose | Gera preview do passo (grind/study/lessons/themes) — não persiste | JWT |
| POST | /api/coach/planning/:weekStartDate/step/:step/confirm | Confirma o passo (delega ao tool AI-2A correspondente) | JWT |
| POST | /api/coach/planning/:weekStartDate/step/:step/skip | Marca passo como `skipped` | JWT |

> `:step` ∈ `grind | study | lessons | themes`. `:weekStartDate` no formato `YYYY-MM-DD` (UTC).
> Handlers seguem o padrão `injectedStorage` 3º arg (lesson #34) para serem testáveis sem `vi.mock('../storage')`.
> **Atenção colisão de rota** (mesmo padrão do EST-3): conferir que `/api/coach/planning/*` não é shadowado por rota `/api/coach/:x` registrada antes. Architect deve verificar ordem de registro em `server/routes/coach.ts` e usar sub-paths dedicados se necessário.

## Modelos de Dados Afetados

### weekly_planning_sessions (NOVO — migration)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | |
| user_id | varchar | not null, FK users | |
| week_start_date | date | not null | DATE UTC via `ymdUtc` (mesma convenção de `study_weekly_plans`) |
| status | varchar(16) | not null, default `'in_progress'` | `in_progress` \| `completed` \| `abandoned` |
| steps | jsonb | not null, default `'{}'` | `{ grind:{status,createdIds?,...}, study:{status,sessionIds?,...}, lessons:{status,...}, themes:{status,focus?} }`; `status` ∈ `pending\|proposed\|confirmed\|skipped` |
| source | varchar(16) | not null, default `'coach_manual'` | `coach_manual` (jogador via chat) \| `est5_ritual` (chamado pelo planning do EST-5) |
| created_at | timestamp | not null, default now | |
| updated_at | timestamp | not null, default now | |
| | | **UNIQUE (user_id, week_start_date)** | idempotência por semana |

> Índice: o UNIQUE já cobre as queries por `(user_id, week_start_date)`. Não precisa índice extra.

### study_weekly_plans (REUSO — sem alteração de schema)
- UPSERT pela chave existente `(user_id, week_start_date)` UTC com `source='coach_manual'`. Sem migration.

### coach_lesson_recommendations (REUSO — sem alteração de schema)
- UPSERT pela chave existente `(user_id, week_start_date)` BRT. Sem migration.

### planned_tournaments / study_sessions_v2 (REUSO via tools)
- Escritos exclusivamente pelos tools AI-2A (`bulk_propose_grade`, `schedule_study_block`). Sem alteração.

**Migration:** `migrations/00XX_weekly_planning_sessions.sql` + `_rollback.sql` (drizzle-kit). Aplicar via psql local (localhost:5433) + documentar pendência PROD no CLAUDE.md §6 (mesmo padrão das migrations 0086/0087).

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic (Claude) | Preview da grade (`bulk_propose_grade`) + sugestão de blocos de estudo / aulas | Passos 1, 2, 3 (reusa os tools existentes; `new Anthropic()` em try/catch — lessons #5/#35) |

## Cenários de Teste Derivados

### Happy Path
- [ ] `start` cria sessão → propor+confirmar os 4 passos → `status='completed'` + resumo no chat.

### Idempotência
- [ ] `start` 2x mesma semana → mesma sessão, passos preservados.
- [ ] Confirmar passo 2 (estudo) 2x → 1 row em `study_weekly_plans` (UPSERT), não 2.
- [ ] Recomendar aulas 2x → 1 row em `coach_lesson_recommendations` (UPSERT).
- [ ] Re-propor grade após confirmar → não duplica `planned_tournaments` (dedup `already_in_grade` ou undo prévio).

### Validação de Input
- [ ] `:step` inválido → 400.
- [ ] `:weekStartDate` fora de `YYYY-MM-DD` → 400.
- [ ] Bloco de estudo com tema de outro user → `theme_not_accessible`.
- [ ] Bloco com aula sem entitlement → `lesson_not_accessible`.
- [ ] Aula fora da whitelist curated no passo 3 → rejeitada.

### Tier Gating
- [ ] `free`/`expired` → 403 no `start` (sem criar row).
- [ ] Trial passa (eligible).
- [ ] Tool revalida gateByTier no `executeConfirmed` (defense in depth).

### Edge Cases / Degradação
- [ ] `getStatsLeaks` vazio/erro no passo 4 → fallback focus stats, flow não quebra (log antes do fallback).
- [ ] Pular todos os passos → `status='completed'` mesmo com tudo `skipped`.
- [ ] EST-5 (mock) chama `startPlanning` direto e lê `status='completed'` — contrato pluggável.
- [ ] `ctaTarget` das activities resolve para rota Wouter existente (guard test — lesson #19).

## Fora de Escopo
- **Execução automática da grade** (founder travou) — toda escrita exige confirmação do jogador.
- A máquina de estados completa do **EST-5** (`recap_sent→...→planning`). EST-6 só expõe o ponto de entrada que `planning` chamará.
- Mudar o conteúdo/seções do Weekly Report (EST-2).
- Análise profunda 7d do sharkscope (EST-5).
- Novos tools de escrita — EST-6 só orquestra os 4 tools AI-2A existentes.
- Push de email do plano (o resumo vai pro chat; entrega tripla é EST-1).

## Dependências
- **Tools AI-2A (SHIPPED):** `bulk_propose_grade`, `schedule_study_block`, `recommend_lesson`, `mark_off_day`.
- **`getReportTier`** (`server/coach/reportEligibility.ts`, SHIPPED).
- **`study_weekly_plans` + `upsertStudyWeeklyPlan`** (SHIPPED).
- **`coach_lesson_recommendations`** (SHIPPED).
- **`getStatsLeaks` + `user_focus_stats`** (SHIPPED — degrade gracioso se ausente).
- NÃO depende de EST-5 estar shipado (standalone).

## Decisões abertas para o System-Architect
1. **Re-propor passo já confirmado:** chamar `undo` do tool antes de re-propor, OU confiar no dedup (`already_in_grade` no grind, ownership/UPSERT no estudo)? Definir por passo. (Recomendação inicial: confiar no dedup do `bulk_propose_grade`; para estudo, re-UPSERT do `study_weekly_plans` + criar só blocos novos.)
2. **Colisão de rota** `/api/coach/planning/*` vs rotas `/api/coach/:x` existentes (mesmo risco do EST-3 — verificar ordem de registro em `server/routes/coach.ts`; usar sub-paths dedicados se necessário) + guard test.
3. **Como o resumo (RF-06) é postado no chat** — reusar exatamente o helper de entrega do EST-1 (`coachType=technical`, turno do mentor) ou um novo emissor? Recomendação: reusar.
4. **Shape exato de `steps` jsonb** — definir Zod + tipo compartilhado. Architect cria ADR + diagrama de sequência do flow.
5. **`source='est5_ritual'` vs `'coach_manual'`** — confirmar enum + se o EST-5 passa flag explícita no `startPlanning`.
6. **Mapeamento `:step` (`grind|study|lessons|themes`) → tool** documentado no ADR.

## Riscos
- **Acoplamento implícito com EST-5:** o contrato de "planning concluído" (RF-06 `status='completed'`) precisa ser estável antes do EST-5 consumir. Mitigação: testar via mock de EST-5 chamando a função orquestradora direto (RF-01/RF-06).
- **Drift de chave de semana** (UTC vs BRT): `study_weekly_plans` é UTC, `coach_lesson_recommendations` é BRT. EST-6 deve respeitar AMBAS sem unificar (CLAUDE.md §10). Risco de gravar na chave errada → guard test por tabela.
- **Custo LLM** acumulado (preview grade + sugestão blocos + aulas). Mitigação: reusa tools já cacheados; passos 3/4 são majoritariamente determinísticos (whitelist + leaks).
- **Colisão de rota** (EST-3 já sofreu): `:id`/`:x` legados shadowam sub-paths — guard test obrigatório.
- **Tests `.tsx` da UI do wizard:** usar `await import` (lessons #14/#26/#38), `useQuery` sem provider → ErrorBoundary (lesson #29), handler `injectedStorage` 3º arg (lesson #34).

## Notas de Implementação (opcional)
- Orquestrador em `server/coach/planning/weeklyPlanningOrchestrator.ts` (export `startPlanning(userId, weekStartDate, opts?)` + `proposeStep` / `confirmStep` / `skipStep` / `getPlanningSession`).
- Handlers HTTP em `server/routes/coach.ts` (ou novo `server/routes/coachPlanning.ts`) seguindo padrão `injectedStorage`.
- `confirmStep('grind')` → delega `bulkProposeGradeTool.executeConfirmed`; `confirmStep('study')` → loop `scheduleStudyBlockTool.executeConfirmed` + `upsertStudyWeeklyPlan`; `confirmStep('lessons')` → `recommendLessonTool`; `themes` é read-only (deriva de `getStatsLeaks`).
- `ymdUtc` reutilizado de `studyWeeklyPlanService.ts` (extrair para util compartilhado se ainda não estiver).
