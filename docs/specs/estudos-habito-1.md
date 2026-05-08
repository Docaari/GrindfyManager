# Spec: Sprint Estudos-Habito-1 — Sistema Log Estudo + Foco Stats Mensal

## Status
**Proposta** | Aprovada | Em Desenvolvimento | Concluida

## Resumo Executivo

Transformar o modulo `/estudos` em **assistente de habito de estudo** com 4 RFs unificadas:

1. **RF-1 Form Log Estudo** — registro post-hoc primary + cronometro live opcional, 4 modos primarios (`drill_gto`, `tournament_review`, `hand_review`, `lesson`) + escape hatch (`other`).
2. **RF-2 Daily Goal + Streak honesto + Freeze automatico** — meta diaria configuravel, streak so conta com meta atingida, 2 freezes/mes silenciosos.
3. **RF-3 Stats Foco 3/mes (extensao do existente)** — header dedicado em `/stats-analyzer`, auto-suggest top 3 leaks, allow theme-less focus (relax FK existente).
4. **RF-4 Focus Stats Bar global** — componente reutilizavel exibido em paginas relevantes do produto, com toggle global em settings.

A entrega 1+2 cria a primeira metrica honesta de "tempo investido em estudo" e fecha o ciclo de retencao via streak/goal. A entrega 3+4 transforma "foco do mes" de feature enterrada em lente persistente cross-product. **Sem este sprint, todas as features Tier 2 e Tier 3 do research (Biblioteca=log, Plano semanal Coach, Spot Anki) ficam sem fundacao mensuravel.**

---

## Contexto

- **Fonte de verdade:** `Docs/strategy/2026-05-08-estudos-stats-analyzer-research.md` secoes 1-9. Founder validou direcao + refino v2 (secao 9). PM-Spec consome.
- **Estado atual `/estudos`:** Sprint Studies-Reform (ADR-067/068) entregou shell maduro (sidebar + sub-rotas + dashboard hub-style + Cmd+K + onboarding wizard + streak + workflow Spot↔Tema). **Nao tem cronometro principal nem registro de sessao funcional.** `studySessions` legado existe mas underused. `StudySessionTimer.tsx` legado vive dentro de `StudyCardDetail` (modulo antigo, anterior a reforma).
- **Estado atual stats foco:** Sprint home-reform-4 Item 7 (ADR-116) ja entregou tabela `user_focus_stats` (escopo mensal `YYYY-MM`, max 3, FK obrigatoria a `study_themes`), endpoint `GET /api/home/focus-stats`, componente `FocusStatsCard` no Home. **Limitacao atual:** `study_theme_id` eh obrigatoria (NOT NULL); founder pediu permitir foco sem tema linkado. Tambem nao ha header dedicado em `/stats-analyzer` nem auto-suggest.
- **Estado atual biblioteca:** Bloco A "Antes das Cartas" LIVE (9 episodios). Mux player com `useCoachRecommendationConsume` ja captura progress. **Nao alimenta `/estudos`** (gap critico do research).
- **Estado atual home settings:** `users.home_layout_settings` (JSONB) existe (Sprint home-reform-5 Item 11, ADR-119). Setting `showFocusStatsBar` ja faz parte do shape. **Vamos estender** com `focusStatsVisibility` (granular por pagina).

---

## Usuarios

| Persona | O que faz nesta sprint |
|---|---|
| **Jogador profissional MTT (founder N=1, beta tier)** | Registra estudos pos-hoc (default), opta por cronometro quando entra em sessao dedicada. Define meta diaria 30-45min. Marca 3 stats foco do mes. Ve foco em todo produto. |
| **Casual user (free tier)** | Registra estudos via FAB "Acabei!". Meta diaria opcional (default 0 = desligado). Pode marcar 3 stats foco mas sem auto-suggest avancado. |
| **Pro grinder (premium tier)** | Tudo acima + auto-trigger Mux (aulas Biblioteca contam) + auto-trigger /grind-live finalize (oferece dialog "Registrar review da sessao?"). |

Sem distincao por role para CRUD de study_sessions/focus stats. Diferenciacao por tier vive em features adjacentes (Coach AI, Biblioteca premium content) — fora de escopo.

---

## Objetivos

1. **Tornar tempo investido em estudo metrica de primeiro nivel.** Registro post-hoc rapido (< 30 segundos) + cronometro live como toggle opcional.
2. **Streak honesto.** Quebrar so apos 2+ dias sem meta atingida (com freezes esgotados). Reset zero por 1 dia missed = anti-pattern.
3. **Stats foco como lente persistente.** Visivel em /home (ja existe), /grind-live, /coach, /estudos, /stats-analyzer. User opta-out via setting global.
4. **Auto-trigger de aulas (preparacao para Tier 2).** RF-1 acomoda `source='auto_lesson'` desde o MVP, mesmo que o trigger Mux fique para Sprint 2. Schema pronto, nada quebra.

## Nao-Objetivos (Out of Scope)

- **Trigger Mux de aulas (>= 80% progress)** — schema preparado em RF-1 (source='auto_lesson') mas trigger fica para Sprint 2 (Estudos-Habito-2). Justificativa: Mux client-side hook + idempotency cross-session sao 2-3 dias dev por si so.
- **Coach AI gera plano semanal automatico** — Sprint 2.
- **Spot Learning Loop + Spaced Reentry (Anki)** — Sprint 3 (killer feature, alto esforco).
- **Stats Foco evolution chart timeline** — DEFER do Sprint 1 v1 (research §9.5). Reduz risco. Voltar em Sprint 2.
- **Stats Foco monthly review banner** ("Maio acabou. Sua C-bet OOP melhorou 4.2%...") — Sprint 2.
- **Lesson_theme_map / linkedLessons[]** em study_themes — research §9.4 propoe mas a vinculacao pelos auto-triggers Sprint 2. MVP usa apenas `lessonId` direto no `study_sessions` row.
- **Drill GTO integracao real** (API GTO Wizard / iframe) — research §9.3 confirma LOG-only no MVP. Roadmap futuro com parceria.
- **Search semantica de spots** + spot insights — Sprint 3.
- **Compartilhamento social, leagues, leaderboards** — anti-pattern para publico Pro.
- **Drill_platform / starred_hand_ids / theme_id como FK rigida** quando ausentes — schema NULL-friendly.
- **Migration de `study_materials.timeSpent` legado para `study_sessions`** — back-fill DEFER. Coluna legada continua existindo, deprecated em comment.
- **Override do `study_theme_id` obrigatorio na tabela `user_focus_stats`** = NAO precisamos desfazer. Vamos relaxar para nullable via migration (RF-3.1) sem perder a FK CASCADE. Stats foco sem tema linkado = card "valor + delta" no home/header sem CTA de "Estudar agora".

---

## Requisitos Funcionais

### RF-1: Sistema Log Estudo (Form 4 modos + escape hatch + cronometro opcional)

