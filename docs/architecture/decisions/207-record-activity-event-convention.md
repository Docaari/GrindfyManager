# ADR-207 — Convencao Nomenclatura `recordActivity` Events

**Status:** Accepted
**Date:** 2026-05-22
**Sprint:** MP-VALIDATION (RF-01 instrumentation + RF-04 coach legacy redirect + RF-05 library progress canary)
**Supersedes / Relates:** ADR-191 (telemetria audio reuse `user_activity`) — este ADR generaliza a convencao alem dos 9 eventos audio originais para cobrir `lesson.*`, `coach.*`, `library.*`.

---

## Context

ADR-191 padronizou reuso da tabela `user_activity` para telemetria de audio (MP2). Inseriu 9 eventos `audio_*` via lib `client/src/lib/audio-telemetry.ts` (sendBeacon batched, cap 10/batch, offline backlog localStorage cap 100, PII strip server-side).

Sprint MP-VALIDATION expande escopo para 17+ eventos novos cruzando 4 dominios (`audio.*`, `lesson.*`, `coach.*`, `library.*`). Sem convencao explicita, riscos:

1. **Drift de naming** — `audio_play` vs `audioPlay` vs `mp.play` em surfaces distintas → queries SQL agg viram impossivel de manter.
2. **PII vazando** — dev adiciona `metadata.userEmail` "so pra debug" → cai em log que `user_activity` server `stripPII` cobre **so as 3 keys hardcoded** (`email`, `displayName`, `name`). Custom keys nao cobertas.
3. **Schema metadata divergente** — `audio_play` v1 usa `{ trackId }`, v2 vira `{ track_id }` snake_case → quebra agregacao retroativa.
4. **Eventos sem dedupe** — `audio_seek` user scrub gera 20-40 events/sec → satura batch + perde sinal.
5. **Versionamento** — quando shape muda (e.g. `audio_play` ganha `queueLength`), retro-compat quebra silencioso.

Forcas em jogo:

- Reuso `user_activity` ja decidido (ADR-191) — sem tabela nova.
- Cap metadata 10KB ja enforcado server-side (Zod schema).
- Lib client ja faz sendBeacon batch + offline backlog (`audio-telemetry.ts`).
- PII strip server `stripPII` lista hardcoded — precisa estender OR convencionar client-side.
- 17+ eventos novos requerem padrao **antes** do code review virar pingue-pongue de naming.

## Decision

**Convencao canonica `recordActivity` events** aplicavel a TODOS os 4 dominios (`audio.*`, `lesson.*`, `coach.*`, `library.*`):

### 1. Formato `action`

- **snake_case obrigatorio.** `action` field em `user_activity`.
- **Namespace por dominio prefix**: `audio.*`, `lesson.*`, `coach.*`, `library.*`. Dot-separator entre namespace e event name.
- **Subdivisao opcional via `feature`** — usar `feature` field em `user_activity` para granularidade (e.g. `feature='mini_player'` quando `action='audio.play'`).
- **Versionamento via suffix `.vN`** quando schema `metadata` muda incompativel: `audio.play.v2`. v1 implicito (sem suffix). Manter both rodando >= 30d antes de deprecar v1.

### 2. Schema `metadata` JSONB — campos canonicos compartilhados

Quando aplicavel ao evento, usar estes nomes (snake_case):

| Campo | Tipo | Quando |
|---|---|---|
| `duration_ms` | number | Eventos com duracao (chunk de listening, dwell, etc) |
| `source_driver` | `'spotify' \| 'internal_mp4' \| 'mux'` | Eventos audio cross-driver |
| `lesson_id` | string (nanoid) | Eventos referenciando uma lesson |
| `course_slug` | string | Eventos referenciando um curso |
| `user_tier` | `'free' \| 'trial' \| 'pro' \| 'premium' \| 'admin'` | Eventos onde tier afeta comportamento |
| `route` | string | Path-only (e.g. `/biblioteca/curso/x/y/play`). NUNCA query/hash. |
| `meta_v` | number | Versao do schema metadata (default `1`). Reservado para schema evolution. |

Campos extras especificos do evento: livres, snake_case, documentados na tabela `Lista canonica` abaixo.

### 3. PII guideline — proibido logar

**NUNCA incluir em `metadata`:**

