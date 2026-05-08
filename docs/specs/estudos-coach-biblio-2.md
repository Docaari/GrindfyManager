# Spec: Sprint Estudos-Coach-Biblio-2 — Loop fechado Biblioteca + Coach + Estudos

## Status
**Proposta** | Aprovada | Em Desenvolvimento | Concluida

## Resumo Executivo

Sprint 2 da iniciativa "Sistema Plano Estudo Mensal" (research §6 Tier 2). Conecta os 3 pilares — Biblioteca, Coach AI e Estudos — em um loop fechado de retencao usando a fundacao entregue em Sprint 1 (Estudos-Habito-1, ADR-126).

4 RFs:

1. **RF-1 Auto-trigger Aula = Estudo registrado** — Mux progress >= 80% cria `study_sessions_v2` com `source='auto_lesson'`. Idempotente em janela 24h. Toast com link "Ver detalhes".
2. **RF-2 Biblioteca recomenda aula por leak** — endpoint que cruza top 3 leaks com `study_themes.linkedLessons` e exibe cards "Aulas recomendadas pra voce" em /home e /estudos.
3. **RF-3 Plano semanal Coach** — Coach AI gera plano de 5 dias toda segunda 9h UTC + botao manual. Persistido em `study_weekly_plans` (nova tabela) com checklist consumivel pelo user.
4. **RF-4 Coach insight pos-sessao live** — apos finalize /grind-live, Coach analisa sessao + spots + retorna painel "Insights da sessao" com top 3 maos para review, aulas relevantes e CTAs estruturados.

A hipotese central: usuario que ja registra tempo de estudo (Sprint 1) entrega muito mais retencao quando o sistema **orquestra** o que estudar em vez de oferecer apenas um log passivo. Concorrentes nao tem esse loop — closed-loop Biblioteca→Coach→Estudos eh defensivel.

---

## Contexto