**Descricao:** Form unico "Registrar Estudo" com 4 modos primarios + escape hatch + toggle "Comecar agora cronometrado". Persiste em tabela nova `study_sessions_v2` (ou estende a existente — decisao do architect).

#### Regras de negocio

##### RF-1.1: Modos primarios

| Modo | Tema | Duration | Campos especificos | FK requerida |
|---|---|---|---|---|
| `drill_gto` | obrigatorio (autocomplete) | obrigatorio (>=1 min) | `drill_platform`, `drill_accuracy` (0-100, opt), `difficult_spots` jsonb (opt) | nenhuma |
| `tournament_review` | opcional | obrigatorio | nenhum | `tournament_id` (FK `tournaments.id`, autocomplete recents 30d, optional — pode ser torneio externo) |
| `hand_review` | opcional | obrigatorio | nenhum | `starred_hand_ids` jsonb array (>=1) — vinculo a `starred_hands.id` |
| `lesson` | obrigatorio* | obrigatorio | nenhum | `lesson_id` (FK `library_lessons.id`, autocomplete published lessons) — *tema vem do tema da aula automaticamente, mas user pode override |
| `other` | obrigatorio (texto livre, autocomplete) | obrigatorio | nenhum | nenhuma |

Nota: "tema obrigatorio" significa que o user deve selecionar um existente OU criar novo via "+ Criar tema novo". Tema texto-livre fora da tabela = rejected.

##### RF-1.2: Origem do registro (`source` discriminator)

| `source` value | Quando | Acionado por |
|---|---|---|
| `manual_post_hoc` | DEFAULT do form (toggle "Comecar agora cronometrado" OFF) | User clica "Registrar Estudo" e preenche form com `started_at` opcional ou null |
| `manual_live` | Toggle "Comecar agora cronometrado" ON | User clica "Registrar e Iniciar" → cria session com `started_at=now()`, status `running`. Cronometro rodando inline. Stop salva `ended_at` + `duration_minutes` calculado |
| `auto_lesson` | (preparado, trigger Sprint 2) | Mux progress >= 80% chama `POST /api/study-sessions` com idempotency `lesson_id + user_id + 24h window` |
| `auto_grind_finalize` | /grind-live finalize handler (Sprint 2) | Sessao live > 30min + opt-in via setting → dialog "Como foi?" |

**MVP Sprint 1 Sprint:** apenas `manual_post_hoc` e `manual_live` ATIVOS. `auto_lesson` e `auto_grind_finalize` aceitos pelo backend (validados como `source` valido) mas NAO ha gatilho frontend. Schema preparado.

##### RF-1.3: Validacao server-side (Zod, NAO trust client)

- `mode` ∈ enum acima.
- `source` ∈ enum acima.
- `duration_minutes`: integer >= 1, <= 1440 (24h cap, anti inflate).
- `theme_id` obrigatorio quando `mode IN ('drill_gto', 'lesson', 'other')`. Validar que tema pertence ao user.
- `lesson_id` obrigatorio quando `mode='lesson'`. Validar que aula existe e esta publicada (`is_published=true`).
- `tournament_id` validado se presente (pertence ao user, exclui filter `grind_session_id IS NULL` — eh historico, nao session_tournament).
- `starred_hand_ids`: array de IDs validos do user, >= 1 quando `mode='hand_review'`.
- `drill_accuracy`: 0-100 se presente.
- `difficult_spots`: jsonb array de objetos `{ context: string (max 200), note: string (max 500) }`. Max 5 itens (anti-spam).
- `notes`: text max 500 chars.
- `attachments`: jsonb array de `{ key: string, url: string }` (reuse spot screenshots infra). Max 5.
- `was_productive`: boolean, default true (so populated em `manual_live` ao stop).
- `started_at`/`ended_at`: timestamps. Se ambos populated em `manual_live`, validar `ended_at > started_at` E `(ended_at - started_at) >= duration_minutes - 60s` (tolerancia para auto-pause).

##### RF-1.4: Idempotency e duplicates

- `manual_post_hoc`: nao ha dedup. User pode registrar 2 sessoes identicas no mesmo dia (use case real: 2 drill blocks separados).
- `manual_live`: validar que user nao tem outra session `status='running'` (max 1 cronometro por user em qualquer momento). Tentar criar segunda → 409.
- `auto_lesson` (Sprint 2): idempotent por chave `(user_id, lesson_id, day_window_24h)`. Repeat call com mesmo `lesson_id` em 24h NAO cria nova; faz UPDATE incremental do `duration_minutes` se `progress_pct` aumentou.

##### RF-1.5: Auto-pause smart no cronometro live

- Quando user fecha tab/minimiza por > 60s, frontend detecta via `visibilitychange` event. Para `setInterval` mas mantem `started_at`.
- Ao retomar, pergunta inline: "Voce esteve fora 12min — descontar do tempo? [Sim] [Nao, contar tudo]". Default: Sim.
- Server-side, `duration_minutes` final = `(ended_at - started_at) - sum(idle_periods)`, onde idle_periods eh array de `{ start, end }` enviados pelo client.

##### RF-1.6: FAB "Acabei de estudar" (low-friction shortcut)

- Visivel sempre que user esta em rotas `/estudos/*` (sticky FAB inferior direito).
- Click abre o mesmo form RF-1.1 mas pre-preenchido com:
  - `mode`: ultima session do user nas 7d (ou `other` se nenhuma).
  - `duration_minutes`: 30 (sugestao default; user edita).
  - `theme_id`: ultimo tema usado nas 7d.
  - Foco no botao "Registrar" (Enter submit em 1 click se aceitar todos defaults).

#### Critério de aceitacao RF-1

- [ ] Migration nova cria tabela `study_sessions_v2` (ou estende `study_sessions` — architect decide) com schema descrito em §Schema preview.
- [ ] Endpoint `POST /api/study-sessions` aceita os 5 modos + 4 sources com Zod validation server-side.
- [ ] Endpoint `GET /api/study-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&mode=X` retorna lista paginada (default last 30d, max page 100, offset/limit).
- [ ] Endpoint `PATCH /api/study-sessions/:id` permite editar `notes`, `was_productive`, `attachments`, `theme_id`. NAO permite editar `mode`, `source`, `duration_minutes`, `started_at` (auditoria).
- [ ] Endpoint `DELETE /api/study-sessions/:id` permite delete soft (coluna `deleted_at`) ate 24h pos creation. Apos 24h → 403.
- [ ] Endpoint `POST /api/study-sessions/:id/finalize` (apenas para `source='manual_live'`, status `running` → `completed`). Recebe `ended_at`, `duration_minutes` final, `was_productive`, `notes`. Validacao: session pertence ao user, status = `running`, duration coerente.
- [ ] Frontend componente `StudyLogDialog.tsx` renderiza form com layout dinamico (campos aparecem/somem conforme `mode`).
- [ ] Frontend toggle "Comecar agora cronometrado" altera comportamento submit: post-hoc cria com status `completed`, live cria com status `running` + abre HUD compacto sticky.
- [ ] HUD cronometro sticky: "Estudando: [tema] · [tempo]" + botoes pause/stop.
- [ ] Auto-pause smart: testes cobrem `visibilitychange` por > 60s + dialog "descontar tempo?" + payload com `idle_periods` array.
- [ ] FAB "Acabei!" visivel em `/estudos/*` apenas. Cmd+K shortcut tambem dispara dialog.
- [ ] Layout dinamico: trocar `mode` reseta campos especificos do anterior (ex: `tournament_id` limpa quando user troca de `tournament_review` → `drill_gto`). **NAO** limpa `theme_id`, `notes`, `duration_minutes` (campos comuns).
- [ ] Limite max 1 session `running` por user enforcado server (409 Conflict ao tentar criar segunda).
- [ ] `study_streak_days` em `users` atualizado dentro da mesma transaction de criacao (RF-2 detalha calculo).

