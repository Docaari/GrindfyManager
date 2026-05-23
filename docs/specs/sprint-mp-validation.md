# Sprint MP-VALIDATION — Instrumentacao Telemetria + Smoke Coach + Admin Metrics + Audit `library_progress`

## Status

**Arquitetura aprovada (system-architect)** — 2026-05-22. Pronta para `test-writer` (pipeline TDD).

Sprint **validacao/observabilidade pos-cluster MP (MP1+MP1.1+MP1.2/1.3+MP2+MP3+MP3.1+MP3.2+MP3.3 shipped) e pre-Wave 2 / pre-prod**. **ZERO feature nova ao usuario.** Foco: instrumentar telemetria que falta, smoke proativo Coach end-to-end, painel admin minimo, decisao redirect /coach legacy, religar bug `library_progress=0`.

Strategist (memory/strategist_2026-05-22-pos-mp.md) recomendou esse sprint como gate antes de Wave 2 / antes de prod — vai dar visibilidade pra priorizar Wave 2 (catalogo + cross-device sync + equalizer) com dados ao inves de heuristica.

**Artefatos arch shipped:** ADR-207 (`Docs/architecture/decisions/207-record-activity-event-convention.md`) + 4 diagramas Mermaid em `Docs/architecture/diagrams/sprint-mp-validation/` (`library-progress-flow`, `record-activity-instrumentation`, `coach-legacy-redirect`, `admin-audio-metrics-query`). RF-05 audit (`memory/audit_library_progress_2026-05-22.md`) H2 confirmed — fix concreto na spec.

Pacote MUST default = RF-05+RF-01+RF-03 = ~14h. Recomendacao auto: MUST+SHOULD (+RF-02) = ~20h.

---

## Origem

- **Cluster MP shipped:** MP1 (`9d2957ac`/`bfdb22cc`) + MP1.1 + MP1.2/1.3 (`10516ab2`) + MP2 (`0fb31bb8`) + MP3 (`b1e8793c`) + MP3.1 Wave A (`7025b58a`) + MP3.1 Wave B (`8bb6b4c5`/`86fa9e89`) + MP3.2 (`15e36cdf`) + MP3.3 (`6e61bf7f`).
- **Strategist 6 modos:** `memory/strategist_2026-05-22-pos-mp.md` (decisao "validar antes de escalar").
- **AI plano:** 7/7 sprints shipped (AI-0A..AI-2B+AI-3+AI-3.1+AI-3.2). Coach proativo (nudges, reports Weekly/Daily/Monthly/Quarterly) ja roda em prod mas **sem smoke end-to-end** que valide pipeline completo.
- **Infra telemetria existente:** `user_activity` tabela (shared/schema.ts:246) + endpoints `POST /api/user-activity` + `POST /api/user-activity/batch` (sendBeacon cap 10) + lib `client/src/lib/audio-telemetry.ts` (ADR-191). PII strip ja implementado.
- **Bug latente reportado founder:** "DB local mostra `library_progress=0` mesmo apos 26 plays detectados via telemetria" — RF-05 investiga.
- **Numeros disponiveis:**
  - ADR: **207** (proximo livre apos 206 test-anti-pattern-useeffect-ctx-loop)
  - Migration: **0081** (apos 0080 transcription_previews_jsonb) — **provavelmente nao usada** (todos RFs reusam `user_activity` + adicionam endpoints/scripts)