- `email`, `display_name`, `name`, `phone`, `cpf`, `payment_card`, `address`.
- IPs (server ja captura `ip_address` em coluna dedicada — nao duplicar).
- Tokens (jwt, refresh, oauth) — usar hash truncado se imprescindivel.
- Texto livre digitado por user (e.g. chat message, nota de estudo). Permitido: token counts, length em chars, format flags.

**Permitido:**

- `user_id` (sempre via FK ja persistida `user_activity.user_id`, NUNCA duplicar em metadata).
- IDs de domain entities (lessonId, courseSlug, sessionId, trackId, nudgeId, reportId).
- Flags tecnicos (tier, driver, format, reason, route).
- Counts e numeros (token count, duration, position).

Server-side: estender `stripPII` Set para cobrir `displayName`, `phone`, `cpf`, `paymentCard`, `address`. Mantido como defesa em profundidade — convencao client e a primeira linha.

### 4. Dedupe + throttle policies

Todos os eventos sao **best-effort** — telemetria NUNCA bloqueia UX (try/catch + log antes do swallow per lesson #9).

| Pattern | Aplicar quando | Implementacao |
|---|---|---|
| **Throttle 30s same (action, lessonId)** | Default p/ eventos repetitivos cross-session | Map<`${action}:${lessonId}`, timestamp> client |
| **Throttle 1s same (action, trackId)** | `audio.seek` (user scrub) | Map<trackId, timestamp> |
| **Throttle 5s same (action, lessonId)** | `library.progress.upsert` (RF-05) | useRef timestamp local |
| **Dedupe 1x per session same (action, lessonId)** | `lesson.completion_pct_*`, `audio.lesson_complete` | Set<lessonId> em React Context, clear no mount |
| **Dedupe 1x per session same action** | `coach.legacy_redirect.fired` (RF-04) | localStorage flag `coach_legacy_warning_shown` |

Throttle e local-only (in-memory ref/Map). Offline backlog (localStorage cap 100) ja existente cobre falhas de rede.

### 5. Lista canonica eventos novos (Sprint MP-VALIDATION)

**17 eventos novos + 1 evento library (RF-05 canary). Total 18.**

#### Audio (8) — RF-01

| `action` | `feature` | `metadata` extras |
|---|---|---|
| `audio.play` | `mini_player` | `track_id, source_driver, queue_position, queue_length` |
| `audio.pause` | `mini_player` | `track_id, at_position_sec, duration_ms, reason: 'user'\|'driver_switch'\|'sleep_timer'` |
| `audio.seek` | `mini_player` | `track_id, from_position_sec, to_position_sec, reason: 'user_scrub'\|'shortcut'\|'resume'` |
| `audio.next` | `mini_player` | `from_track_id, to_track_id, reason: 'user'\|'auto_advance'\|'shortcut_l'` |
| `audio.prev` | `mini_player` | `from_track_id, to_track_id, reason: 'user'\|'shortcut_j'` |
| `audio.queue_add` | `queue` | `track_id, position, source: 'manual'\|'auto_lesson_complete'` |
| `audio.queue_remove` | `queue` | `track_id, position, reason: 'user'\|'cleared'\|'played'` |
| `audio.lesson_complete` | `lesson` | `lesson_id, course_slug, completion_pct, source_driver, duration_ms` |

#### Lesson (5) — RF-01

| `action` | `feature` | `metadata` extras |
|---|---|---|
| `lesson.view` | `lesson_viewer` | `lesson_id, course_slug, format: 'video'\|'audio'\|'pdf'\|'article'` |
| `lesson.play_start` | `lesson_viewer` | `lesson_id, course_slug, format, total_duration_sec` |
| `lesson.completion_pct_25` | `lesson_viewer` | `lesson_id, course_slug, format, total_duration_sec, listened_sec` |
| `lesson.completion_pct_50` | idem | idem |
| `lesson.completion_pct_75` | idem | idem |
| `lesson.completion_pct_100` | idem | idem |

(efetivo: 6 eventos lesson — `.completion_pct_*` sao 4 separados; spec conta como 5 RFs)

#### Coach (4) — RF-01 + RF-04

| `action` | `feature` | `metadata` extras |
|---|---|---|
| `coach.nudge_received` | nudge category | `nudge_id, category: 'B-DOWNSWING'\|'B-VOLUME'\|...` |
| `coach.nudge_dismissed` | nudge category | `nudge_id, category, duration_ms, reason: 'user_click_x'\|'auto_timeout'\|'view_change'` |
| `coach.nudge_cta_clicked` | nudge category | `nudge_id, category, cta_label, target_url` |
| `coach.chat_message` | `chat` | `message_type: 'user'\|'assistant', token_count_input, token_count_output, user_tier` |
| `coach.legacy_redirect.fired` (RF-04) | `coach_hub` | `from_path, to_path, referrer` |

#### Library (1) — RF-05 canary

| `action` | `feature` | `metadata` extras |
|---|---|---|
| `library.progress.upsert` | `lesson_viewer` | `lesson_id, format, last_position_sec, total_duration_sec, completed: boolean` |

Emitido client-side **apos** mutation 200 OK (success path). Server agrega + admin dashboard (RF-03) cruza com `library_events.count(eventType=play)` → alerta drift (canary para regressao similar ao audit 2026-05-22).

### 6. Lib client unica

Renomear `client/src/lib/audio-telemetry.ts` → `client/src/lib/activity-telemetry.ts` (escopo expande). Manter re-export alias `audio-telemetry.ts` por **90 dias** para nao quebrar imports MP3.x:

```ts
// client/src/lib/audio-telemetry.ts (alias deprecated 90d)
export * from "./activity-telemetry";
// Console.warn em dev quando alguem importar via path antigo.
```

API publica:

- `emitAudioEvent(action, payload)` (back-compat ADR-191)
- `emitLessonEvent(action, payload)` (novo)
- `emitCoachEvent(action, payload)` (novo)
- `emitLibraryEvent(action, payload)` (novo — RF-05 canary)

Internals compartilham: throttle Map, dedupe Set per session, sendBeacon batch, offline backlog, PII guard client-side (warn em dev se key prohibida detectada — log antes do swallow).

## Consequences

**Positivas:**

- Convencao explicita reduz pingue-pongue de naming em code review.
- Dedupe/throttle policies por categoria evitam satura batch (lesson #9 do MP2 — `audio.seek` user scrub).
- Versionamento `.vN` permite evoluir schema sem quebrar dashboards retroativos.
- PII guideline + client-side guard reforca defesa server-side `stripPII`.
- Lib unica `activity-telemetry.ts` (alias 90d) simplifica futuras adicoes (e.g. `bankroll.*`, `study.*`, `grind.*`).

**Negativas:**

- Migracao de eventos `audio_*` legacy (snake_case sem prefix) requer rewrite de queries SQL existentes em dashboards/RF-03 OR coexistencia (queries com `OR action LIKE 'audio_%' OR action LIKE 'audio.%'`).
- **Decisao operativa**: por simplicidade, MP-VALIDATION mantem nomes legacy `audio_*` ja em prod (9 eventos ADR-191) e usa **dot-namespace** apenas para os 17 eventos novos. Sem rewrite retroativo. Convencao consolida a partir desta sprint.
- Cap metadata 10KB ja existe — sem mudanca.
- Convencao depende de dev compliance (sem lint rule automatica MVP). Reviewer enforcement.

**Neutras:**

- 18 eventos novos populam `user_activity` em volume ~5-10x maior pos-sprint (especialmente `audio.*` heartbeat). Migration 0064 perf indexes ja cobre escala.
- Painel RF-03 admin agrega via SQL — convencao garante queries simples (`WHERE action LIKE 'audio.%' OR action LIKE 'lesson.%'`).

## Confidence

**Alta** — padrao deriva direto de ADR-191 (precedente shipped) + convencao bem-conhecida (snake_case + namespace dot). Riscos identificados (migracao legacy, dev compliance) com mitigation explicito (sem rewrite retroativo, reviewer enforcement).

## Implementation Notes

- ADR-191 nao precisa de revisao — coexiste como subcaso (audio com nomes legacy underscore).
- RF-01 implementer cria lib + plugins + 17 testes.
- RF-04 implementer pluga `coach.legacy_redirect.fired` 1x (dedupe localStorage).
- RF-05 implementer pluga `library.progress.upsert` apos mutation success.
- RF-03 implementer ajusta SQL queries para reconhecer dois prefixes (`audio_` legacy + `audio.` novo) ate retirada do legacy (defer >6 meses).
- Server `stripPII` Set extended (adicionar `displayName`, `phone`, `cpf`, `paymentCard`, `address`) em PR follow-up ate criterio emergir.