#### Cenarios de teste derivados RF-1

##### Happy path
- [ ] Post-hoc `drill_gto`: `mode='drill_gto', theme_id=Z, duration_minutes=30, source='manual_post_hoc'` → 201, retorna row.
- [ ] Post-hoc `tournament_review`: com `tournament_id` valido → 201.
- [ ] Post-hoc `tournament_review` sem `tournament_id` (torneio externo) → 201, `tournament_id=null`.
- [ ] Post-hoc `hand_review` com 3 `starred_hand_ids` validos → 201.
- [ ] Post-hoc `lesson` com `lesson_id` published → 201, `theme_id` auto-derivado se omitido.
- [ ] Post-hoc `other` com tema novo (criado inline) → 201, novo row em `study_themes`.
- [ ] Live: `POST` cria status `running` → HUD sticky aparece → user clica stop → `POST /finalize` → status `completed` + `duration_minutes` recalculado.
- [ ] FAB pre-preenche corretamente com ultima session 7d.
- [ ] Edit de notes pos-creation (PATCH) → 200.
- [ ] Delete < 24h → 200.

##### Validacao de input
- [ ] `mode='drill_gto'` sem `theme_id` → 400 INVALID_INPUT.
- [ ] `mode='lesson'` sem `lesson_id` → 400.
- [ ] `mode='lesson'` com `lesson_id` de aula `is_published=false` → 400 LESSON_NOT_PUBLISHED.
- [ ] `mode='hand_review'` com `starred_hand_ids=[]` → 400.
- [ ] `mode='hand_review'` com `starred_hand_ids` de outro user → 403.
- [ ] `duration_minutes=0` → 400.
- [ ] `duration_minutes=2000` → 400 (cap 1440).
- [ ] `drill_accuracy=150` → 400.
- [ ] `notes` com 600 chars → 400.
- [ ] `theme_id` de outro user → 403.
- [ ] `tournament_id` com `grind_session_id NOT NULL` → 400 (eh session_tournament, nao historico).

##### Regras de negocio
- [ ] Criar segunda session `running` enquanto outra ativa → 409 SESSION_ALREADY_RUNNING.
- [ ] Finalize de session `completed` (nao `running`) → 409 INVALID_STATE.
- [ ] Edit de session > 24h: PATCH em campos editaveis ainda funciona (PATCH livre); DELETE > 24h → 403.
- [ ] Auto-pause: payload com `idle_periods` total = 12min, `(ended-started)=45min` → `duration_minutes=33`.
- [ ] Streak: criar session com `duration_minutes >= goal` em dia novo → `study_streak_days+=1`.
- [ ] Streak: criar session com `duration_minutes < goal` → streak nao avanca.

##### Edge cases
- [ ] User com goal=0 (desligado): qualquer session marca `daily_goal_met=true` (sem threshold).
- [ ] User cruza meia-noite UTC com session `running` → ao stop, session conta para o dia de `started_at` (anchor consistente).
- [ ] User registra 2 sessions `manual_post_hoc` no mesmo dia: ambas criadas, ambas contribuem para `daily_goal_met` (soma `duration_minutes` do dia >= goal).
- [ ] User cria tema novo via "+ Criar" inline com nome duplicado (case-insensitive trim): retorna o existente (nao cria duplicate). Reuso de logica `studyThemes` ja existente.
- [ ] Concurrent: user A em 2 tabs cria 2 sessions `manual_live` simultaneas — segunda chamada no race recebe 409.

---

### RF-2: Daily Goal + Streak Honesto + Freeze Automatico

**Descricao:** Setting `daily_study_goal_minutes` em `users` (default 0 = desligado). Streak so conta dia em que `sum(duration_minutes WHERE date=today AND deleted_at IS NULL) >= goal`. Freeze: 2 freezes automaticos por mes consumidos silenciosamente; reset apenas apos 2+ dias missed sem freezes restantes.

#### Regras de negocio

##### RF-2.1: Setting `daily_study_goal_minutes`

- Campo novo `users.daily_study_goal_minutes` integer DEFAULT 0.
- Valores aceitos: 0 (desligado), 15, 30, 45, 60, 90, 120 (custom). Validacao Zod no PATCH.
- UI: page `/settings` ja existe — adicionar secao "Habito de Estudo" com select.

##### RF-2.2: Calculo do streak (transacao)

Algoritmo a ser executado server-side dentro da mesma transaction de `POST /api/study-sessions`:

```
1. Compute `today_utc` = UTC date de NOW().
2. SELECT user.last_study_activity_at, user.study_streak_days, user.daily_study_goal_minutes,
          user.study_streak_freezes_used_this_month FOR UPDATE.
3. SELECT SUM(duration_minutes) AS today_minutes FROM study_sessions_v2
   WHERE user_id=X AND DATE(started_at AT TIME ZONE 'UTC') = today_utc
     AND deleted_at IS NULL AND status IN ('completed', 'running').
4. goal = user.daily_study_goal_minutes (0 = desligado, sempre considerar atingido).
5. today_met = (goal == 0) OR (today_minutes >= goal).
6. Se today_met:
     last_active_date = DATE(user.last_study_activity_at)
     gap_days = today_utc - last_active_date
     IF gap_days == 0: streak inalterado (ja atingiu hoje, idempotent).
     ELSE IF gap_days == 1: streak += 1.
     ELSE IF gap_days == 2 AND freezes_used < 2: freezes_used += 1, streak += 1 (consume 1 freeze).
     ELSE IF gap_days >= 2: streak = 1 (reset, comeca novo streak hoje).
   user.last_study_activity_at = NOW().
7. UPDATE users SET study_streak_days=X, last_study_activity_at=NOW(),
                    study_streak_freezes_used_this_month=Y.
```

##### RF-2.3: Reset mensal de freezes