- **Branch alvo:** novo `feature/sprint-mp-validation` saindo de `main` @ `6e61bf7f` (MP3.3 commit — confirmar HEAD antes commit per lesson #24).

---

## Persona-alvo

Founder Grindfy (operator) + dev team agentic (PM-Spec/Test-Writer/Implementer/Reviewer). **NAO ha feature visivel ao usuario final.** Painel admin (RF-03) eh interno (admin role only).

---

## 1. Sumario Executivo

**Objetivo.** Fechar gap de **observabilidade pos-cluster MP + Coach proativo**. Hoje temos: cluster MP shipped, Coach 7 sprints completos, mas **dashboards/admin/smoke vazios**. Founder nao consegue responder: "qual lesson tem maior completion?", "Coach esta gerando reports/nudges como esperado?", "library_progress esta sendo escrito?". Sprint resolve isso instrumentando + diagnosticando + dando visibilidade minima.

**Tese.** Antes de gastar effort em Wave 2 (catalogo Spotify, cross-device sync, equalizer, voice control — features dependentes de cohort data), validamos pipeline existente esta funcional + temos dados pra priorizar.

**Constraints duros.**
- **ZERO feature nova ao usuario.** Toda mudanca eh instrumentacao OR admin OR redirect OR audit.
- **Zero breaking change** em API publica (endpoints existentes mantem contract).
- **Zero migration nova** (reusa `user_activity` + tabelas Coach existentes). **EXCECAO**: se RF-05 descobrir `library_progress` precisa schema mudanca (improvavel), criar migration 0081 ad-hoc.
- **Sprint cap 1.5-2.5d** efetivo (~14-22h trabalho). Pacote MUST (RF-01+RF-03+RF-05) = ~14h.
- **Zero regressao baseline** cluster MP (~593+ suites verde) + AI baseline (1300+ Coach suite).
- **Coach legacy redirect 90d** com warn — NAO remover rota `/coach` ainda (apenas marcar deprecation + redirect 301).

**5 RFs em 1 linha:**

- **RF-01 (HIGH, M, 5-7h) Instrumentar audio + lesson + coach via `recordActivity`** — 17 eventos novos via `user_activity` reuse (8 MP + 5 Lesson + 4 Coach). PII strip + cap metadata 10KB existente.
- **RF-02 (MEDIUM, M, 4-6h) Smoke test Coach proativo end-to-end** — Script CLI Node que cria user trial fake + 7d sessions + force enqueue Weekly/Daily/Monthly + valida reports.status=ready + dispara 5 nudges + valida coach_nudge_log + exercita 3 write tools + valida email pipeline.
- **RF-03 (HIGH, M, 4-6h) Painel admin `/admin/audio-metrics`** — Endpoint GET `/api/admin/audio-metrics` (agg user_activity) + UI React table+KPIs (admin-only).
- **RF-04 (LOW, S, 2-3h) Unificar `/coach` → `/coach-ai`** — Redirect 301 Wouter preservando query/hash/subpaths + console.warn deprecation + telemetria `coach.legacy_redirect.fired`. Banner toast soft em sub-paths.
- **RF-05 (HIGH-INVESTIGATION, S, 1-2h investigation + variable fix)** — Audit `library_progress` UPSERT pipeline. Output: diagnostic report. Se fix trivial (< 1h), inclui no sprint. Se complexo, spec follow-up.

**Total breakdown:**
- Pacote **MUST** (RF-01+RF-03+RF-05): ~14h, ~2d
- Pacote **MUST+SHOULD** (+RF-02): ~20h, ~2.5d
- Pacote **completo** (+RF-04): ~22h, ~3d

**Recomendacao Auto Mode:** executar pacote MUST+SHOULD (4 RFs, ~20h) pulando RF-04 (legacy redirect tem prazo 90d — pode deslizar 1 sprint).

---

## 2. Contexto e Motivacao

### 2.1 RF-01 — Telemetria gap

Cluster MP shipped 9 eventos audio (ADR-191) + Coach shipped sem telemetria de uso real + Lesson playback shipped sem completion% events. Resultado: **ZERO visibilidade no comportamento real**.

Gaps especificos:

| Surface | Eventos hoje | Eventos faltando MP-VALIDATION |
|---|---|---|
| Audio MP | 9 (driver, sleep, spotify) | +8: play/pause/seek/next/prev/queue_add/queue_remove/lesson_complete |
| Lesson (Biblioteca) | 0 telemetria explicita (so library_events legacy) | +5: lesson_view/play_start/completion_pct_25/50/75/100 |
| Coach | 0 telemetria UI | +4: nudge_received/dismissed/cta_clicked/chat_message |

**Total RF-01:** 17 eventos novos via `user_activity` reuse + cliente lib estendida.

### 2.2 RF-02 — Coach proativo sem smoke

Coach roda em prod desde AI-1B (Weekly Report) + AI-1C (Daily/Monthly) + AI-2A (B-DOWNSWING/VOLUME/GRADE nudges) + AI-2B (Quarterly + email). **Pipeline cron-based:** processador 15min + enqueuer hourly + event-driven (Daily Debrief). Sem teste end-to-end que exercite TUDO num user fake, founder nao sabe se algo quebra em prod silenciosamente.

Especificamente: bug latente `PRO_PLANS` pegou meses pra ser descoberto (corrigido em sessao 2026-05-20 mas era ATIVO em prod, com `users.subscription_plan='trial'` nao recebia Weekly Report). Smoke test catch nivel similar.

### 2.3 RF-03 — Admin observability vazio

Founder roda `psql` manual + olha tabelas brutas pra entender uso. Painel `/admin/audio-metrics` minimo da:
- Top 20 lessons por completion%.
- Avg listening time per session.
- Queue depth median/p95.
- Spotify→internal fallback rate.
- MP DAU/WAU.
- Top 10 lessons por plays.

**Pre-requisito:** RF-01 deve estar shipped antes (eventos `lesson_play_start`/`completion_pct_*`/`queue_add` populam essas metricas).

### 2.4 RF-04 — `/coach` legacy redirect

Pos-AI-0B consolidou 3 coaches em um unico hub `/coach-ai`. Rota `/coach` ainda existe (back-compat). Sidebar item ja aponta `/coach-ai` (ADR-148). Falta:
- Redirect 301 Wouter `/coach*` → `/coach-ai*` (preservar query/hash/subpaths).
- Console.warn em PROD para detectar bookmarks externos.
- Telemetria `coach.legacy_redirect.fired` (1 evento RF-01).
- Banner toast soft em sub-paths so se `legacy_redirect_count > 0`.

Prazo 90d ate remover rota legacy completamente.

### 2.5 RF-05 — `library_progress=0` bug

Founder reportou: DB local mostra `library_progress` table com **0 rows** mesmo apos 26 plays detectados via telemetria existente. Hipoteses (a investigar):

1. **Handler endpoint POST progress nao wirado** — code existe mas rota nao registrada.
2. **Client nao envia** — handler espera shape diferente; UI calls falham silenciosamente.
3. **Storage UPSERT bug** — `INSERT ON CONFLICT` aponta pra constraint errada; row escrita em outra tabela.
4. **Migration nao aplicada** — `library_progress` schema existe em codigo mas tabela nao foi criada via psql/db:push.
5. **Telemetria conta plays** ≠ library_progress UPSERT — telemetria pode estar contando page_view, nao play real.

Investigation effort: ~1h. Output: diagnostic report em `memory/audit-library-progress-2026-05-22.md`. **Se fix trivial** (e.g. migration nao aplicada, rota nao registrada), incluir fix neste sprint. **Se complexo** (refactor storage, mudanca schema), spec follow-up `Docs/specs/fix-library-progress.md`.

---

## 3. Decisoes Founder Pre-Resolvidas (Q1-Q5 strategist)

Founder AFK confiou decisao. Defaults aplicados:

| Q | Pergunta | Decisao | Racional |
|---|---|---|---|
| **Q1** | Sprint MP-VALIDATION antes Wave 2? | **ACEITO** | Strategist recomendou; validar antes de escalar |
| **Q2** | Expansao catalogo Spotify (curador)? | **DEFERIDO** | Precisa founder definir editorial direction |
| **Q3** | Deploy prod (Render+Neon+Cloudflare)? | **DEFERIDO** | Precisa creds founder + provisionamento manual |
| **Q4** | `/coach` ou `/coach-ai` canonico? | **`/coach-ai` canonico + redirect 90d** | Hub novo ja consolidado AI-0B; legacy redirect com warn 90d |
| **Q5** | MP3.4 polish backlog? | **MP3.4 backlog formal 3-6m** | Spec separada quando criterio emergir (>=3 lessons NULL ha >7d OR demanda) |

Decisoes Q1+Q4+Q5 afetam ESTE sprint (Q1 = sprint roda; Q4 = RF-04 escopo; Q5 = MP3.4 fora de escopo). Q2+Q3 sao gates externos sem impacto no codigo.

---

## 4. Requisitos Funcionais

### RF-01 — Instrumentar audio + lesson + coach via `recordActivity` reuse

**Prioridade:** HIGH
**Effort:** M (5-7h)
**Refs:** ADR-191 (reuse user_activity), ADR-207 (novo — convencao nomenclatura eventos)

**Descricao.** Adicionar 17 eventos novos via lib client existente `client/src/lib/audio-telemetry.ts` (renomear OR estender para `client/src/lib/activity-telemetry.ts` — decisao implementer). Eventos batched via sendBeacon (cap 10) — infra `POST /api/user-activity/batch` ja existente. PII strip + cap metadata 10KB ja implementados server-side.

**Convencao nomenclatura (ADR-207 a criar):**
- `action` snake_case: `audio_play`, `lesson_completion_pct_50`, `coach_nudge_received`.
- `feature` snake_case opcional: `mini_player`, `lesson_viewer`, `coach_inbox`.
- `page` enum: `'mini_player' | 'lesson_viewer' | 'coach_hub' | 'coach_inbox' | 'coach_chat' | 'biblioteca'`.
- `metadata.v: 1` (versionamento futuro).

**17 eventos:**

#### 8 Audio MP novos:

| `action` | `feature` | `duration` | `metadata` |
|---|---|---|---|
| `audio_play` | driver name | null | `{ trackId, source, queuePosition, queueLength }` |
| `audio_pause` | driver name | playedSecondsThisChunk | `{ trackId, atPositionSec, reason: 'user'|'driver_switch'|'sleep_timer' }` |
| `audio_seek` | driver name | null | `{ trackId, fromPositionSec, toPositionSec, reason: 'user_scrub'|'shortcut'|'resume' }` |
| `audio_next` | `mini_player` | null | `{ fromTrackId, toTrackId, reason: 'user'|'auto_advance'|'shortcut_l' }` |
| `audio_prev` | `mini_player` | null | `{ fromTrackId, toTrackId, reason: 'user'|'shortcut_j' }` |
| `audio_queue_add` | `queue` | null | `{ trackId, position, source: 'manual'|'auto_lesson_complete' }` |
| `audio_queue_remove` | `queue` | null | `{ trackId, position, reason: 'user'|'cleared'|'played' }` |
| `audio_lesson_complete` | `lesson` | totalListenedSec | `{ lessonId, courseSlug, completionPct, sourceDriver }` |

#### 5 Lesson novos:

| `action` | `feature` | `duration` | `metadata` |
|---|---|---|---|
| `lesson_view` | `lesson_viewer` | null | `{ lessonId, courseSlug, format: 'video'|'audio'|'pdf'|'article' }` |
| `lesson_play_start` | `lesson_viewer` | null | `{ lessonId, courseSlug, format, totalDurationSec }` |
| `lesson_completion_pct_25` | `lesson_viewer` | listenedSec | `{ lessonId, courseSlug, format, totalDurationSec }` |
| `lesson_completion_pct_50` | `lesson_viewer` | listenedSec | `{ lessonId, courseSlug, format, totalDurationSec }` |
| `lesson_completion_pct_75` | `lesson_viewer` | listenedSec | `{ lessonId, courseSlug, format, totalDurationSec }` |
| `lesson_completion_pct_100` | `lesson_viewer` | listenedSec | `{ lessonId, courseSlug, format, totalDurationSec }` |

(efetivo: 6 eventos lesson — `_pct_*` sao 4 separados)

#### 4 Coach novos:

| `action` | `feature` | `duration` | `metadata` |
|---|---|---|---|
| `coach_nudge_received` | nudge category | null | `{ nudgeId, category: 'B-DOWNSWING'|'B-VOLUME'|... }` |
| `coach_nudge_dismissed` | nudge category | timeShownSec | `{ nudgeId, category, reason: 'user_click_X'|'auto_timeout'|'view_change' }` |
| `coach_nudge_cta_clicked` | nudge category | timeShownSec | `{ nudgeId, category, ctaLabel, targetUrl }` |
| `coach_chat_message` | `chat` | null | `{ messageType: 'user'|'assistant', tokenCountInput, tokenCountOutput, tier }` |

**Regras de negocio:**
- Toda emissao **best-effort** (try/catch swallow — telemetria NUNCA bloqueia UX). Lesson #9: log antes do swallow.
- `metadata` JSON cap 10KB (Zod ja enforce server-side).
- PII strip (email/displayName/name) ja garantido server-side (`stripPII` em userActivity.ts).
- Throttle `audio_seek` para max 1/segundo por trackId (user scrub gera 20+ eventos sem throttle — perde sinal).
- `audio_lesson_complete` so emite quando `completionPct >= 100` (uma vez por lesson por sessao — dedupe via `Set<lessonId>` no client).
- `lesson_completion_pct_*` dedupe por sessao + lessonId (cada threshold emite 1x).
- `coach_chat_message` NAO inclui texto da mensagem (so token counts).
- Browser sendBeacon fallback fetch keepalive (ja na lib audio-telemetry.ts).

**Criterio de aceitacao:**
- [ ] Lib `client/src/lib/activity-telemetry.ts` (renomeada ou estendida) exporta `emitAudioEvent` + `emitLessonEvent` + `emitCoachEvent` (signatures coerentes).
- [ ] 8 eventos audio plugados em `MiniPlayerBar.tsx` / `AudioPlayerContext.tsx` / `QueueButton.tsx`.
- [ ] 5 eventos lesson plugados em `LessonViewer.tsx` (4 thresholds + 1 view + 1 play_start).
- [ ] 4 eventos coach plugados em `CoachInbox.tsx` / `NudgeCard.tsx` / `CoachChat.tsx`.
- [ ] Throttle `audio_seek` 1/sec funciona (test mock timer).
- [ ] Dedupe `lesson_completion_pct_*` por sessao funciona (test).
- [ ] PII NUNCA aparece em `metadata` (test asserta `email`/`name` keys ausentes).
- [ ] Telemetria offline backlog localStorage cap 100 ja existente (audio-telemetry.ts) cobre novos eventos.
- [ ] ADR-207 criada (convencao nomenclatura).

**Modulos afetados:**
- `client/src/lib/audio-telemetry.ts` → renomear/estender `activity-telemetry.ts`.
- `client/src/components/audio-player/MiniPlayerBar.tsx` (play/pause/seek/next/prev plugins).
- `client/src/contexts/AudioPlayerContext.tsx` (audio_lesson_complete dedupe + queue events).
- `client/src/components/audio-player/QueueButton.tsx` (queue_add/queue_remove).
- `client/src/pages/biblioteca/LessonViewer.tsx` (6 lesson events).
- `client/src/components/coach/CoachInbox.tsx` (nudge_received/dismissed).
- `client/src/components/coach/NudgeCard.tsx` (nudge_cta_clicked).
- `client/src/components/coach/CoachChat.tsx` (chat_message).
- `tests/client/telemetry/` (NEW): 17 testes cobrindo emit + dedupe + throttle + PII.
- `Docs/architecture/decisions/207-telemetry-event-naming-convention.md` (NEW).

**Telemetria de validacao (RF-01 self-meta):**
- Apos shipping, founder roda query simples: `SELECT action, COUNT(*) FROM user_activity WHERE created_at > NOW() - INTERVAL '24 hours' AND page IN ('mini_player','lesson_viewer','coach_hub','coach_inbox','coach_chat') GROUP BY action ORDER BY COUNT(*) DESC`. **17 actions esperadas** com counts > 0 apos 24h de uso real.

---

### RF-02 — Smoke test Coach proativo end-to-end

**Prioridade:** SHOULD (HIGH se founder quer validation antes prod)
**Effort:** M (4-6h)
**Refs:** AI-1B/1C/2A/2B specs + ADR-156/157/158/159/167/172/173

**Descricao.** Script CLI Node em `scripts/smoke-coach-proactive.ts` que:

1. **Setup** — Cria user fake em DB local (`subscription_plan='trial'`, opt-in todos reports). User unico identificavel (`USER-SMOKE-${timestamp}`).
2. **Populate** — Insere 7d de `grind_sessions` + `session_tournaments` + `tournaments` historico + `bankroll_snapshots` + 1 estudo concluido (cobre regras Weekly Report).
3. **Force enqueue reports** — Chama `enqueueDailyDebriefForSession(userId, sessionDate)` + simulate cron `enqueueReportsTick()` com `Date.now()` mock para terca/quarta + dia 1 do mes (cobre Weekly/Daily/Monthly).
4. **Run processor** — Chama `processReportJobsTick()` em loop ate `report_jobs.status` virar `done`|`degraded`|`failed` (max 3 retries).
5. **Validate reports** — SELECT `reports` WHERE userId=fake → asserta:
   - 3 rows (weekly, daily, monthly) com `status='ready'` OR `status='degraded'` (com `degradedReason` capturado).
   - `content` JSONB shape v2 valido (cobertura: `sessionSummary` daily, `comparatives` monthly, etc).
   - `markdown` derivado nao-vazio.
   - `cost_usd_estimate` > 0 (se LLM real-call) OR `null` se fallback.
6. **Force nudges** — Chama force triggers para 5 categorias:
   - `B-DOWNSWING` — popular drawdown >=15% janela 7d → tick hourly → asserta `coach_nudge_log` row.
   - `B-VOLUME` — mock dia=terca 11h local → tick → asserta nudge.
   - `B-GRADE` — mock dia=domingo 18h local → tick → asserta nudge.
   - `B-GAPCHECK` — mock ultima sessao ha 3 dias → tick → asserta nudge.
   - `B-IMPORT` — mock ultima importacao ha 5 dias + sessoes recentes → tick → asserta nudge.
7. **Validate nudges** — SELECT `coach_nudge_log` WHERE userId=fake → asserta 5 rows com `content` populated.
8. **Exercise 3 write tools** — Simula chat call com tools:
   - `bulk_propose_grade` (5 torneios cap 20) → asserta `planned_tournaments` rows.
   - `schedule_study_block` → asserta `study_sessions_v2` row `status='planned'`.
   - `mark_off_day` → asserta `user_off_days` row + UNIQUE constraint cobre.
9. **Validate email pipeline (best-effort)** — Se `SMTP_HOST` configurado + `EMAIL_WEEKLY_ENABLED=true` em user prefs → asserta `email_log` row com `status='sent'` OR `status='skipped'` (e.g. SMTP unreachable acceptable).
10. **Cleanup** — DELETE user fake + cascade rows (use TRUNCATE seletivo via `userPlatformId LIKE 'USER-SMOKE-%'`).
11. **Report markdown** — Output em `memory/smoke-coach-${timestamp}.md` com:
    - Status pass/fail por step (1-9).
    - Tempo total ms.
    - Erros capturados (stack trace).
    - Counts: reports gerados, nudges fired, tools exercidas, emails enviados.

**Regras de negocio:**
- Script idempotente — pode rodar multiplas vezes seguidas (cleanup garantido + cada run cria userId unico).
- **Modo dry-run** — flag `--dry-run` skipa LLM real-calls (mock `callReportLlm` retorna fallback) + skipa email send. Default = real-mode (cobre pipeline completo).
- Cap timeout total script: 5min. Se passar, abort + log timeout no report.
- Modo `--keep-user` mantem user fake para inspecao manual (skip step 10).
- Output exit code: 0 success, 1 falha qualquer step, 2 timeout, 3 cleanup fail.
- Script roda local OR CI. **NAO** rodar em PROD (proteger via env check `NODE_ENV !== 'production'` OR explicit flag `--allow-prod`).

**Criterio de aceitacao:**
- [ ] Script `scripts/smoke-coach-proactive.ts` existe + roda `npx tsx scripts/smoke-coach-proactive.ts --dry-run`.
- [ ] Cobre 11 steps acima.
- [ ] Cleanup remove TODOS rows fake (TRUNCATE check pos-run: `SELECT COUNT(*) FROM users WHERE userPlatformId LIKE 'USER-SMOKE-%'` = 0).
- [ ] Report markdown gerado com sumario step-by-step.
- [ ] Test integration `tests/scripts/smoke-coach-proactive.test.ts` valida script structure (existencia funcoes, exports).
- [ ] Documentado em `Docs/scripts.md` (criar se nao existe) ou similar.

**Modulos afetados:**
- `scripts/smoke-coach-proactive.ts` (NEW).
- `tests/scripts/smoke-coach-proactive.test.ts` (NEW).
- `Docs/scripts.md` ou similar (NEW se nao existe).

**Telemetria de validacao (RF-02 self-meta):**
- Founder roda `npx tsx scripts/smoke-coach-proactive.ts` antes de cada release/deploy.
- Exit code 0 = pipeline Coach OK; != 0 = bloqueia release.

---

### RF-03 — Painel admin `/admin/audio-metrics`

**Prioridade:** HIGH
**Effort:** M (4-6h)
**Refs:** RF-01 (eventos populam), ADR-191 (queries user_activity)

**Descricao.** Endpoint admin-only + UI minimal mostrando metricas chave do cluster MP + Lesson + Coach. Pre-requisito: RF-01 shipped + ~1-2 dias de uso real para populate.

**Endpoint:** `GET /api/admin/audio-metrics?range=7d|30d|90d` (default `7d`).

**Auth:** `requireAuth` + `requirePermission('admin')` (helper existente).

**Response shape (JSON):**

```json
{
  "range": "7d",
  "generatedAt": "2026-05-22T14:30:00Z",
  "kpis": {
    "mpDau": 42,
    "mpWau": 128,
    "avgListeningTimePerSessionSec": 1825,
    "queueDepthMedian": 3,
    "queueDepthP95": 12,
    "spotifyToInternalFallbackRate": 0.12,
    "totalPlays": 1547,
    "totalLessonCompletions": 89
  },
  "topLessonsCompletion": [
    { "lessonId": "abc", "courseSlug": "warmup", "lessonSlug": "intro", "completionPct": 0.78, "plays": 156 },
    ...
  ],
  "topLessonsPlays": [
    { "lessonId": "xyz", "courseSlug": "mtt", "lessonSlug": "ante-pressure", "plays": 234 },
    ...
  ]
}
```

**Queries SQL (server-side, agg user_activity):**

```sql
-- MP DAU
SELECT COUNT(DISTINCT user_id) AS dau
FROM user_activity
WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '1 day';

-- MP WAU
SELECT COUNT(DISTINCT user_id) AS wau
FROM user_activity
WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '7 days';

-- Avg listening per session (heuristica: SUM duration WHERE action='audio_driver_active')
SELECT AVG(duration) AS avg_sec
FROM user_activity
WHERE action = 'audio_driver_active' AND created_at > NOW() - INTERVAL '7 days' AND duration > 0;

-- Queue depth median/p95
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (metadata->>'queueLength')::int) AS median,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'queueLength')::int) AS p95
FROM user_activity
WHERE action = 'audio_queue_add' AND created_at > NOW() - INTERVAL '7 days';

-- Spotify fallback rate
SELECT
  COUNT(*) FILTER (WHERE metadata->>'reason' IN ('token_expired','reconnect_failed_3x'))::float /
  NULLIF(COUNT(*), 0) AS rate
FROM user_activity
WHERE action = 'audio_driver_switch' AND metadata->>'from' = 'spotify' AND created_at > NOW() - INTERVAL '7 days';

-- Top 20 lessons completion (JOIN library_lessons)
SELECT
  l.id, l.course_slug, l.slug, l.title,
  COUNT(*) FILTER (WHERE ua.action = 'lesson_play_start') AS plays,
  COUNT(*) FILTER (WHERE ua.action = 'lesson_completion_pct_100')::float /
    NULLIF(COUNT(*) FILTER (WHERE ua.action = 'lesson_play_start'), 0) AS completion_pct
FROM library_lessons l
LEFT JOIN user_activity ua ON ua.metadata->>'lessonId' = l.id
  AND ua.created_at > NOW() - INTERVAL '7 days'
GROUP BY l.id, l.course_slug, l.slug, l.title
HAVING COUNT(*) FILTER (WHERE ua.action = 'lesson_play_start') > 0
ORDER BY completion_pct DESC NULLS LAST
LIMIT 20;
```

**UI:** Componente React `client/src/pages/admin/AudioMetrics.tsx` registrado em rota `/admin/audio-metrics` (Wouter, gated por ProtectedRoute admin prefix).

Layout:
- 4 KPI cards (DAU, WAU, avg listening, fallback rate) topo.
- 2 tables side-by-side: Top 20 completion + Top 10 plays.
- Range selector (7d/30d/90d) top-right.
- Sem charts (Recharts opcional MP4+).
- Refresh button manual (sem auto-refresh para evitar custo query).

**Regras de negocio:**
- Endpoint cache server-side 5min (key = `range`) — evita queries pesadas.
- Cap result rows: top 20 completion + top 10 plays.
- Auth admin OR 403.
- Query timeout 10s (Postgres `statement_timeout` set per request).
- UI fail-gracefully — se endpoint 500, mostra "Metricas indisponiveis temporariamente" + retry button.
- Mobile NAO suportado MVP (admin desktop-only).

**Criterio de aceitacao:**
- [ ] `GET /api/admin/audio-metrics?range=7d` retorna 200 + shape acima (asserta keys e tipos).
- [ ] Non-admin retorna 403.
- [ ] Endpoint cache 5min (test mock Date.now).
- [ ] UI renderiza 4 KPI cards + 2 tables.
- [ ] Range selector troca dados (test simulate click).
- [ ] Loading state + error state cobertos.
- [ ] Test integration: insert 50 user_activity rows fake → query retorna counts corretos.

**Modulos afetados:**
- `server/routes/adminAudioMetrics.ts` (NEW).
- `server/storage/audioMetricsStorage.ts` (NEW — queries SQL agg).
- `client/src/pages/admin/AudioMetrics.tsx` (NEW).
- `client/src/App.tsx` (registrar rota `/admin/audio-metrics`).
- `client/src/components/admin/Sidebar.tsx` (link "Metricas Audio" se ja existe sidebar admin).
- `tests/server/admin/audio-metrics.test.ts` (NEW).
- `tests/client/admin/AudioMetrics.test.tsx` (NEW).

---

### RF-04 — Unificar `/coach` → `/coach-ai` redirect 90d

**Prioridade:** LOW
**Effort:** S (2-3h)
**Refs:** ADR-148 (consolidacao coach), Q4 founder decision

**Descricao.** Wouter redirect 301 logico `/coach*` → `/coach-ai*` preservando query/hash/subpaths. Pos sidebar item ja apontar `/coach-ai` (ADR-148), faltava forçar redirect das rotas legacy.

**Comportamento:**

| URL acessada | Redireciona para |
|---|---|
| `/coach` | `/coach-ai` |
| `/coach/?tab=chat` | `/coach-ai?tab=chat` |
| `/coach/relatorio/abc123` | `/coach-ai/relatorio/abc123` |
| `/coach/relatorio/abc123#secao-x` | `/coach-ai/relatorio/abc123#secao-x` |
| `/coach-ai*` | sem redirect (rota canonica) |

**Regras de negocio:**
- Wouter `<Redirect to={...}>` component OR custom `useEffect` que faz `setLocation()` se path comeca `/coach` (e nao `/coach-ai`).
- Preservar `window.location.search` + `window.location.hash`.
- Emit telemetria 1x por session: `coach_legacy_redirect_fired` em `user_activity` (page `coach_hub`, metadata `{ fromPath, toPath, referrer }`).
- Console.warn em PROD: `[DEPRECATED] /coach foi consolidado em /coach-ai. Atualize bookmarks. Rota legacy sera removida em 90 dias.`
- Banner toast soft (Radix Toast) **so se** `localStorage.coach_legacy_warning_shown !== 'true'` → marca true apos primeira exibicao (suprime futuro toast para mesmo user).
- Banner toast self-dismiss em 8s OR user click X.
- Sidebar item ja aponta `/coach-ai` (verificar via Grep).
- Rota `/coach*` mantida 90d (ate 2026-08-22 baseado em data hoje). Apos: remover Wouter routes legacy + deletar handler (separate PR).

**Criterio de aceitacao:**
- [ ] `/coach` redireciona para `/coach-ai` (test Wouter).
- [ ] `/coach/relatorio/:id` redireciona para `/coach-ai/relatorio/:id` preservando params.
- [ ] Query/hash preservados.
- [ ] `coach_legacy_redirect_fired` event emitted 1x (test mock telemetry).
- [ ] Console.warn fired em PROD-like env (test env var override).
- [ ] Banner toast aparece 1x, suprimido depois (test localStorage).
- [ ] `/coach-ai` direto NAO redireciona.

**Modulos afetados:**
- `client/src/App.tsx` (Wouter rotas — adicionar handler legacy).
- `client/src/pages/coach/CoachLegacyRedirect.tsx` (NEW — componente redirect + toast + telemetry).
- `client/src/components/Sidebar.tsx` (verify ja `/coach-ai`).
- `tests/client/coach/legacy-redirect.test.tsx` (NEW).

---

### RF-05 — Religar `library_progress` UPSERT pipeline (audit-confirmed H2)

**Prioridade:** HIGH (deve rodar PRIMEIRO antes RF-01 — RF-01 ganha canary event `library.progress.upsert` que depende deste fix shipped)
**Effort:** S-M (2-4h impl + testes; ZERO migration)
**Refs:** `memory/audit_library_progress_2026-05-22.md` (audit completo), ADR-207 (canary event convention)

**Audit completo (2026-05-22, modo read-only).** Hipotese vencedora: **H2 CONFIRMED — frontend NUNCA chama `PATCH /api/library/lessons/:id/progress`**. Hipoteses H1/H3/H4/H5 todas REJECTED com evidence:

| Hipotese | Status | Evidence resumida |
|---|---|---|
| H1 — Endpoint nao wirado | REJECTED | `server/routes/library.ts:378` handler `handlePatchLibraryProgress` completo + Zod + auth; wirado em `library-register.ts:123-127` + `routes/index.ts:258` chama `registerLibraryRoutes(app)`. |
| **H2 — Cliente nao chama** | **CONFIRMED** | `grep "PATCH" client/src/pages/biblioteca` = **0 matches**. `grep "/api/library/lessons"` client = so 4 callsites GET (LessonViewer GET lesson/progress, LessonPickerDialog GET batch, ArticleIframe GET bundle). NENHUM PATCH em LessonViewer/PodcastPlayer/ArticleIframe/AudioPlayerContext/useLessonAutoLog/useCoachRecommendationConsume. Endpoint orfao desde Sprint Biblioteca-1 (`f138147b` 2025-Q4). |
| H3 — Storage UPSERT quebrado | REJECTED | `server/storage.ts:10126-10193` `upsertLibraryProgress` correto: `INSERT ... ON CONFLICT(user_id, lesson_id, format)` casa com unique index `uq_library_progress_user_lesson_format`. Threshold D12 95% completion. Preserva `completedAt` previo via COALESCE. console.error precede fallback (lesson #9). |
| H4 — Migration nao aplicada | REJECTED | `migrations/0023_biblioteca.sql:108-118` CREATE TABLE + UNIQUE INDEX baseline Biblioteca-1. Founder rodou — query SELECT que detectou "0 rows" funcionou (tabela existe, vazia). |
| H5 — Throttle elimina UPDATEs | REJECTED | Backend throttle skeleton existe (`routes/library.ts:406-411` retorna 429 com `Retry-After`) so ativo em mock tests. Storage real nao throttle. Client nao throttle (porque nao ha caller). Zero rows = zero PATCH calls. |

**Root cause:**
> Endpoint, schema, storage, migration TODOS funcionam. Falta apenas o caller no frontend (`PATCH` listener em `timeupdate` no `<video>` do Mux Player, no `<audio>` do PodcastPlayer, e ack scroll/conclusao no ArticleIframe).

**Fix (escopo desta sprint — video + audio):**

#### 1. LessonViewer.tsx — mutation + listener video

**File:** `client/src/pages/biblioteca/LessonViewer.tsx` (~apos linha 213, depois `progressQuery`).

```ts
const queryClient = useQueryClient();

const progressMutation = useMutation({
  mutationFn: (payload: {
    format: FormatTab;
    lastPositionSeconds: number;
    totalDurationSeconds?: number;
  }) => apiRequest("PATCH", `/api/library/lessons/${resolvedId}/progress`, payload),
  onSuccess: (data: any) => {
    if (data?.completed) {
      queryClient.invalidateQueries({ queryKey: ["library-progress", resolvedId] });
    }
    // RF-01 canary (ADR-207 §5 library.progress.upsert)
    emitLibraryEvent("library.progress.upsert", {
      lesson_id: resolvedId,
      format: payload.format,
      last_position_sec: payload.lastPositionSeconds,
      total_duration_sec: payload.totalDurationSeconds,
      completed: !!data?.completed,
    });
  },
  onError: (err: any) => {
    if (import.meta.env.DEV) console.warn("[library-progress PATCH] failed (silent)", err);
  },
});

// Throttle 5s client-side (ADR-207 §4 — alinhado server throttle skeleton)
const lastProgressPatchAtRef = useRef<Map<string, number>>(new Map());
const PROGRESS_PATCH_THROTTLE_MS = 5000;
const reportProgress = useCallback(
  (format: FormatTab, lastPositionSeconds: number, totalDurationSeconds?: number) => {
    if (!resolvedId) return;
    const now = Date.now();
    const key = `${resolvedId}:${format}`;
    const last = lastProgressPatchAtRef.current.get(key) ?? 0;
    if (now - last < PROGRESS_PATCH_THROTTLE_MS) return;
    lastProgressPatchAtRef.current.set(key, now);
    progressMutation.mutate({ format, lastPositionSeconds, totalDurationSeconds });
  },
  [resolvedId, progressMutation],
);
```

#### 2. LessonViewer.tsx — bindings timeupdate + beforeunload sendBeacon flush

```ts
useEffect(() => {
  const m = mediaElementRef.current;
  if (!m || activeTab !== "video") return;
  const onTimeUpdate = () => {
    const cur = Number(m.currentTime);
    const dur = Number(m.duration);
    if (!Number.isFinite(cur) || !Number.isFinite(dur) || dur <= 0) return;
    reportProgress("video", Math.floor(cur), Math.floor(dur));
  };
  const onUnload = () => {
    const cur = Number(m.currentTime);
    const dur = Number(m.duration);
    if (cur > 0 && dur > 0) {
      navigator.sendBeacon?.(
        `/api/library/lessons/${resolvedId}/progress`,
        new Blob(
          [JSON.stringify({ format: "video", lastPositionSeconds: Math.floor(cur), totalDurationSeconds: Math.floor(dur) })],
          { type: "application/json" },
        ),
      );
    }
  };
  m.addEventListener("timeupdate", onTimeUpdate);
  window.addEventListener("beforeunload", onUnload);
  document.addEventListener("visibilitychange", onUnload);
  return () => {
    m.removeEventListener("timeupdate", onTimeUpdate);
    window.removeEventListener("beforeunload", onUnload);
    document.removeEventListener("visibilitychange", onUnload);
  };
}, [activeTab, lesson, resolvedId, reportProgress]);
```

**Nota sendBeacon vs PATCH:** sendBeacon usa POST. Server precisa aceitar ambos OR criar handler comum. Decisao implementer: opcao mais simples = duplicate route `app.post("/api/library/lessons/:id/progress", requireAuth, handlePatchLibraryProgress)` (handler permite ambos verbos, sem refactor).

#### 3. PodcastPlayer — prop `onTimeUpdate`

**File:** `client/src/components/biblioteca/PodcastPlayer.tsx`.

```ts
interface Props { ...; onTimeUpdate?: (cur: number, dur: number) => void; }

<audio
  ...
  onTimeUpdate={(e) => {
    const el = e.currentTarget;
    props.onTimeUpdate?.(el.currentTime, el.duration);
  }}
/>
```

**LessonViewer caller:**
```ts
<PodcastPlayer
  ...
  onTimeUpdate={(cur, dur) => reportProgress("podcast", Math.floor(cur), Math.floor(dur))}
/>
```

#### 4. ArticleIframe — FOLLOW-UP separado (NAO neste sprint)

Article nao tem `timeupdate` — requer postMessage `{ type: 'article-scroll', scroll_pct, dwell_seconds }` injetado via `library/static/article-scripts.js`. Escopo cresce ~+2h + precisa verificar/estender o iframe script. **Defer para sprint follow-up `fix-library-progress-article`** (criar spec separada quando RF-05 video+audio shipped).

#### 5. Tests novos (2 arquivos)

**File:** `tests/client/biblioteca/LessonViewer.progressPatch.test.tsx` (NEW)
- Mount LessonViewer com mock video element + mock `apiRequest`.
- Fire 5 `timeupdate` events com `currentTime` incrementando.
- Aguardar 5s + 1 fake timer (acima throttle).
- Esperar exatamente 1-2 calls PATCH (throttle conta).
- Validar payload shape `{ format: 'video', lastPositionSeconds, totalDurationSeconds }`.
- Validar `library.progress.upsert` event emitted apos success.

**File:** `tests/integration/api/library-progress-flow.test.ts` (NEW)
- E2E: GET initial vazio → PATCH → GET retorna o que escreveu.
- Throttle 429 path (mock storage retorna `throttled: true`).
- sendBeacon path: POST same handler retorna 200.

**Imports faltantes em LessonViewer.tsx:**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { emitLibraryEvent } from "@/lib/activity-telemetry"; // depende RF-01 lib renomeada
```

**Impacto colateral (features hoje degradadas — voltam apos fix):**

- **LibraryResume.tsx aba "Continuar de onde parou"** — usa `storage.getLibraryResumeCandidates` que reads `library_progress`. Hoje SEMPRE vazia. Apos fix: comeca a popular.
- **Badge "Concluida"** em `LessonRow` / `LessonHero` — usa `storage.getCompletedLessonIds` que reads `library_progress.completed_at IS NOT NULL`. Hoje NUNCA acende. Apos fix: acende em lessons >= 95%.
- **MP1 picker `LessonPickerDialog.tsx:274`** — chama `getLibraryProgressByLessonIds`. Hoje retorna `{}`. Apos fix: mostra % por lesson + permite resume cross-session via DB (complementa resumeSnapshot localStorage MP3.1).
- **Coach IA tool `compute_grind_study_ratio` / `analyze_study_pace`** — cruza com biblioteca usage. Hoje degradacao silenciosa.

**Criterio de aceitacao:**
- [ ] PATCH `/api/library/lessons/:id/progress` invocado em `timeupdate` (video) e `onTimeUpdate` (audio) com throttle 5s.
- [ ] sendBeacon disparado em `beforeunload` + `visibilitychange` (best-effort flush bypass throttle).
- [ ] `library.progress.upsert` event emitted apos PATCH success (canary RF-01 + ADR-207).
- [ ] `library_progress` table comeca a popular (test integration valida).
- [ ] Test regression `tests/client/biblioteca/LessonViewer.progressPatch.test.tsx` cobre throttle + payload + event emit.
- [ ] Test integration `tests/integration/api/library-progress-flow.test.ts` cobre GET→PATCH→GET roundtrip.
- [ ] Badge "Concluida" acende em lesson com playback >= 95% (verify manual founder).
- [ ] LibraryResume mostra lesson recente (verify manual founder).
- [ ] MP1 picker `LessonPickerDialog` mostra % progress.
- [ ] ZERO regressao baseline (~116 library suites verde).
- [ ] ArticleIframe FORA do escopo (follow-up spec — criar `Docs/specs/fix-library-progress-article.md` se founder pedir).

**Modulos afetados:**
- `client/src/pages/biblioteca/LessonViewer.tsx` (mutation + 2 listeners + canary emit).
- `client/src/components/biblioteca/PodcastPlayer.tsx` (prop `onTimeUpdate`).
- `server/routes/library-register.ts` (adicionar POST duplicate route p/ sendBeacon).
- `tests/client/biblioteca/LessonViewer.progressPatch.test.tsx` (NEW).
- `tests/integration/api/library-progress-flow.test.ts` (NEW).
- **DEFER:** `client/src/components/biblioteca/ArticleIframe.tsx` + `library/static/article-scripts.js` (follow-up spec).

---

## 5. Requisitos Nao-Funcionais

- **Performance:** queries admin (RF-03) cap 10s timeout + cache 5min. Telemetria emit best-effort (NUNCA bloqueia UX, ja garantido lib existente).
- **Seguranca:** PII strip em `user_activity` ja existe (PII_KEYS Set). Cap metadata 10KB. Admin endpoint requirePermission. Smoke script bloqueado em PROD via NODE_ENV check.
- **Disponibilidade:** Telemetria offline backlog localStorage cap 100 (audio-telemetry.ts existente). Sem dependencia hard de telemetria — feature funciona se endpoint down.
- **Cobertura:** RF-01 adiciona 17 testes (1 per evento + dedupe/throttle). RF-03 adiciona ~6 testes (auth, queries, UI). RF-02 adiciona 1 test integration (script structure).
- **Doc:** ADR-207 + atualizacao CLAUDE.md §4 (se novas envs) + §10 (status sprint MP-VALIDATION).
- **Regressao baseline:** ~593+ sibling suites verde + 339 mini-player + 1300+ coach baseline — todos manter verde. `tsc 0` mantido.

---

## 6. Endpoints Previstos

| Metodo | Rota | Descricao | Auth | RF |
|---|---|---|---|---|
| GET | `/api/admin/audio-metrics?range=7d\|30d\|90d` | KPIs MP + lesson + queue + fallback | admin | RF-03 |

Endpoints reusados (existentes, sem mudanca de contract):
- `POST /api/user-activity` (RF-01 emit unitario)
- `POST /api/user-activity/batch` (RF-01 emit batched sendBeacon)

---

## 7. Modelos de Dados Afetados

**Nenhuma migration nova** (assumindo H1-H3-H5 em RF-05 — se H4 confirmar migration `library_progress` faltando, criar 0081 ad-hoc).

Reusa:
- `user_activity` (todos eventos RF-01 + smoke script RF-02 indireto).
- `library_lessons` (JOIN em RF-03 queries).
- `report_jobs`/`reports`/`coach_nudge_log`/`planned_tournaments`/`study_sessions_v2`/`user_off_days`/`email_log` (RF-02 smoke valida).

---

## 8. Integracoes Externas

| Servico | Proposito | Quando | RF |
|---|---|---|---|
| Anthropic API | Coach LLM real-call (Sonnet 4.6 + Haiku) | RF-02 smoke real-mode | RF-02 |
| SMTP (Gmail) | Email send Weekly/Monthly | RF-02 smoke se SMTP configurado | RF-02 |

Sem integracao nova. RF-02 reusa pipeline AI-1B/1C/2B existente.

---

## 9. Cenarios de Teste Derivados

### Happy Path
- [ ] RF-01: 17 eventos emit, server persiste em `user_activity`, PII stripped.
- [ ] RF-02: `npx tsx scripts/smoke-coach-proactive.ts --dry-run` exit 0, 3 reports + 5 nudges + 3 tools + (optional) 1 email.
- [ ] RF-03: GET `/api/admin/audio-metrics?range=7d` retorna shape valido com KPIs > 0 (apos seed RF-01).
- [ ] RF-04: `/coach` redirect → `/coach-ai`, query+hash preservados, toast 1x.
- [ ] RF-05: audit gerado, hipotese identificada.

### Validacao de Input
- [ ] RF-01: metadata > 10KB → 400 (server ja enforce).
- [ ] RF-01: PII keys (`email`, `displayName`) → stripped antes persist.
- [ ] RF-03: admin endpoint sem auth → 401.
- [ ] RF-03: non-admin com auth → 403.
- [ ] RF-03: `range=invalid` → 400 OR default 7d.

### Regras de Negocio
- [ ] RF-01: `audio_seek` throttle 1/sec (test fake timer).
- [ ] RF-01: `lesson_completion_pct_50` emite 1x por sessao+lesson (dedupe).
- [ ] RF-01: `audio_lesson_complete` emite 1x quando completionPct >= 100.
- [ ] RF-02: smoke cleanup remove TODOS rows fake (post-run assert COUNT = 0).
- [ ] RF-02: `--dry-run` mocka `callReportLlm` (asserta nao chama Anthropic).
- [ ] RF-03: cache 5min funciona (test Date.now mock).
- [ ] RF-04: localStorage flag suprime toast segunda vez.

### Edge Cases
- [ ] RF-01: emit fail (server 500) → swallow + log + offline backlog ativa.
- [ ] RF-01: navegacao SPA durante emit → keepalive fetch garante envio.
- [ ] RF-02: SMTP unreachable → step 9 marca `skipped`, exit 0.
- [ ] RF-02: timeout 5min → exit 2 + report inclui partial state.
- [ ] RF-03: `user_activity` vazio → KPIs retornam 0/null gracefully.
- [ ] RF-04: `/coach/path-inexistente` → redirect `/coach-ai/path-inexistente` (deixa NotFound da rota target handle).
- [ ] RF-05: tabela `library_progress` nao existe → audit reporta H4 + sugere `npm run db:push`.

### Regressao baseline
- [ ] ~339 mini-player suites verde.
- [ ] ~83 MP3.2 + ~30 MP3.3 verde.
- [ ] ~116 library verde.
- [ ] ~1300 coach suite verde.
- [ ] ~9568 server total verde.
- [ ] `tsc --noEmit` exit 0.

---

## 10. Fora de Escopo

- **Feature nova ao usuario** (Wave 2 deferida: catalogo Spotify, cross-device sync, equalizer, lyrics, voice control, mobile queue responsive).
- **Catalogo Spotify expandido** (Q2 defer founder).
- **Deploy prod Render+Neon+Cloudflare** (Q3 defer founder — `Docs/deploy/` ja tem spec mas precisa creds).
- **MP3.4 polish backlog 3-6m** (Q5 — spec separada quando criterio emergir).
- **Implementar Whisper real** (ADR-200 DEFER mantido).
- **Charts/visualizacao Recharts em admin** (RF-03 MVP table-only).
- **Mobile responsive admin** (desktop-only MVP).
- **Auto-refresh admin** (manual refresh button only).
- **Banner toast persistente** em `/coach-ai` apos primeiro view (RF-04 suprime via localStorage flag).
- **Remover rota `/coach` legacy** (90d prazo — 2026-08-22).
- **Refactor `LessonViewer` ou `PodcastPlayer`** (Biblioteca-1 territorial).
- **Mudanca em qualquer ADR pre-191** (telemetria scoped).
- **Sumarizacao auto user_activity rows > 90d** (cleanup policy defer separate sprint).

---

## 11. Tier List ICE — Priorizacao Recomendada

Score ICE = (Impact * Confidence * Ease) escala 1-10.

| Item | Impact | Confidence | Ease | ICE | Recomendacao |
|---|---|---|---|---|---|
| **RF-05** Religar library_progress (H2 confirmed) | 9 | 10 | 8 | **720** | **MUST + FIRST** (bug ativo prod-like, fix concreto pos-audit) |
| **RF-01** Instrumentar telemetria | 9 | 9 | 6 | **486** | **MUST** (gate Wave 2 + RF-03 dependency) |
| **RF-03** Admin metrics panel | 8 | 8 | 7 | **448** | **MUST** (visibilidade founder) |
| **RF-02** Smoke Coach end-to-end | 7 | 7 | 7 | **343** | **SHOULD** (catch regressao prod) |
| **RF-04** Coach legacy redirect | 4 | 8 | 8 | **256** | **NICE** (90d prazo, pode deslizar) |

**Pacote MUST (3 items, ~14h, ~2d):** RF-05 + RF-01 + RF-03 → fecha bug latente + telemetria + observabilidade.

**Pacote MUST+SHOULD (4 items, ~20h, ~2.5d):** + RF-02 → fecha tambem smoke Coach.

**Pacote completo (5 items, ~22h, ~3d):** + RF-04 → fecha tambem redirect legacy.

**Recomendacao Auto Mode:** executar **MUST+SHOULD (4 items, ~20h)** = cap 2.5 dia. RF-04 pode rodar em sprint paralelo curto OR ser absorvido em sprint UX-QW-4 futuro.

---

## 12. Ordem de Execucao

**Audit RF-05 ja completo (2026-05-22):** H2 CONFIRMED (cliente nunca chama PATCH). Hipotese unica — outras 4 REJECTED com evidence. Sem investigation residual; fix bem-definido (mutation + 2 listeners + canary).

**RF-05 PRIMEIRO** (2-4h impl+test, ZERO migration):
- Implementer pluga `progressMutation` + listeners `timeupdate` (video) + `onTimeUpdate` prop (audio) + sendBeacon `beforeunload`/`visibilitychange`.
- Adiciona POST duplicate route para sendBeacon (sem refactor handler).
- Tests novos: `LessonViewer.progressPatch.test.tsx` + `library-progress-flow.test.ts`.
- Desbloqueia value visivel: LibraryResume, badge "Concluida", MP1 picker %, Coach tools `compute_grind_study_ratio`.
- **NAO inclui ArticleIframe** (follow-up spec separada).

**RF-01 SEGUNDO** (5-7h, depende RF-05 para wirar canary):
- Rename `audio-telemetry.ts` → `activity-telemetry.ts` + alias 90d.
- 8+5+4+1(canary)=18 eventos via lib estendida.
- Plugins em MiniPlayerBar/AudioPlayerContext/QueueButton (audio), LessonViewer (lesson + canary RF-05), CoachInbox/NudgeCard/CoachChat (coach).
- 18+ tests emit + dedupe + throttle + PII guard.

**RF-03 TERCEIRO** (4-6h, depende RF-01 shipped p/ events populating):
- Endpoint `GET /api/admin/audio-metrics?range=Xd` + cache 5min + 8 queries paralelas.
- UI `AudioMetrics.tsx` 4 KPI cards + 2 tables + range selector + canary drift badge.
- Tests auth (401/403) + queries (50 fake events → counts) + UI loading/error.

**RF-02 QUARTO** (4-6h, paralelo RF-03):
- Script CLI `scripts/smoke-coach-proactive.ts` 11 steps.
- Test integration `smoke-coach-proactive.test.ts` valida script structure.
- Exit codes 0/1/2/3 + dry-run mock + cleanup safety guard `USER-SMOKE-` prefix.

**RF-04 QUINTO** (2-3h, opcional):
- Wouter `CoachLegacyRedirect` component + useEffect setLocation preservando query/hash.
- Toast Radix 1x/user + sessionStorage dedupe + PROD console.warn 90d.
- `coach.legacy_redirect.fired` event 1x/session.

**Total sequencial MUST+SHOULD:** ~16-22h em ~2-2.5 dias (RF-05 ja com plano concreto encurtou estimativa original).

---

## 13. ADRs + Diagramas (system-architect 2026-05-22)

**ADR criada:**

- **ADR-207** — `Docs/architecture/decisions/207-record-activity-event-convention.md` — Convencao nomenclatura `recordActivity` events (snake_case + dot-namespace por dominio `audio.*`/`lesson.*`/`coach.*`/`library.*` + schema metadata canonico + PII guideline expandida + dedupe/throttle policies + lib unica `activity-telemetry.ts` com alias 90d). Generaliza ADR-191 (audio_* legacy coexiste — sem rewrite retroativo).

**Diagramas Mermaid em `Docs/architecture/diagrams/sprint-mp-validation/`:**

1. **`library-progress-flow.mermaid`** (RF-05) — Sequence: `LessonViewer` / `PodcastPlayer` `timeupdate` → throttle 5s useRef → `progressMutation` → `PATCH /api/library/lessons/:id/progress` → `handlePatchLibraryProgress` → `upsertLibraryProgress` → DB. Cobre tambem `beforeunload` / `visibilitychange` sendBeacon bypass throttle, podcast format via `<audio onTimeUpdate>`, success emit `library.progress.upsert` canary, failure path silent (log dev only).

2. **`record-activity-instrumentation.mermaid`** (RF-01) — Sequence: UI events (play/pause/seek/lesson_complete/coach_nudge_*) → `activity-telemetry.ts` → PII guard client → throttle Map → dedupe Set per session → batch buffer (cap 10) → `navigator.sendBeacon` (fallback fetch keepalive + offline backlog localStorage cap 100) → `POST /api/user-activity/batch` → server `stripPII` + cap 10KB → bulk INSERT `user_activity`. Inclui 4 dominios + PII allowlist/denylist.

3. **`coach-legacy-redirect.mermaid`** (RF-04) — Flowchart: user navega `/coach*` → Wouter Route matcher → `CoachLegacyRedirect` component → useEffect captura search+hash → buildTarget `/coach-ai`+subpath → setLocation. Branches: localStorage flag suprime toast 2x; PROD console.warn deprecation 90d; sessionStorage dedupe `coach.legacy_redirect.fired` emit 1x/session.

4. **`admin-audio-metrics-query.mermaid`** (RF-03) — Sequence: admin `/admin/audio-metrics` → useQuery → `GET /api/admin/audio-metrics?range=Xd` → `requireAuth + requirePermission('admin')` → cache check (5min TTL in-memory Map per range) → `audioMetricsStorage.getAudioMetrics` → Promise.all 8 SQL queries paralelas (DAU/WAU/avg listening/queue percentiles/fallback rate/top20 completion JOIN library_lessons/top10 plays/RF-05 canary drift). Inclui range change, manual refresh, query timeout 10s failure path.

---

## 14. Notas de Implementacao (opcional)

- **RF-01 lib renomeada** — Decisao system-architect: rename `client/src/lib/audio-telemetry.ts` → `client/src/lib/activity-telemetry.ts` (escopo expande pra 4 dominios). Manter `audio-telemetry.ts` como **alias re-export 90d** (`export * from "./activity-telemetry"` + `console.warn` em DEV) — NAO quebrar imports MP3.x. Preservar `emitAudioEvent` (back-compat ADR-191) + adicionar `emitLessonEvent` + `emitCoachEvent` + `emitLibraryEvent` (RF-05 canary). Internals (throttle Map, dedupe Set, batch buffer, offline backlog, PII guard) compartilhados.
- **RF-01 throttle** — usar `lodash.throttle` ja em deps OR implementar leve com `Map<key, timestamp>`.
- **RF-01 dedupe** — `Set<lessonId>` por sessao em React Context (clear no `mountEffect`).
- **RF-01 PII** — server ja garante via `stripPII`. Client NAO precisa pre-sanitize.
- **RF-02 mock LLM** — `--dry-run` injeta mock via `vi.mock` equivalent OR factory injection no script (sem vi pois eh script CLI).
- **RF-02 cleanup safety** — SEMPRE `userPlatformId LIKE 'USER-SMOKE-%'` no DELETE (NUNCA delete user real). Adicional guard: `WHERE created_at > NOW() - INTERVAL '1 hour'`.
- **RF-03 cache** — `Map<rangeKey, { data, expiresAt }>` in-memory + `_resetForTests()` exported.
- **RF-03 queries** — usar Drizzle raw `sql\`\`` para queries complexas (percentile, FILTER, JOIN). Alternativa: SQL puro em `server/storage/audioMetricsStorage.ts`.
- **RF-04 Wouter redirect** — preferir custom `useEffect` com `useLocation()` em vez de `<Redirect>` para preservar hash/query (Wouter v3 `<Redirect>` perde hash).
- **RF-04 toast** — Radix Toast OR shadcn `useToast()`. Auto-dismiss 8s.
- **RF-05 audit** — JA COMPLETO em `memory/audit_library_progress_2026-05-22.md` (H2 confirmed). Implementer pula investigation, vai direto ao fix (mutation + 2 listeners + canary).
- **RF-05 sendBeacon vs PATCH** — sendBeacon usa POST. Server precisa aceitar ambos. Decisao implementer: opcao simples = `app.post("/api/library/lessons/:id/progress", requireAuth, handlePatchLibraryProgress)` duplicate route (handler aceita ambos verbos via shared logic — sem refactor).
- **Verificacao pos-RF-05** founder manual: tocar 1 lesson video >= 30s → confirma `SELECT * FROM library_progress WHERE user_id = '...' LIMIT 1` retorna row + badge "Concluida" acende em >= 95%.

---

## 15. Verificacao Final

- [x] Cada RF tem prioridade, effort, criterio de aceitacao, refs.
- [x] Cenarios de teste cobrem happy / validacao / regras / edge / regressao baseline.
- [x] Fora de escopo preenchido (Wave 2 + Q2/Q3 deferidos + MP3.4 backlog).
- [x] Tier list ICE para founder priorizar (MUST/SHOULD/NICE).
- [x] Numero ADR (207) reservado.
- [x] Migration nao necessaria (reusa user_activity + tabelas Coach existentes; RF-05 H4 REJECTED — tabela ja existe baseline 0023).
- [x] Diagramas Mermaid criados (4 em `Docs/architecture/diagrams/sprint-mp-validation/`).
- [x] ADR-207 criada (`Docs/architecture/decisions/207-record-activity-event-convention.md`).
- [x] RF-05 audit completo (`memory/audit_library_progress_2026-05-22.md`) — H2 confirmed.
- [x] Modulos afetados por RF.
- [x] Sem ambiguidade em decisoes default (Q1+Q4+Q5 pre-resolvidas; defaults pacote MUST+SHOULD).
- [x] Branch alvo + base commit definidos (`feature/sprint-mp-validation` saindo de `main@6e61bf7f` MP3.3).
- [x] Sprint cap (1.5-2.5d) bate com pacote recomendado MUST+SHOULD (~20h).
- [x] Ordem execucao explicita (RF-05 first, RF-01 segundo, RF-03+RF-02 paralelo, RF-04 ultimo opcional).
- [x] Pipeline TDD compatibilidade (system-architect → test-writer → implementer → reviewer).