### Fonte de verdade
- **Research:** `Docs/strategy/2026-05-08-estudos-stats-analyzer-research.md` — secao 6 (Tier 2 ICE 4.0+) + secoes 3.3 (Founder #3 Biblioteca=log) + 4.1 (ID1 Plano semanal) + 4.3 (ID3 Biblio reco por leak) + 4.4 (ID4 Coach pos-live).
- **Spec base:** `Docs/specs/estudos-habito-1.md` — RF-1 ja preparou `source='auto_lesson'` no enum + idempotency cross-session em §RF-1.4. Schema `study_sessions_v2` ja entrega tudo que precisamos.

### Estado atual
- **`study_sessions_v2`** existe (Sprint Estudos-Habito-1, ADR-126). Schema completo com `source ∈ {manual_post_hoc, manual_live, auto_lesson, auto_grind_finalize}`. RF-1 deste sprint **ATIVA** o gatilho `auto_lesson` (preparado).
- **`study_themes`** ja tem `linkedStats jsonb[]` + `linkedLessons jsonb[]` (Sprint Estudos-Habito-1, ADR-127, curated taxonomy). RF-2 deste sprint USA esse mapping; founder/admin seed manual + opcional admin UI fora de escopo.
- **Mux Player + `useCoachRecommendationConsume`** ja captura progress em `client/src/components/biblioteca/...` (ver lesson #20 — wirar via container querySelector). RF-1 piggyback nesse hook.
- **Coach infra** modular em `server/coach*.ts` (12 arquivos). `coachToolRunner.ts` + `coachSystemBuilder.ts` + `coachPrompts.ts` ja sao lazy-loaded por contexto. RF-3 e RF-4 adicionam **2 tools novas** (`coachStudyPlan`, `coachSessionInsights`) seguindo padroes existentes (Sprint Coach-2A/2B).
- **Cron infra** — Sprint News-3 (ADR-107) entregou pattern para crons. RF-3 reusa para `generateWeeklyStudyPlanCron` segunda 9h UTC.
- **Endpoint `/api/grind-sessions/:id/finalize`** existente — RF-4 hooka pos-finalize sem mudar contrato.
- **`getStatsLeaks(userId, top)`** existente em `storage.ts` (Sprint home-reform-4 Item 7). RF-2 reusa.

---

## Usuarios e User Stories

### Personas

| Persona | Como esse sprint impacta |
|---|---|
| **Jogador profissional MTT (founder + pro beta)** | Aula assistida vira log automatico. Plano semanal Coach reduz friccao "o que estudar?". Insights pos-live captura aprendizado quente. |
| **Casual user (free tier)** | Auto-log aula + recomendacoes leak. Plano Coach pode ser feature gated por tier (decisao de produto, nao de spec). |
| **Pro grinder (premium tier)** | Tudo ativo. Insights pos-sessao live entregam ganho marginal alto. |

### User stories

**US-1 (Founder, pro):** "Eu assisto Bloco A Ep 4 'C-bet OOP' inteiro durante o cafe da manha. Quando passa de 80%, o sistema registra 18min de estudo automaticamente vinculado ao tema 'C-bet flop OOP'. Eu vejo um toast e clico 'Ver detalhes' — quero confirmar que registrou direito."

**US-2 (Pro grinder):** "Abro /home e vejo 'Voce tem leak em 3bet vs Open. Aula Bloco A Ep 7 cobre isso (12min). Assistir agora?'. Click leva direto pro player Mux. Apos terminar, sistema fecha o loop registrando estudo + atualiza progresso da aula."

**US-3 (Founder N=1 ate prova em contrario):** "Segunda-feira 10h abro o app e tem 'Plano de estudo da semana': 5 dias com 3-4 atividades cada (drill GTO 30min, aula X, hand review Y). Marco completed e o sistema riska. Domingo a noite ja sei se cumpri o plano."

**US-4 (Pro pos sessao):** "Acabei sessao live de 4h em 22 torneios. Modal pos-finalize abre 'Insights da sessao': top 3 maos pra revisar (linkando spots ja gravados), 2 aulas sugeridas baseadas em decisoes ruins, botao 'Registrar review'. Click no registrar abre StudyLogDialog mode=hand_review pre-preenchido com starred_hand_ids."

---

## Objetivos

1. **Fechar o loop Biblioteca → Estudos** sem friccao manual. Trigger Mux 80% cria study session com toast non-intrusivo.
2. **Cruzar leaks com conteudo proprio** para que o investimento na Biblioteca (Bloco A) gere retencao. Recomendacao certa, no momento certo, no lugar certo.
3. **Coach AI orquestra a semana**, nao apenas responde duvidas. Plano semanal calibravel + botao manual + completion tracking.
4. **Capturar momento de alto engajamento pos-sessao live** com insights estruturados (nao prosa generica) que linkam direto para acao.

## Nao-Objetivos (Out of Scope — Sprint 3)

- **Spot Learning Loop + Spaced Reentry (Anki-like)** — feature killer mas alto esforco (research §F5+ID6, ICE 4.33, 10-14d). Sprint 3 dedicado.
- **Stats foco evolution chart timeline** — ainda DEFER (research §F4 expanded). Pode entrar em Sprint 3 ou paralelo.
- **Stats foco monthly review banner** ("Maio acabou. Sua C-bet OOP melhorou..."). Defer.
- **Admin UI para curadoria de `study_themes.linkedLessons`** — founder edita via DB direct ou seed script. Admin UI eh sprint dedicado (operacao biblioteca).
- **Coach review mensal** (research ID8) — depende de RF-3 maduro. Defer.
- **Compare meu foco com a media Pro** (research ID7) — privacy review pendente. Defer.
- **Drill GTO integracao real** (parceria GTO Wizard) — roadmap Q3+.
- **`auto_grind_finalize` source ATIVO em estudos** — schema preparado em Sprint 1, mas o trigger pos-finalize neste sprint eh **somente Coach insights** (RF-4) que **opcionalmente** o user clica para criar uma `study_sessions_v2` mode=hand_review (caminho via StudyLogDialog ja existente). NAO criamos session automaticamente sem confirmacao.
- **Email/Push notifications** de "plano da semana gerado" — fora de escopo. Apenas in-app (banner + Coach conversation). Push pode entrar em fase 2.
- **Versionamento de planos** (historico tipo "Plano Semana 12") — apenas o plano corrente eh editavel/visivel. Planos passados ficam read-only no banco mas UI mostra so corrente.
- **Recomendacoes nao-aula** (spots, drills, torneios) na RF-2 — apenas aulas. Recomendacoes mais amplas ja existem em `studyRecommendationsService` (Sprint Studies-Reform RF-06).

---

## Requisitos Funcionais

### RF-1: Auto-trigger Aula = Estudo registrado (`source='auto_lesson'`)

**Descricao:** Quando user assiste aula da Biblioteca (Mux Player) e progresso passa de 80%, sistema chama `POST /api/study-sessions` com `source='auto_lesson'`. Endpoint usa idempotency cross-session em janela 24h por `(user_id, lesson_id)` (algoritmo definido em ADR-130, Sprint 1). Se sessao existe na janela, faz UPDATE incremental do `duration_minutes` quando progresso aumentou; senao cria nova. Toast informa user com link "Ver detalhes".

#### Regras de negocio

##### RF-1.1: Trigger client-side

- Hook `useLessonStudyAutoLog(lessonId, lesson)` (novo) escuta `timeupdate` event do Mux Player via container `querySelector('mux-player, video, audio')` (lesson #20).
- Calcula `progressPct = currentTime / duration`. Quando passa de **0.80** (>= 0.80), dispara `POST /api/study-sessions` apenas **uma vez por mount** do player (flag local `firedThisMount`).
- Se user re-assiste a mesma aula no mesmo dia, segunda chamada usa idempotency server-side (mesmo `(user_id, lesson_id, 24h)`) — server faz UPDATE. Frontend nao precisa saber.
- Hook **nao bloqueia** o player. Falha de network = silent (console warn dev, sem toast erro). Lesson #9 (try/catch generico engole) — logue rejected antes de fallback.

##### RF-1.2: Payload do trigger

```ts
POST /api/study-sessions
{
  mode: "lesson",
  source: "auto_lesson",
  lessonId: <UUID>,
  durationMinutes: Math.min(
    Math.round(currentTime / 60),
    Math.round(lessonDurationSeconds / 60)
  ),
  themeId: <derivado server-side via lookup>, // null se sem mapping
  notes: null,
  startedAt: <opcional, mount time do player>,
  endedAt: <opcional, now()>
}
```

- `durationMinutes` cap: `min(progressTime/60, lessonRuntime/60)`. Anti-inflate.
- `themeId` deve ser **derivado server-side** (NAO trust client). Lookup: SELECT primeiro `study_themes.id` WHERE `lesson_id IN linked_lessons jsonb` e `is_curated=true`. Se zero match → fallback `themeId=null` (aceito pela schema; rota `mode='lesson'` permite tema null porque deriva da aula).
  - **Decisao spec:** ajuste necessario em RF-1 do Sprint 1 — schema atual (ADR-126) lista "tema obrigatorio para mode=lesson" mas com fallback "tema vem do tema da aula automaticamente, mas user pode override". A presente sprint **flexibiliza** server-side: `mode='lesson'` aceita `themeId=null` quando nao ha aula mapeada. Documentar em comment + atualizar ADR-126 (errata).
- `lessonId` validado: aula existe, `is_published=true`, pertence a curso ativo. Se aula deletada/despublicada apos start mas antes do trigger → 400 mas frontend recebe silent (lesson #9).

##### RF-1.3: Idempotency server-side (reuso ADR-130)

Algoritmo (ja em ADR-130 Sprint 1, aqui detalhado para clareza):

```
1. SELECT * FROM study_sessions_v2
   WHERE user_id=X AND lesson_id=L AND source='auto_lesson'
     AND deleted_at IS NULL
     AND registered_at > now() - interval '24 hours'
   ORDER BY registered_at DESC LIMIT 1
   FOR UPDATE.
2. IF found AND new.duration_minutes > existing.duration_minutes:
     UPDATE existing SET duration_minutes=new.duration_minutes,
                          ended_at=new.endedAt,
                          updated_at=now()
     RETURN { updated: true, sessionId: existing.id }.
3. ELSE IF found AND new.duration_minutes <= existing.duration_minutes:
     // user re-assistiu mas nao avancou — no-op
     RETURN { updated: false, sessionId: existing.id, reason: "no_progress" }.
4. ELSE:
     INSERT new row.
     // streak/goal update (RF-2 Sprint 1) roda na MESMA transaction
     RETURN { created: true, sessionId: new.id }.
```

**Performance:** indice partial novo em Sprint 1 ja cobre `(lesson_id) WHERE lesson_id IS NOT NULL`. Validar com EXPLAIN.

##### RF-1.4: UX toast + ver detalhes

- Toast non-blocking, top-right, 5s auto-dismiss.
- Texto: "Estudo registrado: [titulo da aula] ([X] min)". Variant **success**.
- Action button "Ver detalhes" → navega `/estudos?session=<id>` (deep link). Pagina /estudos detecta query param e abre dialog `SessionDetailDialog` (existente ou novo, sprint architect decide) com a sessao highlighted.
- Se update (no-op caso 3): NAO mostra toast. Silent.
- Se update incremental com progresso novo (caso 2): mostra toast "Aula em andamento: progresso atualizado para [X] min" — variant **info**, sem action button (so dismiss).
- Se threshold de 80% bate em re-assistir aula completada (1 dia depois): cria sessao nova (porque > 24h). Toast normal.

##### RF-1.5: Settings opt-out

- Estender `users.home_layout_settings.studyHabit` shape com:
  ```ts
  studyHabit: {
    autoLogLessons: boolean // default true
  }
  ```
- Settings page `/settings` (secao "Habito de Estudo" ja criada em Sprint 1) ganha toggle "Registrar aula assistida automaticamente como estudo".
- Frontend hook `useLessonStudyAutoLog` checa setting em runtime — se `false`, hook eh inerte (nao dispara POST).
- Telemetria: event `auto_log_lesson_opted_out` quando user desliga (rastreio para validar adoption).

#### Critério de aceitacao RF-1

- [ ] Hook `useLessonStudyAutoLog(lessonId)` criado em `client/src/hooks/`. Wirado em todos os `<MuxPlayer>` containers de aulas Biblioteca (`/biblioteca/curso/:courseSlug/:lessonSlug/play` e variantes).
- [ ] Endpoint `POST /api/study-sessions` (existente, Sprint 1) ACEITA `source='auto_lesson'`. Validacao Zod ja prepara o enum.
- [ ] Endpoint deriva `themeId` server-side via lookup `study_themes.linkedLessons jsonb` (SQL `?` operator ou `jsonb_array_elements`).
- [ ] Idempotency: 2 chamadas em 24h com mesmo `lessonId` resultam em 1 row. Segunda chamada com `durationMinutes` maior faz UPDATE.
- [ ] Toast renderiza com link "Ver detalhes" na criacao. Update incremental usa toast info sem action.
- [ ] Setting `studyHabit.autoLogLessons` adicionado ao shape `home_layout_settings`. UI toggle em `/settings`. Hook respeita.
- [ ] Streak/goal updates rodam dentro da mesma transaction (sem regressao Sprint 1 RF-2).
- [ ] Erra silent quando network/lesson_id invalido — sem disrupcao do player.
- [ ] errata ADR-126: `mode='lesson'` aceita `themeId=null` server-side. Atualizar comment + spec base.

#### Cenarios de teste derivados RF-1

##### Happy path
- [ ] Player atinge 80% pela primeira vez → POST → 201 created → toast "Estudo registrado".
- [ ] Aula com `linkedLessons` mapeada em tema curated → row com `themeId` preenchido.
- [ ] Aula sem mapping → row com `themeId=null` + toast normal.
- [ ] Mesma aula em 24h, progresso aumentou de 80% para 95% → UPDATE existente, `durationMinutes` atualizado, toast info.
- [ ] Mesma aula em 24h, progresso igual ou menor → no-op, sem toast.

##### Validacao de input
- [ ] Frontend trigger com `lessonId` invalido → 400 server-side, hook captura silent. Sem crash.
- [ ] Aula `is_published=false` → 400 LESSON_NOT_PUBLISHED. Silent client.
- [ ] `durationMinutes > lessonRuntime/60` → cap aplicado server-side, log warn.
- [ ] `progressPct` reportado pelo client > 1 (Mux glitch) → cap em 1.0 frontend.

##### Regras de negocio
- [ ] User com `autoLogLessons=false` → hook NAO dispara POST mesmo aos 80%.
- [ ] Streak avanca quando session contribui para `today_minutes >= goal` (Sprint 1 RF-2 logica).
- [ ] Concurrent: user em 2 tabs assistindo MESMA aula passa 80% em ambas em < 1s → idempotency garante 1 row (FOR UPDATE serializa).

##### Edge cases
- [ ] Tab fechada antes de 80% atingir → nao registra. Sem POST.
- [ ] User skip 0%→90% via seek → trigger dispara aos 80% logico (currentTime real do player). Comportamento aceito (registra duracao = currentTime, nao runtime total).
- [ ] Mux Player com runtime 0 (live ou bug) → divisao por zero protegida client-side (no-op).
- [ ] Re-mount do player (user navega fora e volta) reseta `firedThisMount`. Se progresso ainda > 80%, dispara de novo, server faz UPDATE (idempotent).
- [ ] Lesson com tema linkado em `linkedLessons` mas tema soft-deleted → derivacao server-side ignora linha; fallback `themeId=null`.
- [ ] Toast "Ver detalhes" com `?session=<id>` em URL: pagina `/estudos` precisa detectar query param e scrollar/highlight. Se sessao deletada antes do click → fallback dialog "Sessao nao encontrada".

---

### RF-2: Biblioteca recomenda aula por leak

**Descricao:** Cruza top 3 leaks do user (`getStatsLeaks(userId, 3)`) com `study_themes.linkedLessons` para gerar recomendacoes "aula que ataca leak X". Endpoint dedicado, cache 1h por user. Card "Aulas recomendadas pra voce" exibido em `/home` (logo apos FocusStatsBar) e `/estudos` (header section).

#### Regras de negocio

##### RF-2.1: Endpoint

```
GET /api/biblioteca/recommendations
Auth: requireAuth
Cache: server-side TTL 60min por user (Map<userId, {data, expiresAt}>) + invalidator publico.
```

Response shape:
```json
{
  "recommendations": [
    {
      "leak": {
        "statId": "cbet_flop_oop_pct",
        "statName": "C-bet flop OOP",
        "value": 28,
        "benchmark": 38,
        "delta": -10,
        "severity": 8
      },
      "theme": {
        "id": "theme_xyz",
        "name": "C-bet flop OOP",
        "slug": "c-bet-flop-oop",
        "isCurated": true
      },
      "lessons": [
        {
          "id": "lesson_abc",
          "title": "Ep 4: C-bet OOP no Flop",
          "courseSlug": "antes-das-cartas",
          "lessonSlug": "ep-4-cbet-oop-flop",
          "durationSeconds": 720,
          "thumbnailUrl": "https://...",
          "watchedPct": 0.45 // se user ja assistiu parcialmente
        }
      ]
    }
  ],
  "generatedAt": "2026-05-08T14:23:11Z",
  "cacheExpiresAt": "2026-05-08T15:23:11Z"
}
```

##### RF-2.2: Algoritmo de match

```
1. leaks = getStatsLeaks(userId, top=3) // ja existe storage.ts
2. FOR each leak in leaks:
     // Match tema via linkedStats jsonb array
     SELECT * FROM study_themes
     WHERE user_id IN (NULL_USER_FOR_CURATED, userId) -- curated globais OU user-custom
       AND linked_stats @> jsonb_build_array(leak.statId)
     ORDER BY is_curated DESC, name ASC -- prefer curated
     LIMIT 1
     // Se zero matches, skipar este leak (nao recomenda)
   IF tema encontrado:
     // Lookup aulas via linkedLessons
     lessonIds = tema.linkedLessons (jsonb array)
     SELECT id, title, course_id, mux_playback_id, runtime_seconds
       FROM library_lessons l
       JOIN library_courses c ON l.course_id=c.id
       WHERE l.id = ANY(lessonIds) AND l.is_published=true
       ORDER BY l.episode_number ASC
       LIMIT 2 -- max 2 aulas por leak (anti-overflow)
     // Hidratar courseSlug + lessonSlug + watchedPct
     FOR each lesson:
       watchedPct = SELECT MAX(progress_pct) FROM library_lesson_progress
                    WHERE user_id=X AND lesson_id=lesson.id
       courseSlug = course.slug
       lessonSlug = lesson.slug
3. Filtrar leaks que tem >= 1 lesson recomendada.
4. Cap final: max 3 cards (1 por leak top 3). Se < 3 leaks com aula → retorna < 3.
5. Cache 60min: store na Map<userId, {data, expiresAt}>.
```

**Decisao:** curated themes (founder seed) tem prioridade. User-custom themes que tenham `linkedStats` preenchido tambem entram (lesson #11 — apresentar dado, nao decorar; mas nao bloquear).

##### RF-2.3: Cache + invalidacao

- Cache server-side em-memoria via `Map<userId, {data, expiresAt}>` (sem Redis no Sprint 2).
- TTL 60min por entry.
- Invalidator publico `invalidateBibliotecaRecommendationsCache(userId)` chamado em:
  - POST/DELETE `/api/stats/focus` (mudou foco → leaks podem ter mudado).
  - PATCH `/api/library-lessons/:id` admin (mudou conteudo → re-match).
  - POST `/api/study-themes` que altera `linkedStats` ou `linkedLessons` (mudou mapping).
- `_resetForTests()` exportado para test suite (lesson #21).

##### RF-2.4: Empty states

| Cenario | Card render |
|---|---|
| User sem leaks detectados (low data) | "Selecione 3 stats em foco em /stats-analyzer pra receber recomendacoes" + CTA navega `/stats-analyzer`. |
| User com leaks mas zero `linkedLessons` matching | "Estamos curando aulas para os seus leaks atuais. Volte em breve" — sem CTA. |
| User com 1 leak match (mas 2 leaks sem match) | Renderiza 1 card + texto "Mais aulas em breve". |
| API fail | Card nao renderiza (silent fail). Console warn dev. |

##### RF-2.5: UI cards

Componente `<LessonRecommendationsCard placement="home" | "estudos" />`:

- Layout horizontal scroll snap (mobile) / grid 3 cols (desktop).
- Cada card:
  - Thumbnail aula (160x90).
  - Title aula (max 2 linhas).
  - Badge tema "C-bet flop OOP" (cor do tema).
  - Tag leak "Leak: -10% vs benchmark" (severity color).
  - Progress bar se `watchedPct > 0` ("45% assistido").
  - Duracao "12 min".
  - Hover/focus: CTA "Assistir agora" → navega `/biblioteca/curso/${courseSlug}/${lessonSlug}/play` (lesson #19 — courseSlug+lessonSlug obrigatorios).
- Click no card todo = mesmo CTA.
- Section header "Aulas recomendadas pra voce" + badge "Atualizado [Xh atras]".
- Refresh button (icon-only, hover tooltip "Atualizar recomendacoes") chama `POST /api/biblioteca/recommendations/refresh` (invalida cache + re-fetch). Rate limit 5/dia per user.

#### Critério de aceitacao RF-2

- [ ] Endpoint `GET /api/biblioteca/recommendations` criado em novo arquivo `server/routes/biblioteca-recommendations.ts`.
- [ ] Endpoint `POST /api/biblioteca/recommendations/refresh` invalida cache + re-fetch. Rate limit 5/dia.
- [ ] Cache server-side `Map<userId, {data, expiresAt}>` TTL 60min + `_resetForTests()` export + invalidators publicos.
- [ ] Algoritmo cruza `getStatsLeaks` com `study_themes.linkedStats` jsonb (operator `@>` ou `?`). Curated tem prioridade.
- [ ] Hidrata `courseSlug` + `lessonSlug` para Wouter route casar (lesson #19).
- [ ] Componente `<LessonRecommendationsCard placement>` renderiza max 3 cards com layout responsivo.
- [ ] Empty states (3 cenarios) renderizam com CTAs apropriados.
- [ ] Card instalado em `/home` (logo apos `FocusStatsBar`/`FocusStatsCard`) e `/estudos` (header dashboard).
- [ ] Refresh button chama refresh endpoint, atualiza UI, mostra toast "Recomendacoes atualizadas".
- [ ] watchedPct hidratado do `library_lesson_progress`.

#### Cenarios de teste derivados RF-2

##### Happy path
- [ ] User com 3 leaks, 3 temas matching, 2 aulas cada → response 3 cards, 1 lesson cada (top 1 por leak).
- [ ] User com 3 leaks, apenas 1 tema com linkedLessons → response 1 card.
- [ ] Cache hit em 2a chamada < 60min → response.cacheExpiresAt mantido. Sem re-execute do algoritmo.
- [ ] Cache miss apos invalidacao via `POST /api/stats/focus` → re-fetch.
- [ ] Aula com `watchedPct=0.5` (user assistiu metade antes) → card mostra progress bar 50%.

##### Validacao
- [ ] User nao autenticado → 401.
- [ ] Refresh acima de 5/dia → 429 RATE_LIMITED.

##### Regras de negocio
- [ ] Curated theme + user-custom matchando mesmo leak → curated vence.
- [ ] Aula `is_published=false` filtrada do response.
- [ ] User soft-delete tema com `linkedLessons` → re-fetch nao retorna lessons daquele tema.
- [ ] User sem stats foco → empty state "Selecione 3 stats" com CTA correto.

##### Edge cases
- [ ] `linkedStats` vazio em todos temas → response `recommendations: []` + empty state apropriado.
- [ ] Aula deletada apos cache populated → cache stale ate TTL. Aceitavel (60min). Documentar.
- [ ] `library_lesson_progress` ausente para user (nunca assistiu) → `watchedPct=0`.
- [ ] Concurrent: 2 calls de invalidator + read race → ultimo write vence. TTL renova. Aceito (lesson #21 server-side cache).

---

### RF-3: Plano semanal Coach

**Descricao:** Coach AI gera plano semanal personalizado de 5 dias toda segunda 9h UTC (cron) ou manualmente via botao "Gerar plano da semana". Plano contem 3-4 atividades por dia com tempo total ~= avg duracao da ultima semana. Persiste em `study_weekly_plans` (nova tabela). UI checklist consumivel + regenerar manual (1x/dia).

#### Regras de negocio

##### RF-3.1: Algoritmo de geracao

```
INPUT: userId, weekStartDate (segunda da semana corrente em UTC)

1. Coletar contexto:
   a. focusStats = SELECT user_focus_stats WHERE user_id=X AND month=current_month
      LIMIT 3
   b. recentLeaks = getStatsLeaks(userId, top=3)
   c. avgDuration = SELECT AVG(duration_minutes) FROM study_sessions_v2
      WHERE user_id=X AND deleted_at IS NULL AND source != 'auto_lesson'
        AND registered_at > now() - interval '7 days'
   d. recentLessons = SELECT recently watched/recommended (RF-2 cross-ref)
   e. starredHandsRecent = ultimas 5 starred_hands com priority IN ('high', 'critical')

2. Determinar daily_target_minutes:
   IF avgDuration NULL OR avgDuration < 15: 30 (default conservador)
   ELSE: clamp(avgDuration * 0.95, 15, 120) // 95% do avg, range 15-120

3. Build prompt para Coach (Claude):
   - Sistema: persona tiered Coach (reuso `coachSystemBuilder.ts`)
   - User context block:
     "Stats foco: [list focus_stats]
      Leaks recentes: [list leaks com severity]
      Aulas relevantes: [recent + curadas]
      Spots criticos: [starredHands ids + tipos]
      Tempo medio diario: [avgDuration] min
      Meta diaria: [daily_target_minutes] min"
   - Instrucao: "Gere plano de 5 dias (Seg-Sex) com 3-4 atividades cada. Cada atividade deve ser:
      type ∈ {drill_gto, lesson, hand_review, theory_read, snapshot_review, other}
      title (string curta)
      description (string)
      estimatedMinutes (integer)
      ctaTarget (URL Wouter, ex: /biblioteca/curso/X/Y/play OR null)
      themeId (opcional)
      lessonId (opcional, se type=lesson)
      handIds (opcional, se type=hand_review)
      Soma de minutos por dia ≈ daily_target_minutes ± 15%.
      Distribuicao recomendada por semana:
        - 2 drills GTO em 2 dias
        - 2 aulas Biblioteca (uma de revisao, uma de progressao)
        - 1 hand_review com starredHands
        - 1 snapshot_review (foco stats)
        - 1 theory_read flexivel (link Coach pode sugerir externo)
      Justifique cada atividade em 1 linha (campo `reasoning`).
      Output JSON validado pelo schema StudyWeeklyPlanItem."
   - Tool retornado via `coachStudyPlan` tool (structured output)

4. Validar JSON output via Zod schema. Se falha:
   - Retry 1x com prompt "Output JSON invalido. Schema correto: [schema]". Lesson #5 (vi.fn nao eh constructor — para tools).
   - Se 2a falha → retorna 500 INTERNAL_ERROR + log estruturado.

5. INSERT INTO study_weekly_plans:
   { id, user_id, week_start_date=weekStartDate, plan_jsonb=output,
     generated_at=now(), completed_items_jsonb=[], source }

6. Coach conversation: NAO criar mensagem nova no /coach chat (evita poluicao). Plano vive em `/estudos` UI.
```

##### RF-3.2: Schema `study_weekly_plans` (NOVA tabela)

```ts
study_weekly_plans {
  id: varchar(21) PK NOT NULL          // nanoid
  user_id: varchar(21) NOT NULL FK users.userPlatformId ON DELETE CASCADE
  week_start_date: date NOT NULL       // segunda-feira da semana em UTC
  plan_jsonb: jsonb NOT NULL           // array de StudyWeeklyPlanDay
  generated_at: timestamptz NOT NULL DEFAULT now()
  completed_items_jsonb: jsonb NOT NULL DEFAULT '[]'  // array de itemId completed
  source: varchar(16) NOT NULL CHECK source IN ('coach_auto', 'coach_manual')
  daily_target_minutes: integer NOT NULL
  cost_tokens_used: integer            // tracking custo Coach
  created_at: timestamptz NOT NULL DEFAULT now()
  updated_at: timestamptz NOT NULL DEFAULT now()
}
```

**Indices:**
- `UNIQUE (user_id, week_start_date)` — 1 plano por user por semana.
- `(user_id, generated_at DESC)` — list historico.

**Shape `plan_jsonb`:**
```ts
type StudyWeeklyPlan = {
  days: Array<{
    dayLabel: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
    date: string // ISO YYYY-MM-DD
    activities: Array<StudyWeeklyPlanItem>
  }>
}
type StudyWeeklyPlanItem = {
  itemId: string  // nanoid local ao plan
  type: 'drill_gto' | 'lesson' | 'hand_review' | 'theory_read' | 'snapshot_review' | 'other'
  title: string  // max 80 char
  description: string  // max 200 char
  estimatedMinutes: number  // 5-120
  ctaTarget: string | null  // URL relativa Wouter
  themeId: string | null
  lessonId: string | null
  handIds: string[]  // se type=hand_review
  reasoning: string  // max 200 char
}
```

##### RF-3.3: Cron `generateWeeklyStudyPlanCron`

- Roda toda **segunda 9h UTC** (06h BRT). Reuso pattern `server/cron/refreshNews` (Sprint News-3 ADR-107).
- Para cada user com `users.is_active=true` AND `users.has_coach_access=true` (TBD: definir flag — provavelmente premium tier; coordenar com architect):
  1. Verificar se ja existe plano para `week_start_date=this_monday` → SKIP.
  2. Verificar quota Coach (`coach_quota_remaining > 0`) → SKIP se zero.
  3. Tentar gerar plano (algoritmo §RF-3.1). Catch errors per-user (lesson #9). Continue.
  4. Log estruturado: `{ userId, planId, durationMs, tokensUsed, status }`.
- Idempotency: rerun do cron no mesmo dia nao recria planos existentes.
- Failure recovery: cron falha individual nao afeta outros users.
- Rate limit Anthropic: pacing entre calls (sleep 200ms entre user-loop iterations).

##### RF-3.4: Botao manual "Gerar plano da semana"

- Endpoint `POST /api/study-weekly-plan/regenerate`. Auth + rate limit **1/dia per user** (gating UI tambem).
- Body opcional: `{ resetCompleted: boolean }` — se true, descarta `completed_items_jsonb` da semana e regera.
- Logica: chama mesmo algoritmo §RF-3.1 mas com `source='coach_manual'`. UPDATE row existente (UNIQUE constraint week_start_date).
- Response: novo plano completo.
- UI: botao no header "Plano da semana" → confirmacao dialog "Regenerar descartara progresso atual. Continuar?" → submit → toast.
- Telemetria: event `study_plan_regenerated` com `{userId, reason}`.

##### RF-3.5: Marcacao de completed

- Endpoint `PATCH /api/study-weekly-plan/items/:itemId/toggle`. Auth.
- Body: `{ completed: boolean }`.
- Server: SELECT `study_weekly_plans` WHERE `user_id=X AND week_start_date=current_week`. Se found, UPDATE `completed_items_jsonb` (add/remove `itemId`).
- Race-safe: usar `jsonb_set` ou app-level read-modify-write em transacao.
- Side effects:
  - Se `completed=true` AND `item.type='lesson'` → NAO criar `study_sessions_v2` automaticamente. Aula tem seu proprio auto-trigger (RF-1). Apenas marca completed local ao plan.
  - Se `completed=true` AND `item.type='hand_review'` → abrir dialog "Quer registrar como sessao de estudo?" → CTA "Sim, registrar" abre `StudyLogDialog mode='hand_review'` pre-preenchido com `handIds`. **NAO eh automatico.**
  - Outros types: apenas marca completed.

##### RF-3.6: UI

Componente `<StudyWeeklyPlanCard />` em `/estudos`:

- Header section: "Plano da semana de [DD/MM] a [DD/MM]" + badge "Gerado [Xh atras]" + botao Regenerar.
- 5 dias horizontais (mobile: scroll snap; desktop: grid 5 col).
- Cada dia: header `Seg`, `Ter`, etc + total estimado (`90 min`).
- Cada atividade: row com checkbox + title + duracao + tag tipo + CTA target (icon link → click navega).
- Empty state se nao ha plano para semana corrente:
  - "Plano da semana eh gerado toda segunda-feira automaticamente."
  - CTA "Gerar plano agora" → endpoint regenerate.
  - Skeleton loading durante geracao (10-20s pode demorar — pre-warming).
- Estado parcial: contador top-right "3/14 completed" + barra de progresso.

##### RF-3.7: Endpoints

```
GET /api/study-weekly-plan?week=YYYY-MM-DD
  Auth: requireAuth.
  Default: current week se param ausente.
  Response: plano da semana + completion status.

POST /api/study-weekly-plan/regenerate
  Auth: requireAuth.
  Rate limit: 1/dia per user.
  Body: { resetCompleted?: boolean (default false) }
  Response: novo plano.

PATCH /api/study-weekly-plan/items/:itemId/toggle
  Auth: requireAuth.
  Body: { completed: boolean }
  Response: plano atualizado.
```

#### Critério de aceitacao RF-3

- [ ] Migration nova cria tabela `study_weekly_plans` com schema acima + indices.
- [ ] Coach tool nova `coachStudyPlan` em `server/coachToolRunner.ts` que aceita context user + retorna structured plan output.
- [ ] Coach prompt builder estendido em `server/coachPrompts.ts` com bloco `STUDY_PLAN_SYSTEM_PROMPT` (lesson #10 — DRY de prompts, extrair em arquivo proprio se reuso).
- [ ] Service `server/services/studyWeeklyPlanService.ts` orquestra: coleta context → call Coach → valida output → persist.
- [ ] Cron `server/cron/generateWeeklyStudyPlanCron.ts` segunda 9h UTC, idempotente, per-user error tolerant.
- [ ] Endpoint `GET /api/study-weekly-plan?week=` retorna plano corrente.
- [ ] Endpoint `POST /api/study-weekly-plan/regenerate` rate-limited 1/dia.
- [ ] Endpoint `PATCH /api/study-weekly-plan/items/:itemId/toggle` race-safe.
- [ ] Componente `<StudyWeeklyPlanCard />` instalado em `/estudos`.
- [ ] Empty state + skeleton + estado parcial renderizam corretamente.
- [ ] Coach quota integration: cron skipa se `coach_quota_remaining <= 0`. Botao manual idem (UI gating + 429 server).
- [ ] Validacao Zod do output Coach: schema `StudyWeeklyPlan` rigido. Retry 1x se falha.
- [ ] Telemetria event `study_plan_generated` com `{userId, source, tokensUsed, durationMs}`.

#### Cenarios de teste derivados RF-3

##### Happy path
- [ ] Cron segunda 9h: gera plano para user com focusStats + leaks + 30min avg → row criada com 5 dias x 3-4 atividades.
- [ ] User chama regenerate manualmente → row UPDATE com `source='coach_manual'`. `completed_items_jsonb` resetado se `resetCompleted=true`.
- [ ] User toggle item completed → row atualizada. Refetch retorna 1/14 completed.
- [ ] User com `lesson` type item completed → toast NAO criar sessao (RF-1 cuida).
- [ ] User com `hand_review` type completed → dialog "registrar?" abre, CTA leva ao StudyLogDialog pre-preenchido.

##### Validacao
- [ ] User sem `has_coach_access` → endpoint regenerate retorna 403 NO_COACH_ACCESS. UI gating.
- [ ] User com quota=0 → 429 QUOTA_EXCEEDED.
- [ ] Body `resetCompleted` nao boolean → 400.
- [ ] `itemId` invalido no toggle → 404.
- [ ] User tenta regenerate 2x no mesmo dia → 429.

##### Regras de negocio
- [ ] Cron nao recria plano se ja existe para semana (UNIQUE constraint + check pre-insert).
- [ ] Coach output JSON invalido → retry 1x. Se 2a falha, log estruturado + cron continua proximo user.
- [ ] `daily_target_minutes` calculado: avg=20 → target=19; avg=null → 30.
- [ ] `daily_target_minutes` clamp: avg=200 → 120 (cap).
- [ ] Cron skipa user com `is_active=false`.

##### Edge cases
- [ ] User sem nenhuma `study_sessions_v2` registrada → avgDuration null → target=30. Plano gerado com defaults.
- [ ] User sem focus stats E sem leaks → plano gerado mais generico (Coach handle).
- [ ] User troca de timezone mid-week → `week_start_date` calc em UTC sempre. Aceito.
- [ ] Cron roda mas alguem ja gerou manual no domingo → SKIP (UNIQUE conflict).
- [ ] Output Coach com 4 dias (nao 5) → schema Zod rejeita → retry → se persistir, log + skip user. Plano nao salva.
- [ ] Toggle de item de plano antigo (semana passada) → 200 mas no-op (apenas semana corrente eh editavel). Documentar.
- [ ] Concurrent: 2 toggles simultaneos no mesmo item → ultimo wins (read-modify-write). Aceito risco minor.

---

### RF-4: Coach insight pos-sessao live

**Descricao:** Apos finalize de sessao /grind-live (`POST /api/grind-sessions/:id/finalize`), Coach AI analisa torneios + spots gravados + retorna structured insights: top 3 maos para review, aulas relevantes baseadas em decisoes, spots gravados visualizaveis. UI: painel "Insights da sessao" no `/grind-live/:id/recap` (ou modal pos-finalize, architect decide). CTAs: "Registrar review", "Assistir aula", "Adicionar insight ao spot". Cache 24h por session.

#### Regras de negocio

##### RF-4.1: Trigger e timing

- Endpoint novo `GET /api/coach/session-insights/:sessionId`. Auth + ownership check.
- Backend NAO gera insights na finalize handler em si (latencia ruim para finalize). Lazy-on-demand: client chama o endpoint quando user abre o painel/modal recap.
- Cache 24h: store em `coach_session_insights` (nova mini-table) ou em cache em-memoria por session. Architect decide; **recomendacao spec: tabela porque queremos persistencia para auditoria**.

##### RF-4.2: Schema `coach_session_insights` (NOVA tabela)

```ts
coach_session_insights {
  id: varchar(21) PK NOT NULL
  user_id: varchar(21) NOT NULL FK users.userPlatformId
  grind_session_id: varchar(21) NOT NULL UNIQUE FK grind_sessions.id ON DELETE CASCADE
  insights_jsonb: jsonb NOT NULL
  generated_at: timestamptz NOT NULL DEFAULT now()
  expires_at: timestamptz NOT NULL  // generated_at + 24h
  cost_tokens_used: integer
  created_at: timestamptz NOT NULL DEFAULT now()
}
```

**Indices:**
- `UNIQUE (grind_session_id)` — 1 insight por sessao.
- `(user_id, generated_at DESC)`.

**Shape `insights_jsonb`:**
```ts
type SessionInsights = {
  summary: string  // max 200 char, 1-2 frases
  topHands: Array<{
    handId: string  // FK starredHands.id (criado durante sessao OU ad-hoc da analise)
    title: string  // max 80, ex: "BB defense vs UTG 3bet"
    rationale: string  // max 200, "Pot de 25BB, voce check-fold com middle pair OOP"
    action: 'review' | 'study'
    ctaUrl: string  // ex: /estudos/spots/<handId> OR /biblioteca/curso/X/Y/play
    handBadge?: 'big_pot' | 'tilted' | 'gto_deviation' | 'icm_critical'
  }>  // max 3
  suggestedLessons: Array<{
    lessonId: string
    title: string
    courseSlug: string
    lessonSlug: string
    rationale: string  // max 150
    durationSeconds: number
  }>  // max 2
  spotsToReview: Array<{
    spotId: string  // starredHands.id criado pelo user durante sessao
    label: string
    suggestedAction: 'add_insight' | 'link_theme' | 'review_later'
  }>  // todos os spots da sessao + suggestion default
  focusStatsHighlight: Array<{
    statId: string
    statName: string
    occurredCount: number  // quantas vezes essa stat-related decision apareceu na sessao (estimativa heuristica)
    rationale: string
  }>  // max 3 (1 por focusStat marcada do mes)
}
```

##### RF-4.3: Algoritmo de geracao

```
INPUT: sessionId, userId

1. Verify ownership: grind_session.user_id === userId. Else 403.
2. Verify sessao finalizada (`status='completed'` ou similar). Else 400 SESSION_NOT_FINALIZED.
3. Cache check: SELECT coach_session_insights WHERE grind_session_id=X AND expires_at > now().
   IF found: return.
4. Coletar context:
   a. session = grind_sessions row
   b. tournaments = SELECT tournaments WHERE grind_session_id=X (mesmo escopo de session_tournaments via storage)
   c. spots = SELECT starredHands WHERE grind_session_id=X
   d. focusStats = SELECT user_focus_stats WHERE user_id=X AND month=current_month
   e. starredHandIds = spots.map(s => s.id)
5. Build prompt para Coach (Claude):
   - Sistema: persona tiered (reuso `coachSystemBuilder`).
   - User block:
     "Sessao [date], [N] torneios, duracao [X]h.
      Resultado: [profit USD]. Spots gravados: [N].
      Stats foco do mes: [list]. Aulas disponiveis: [list curated em tema com linkedStats matching focusStats]."
   - Instrucao: "Gere insights estruturados. Output JSON SessionInsights. Prefere maos com pots grandes ou decisoes desviantes. Aulas devem matchear stats foco. spotsToReview lista os spots da sessao + sugestao default por tipo (tilt → review_later; leak → add_insight). 1-2 frases summary."
6. Tool `coachSessionInsights` retorna structured output. Validar Zod.
7. INSERT coach_session_insights. expires_at = now() + 24h.
8. Return.
```

##### RF-4.4: UI

Componente `<CoachSessionInsightsPanel sessionId>` em `/grind-live/:id/recap` ou modal pos-finalize:

- 4 sections empilhadas:
  1. **Resumo** — `summary` text + badge "Gerado [Xs atras]".
  2. **Top maos para review** — 3 cards horizontais:
     - Card: titulo + rationale + badge tipo (big_pot/tilted/gto_deviation/icm_critical).
     - CTA primary "Registrar review" → abre `<StudyLogDialog mode='hand_review'>` pre-preenchido com `starred_hand_ids=[handId]`.
     - CTA secondary "Adicionar insight" → abre dialog inline para editar `notes`/`learning` do spot.
  3. **Aulas sugeridas** — 2 cards:
     - Thumbnail + title + rationale + duracao.
     - CTA "Assistir aula" → navega `/biblioteca/curso/${courseSlug}/${lessonSlug}/play`. Lesson #19.
  4. **Stats foco da sessao** — 3 chips com `statName`, `occurredCount` (estimativa), rationale curto.
- Loading state: skeleton 3 sections (5s pode demorar primeira call).
- Error state: "Coach indisponivel agora. Tente novamente em alguns minutos." + retry button.
- Empty state (sessao sem spots, sem torneios): "Sessao curta — sem insights estruturados. [Registrar manualmente]".

##### RF-4.5: Endpoint

```
GET /api/coach/session-insights/:sessionId
  Auth: requireAuth
  Cache: server-side via tabela `coach_session_insights` (24h).
  Response: SessionInsights + metadata (cached: bool, expiresAt).

POST /api/coach/session-insights/:sessionId/regenerate
  Auth: requireAuth + rate limit 3/sessao (anti-spam).
  Forca regenerate, ignora cache. Retorna novo insights.
  Use case: user sentiu insight ruim e quer outra tentativa.
```

##### RF-4.6: Auto-prompt opt-in

- Setting `home_layout_settings.studyHabit.autoPromptCoachInsightsAfterLive`: boolean default **false** (premium pode flag-onar).
- Quando true E sessao finalize > 30min duracao → modal abre automaticamente pos-finalize (via redirect handler).
- Quando false → user precisa abrir /grind-live/:id/recap manualmente.

#### Critério de aceitacao RF-4

- [ ] Migration nova cria tabela `coach_session_insights` com indices.
- [ ] Coach tool `coachSessionInsights` em `coachToolRunner.ts` que recebe sessionId context + retorna structured.
- [ ] Service `server/services/coachSessionInsightsService.ts` orquestra cache + call Coach + persist.
- [ ] Endpoint `GET /api/coach/session-insights/:sessionId` retorna cached ou gera fresh.
- [ ] Endpoint `POST /api/coach/session-insights/:sessionId/regenerate` ignora cache, rate-limited 3/sessao.
- [ ] Componente `<CoachSessionInsightsPanel />` instalado em `/grind-live/:id/recap`.
- [ ] CTAs "Registrar review" abre `StudyLogDialog` pre-preenchido.
- [ ] CTA "Assistir aula" navega Wouter route com courseSlug+lessonSlug (lesson #19).
- [ ] Setting `autoPromptCoachInsightsAfterLive` adicionado ao shape settings.
- [ ] Auto-prompt ativa modal apos finalize quando setting=true e sessao > 30min.
- [ ] Telemetria event `coach_session_insights_generated` + `coach_insight_cta_clicked` (granular por tipo).

#### Cenarios de teste derivados RF-4

##### Happy path
- [ ] User finaliza sessao com 5 spots + 12 torneios → opens recap → endpoint chama → Coach gera insights → cache salvo → response 4 sections preenchidas.
- [ ] Refetch < 24h → cache hit, sem chamar Coach.
- [ ] User clica "Registrar review" → StudyLogDialog abre com `starred_hand_ids=[handId]`.
- [ ] User clica "Assistir aula" → navega para player corretamente.

##### Validacao
- [ ] User nao-owner da sessao → 403.
- [ ] Sessao nao finalizada → 400.
- [ ] Setting auto-prompt ON + sessao 20min (< 30min threshold) → modal NAO abre auto.
- [ ] Regenerate acima de 3/sessao → 429.

##### Regras de negocio
- [ ] User com quota Coach=0 → 429 ou response com `insights={}` + flag `quota_exceeded=true`. UI mostra "Coach indisponivel".
- [ ] Cache expirado (>24h) + GET → re-gera.
- [ ] Spots da sessao = 0 → empty state "sessao curta".
- [ ] Coach output JSON invalido → retry 1x → log + 500.
- [ ] User sem focus stats marcadas → `focusStatsHighlight=[]`.

##### Edge cases
- [ ] Sessao com 1 torneio super curto + 0 spots → insights minimos, summary genérico.
- [ ] starred_hand_ids referenciando spot deletado pos-geracao → CTA "Registrar review" mostra error toast "Spot indisponivel".
- [ ] User finaliza sessao em 23:55 UTC + opens recap em 00:30 UTC dia seguinte → cache valido (24h baseado em generated_at). Funciona.
- [ ] Concurrent: 2 calls GET em < 1s → race no SELECT-then-INSERT pode duplicar. Mitigar via UNIQUE (grind_session_id) constraint + INSERT ON CONFLICT DO NOTHING.

---

## Requisitos Nao-Funcionais

- **Performance:**
  - `POST /api/study-sessions` (`source=auto_lesson` flow): < 300ms p95 (idempotency + lookup tema).
  - `GET /api/biblioteca/recommendations` cache hit: < 50ms p95.
  - `GET /api/biblioteca/recommendations` cache miss: < 800ms p95 (joins + jsonb).
  - `GET /api/study-weekly-plan`: < 100ms p95 (single row read).
  - `POST /api/study-weekly-plan/regenerate`: 5-15s acceptable (Coach inference). UI mostra progress.
  - `GET /api/coach/session-insights/:sessionId` cache hit: < 80ms p95.
  - `GET /api/coach/session-insights/:sessionId` cache miss: 5-12s (Coach inference). Loading state.

- **Seguranca:**
  - Todos endpoints `requireAuth`.
  - Cross-user access reject: `lessonId`, `themeId`, `tournamentId`, `starred_hand_ids`, `grind_session_id` validados.
  - Rate limits explicitados acima por endpoint.
  - Coach quota tracking integrado (reuso infra Sprint Coach-1/2A/2B).

- **Disponibilidade:**
  - Cron `generateWeeklyStudyPlanCron` falha individual nao bloqueia outros users.
  - Anthropic API down → cron loga estruturado + skipa users impactados. Plano fica null para semana.
  - Recommendations endpoint cache resilient: se invalidator falha, cache continua valido ate TTL.

- **Custo:**
  - Coach inference por user: ~1k tokens output plano semanal + ~600 tokens output insights pos-sessao. Estimativa $0.05-0.10/user/semana premium tier.
  - Cron pacing 200ms entre users. Coach quota check prev-flight evita custos.

- **i18n:**
  - UI 100% PT-BR.
  - Coach output prompt: instrucao "responda em portugues do Brasil".

- **Acessibilidade:**
  - Cards recomendacoes navegaveis por teclado (Tab + Enter).
  - Modal recap com focus trap.
  - Toast com role=alert.

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/study-sessions` | (existente, Sprint 1) Aceitar `source='auto_lesson'` | JWT | 60/min |
| GET | `/api/biblioteca/recommendations` | Aulas recomendadas por leak | JWT | - |
| POST | `/api/biblioteca/recommendations/refresh` | Invalida cache + re-fetch | JWT | 5/dia |
| GET | `/api/study-weekly-plan?week=` | Plano da semana (current default) | JWT | - |
| POST | `/api/study-weekly-plan/regenerate` | Forca regenerate manual | JWT | 1/dia |
| PATCH | `/api/study-weekly-plan/items/:itemId/toggle` | Marca completed/uncompleted | JWT | 60/min |
| GET | `/api/coach/session-insights/:sessionId` | Insights cached ou novo | JWT | - |
| POST | `/api/coach/session-insights/:sessionId/regenerate` | Regenera ignorando cache | JWT | 3/sessao |
| PATCH | `/api/users/me/settings` | (existente) Aceitar novos toggles `autoLogLessons`, `autoPromptCoachInsightsAfterLive` | JWT | 30/min |

---

## Modelos de Dados Afetados

### `study_themes` (sem mudanca de schema)

`linkedLessons` jsonb ja existe (ADR-127). Apenas seed/uso por RF-2.

### `study_sessions_v2` (sem mudanca de schema)

`source='auto_lesson'` ja existe no enum (ADR-126). Apenas ATIVA o trigger.

**Errata ADR-126:** clarificar que `mode='lesson'` aceita `themeId=null` quando aula nao tem mapeamento via `linkedLessons`. Sprint 1 spec dizia "tema vem da aula automaticamente" — formalizar fallback null como aceito.

### `study_weekly_plans` (NOVA tabela)

Schema definido em RF-3.2 acima.

| Campo | Tipo | Constraints |
|---|---|---|
| `id` | varchar(21) | PK NOT NULL nanoid |
| `user_id` | varchar(21) | NOT NULL FK users.userPlatformId CASCADE |
| `week_start_date` | date | NOT NULL — segunda da semana UTC |
| `plan_jsonb` | jsonb | NOT NULL — array de StudyWeeklyPlanDay |
| `generated_at` | timestamptz | NOT NULL DEFAULT now() |
| `completed_items_jsonb` | jsonb | NOT NULL DEFAULT '[]' |
| `source` | varchar(16) | NOT NULL CHECK source IN ('coach_auto', 'coach_manual') |
| `daily_target_minutes` | integer | NOT NULL CHECK >= 5 AND <= 240 |
| `cost_tokens_used` | integer | nullable (tracking) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**Indices:**
- `UNIQUE (user_id, week_start_date)` — idempotency cron + manual.
- `(user_id, generated_at DESC)` — historico.

### `coach_session_insights` (NOVA tabela)

Schema definido em RF-4.2 acima.

| Campo | Tipo | Constraints |
|---|---|---|
| `id` | varchar(21) | PK NOT NULL |
| `user_id` | varchar(21) | NOT NULL FK |
| `grind_session_id` | varchar(21) | NOT NULL UNIQUE FK CASCADE |
| `insights_jsonb` | jsonb | NOT NULL |
| `generated_at` | timestamptz | NOT NULL DEFAULT now() |
| `expires_at` | timestamptz | NOT NULL |
| `cost_tokens_used` | integer | nullable |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

**Indices:**
- `UNIQUE (grind_session_id)`.
- `(user_id, generated_at DESC)`.

### `users` (sem nova coluna direta — extensao JSONB)

Estender `users.home_layout_settings.studyHabit` shape com:
```ts
studyHabit: {
  autoLogLessons: boolean              // default true
  autoPromptCoachInsightsAfterLive: boolean  // default false
}
```

**Sem migration SQL.** Lazy back-fill via storage layer (lesson #7 — schema deprecation gradual).

### `library_lessons` (sem mudanca direta)

Reuso campos existentes (`runtime_seconds`, `is_published`, `course_id` → courseSlug via JOIN, `slug` → lessonSlug).

### `library_lesson_progress` (sem mudanca direta)

Reuso de `progress_pct` para hidratar `watchedPct` em RF-2.

---

## Coach Prompts e Tools

### Tool nova: `coachStudyPlan`

```ts
// server/coachToolRunner.ts (extensao)
{
  name: 'coachStudyPlan',
  description: 'Gera plano de estudo semanal personalizado baseado em focus stats, leaks recentes, aulas relevantes e starred hands criticos. Output: 5 dias x 3-4 atividades estruturadas.',
  input_schema: {
    type: 'object',
    properties: {
      userContext: { type: 'object', /* shape definido em RF-3.1 */ },
      weekStartDate: { type: 'string' /* ISO date */ }
    },
    required: ['userContext', 'weekStartDate']
  }
}
```

System prompt block: `STUDY_PLAN_SYSTEM_PROMPT` em `server/coachPrompts.ts`. Lesson #10 — DRY de prompts, extrair em arquivo dedicado se reuso entre cron e endpoint manual.

### Tool nova: `coachSessionInsights`

```ts
{
  name: 'coachSessionInsights',
  description: 'Analisa sessao /grind-live finalizada e retorna insights estruturados: top 3 maos, aulas sugeridas, spots para review.',
  input_schema: {
    type: 'object',
    properties: {
      sessionContext: { type: 'object', /* shape definido em RF-4.3 */ }
    },
    required: ['sessionContext']
  }
}
```

System prompt block: `SESSION_INSIGHTS_SYSTEM_PROMPT`.

### Persona / lazy loading

Reusar pattern Sprint Coach-2A/2B: tools so carregam quando contexto pagina match (`/estudos`, `/grind-live`, `/coach`). `coachStudyPlan` so para `/estudos`. `coachSessionInsights` para `/grind-live/:id/recap`.

---

## UI Mockups (ASCII)

### Toast pos auto-log (RF-1)

```
┌─────────────────────────────────────────────────┐
│ ✓ Estudo registrado: Bloco A — Ep 4 (12 min)    │
│                              [Ver detalhes] [×] │
└─────────────────────────────────────────────────┘
```

### Lesson Recommendations Card (RF-2) — `/home`

```
┌────────────────────────────────────────────────────────────────────┐
│  Aulas recomendadas pra voce      Atualizado 5min atras  [↻]      │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ [thumb]     │  │ [thumb]     │  │ [thumb]     │                 │
│  │ Ep 4: C-bet │  │ Ep 7: 3-bet │  │ Ep 9: ICM   │                 │
│  │ OOP         │  │ Defense     │  │ bubble play │                 │
│  │             │  │             │  │             │                 │
│  │ Tema:C-bet  │  │ Tema:3bet   │  │ Tema: ICM   │                 │
│  │ Leak:-10%   │  │ Leak: -8%   │  │ Leak: -5%   │                 │
│  │ ▓▓▓░░ 45%   │  │ ░░░░░ 0%    │  │ ░░░░░ 0%    │                 │
│  │ 12 min      │  │ 18 min      │  │ 25 min      │                 │
│  │             │  │             │  │             │                 │
│  │ [Assistir]  │  │ [Assistir]  │  │ [Assistir]  │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└────────────────────────────────────────────────────────────────────┘
```

### Plano da semana Card (RF-3) — `/estudos`

```
┌────────────────────────────────────────────────────────────────────┐
│  Plano da semana 06/05 a 10/05      Gerado 2h atras    [Regenerar] │
│  Progresso: 4/14 ▓▓▓░░░░░░░░░                                      │
├────────────────────────────────────────────────────────────────────┤
│  Seg 06/05 (45min)        Ter 07/05 (45min)   Qua 08/05 (60min)    │
│  ☑ Drill GTO 3bet 30min   ☐ Aula Ep4 12min    ☐ Hand review 30min  │
│  ☑ Aula Ep5 15min          ☐ Snapshot 15min    ☐ Drill ICM 30min   │
│                            ☐ Theory 18min                          │
│  ────────────────────────────────────────────────────────────────  │
│  Qui 09/05 (45min)        Sex 10/05 (60min)                        │
│  ☐ Drill 3bet OOP 30min   ☐ Aula Ep6 30min                         │
│  ☐ Spot review 15min       ☐ Drill final 30min                     │
└────────────────────────────────────────────────────────────────────┘
```

### Coach Session Insights Panel (RF-4) — `/grind-live/:id/recap`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Insights da sessao              Gerado 30s atras   [Regenerar]    │
├─────────────────────────────────────────────────────────────────────┤
│  Resumo: Sessao 4h, 22 torneios, +$143. 3 spots criticos. ICM      │
│  bubble decisions foram bem; C-bet OOP em 3-bet pots fraco.        │
│                                                                     │
│  ▸ Top 3 maos para review                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ [big_pot] BB defense vs UTG 3bet · pot 25BB                │  │
│  │  Voce check-fold com middle pair OOP. Frequencia + EV.     │  │
│  │  [Registrar review] [Adicionar insight]                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ [icm_critical] CO open com 12BB stack ICM bubble           │  │
│  │  Open shove vs raise: marginal +EV mas alto var.           │  │
│  │  [Registrar review] [Adicionar insight]                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ▸ Aulas sugeridas                                                  │
│  [Ep4 C-bet OOP] [Ep7 ICM bubble]                                  │
│                                                                     │
│  ▸ Spots gravados (5)                                               │
│  Spot #1 [add_insight]  Spot #2 [link_theme]  Spot #3 [review]     │
│                                                                     │
│  ▸ Stats foco da sessao                                             │
│  C-bet OOP (×8)   3bet defense (×4)   ICM bubble (×2)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Metricas de Sucesso

### Metas Sprint 2 (D7-D14 pos-deploy)

- **RF-1 Auto-log adoption:** % users premium com >= 1 `auto_lesson` session/semana → **target 60%** (assumindo Bloco A com aulas mapeadas).
- **RF-1 Opt-out rate:** % users que desligam `autoLogLessons` → **target < 5%** (anti-flag).
- **RF-2 Click-through recomendacoes:** % cards exibidos que recebem click → **target 30%** (CTR alto pq leak-driven).
- **RF-2 Conversao recomendacao → study session:** % clicks que resultam em RF-1 trigger (assistiu >= 80%) → **target 50%**.
- **RF-3 Plano semanal cobertura:** % users premium com plano ativo na semana corrente → **target 70%**.
- **RF-3 Adesao plano:** mean % itens completed por plano semanal → **target 40%**.
- **RF-3 Manual regenerate:** % users que clicam regenerate >= 1x na primeira semana → **target 30%** (sinal de iteracao saudavel).
- **RF-4 Insights opening rate:** % sessoes /grind-live finalizadas onde user abre recap → **target 50%**.
- **RF-4 CTA click-through:** % cards "Registrar review" clicados / cards exibidos → **target 25%**.

### Metas Sprint 2 (M1 pos-deploy)

- **% users com `auto_lesson` >= 1/semana e plano semanal ativo:** **target 40%** (cohort engaged).
- **Mean tokens consumidos por user/semana (Coach):** **< 5k** (cost ~$0.05/user/semana premium).
- **Mean watchedPct das aulas recomendadas RF-2:** **target 60%+** (sinal qualidade match).
- **Coach quota exhaustion rate:** **< 10%** (se >10%, repensar quotas).

### Counter-metrics (red flags)

- Spike de regenerate >= 2/semana pelo mesmo user → plano ruim, ajustar prompt.
- DELETE rate de `auto_lesson` sessions > 5% → user nao concorda com auto-log → repensar UX.
- `cost_tokens_used` mediana acima de 2k por plan → prompt verboso, otimizar.
- Auto-prompt insights modal dismiss rate > 70% → modal eh interrupcao indesejada → repensar trigger threshold.

---

## Riscos e Mitigacoes

| # | Risco | Mitigacao |
|---|-------|-----------|
| **R1** | Coach gera plano que NAO mapeia aulas reais existentes (alucinacao) | Validar `lessonId` no output Zod schema vs `library_lessons.id` reais. Se invalido, retry 1x; se persistir, log + fallback "Sem aulas matching" item description. |
| **R2** | Coach gera plano com totais minutos fora de range | Zod range check (`estimatedMinutes` 5-120, daily total ±15% target). Reject + retry. |
| **R3** | Recomendacao stale apos user atualizar foco/leaks | Cache invalidator em hooks de `POST /api/stats/focus` etc. TTL 60min hard-stop. |
| **R4** | Custo Coach inference balanceando contra ROI | Quota tracking ja existe. Cron pacing 200ms. Pre-flight check de quota antes de chamar. Telemetria `cost_tokens_used`. |
| **R5** | Hallucinacao em insights pos-sessao linkando spots/handIds inexistentes | Validar `handId` ∈ `starredHands` ids da sessao no output. Reject + retry. |
| **R6** | Auto-log lesson cria duplicate em concurrent tabs | Idempotency `(user_id, lesson_id, 24h)` + `FOR UPDATE` (RF-1.3). Lesson #10. |
| **R7** | linkedStats/linkedLessons subutilizados (founder nao seedou) | Sprint inclui task fora de codigo: founder seed planilha de mapping para Bloco A (9 episodios). Sem isso RF-2 fica vazio. **Bloqueador soft.** |
| **R8** | Plano semanal nao retroativo: user comeca quarta-feira da semana, plano dia-anterior parece "perdido" | UI mostra dias passados como "Passado, sem progresso" sem CTA negativo. Foco em dias restantes. |
| **R9** | Coach quota exhausted mid-week → user perde regenerate | Botao gating + 429 server. UI explica "Cota Coach atingida — disponivel novamente [data reset]". |
| **R10** | Race regenerate concurrent: 2 calls em < 1s | UNIQUE (user_id, week_start_date) + INSERT...ON CONFLICT DO UPDATE. App-level lock opcional. |
| **R11** | Cron falha em mes/data especifico → users sem plano semana | Cron logging estruturado. Manual fallback: user clica "Gerar plano agora" no /estudos. |
| **R12** | Lesson #28 (vi.mock por path) — testes mockando `coachToolRunner` em paths diferentes | Padronizar imports via shim `@/services/coachToolRunner` se necessario para testes. |
| **R13** | Hidratacao de courseSlug+lessonSlug em RF-2 e RF-4 quebra rota Wouter | Lesson #19 — sempre JOIN com `library_courses` para hidratar slugs. Validar route casamento via test. |

---

## Dependencias

### Pre-requisitos (ja existem)

- **Sprint Estudos-Habito-1** (ADR-126/127) — `study_sessions_v2` + `study_themes.linkedLessons` + `study_themes.linkedStats`. **OBRIGATORIO mergeado em main.**
- **Sprint Biblioteca-1/2** (ADRs 071-076) — Mux Player + library_lessons + library_lesson_progress. **OBRIGATORIO.**
- **Sprint Coach-1/2A/2B** — coach* infra modular, persona tiered, tools, page context. **OBRIGATORIO.**
- **Sprint home-reform-4 Item 7** (ADR-116) — `getStatsLeaks()`, `user_focus_stats`. **OBRIGATORIO para RF-2 e RF-3.**
- **Sprint News-3** (ADR-107) — cron infra pattern. **OBRIGATORIO para RF-3 cron.**
- **Sprint Spot-Screenshots** (ADR-057) — spots infra reuso para RF-4 spot CTAs.
- **Sprint Studies-Reform** (ADR-067/068) — shell `/estudos` + sub-rotas + dashboard hub. **OBRIGATORIO para placement RF-2/RF-3.**
- **Sprint Grind-Live spot notes / finalize** — handler de finalize sessao /grind-live. **OBRIGATORIO para RF-4.**

### Bloqueadores externos (founder)

- **Seed `linkedLessons` + `linkedStats` em `study_themes` curated** — sem isso, RF-2 retorna vazio e RF-3 gera plano sem aulas mapeadas. Founder deve seedar via planilha → script de import (~30 temas + Bloco A 9 episodios). **Pode ser paralelo a implementacao mas precisa estar pronto antes de QA.**

### Bloqueia (sera Sprint 3)

- **Spot Learning Loop + Spaced Reentry (Anki)** — depende de RF-4 maduro como gateway pos-sessao + RF-2 como content source.
- **Coach review mensal** — depende de RF-3 com >= 4 semanas de historico.
- **Stats foco evolution chart** — independente, paralelo OK.

---

## Notas de Implementacao (sugestoes para Implementer)

### Arquitetura

- **Cron RF-3:** seguir pattern `server/cron/refreshNews.ts` (Sprint News-3). Use idle scheduler ou node-cron biblioteca ja em uso.
- **Cache RF-2:** Map<userId, {data, expiresAt}> em memoria server. NAO usar Redis (overkill Sprint 2). `_resetForTests()` export. Lesson #21.
- **Coach tools RF-3 e RF-4:** seguir pattern `server/coachToolRunner.ts` existente. Lazy load por context (`/estudos` para study plan; `/grind-live` para insights).
- **System prompts:** extrair em `server/coachPrompts.ts` ou subarquivo dedicado se prompt > 50 linhas. Lesson #10 (DRY de prompts).

### Drizzle / Schema

- **Tabela `study_weekly_plans`:** Drizzle define no `shared/schema.ts`. Index UNIQUE composite (`user_id`, `week_start_date`).
- **Tabela `coach_session_insights`:** idem. Index UNIQUE em `grind_session_id`.
- **Migration:** ordem importa — depois Sprint 1 e Sprint Coach-X (FKs). Architect coordena ordem.

### Testes

- **Lesson #1 (hooks first):** RF-1 hook `useLessonStudyAutoLog` deve seguir Rules of Hooks. Early return sempre depois.
- **Lesson #14 (vi.hoisted):** mocks de `coachToolRunner` precisam usar `vi.hoisted` se const-spy.
- **Lesson #15 (polyfill localStorage):** se hook RF-1 usa localStorage para `firedThisMount`, polyfill em `tests/setup.ts` para node env (ou hook fica em-memoria via useRef).
- **Lesson #19 (CTA targets):** todo URL hidratado via JOIN courseSlug+lessonSlug. Test que valida casamento com Wouter route.
- **Lesson #20 (player wirar via container):** RF-1 hook usa `container.querySelector('mux-player, video, audio')` e captura `timeupdate`.
- **Lesson #21 (cache server-side):** `invalidateBibliotecaRecommendationsCache` chamado em mutations relevantes. Test integration.
- **Lesson #26 (vitest 4 + require .tsx):** evitar `require()` em testes; usar `await import()`.
- **Lesson #27 (Radix):** se `<CoachSessionInsightsPanel />` usa Radix Tabs, garantir `onClick` redundante para RTL `fireEvent.click`.
- **Lesson #30 (hook test jsdom):** RF-1 hook test em `.test.ts` precisa jsdom config.

### Coach output validation

- Schema Zod rigido para `StudyWeeklyPlan` e `SessionInsights`. Cada campo tipado, ranges, max lengths.
- Retry 1x com prompt "schema correto: {schema}". Se persistir fail, log estruturado `{ userId, error: 'coach_output_invalid', raw: <output> }` + 500 (manual) ou skip (cron).

### Telemetria

- Eventos novos:
  - `auto_log_lesson_triggered` `{ userId, lessonId, durationMinutes }`
  - `auto_log_lesson_opted_out`
  - `biblioteca_recommendation_clicked` `{ userId, lessonId, leakStatId }`
  - `study_plan_generated` `{ userId, source, tokensUsed, durationMs }`
  - `study_plan_regenerated`
  - `study_plan_item_toggled` `{ userId, itemType, completed }`
  - `coach_session_insights_generated` `{ userId, sessionId, tokensUsed, cached }`
  - `coach_insight_cta_clicked` `{ userId, ctaType }`

### Evitar

- Hardcoded `lessonId`/`themeId` em testes — sempre via factory.
- Trust client em `durationMinutes` no auto-log RF-1 — server cap via lessonRuntime.
- Re-implementar logica de leak detection — reusar `getStatsLeaks()`.
- Coach prompt verboso — manter < 1k tokens system + < 500 user context para custo.

---

## Verificação Final (PM)

- [x] Cada requisito tem critérios de aceitacao verificáveis.
- [x] Cenários de teste cobrem happy path, validacao, regras negocio, edge cases.
- [x] Out of Scope explicito (Sprint 3 e features deferidas).
- [x] Endpoints listados com método, rota, descricao, auth, rate limit.
- [x] Modelos de dados afetados documentados com campos e constraints.
- [x] Riscos e mitigacoes mapeados (13 riscos).
- [x] Dependencias com sprints anteriores documentadas + bloqueadores externos.
- [x] Lessons learned aplicaveis citadas.
- [x] Mockups ASCII para fluxos principais.
- [x] Metas de sucesso quantificaveis (D7-D14 + M1 + counter-metrics).
- [x] Coach prompts/tools necessarios definidos.

---

## Proximo Passo

Apos aprovacao founder:

```
✅ Spec aprovada e salva em Docs/specs/estudos-coach-biblio-2.md

Proximo passo recomendado:
→ Use o agente system-architect para criar a arquitetura
  baseada na spec em Docs/specs/estudos-coach-biblio-2.md.

  Architect deve produzir:
  - ADR para "study_weekly_plans schema + cron pattern" (decisao chave)
  - ADR para "coach_session_insights cache strategy: tabela vs memoria"
  - ADR para "auto_lesson trigger: client-side vs server-side push" (decisao do hook Mux)
  - Migration sequence (study_weekly_plans + coach_session_insights — 2 migrations distintas ou monolitica?)
  - Errata ADR-126: themeId nullable em mode='lesson' quando aula nao tem mapping
  - Fluxograma RF-1 trigger: timeupdate → 80% → POST → toast (frontend + server idempotency)
  - Fluxograma RF-3 cron: segunda 9h UTC → loop users → coletar context → call Coach → validate → persist
  - Diagrama sequencia RF-4: finalize → user opens recap → cache check → Coach call → render
  - Atualizar `Docs/architecture/data-model-index.md` com tabelas novas
  - Atualizar `Docs/api/coach-tools.md` com `coachStudyPlan` e `coachSessionInsights`
```