- Cron diario 00:05 UTC: `UPDATE users SET study_streak_freezes_used_this_month=0 WHERE last_freeze_reset_month != to_char(NOW(), 'YYYY-MM')`.
- Coluna nova `users.last_freeze_reset_month` varchar(7) registra ultima reset.
- Justificativa: limpa freezes na virada do mes UTC. Falha do cron eh recuperavel (idempotent — proximo cron pega).

##### RF-2.4: UI Header `/estudos`

Componente novo `StudyHeaderHabit.tsx`:
- "Streak: X dias" (numero + label).
- "Meta hoje: 18/30 min" (barra progresso visual). Verde se atingiu, amber se faltam, cinza se goal=0.
- "Freezes restantes: 2/2" (mostra apenas se goal > 0, senao oculta).
- Tooltip explicativo: "Streak conta dias com meta atingida. 2 freezes/mes te protegem se voce esquecer 1 dia."

##### RF-2.5: Edge cases streak

- User altera goal de 0 para 30 mid-week: dia em curso passa a exigir 30min para contar. Nao retroage para dias passados.
- User altera goal de 30 para 0 mid-week: hoje conta automaticamente (goal=0). Streak nao salta (continua incrementando 1/dia).
- User registra 2 sessions no mesmo dia somando 35min com goal=30: streak avanca **uma vez** (idempotent por dia).
- User deleta session 2 dias atras que era a unica naquele dia → streak NAO recalcula automaticamente (audit trail). Aceitamos como divergencia minor; nao expor recalc admin no MVP.

#### Critério de aceitacao RF-2

- [ ] Migration adiciona `users.daily_study_goal_minutes`, `users.study_streak_freezes_used_this_month`, `users.last_freeze_reset_month`.
- [ ] PATCH `/api/users/me/settings` aceita `daily_study_goal_minutes` ∈ {0, 15, 30, 45, 60, 90, 120}.
- [ ] Endpoint GET `/api/users/me/study-habit` retorna `{streakDays, todayMinutes, goalMinutes, freezesUsedThisMonth, freezesRemaining}` (calc server, sem cache).
- [ ] Logica de streak rodada dentro de transaction de POST study-sessions (race-safe via FOR UPDATE).
- [ ] Cron diario `resetStudyFreezesMonthly` em `server/cron/` reset col mensal.
- [ ] Componente `StudyHeaderHabit.tsx` renderiza header em `/estudos` (apos sidebar).
- [ ] Tooltip explicativo em hover sobre "freezes".

#### Cenarios de teste derivados RF-2

##### Happy path
- [ ] Goal=30, dia 0 streak=0. Registra session 30min → streak=1.
- [ ] Dia 1, registra session 30min consecutivo → streak=2.
- [ ] Dia 2, esquece. Dia 3, registra session 30min → freeze consumed (1/2), streak=3.
- [ ] Dia 5, esquece dia 4. Registra dia 5 → freeze consumed (2/2), streak=4.
- [ ] Dia 7, esquece dia 6. Registra dia 7 (freezes esgotados) → streak=1 (reset).

##### Validacao
- [ ] Goal=200 → 400 (nao esta no enum).
- [ ] Goal=-5 → 400.
- [ ] Goal=0 desliga: qualquer session 1min marca `today_met=true`.

##### Regras de negocio
- [ ] 2 sessions no mesmo dia somando 35min, goal=30 → streak avanca apenas 1 (idempotent).
- [ ] Goal alterado de 30 para 60 hoje, ja registrou 30min: dia ainda **NAO atingiu** novo goal — streak nao avanca ate completar 60min.
- [ ] Cron de reset: ao virar mes UTC, `freezes_used_this_month=0`.

##### Edge cases
- [ ] User registra session com `started_at` 2 dias no passado (post-hoc tardio). Streak considera `started_at` date, nao registered_at. **Decisao:** o streak conta no dia que **registered_at** ocorre, NAO o dia de `started_at`. Justificativa: registro tardio ainda eh acao de hoje. Documentar em UI.
- [ ] User cruza meia-noite UTC com cronometro live (started 23:55, ended 00:30 dia seguinte): session anchora em `started_at` date para registro mas `today_met` calc usa `started_at` date. Aceita como anchor. (No edge desta, "today" do streak eh consistente com momento de ativacao.)

---

### RF-3: Stats Foco 3/mes — Header + Auto-suggest + Theme Optional

**Descricao:** Estender o sistema `user_focus_stats` ja existente (Sprint home-reform-4 Item 7, ADR-116) com:

1. Header dedicado em `/stats-analyzer` mostrando os 3 cards das stats foco do mes corrente.
2. Auto-suggest "Sugerir 3 stats" baseado em top 3 leaks (`getStatsLeaks()` ja existente).
3. Relax do `study_theme_id NOT NULL` → permitir foco sem tema linkado.

#### Regras de negocio

##### RF-3.1: Schema migration — `study_theme_id` nullable

- Migration nova `0050_user_focus_stats_nullable_theme.sql`:
  ```sql
  ALTER TABLE user_focus_stats
    ALTER COLUMN study_theme_id DROP NOT NULL;
  ```
- Drizzle schema update: remover `.notNull()` do field.
- Backward compat: rows existentes ja tem theme — sem back-fill necessario.

##### RF-3.2: Header `/stats-analyzer`

Componente novo `FocusStatsHeader.tsx` no topo de `StatsAnalyzerTab`:

- Renderiza ate 3 cards horizontais (grid).
- Cada card:
  - Stat name (ex: "C-bet flop OOP")
  - Valor atual (snapshot mais recente do mes corrente, ex: "32%")
  - Delta vs mes anterior (ex: "+4.2% vs Abril", verde se positivo na direcao desejada, vermelho se negativo). Usa `direction` do catalog.
  - Tema linkado (se houver): "Tema: ICM bubble" + chip clicavel → navega `/estudos/temas/:id`.
  - Sem tema linkado: badge "Sem tema" + CTA "Vincular tema" → abre dialog (existente do home-reform-4 Item 7).
  - Botao "Trocar" → abre modal seleciona stat substituta + (opcional) novo tema.
- Empty state (zero stats marcadas):
  - Card "Voce nao escolheu suas 3 stats foco de [Mes Corrente]"
  - CTA primary "Sugerir 3 stats automaticamente" → chama RF-3.3.
  - CTA secondary "Escolher manualmente" → abre `FocusStatPicker` (componente existente).

##### RF-3.3: Auto-suggest top 3 leaks

- Endpoint novo `POST /api/stats/focus/auto-suggest?month=YYYY-MM`.
- Logica server:
  1. Chama `getStatsLeaks(userId)` (ja existe em Sprint home-reform-4) que retorna stats com pior delta vs benchmark.
  2. Filtra top 3 por severity score (descending).
  3. Para cada uma, sugere tema linkado via lookup em `study_themes.linkedStats` (jsonb) — match em `stat_id`. Se tema match encontrado, attach. Se nao, attach null.
  4. Cria 3 rows em `user_focus_stats` para o `month` em transaction.
  5. Retorna `{ created: [3 rows], suggestedReason: { stat_id: leak_severity }}`.
- Erros: se user ja tem 3 stats marcadas no mes → 409 (UI deve esconder botao). Se < 3 leaks detectados (low data) → 200 com `created` < 3 + warning.
- Idempotency: se user clica auto-suggest 2x → segunda chamada retorna 409.

##### RF-3.4: Limite max 3 hard

- Validacao DB-level: ja existe `UNIQUE (user_id, stat_id, month)`.
- Validacao app-level (POST manual + auto-suggest): COUNT < 3 antes de insert.
- UI: ao tentar 4a → mostra dialog "Voce ja tem 3 stats foco em [Mes]. Trocar uma existente?".

##### RF-3.5: Sync com FocusStatsCard do Home (sem mudanca)

- Endpoint `GET /api/home/focus-stats` (ja existe) NAO precisa mudar.
- `FocusStatsCard` no Home renderiza igual. Apenas o card "Sem tema" aparece quando `study_theme_id` is null — empty CTA secao "Tema do mes".

#### Critério de aceitacao RF-3

- [ ] Migration `0050_user_focus_stats_nullable_theme.sql` aplicada.
- [ ] Drizzle schema atualizado.
- [ ] Endpoint `POST /api/stats/focus` (existente) aceita `study_theme_id=null` sem erro.
- [ ] Endpoint novo `POST /api/stats/focus/auto-suggest` retorna 3 stats sugeridas + auto-cria rows.
- [ ] Componente `FocusStatsHeader.tsx` renderiza no topo de `StatsAnalyzerTab`.
- [ ] Empty state com CTA "Sugerir 3 stats" + CTA secondary "Escolher manualmente".
- [ ] Cards mostram stat + valor + delta + tema (ou "Sem tema") + botao Trocar.
- [ ] Botao Trocar abre modal reaproveitando `FocusStatPicker` existente.
- [ ] Tentativa de 4a stat → dialog "Trocar existente?" (UI gating, sem 409 surprise).

#### Cenarios de teste derivados RF-3

##### Happy path
- [ ] Auto-suggest com 5 leaks detectados → cria 3 rows top severity.
- [ ] Auto-suggest com leaks que matcham tema (linkedStats) → rows com `study_theme_id` preenchido.
- [ ] Auto-suggest com leaks sem tema match → rows com `study_theme_id=null`.
- [ ] Header renderiza 3 cards com stat name, valor atual, delta colorido.
- [ ] Click "Trocar" abre modal e completa swap.

##### Validacao
- [ ] Auto-suggest com user ja tendo 3 stats → 409.
- [ ] Auto-suggest com `month` invalido (formato) → 400.
- [ ] Auto-suggest com `month` futuro → 400.

##### Regras de negocio
- [ ] Auto-suggest 2x consecutivos → segunda 409 idempotent.
- [ ] Auto-suggest com 1 leak detected → cria 1 row + warning "low data".
- [ ] Stat foco sem tema → card mostra "Sem tema" + CTA "Vincular".

##### Edge cases
- [ ] Stats foco do mes anterior virou novo mes → header mostra empty state (mes corrente vazio).
- [ ] User deleta tema linkado a stat foco → CASCADE na FK seta nula? **NAO** — schema atual `ON DELETE CASCADE` deleta a row inteira de `user_focus_stats`. **Mantemos** — comportamento existente (ADR-116). Documentar.
- [ ] Catalog HUD nao tem `stat_id` mais (admin removeu) → header renderiza "Stat indisponivel" + CTA "Remover".

---

### RF-4: Focus Stats Bar Global (Componente reutilizavel)

**Descricao:** Componente `<FocusStatsBar />` que exibe as 3 stats foco do mes em paginas relevantes do produto. Toggle global em settings desliga.

#### Regras de negocio

##### RF-4.1: Componente

`client/src/components/study/FocusStatsBar.tsx`:
- Props: `placement: 'home' | 'grind-live' | 'coach' | 'estudos' | 'stats-analyzer'`.
- Renderizacao:
  - Layout horizontal compacto (max-height 64px).
  - Renderiza 3 chips: `[Stat Name: Value (delta_color)]`.
  - Se < 3 stats marcadas: chips placeholder + CTA "Selecionar [N restantes] em /stats-analyzer".
  - Click em chip navega para `/stats-analyzer?focus=stat_id` (highlight + scroll into view).
- Data source: hook `useFocusStatsBar()` que chama `GET /api/home/focus-stats?month=YYYY-MM` (mes corrente). Cached via TanStack Query stale-time 60s.
- Feature flag: oculto se `users.home_layout_settings.focusStatsVisibility[placement] === false`.

##### RF-4.2: Settings global

- Estender shape `homeLayoutSettings.focusStatsVisibility` com objeto:
  ```ts
  focusStatsVisibility: {
    home: boolean,        // default true (ja existe como `showFocusStatsBar` em home-reform-5 — migrar)
    grindLive: boolean,   // default true
    coach: boolean,       // default true
    estudos: boolean,     // default true
    statsAnalyzer: boolean // default true
  }
  ```
- Migration: `home_layout_settings` JSONB sofre **back-fill** em row update opcional (sem migration SQL, lazy via storage layer ao GET).
- Settings page `/settings/home`: UI toggle por placement.
- Toggle "off" global: mostrar checkbox "Esconder em todo lugar" → seta todos boolean false.

##### RF-4.3: Posicionamento por pagina

| Placement | Onde renderiza |
|---|---|
| `home` | Ja renderiza via `FocusStatsCard` Home. Bar adicional NAO duplicar — usar a card existente. **Nao instalar Bar em /home no MVP.** |
| `grind-live` | Sticky top dentro do `<GrindSessionLive />` (apos timer principal). Util durante jogo. |
| `coach` | Topo de `/coach` (acima de chat history) — informa o coach do contexto via UI (Coach AI ja recebe via tool, isso eh para o user ver). |
| `estudos` | Junto com `<StudyHeaderHabit />` (RF-2.4) — empilha vertical. |
| `stats-analyzer` | NAO instalar Bar (ja tem `FocusStatsHeader` da RF-3). |

##### RF-4.4: Estados

- Empty state (0 stats): chips placeholder + CTA single line.
- Partial state (1-2 stats): chips real + chips ghost para vagas + CTA "Selecionar [N] restantes".
- Full state (3 stats): apenas chips reais.
- Loading: skeleton 64px height.
- Error (api fail): renderiza nada (silent fail). Console warn em dev.

#### Critério de aceitacao RF-4

- [ ] Componente `FocusStatsBar.tsx` criado com hooks + props acima.
- [ ] Hook `useFocusStatsBar(placement)` chama endpoint existente, respeita visibility setting.
- [ ] Settings page mostra 4 toggles (home oculto pq usa Card, mas placement existe na shape para futuro).
- [ ] Bar instalada em `/grind-live`, `/coach`, `/estudos` (3 paginas).
- [ ] Empty + partial + full + loading + error states renderizam corretamente.
- [ ] Click chip navega `/stats-analyzer?focus=X` com highlight.
- [ ] Telemetria opcional (DEFER): event `focus_stats_bar_clicked` para validar uso.

#### Cenarios de teste derivados RF-4

##### Happy path
- [ ] User com 3 stats marcadas em /grind-live: ve 3 chips com valores.
- [ ] Click no chip "C-bet flop OOP" navega para /stats-analyzer?focus=cbet_flop_oop.
- [ ] User desabilita visibility em /coach: bar nao renderiza nessa pagina.

##### Validacao
- [ ] User sem stats marcadas: ve CTA "Selecionar 3 stats em /stats-analyzer".
- [ ] User com 1 stat: ve 1 chip + 2 ghost + CTA "Selecionar 2 restantes".

##### Regras de negocio
- [ ] Bar respeita visibility per-placement (granular).
- [ ] Toggle "Esconder em todo lugar" → seta todos false → bar oculta cross-product.

##### Edge cases
- [ ] API fail: bar renderiza null (sem crash).
- [ ] User abre /grind-live no dia 1 do mes (sem snapshots novos): chips mostram "Sem dados ainda" subtitle.
- [ ] User troca de mes mid-session live: bar mantem estado do `month` no mount; nao auto-refresh ao virar meia-noite (aceitavel — refresh no proximo navigate).

---

## Requisitos Nao-Funcionais

- **Performance:**
  - `POST /api/study-sessions` < 250ms p95 (transaction com FOR UPDATE em users + insert).
  - `GET /api/study-sessions` paginated < 200ms p95 (com indice user_id+started_at).
  - `GET /api/users/me/study-habit` < 100ms p95 (3 SELECTs simples).
  - `POST /api/stats/focus/auto-suggest` < 500ms p95 (depende de `getStatsLeaks` existente).
  - Bar `FocusStatsBar` cache TanStack 60s. Sem polling.

- **Seguranca:**
  - Todos endpoints requerem `requireAuth` JWT.
  - Cross-user access rejected: `theme_id` / `tournament_id` / `lesson_id` / `starred_hand_ids` validated against `user_id`.
  - Rate limiting em `POST /api/study-sessions`: 60/min por user (anti-spam).

- **Disponibilidade:**
  - Cron `resetStudyFreezesMonthly` falha → recuperavel (idempotent).
  - Auto-pause smart: tolerancia 60s antes de detectar idle (anti-flapping).

- **i18n:**
  - UI 100% PT-BR. Strings em `client/src/i18n/pt-br.ts` (se existe) ou inline.
  - Modos labels: "Drill GTO", "Review de Torneio", "Review de Maos", "Aula", "Outro".

- **Acessibilidade:**
  - Form RF-1 navegavel por teclado (Tab + Enter submit).
  - Focus management ao abrir dialog (foco no select de mode).
  - Tooltip "freezes" via Radix Tooltip (acessivel via keyboard).

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/study-sessions` | Cria session (post-hoc completed ou live running) | JWT | 60/min |
| PATCH | `/api/study-sessions/:id` | Edita campos editaveis (notes, was_productive, etc) | JWT | 30/min |
| DELETE | `/api/study-sessions/:id` | Soft delete (24h gate) | JWT | 30/min |
| POST | `/api/study-sessions/:id/finalize` | Finaliza session live | JWT | 30/min |
| GET | `/api/study-sessions` | Lista paginada com filtros | JWT | - |
| GET | `/api/users/me/study-habit` | Streak + goal + freeze status | JWT | - |
| PATCH | `/api/users/me/settings` | Altera goal + visibility settings (estende existente) | JWT | 30/min |
| POST | `/api/stats/focus` | Marca stat foco (existente, aceitar `study_theme_id=null`) | JWT | 30/min |
| POST | `/api/stats/focus/auto-suggest` | Auto-cria 3 stats top leaks | JWT | 10/min |
| GET | `/api/home/focus-stats` | Existente, sem mudanca | JWT | - |

---

## Modelos de Dados Afetados

### `study_sessions_v2` (nova tabela ou estendida — architect decide)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar(21) | PK NOT NULL | nanoid |
| `user_id` | varchar(21) | NOT NULL FK users | CASCADE |
| `mode` | varchar(32) | NOT NULL CHECK enum | drill_gto/tournament_review/hand_review/lesson/other |
| `source` | varchar(32) | NOT NULL CHECK enum | manual_post_hoc/manual_live/auto_lesson/auto_grind_finalize |
| `status` | varchar(16) | NOT NULL DEFAULT 'completed' | running/completed |
| `theme_id` | varchar(21) | FK study_themes nullable | SET NULL on delete |
| `tournament_id` | varchar | FK tournaments nullable | SET NULL on delete |
| `lesson_id` | varchar | FK library_lessons nullable | SET NULL on delete |
| `starred_hand_ids` | jsonb | nullable | array de IDs |
| `drill_platform` | varchar(32) | nullable | gto_wizard/pio/monker/other |
| `drill_accuracy` | integer | nullable, 0-100 CHECK | |
| `difficult_spots` | jsonb | nullable | array max 5 itens |
| `duration_minutes` | integer | NOT NULL CHECK >= 1 AND <= 1440 | |
| `started_at` | timestamptz | nullable | so populated em manual_live |
| `ended_at` | timestamptz | nullable | so populated em manual_live |
| `registered_at` | timestamptz | NOT NULL DEFAULT now() | quando o LOG foi feito |
| `idle_periods` | jsonb | nullable | array {start, end} para auto-pause |
| `notes` | text | CHECK length <= 500 | |
| `attachments` | jsonb | nullable | array {key, url} max 5 |
| `was_productive` | boolean | nullable | so live |
| `daily_goal_met` | boolean | NOT NULL DEFAULT false | calculado em trigger ou pelo handler |
| `xp_awarded` | integer | NOT NULL DEFAULT 0 | reservado para gamification futura |
| `deleted_at` | timestamptz | nullable | soft delete 24h gate |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | trigger `set_updated_at` |

**Indices:**
- `(user_id, started_at DESC)` — list por user.
- `(user_id, mode, started_at DESC)` — filtro por modo.
- `(user_id, registered_at DESC)` — list ordered por log time.
- `(lesson_id) WHERE lesson_id IS NOT NULL` — auto_lesson idempotency lookup.
- `(user_id, status) WHERE status='running'` — quick check de session live ativa.

**Constraints (validar no architect, podem ser triggers):**
- `mode='drill_gto' → theme_id NOT NULL`
- `mode='lesson' → lesson_id NOT NULL`
- `mode='hand_review' → starred_hand_ids IS NOT NULL AND jsonb_array_length(starred_hand_ids) >= 1`
- `mode='other' → theme_id NOT NULL`
- `status='running' → started_at NOT NULL AND ended_at IS NULL`
- `status='completed' → duration_minutes NOT NULL`

### `users` (alteracoes)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `daily_study_goal_minutes` | integer | DEFAULT 0 | 0=desligado, valores: 0/15/30/45/60/90/120 |
| `study_streak_freezes_used_this_month` | integer | DEFAULT 0 | Reset mensal via cron |
| `last_freeze_reset_month` | varchar(7) | nullable | YYYY-MM, marca ultima reset |
| `home_layout_settings` (JSONB extension) | jsonb | shape estendido | adicionar `focusStatsVisibility: {home, grindLive, coach, estudos, statsAnalyzer}` |

**Existentes nao tocados:**
- `study_streak_days` (Sprint Studies-Reform RF-12) — mantido, semantica refinada por RF-2.
- `last_study_activity_at` (Sprint Studies-Reform RF-12) — mantido.

### `user_focus_stats` (alteracao)

| Campo | Mudanca |
|---|---|
| `study_theme_id` | DROP NOT NULL (passa a ser nullable) |

**Sem outras mudancas.** Indices preservados.

### `study_themes` (sem mudanca de schema, mas extensao opcional via architect)

Architect pode propor adicao de `linked_stats jsonb` para alimentar auto-suggest RF-3.3 com tema-stat mapping. **Recomendacao PM:** NAO bloquear este sprint nessa adicao — auto-suggest RF-3.3 pode usar lookup externo (config seed) sem migration. Se architect priorizar, OK adicionar.

---

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Mux Player | (Sprint 2 / preparacao) Trigger auto_lesson em progress >= 80% | Sprint 2 |
| GTO Wizard | (roadmap futuro) Parceria para drill log automatico | Q3 2026+ |

**Sprint 1: nenhuma integracao externa nova.**

---

## UI Mockups (ASCII)

### Form Log Estudo (post-hoc default)

```
┌──────────────────────────────────────────────────────────────┐
│  Registrar Estudo                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Modo:   ( ) Drill GTO  ( ) Review Torneio                   │
│          (•) Aula       ( ) Review de Maos   ( ) Outro       │
│                                                              │
│  Tema (autocomplete):                                        │
│  ┌────────────────────────────────────────────────┐          │
│  │ ICM bubble                                  ▾  │          │
│  └────────────────────────────────────────────────┘          │
│   Sugeridos: ICM bubble play • Final table ICM • Pay jumps  │
│                                                              │
│  [SE Modo=Aula] Aula da Biblioteca:                          │
│  ┌────────────────────────────────────────────────┐          │
│  │ Bloco A — Ep 6 "ICM no bubble"             ▾  │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  Duracao:  [ 45 ] min        ☐ Comecar cronometrado          │
│                                                              │
│  Notas (opcional, max 500 char):                             │
│  ┌────────────────────────────────────────────────┐          │
│  │                                                │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  [SE Modo=Drill GTO] Spots dificeis: [ + Adicionar ]         │
│                                                              │
│  Prints:  [ + Anexar print ]                                 │
│                                                              │
│                              [Cancelar]   [Registrar]        │
└──────────────────────────────────────────────────────────────┘
```

### Header `/estudos` (RF-2.4)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔥 Streak: 7 dias       Meta hoje: 30/45 min ▓▓▓▓░░░          │
│                                       Freezes: 1/2 ⓘ            │
└─────────────────────────────────────────────────────────────────┘
[Registrar Estudo]                                              [+]
```

### Header `/stats-analyzer` (RF-3.2)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stats Foco de Maio 2026                              [Trocar todas] │
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐            │
│ │ C-bet flop OOP │ │ 3bet vs Open   │ │ ICM bubble     │            │
│ │ 32% ▲ +4.2%    │ │ 11% ▼ -1.1%    │ │ 47% ─ 0%       │            │
│ │ Tema: C-bet OOP│ │ Sem tema +    │ │ Tema: ICM      │            │
│ │ [Trocar]       │ │ [Trocar]       │ │ [Trocar]       │            │
│ └────────────────┘ └────────────────┘ └────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

### Header `/stats-analyzer` (empty state)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stats Foco de Maio 2026                                              │
├──────────────────────────────────────────────────────────────────────┤
│      Voce ainda nao escolheu suas 3 stats foco deste mes.           │
│                                                                      │
│      [⚡ Sugerir 3 stats baseadas nos seus leaks]                    │
│                                                                      │
│      ou [Escolher manualmente]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### FocusStatsBar (RF-4)

```
[ C-bet OOP: 32% ▲ +4.2% ] [ 3bet vs Open: 11% ▼ -1.1% ] [ ICM: 47% ─ ]
```

### FAB "Acabei!"

```
                                                              ┌────────┐
                                                              │+ Acabei!│
                                                              └────────┘
```

---

## Metricas de Sucesso

Tracked via telemetria server-side (eventos no `analytics_events` ou similar — architect define se nao existe).

### Metas Sprint 1 (D7-D14 pos-deploy)

- **Activation:** % users que registram >= 1 study session na primeira semana: **target 60%** (founder + 5+ pro beta).
- **Retention by feature:** % users com >= 1 study session/semana D14: **target 45%** (research §F1 metric).
- **Goal adoption:** % users que setaram goal > 0: **target 50%** (founder + pros). Beta tier free target 30%.
- **Streak adoption:** mean streak length D14: **target 5 dias** (com freezes).
- **Mode distribution:** target rough split 30% drill_gto / 25% lesson / 20% tournament_review / 15% hand_review / 10% other.
- **Manual vs Live ratio:** target 60% manual_post_hoc / 40% manual_live (research §F2 prediction).
- **Stats foco adoption:** % users com 3 stats marcadas D7: **target 50%**. Auto-suggest CTR: **target 70%** (alto pq reduz friction de "nao sei o que escolher").
- **Stats foco visibility opt-out:** target < 10% (anti-pattern: se >10% desligam, repensar UX).

### Metas Sprint 1 (M1 pos-deploy)

- **Daily active in /estudos:** target 30% MAU (vs 10% pre-sprint).
- **Mean duration_minutes/dia ativo:** target 35min.
- **% users que renovam stats foco no novo mes:** target 55% (research §F4 metric).
- **Coach AI requests citando focus stats:** target +20% (sinal de que bar+context funciona).

### Counter-metrics (red flags)

- Spike de `was_productive=false` > 30% live sessions → cronometro virou ritual sem valor.
- DELETE rate > 10% das sessions criadas → form confuso ou friction alta.
- Streak reset rate > 50% users D14 → freezes nao bastam, repensar.

---

## Riscos e Mitigacoes

| # | Risco | Mitigacao |
|---|-------|-----------|
| **R1** | Form 4 modos + tema + campos condicionais confunde user | Layout dinamico (campos aparecem/somem). Validacao client-side imediata com mensagens claras. Telemetria event `study_log_form_abandoned` com last_field_focus para iterar. |
| **R2** | Drill GTO log sem integracao = LOG dummy, baixa retencao | Aceitar no MVP. Track `% sessions com drill_accuracy preenchido`. Se >50% → validar parceria GTO Wizard Q3. |
| **R3** | Streak punitivo perde retencao | Freeze automatico (2/mes silencioso). Reset apenas apos 2+ dias missed sem freezes. Documentar tooltip. |
| **R4** | Cronometro live causa friction se user esquece de stop | Auto-pause smart (visibilitychange). Notif local "voce esta com cronometro rodando" se > 2h sem interacao. |
| **R5** | Tema duplicado (free-form + curated): "C-bet OOP" vs "c-bet out of position" | Fuzzy match (Levenshtein ou similar) em autocomplete. Coach mensal consolida. Founder pode editar/merge no admin. **MVP:** apenas fuzzy match no autocomplete; admin merge defer. |
| **R6** | Schema com 4 FKs nullable + 4 jsonb + status discriminator complexo | Drizzle types ajudam. Test fixtures para cada modo. Architect define se `study_sessions_v2` separada ou estende existente. |
| **R7** | Auto-suggest stats com low data (< 3 leaks detectados) | Retorna < 3 + warning UI "Pouco historico — registre mais sessoes para sugestoes melhores". |
| **R8** | Bar global polui UI em paginas tight (/grind-live) | Toggle granular per-placement. Default true. Telemetria opt-out rate vs CTR. |
| **R9** | Migration `user_focus_stats DROP NOT NULL` em prod com rows existentes | Trivial — DROP NOT NULL eh forward-compatible. Rows existentes mantem theme. Sem back-fill. |
| **R10** | Race condition no streak update (2 sessions concurrent) | `SELECT ... FOR UPDATE` no users row dentro da transaction. Postgres advisory locks fallback se gargalo. |
| **R11** | Cron freeze reset falha em mes especifico → users com freezes_used_this_month stale | Idempotent. Proximo cron pega. Backup: handler de POST study-sessions tambem checa `last_freeze_reset_month != current_month` e reseta lazy. |

---

## Dependencias

**Pre-requisitos (ja existem):**
- `users.study_streak_days`, `users.last_study_activity_at` (Sprint Studies-Reform RF-12, ADR-067).
- `user_focus_stats` table + `GET /api/home/focus-stats` (Sprint home-reform-4 Item 7, ADR-116).
- `getStatsLeaks()` service (home-reform-4 Item 7).
- Catalog HUD `shared/hud-stat-catalog.ts` (Sprint Stats-V2, ADR-062).
- Spot screenshots infra (Sprint Spot-Screenshots, ADR-057) — reaproveitada para attachments.
- Library Lessons (Sprint Biblioteca-1/2, ADRs 071-076).
- `home_layout_settings` JSONB (Sprint home-reform-5 Item 11, ADR-119).
- Cron infrastructure (Sprint News-3, ADR-107) — para `resetStudyFreezesMonthly`.

**Bloqueia (sera Sprint 2):**
- Trigger Mux auto_lesson — depende de RF-1 schema source enum.
- Plano semanal Coach — depende de `study_sessions_v2` data + focus stats.
- Biblioteca recomenda aula por leak — depende de RF-3 + Mux trigger.

---

## Notas de Implementacao (sugestoes para Implementer)

- **Tabela:** preferencia em **criar `study_sessions_v2` nova** vs estender `study_sessions` legado. Justificativa: schema legado tem campos hoje irrelevantes (`study_card_id` legacy, `focus_score`, `productivity_score`). Manter legado read-only para compat. Architect decide.
- **Drizzle types:** usar `discriminatedUnion` Zod para validacao por mode. Cada mode tem seu schema parcial; merge final.
- **Test fixtures:** uma fixture por modo + uma fixture multi-modo para list/filter testes.
- **Lessons learned aplicaveis:**
  - **Lesson #1 (hooks first):** componentes RF-1/4 com early return — todos os hooks ANTES.
  - **Lesson #2 (data-testid):** form fields com testids estaveis (`study-log-mode-drill_gto`, etc).
  - **Lesson #11 (sem actions decorativas):** FocusStatsBar so renderiza com data real, sem placeholder hard-coded em produto.
  - **Lesson #13 (apiRequest):** mocks em testes retornam JSON parseado direto.
  - **Lesson #19 (CTA targets):** ao gerar link "Continuar de onde parou" para `mode=lesson`, hidratar courseSlug+lessonSlug do storage para casar com Wouter.
  - **Lesson #20 (player wirar via container):** Hooks que escutam `timeupdate` no Mux (Sprint 2) usar wrapper container + querySelector.
  - **Lesson #28 (vi.mock por path):** se RF-4 testes mockam `FocusStatsBar` em path X mas codigo importa de Y, criar shim.
  - **Lesson #30 (hook test em .test.ts → jsdom):** RF-2 useStudyHabit hook test precisa de jsdom config.
- **Evitar:**
  - Hard-coded `theme_id` em fixtures — sempre derivar via factory.
  - Migrations grandes monoliticas — split em 2-3 migrations menores.
  - Trust client em `duration_minutes` calc — re-validar server-side com `(ended_at - started_at)`.

---

## Verificação Final (PM)

- [x] Cada requisito tem critérios de aceitacao verificáveis.
- [x] Cenários de teste cobrem happy path, validacao, regras negocio, edge cases.
- [x] Out of Scope explicito.
- [x] Endpoints listados com método, rota, descricao, auth.
- [x] Modelos de dados afetados documentados com campos e constraints.
- [x] Riscos e mitigacoes mapeados.
- [x] Dependencias com sprints anteriores documentadas.
- [x] Lessons learned aplicaveis citadas.
- [x] Mockups ASCII para fluxos principais.
- [x] Metas de sucesso quantificaveis.

---

## Proximo Passo

Apos aprovacao founder:

```
✅ Spec aprovada e salva em Docs/specs/estudos-habito-1.md

Proximo passo recomendado:
→ Use o agente system-architect para criar a arquitetura
  baseada na spec em Docs/specs/estudos-habito-1.md.

  Architect deve produzir:
  - ADR para "study_sessions_v2 nova vs estende legado" (decisao chave)
  - ADR para "tema hybrid taxonomy" (curated + user-custom + linkedStats)
  - Migration sequence (ordem aplicacao + back-compat)
  - Fluxograma RF-1 form com layout dinamico por mode
  - Fluxograma RF-2 streak + freeze algorithm (state machine)
  - Diagrama sequencia POST /api/study-sessions (auth → validate → tx → calc streak → response)
  - Atualizar `Docs/architecture/data-model-index.md` com tabelas novas
```
