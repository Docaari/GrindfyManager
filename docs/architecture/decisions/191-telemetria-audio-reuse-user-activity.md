# ADR-191: Telemetria audio = reuse `user_activity` table

## Status

Aceito — 2026-05-22.

**Resolve Q-F + Q-M da spec MP2.** Substitui o D11 da spec MP2 (que cogitava tabela nova `audio_telemetry`) por reuso de `user_activity`.

## Data

2026-05-22

## Contexto

O Sprint Mini Player 2 (MP2) adiciona telemetria de uso do player audio para:

1. Validar a decisao "queue homogenea + troca driver explicita" (ADR-189) com dados reais (% users que trocam driver na mesma sessao).
2. Medir adocao do Spotify Premium gate (% users Free vs Premium na cohort).
3. Medir fire rate do Sleep Timer (RNF-05 — ±2s de drift em background tab).
4. Detectar reconnect failures + premium check failures pra triagem de bugs.

Spec MP2 D11 + Q-F propunha 2 opcoes:

- **Q-F opcao 1**: reusar `library_events` JSONB (existente para telemetria da Biblioteca-1) com prefix `audio_*` em event_name. **Schema NAO bate** — `library_events` tem colunas especificas (`lesson_id`, `course_id`, `position_seconds`) que nao fazem sentido pra audio_driver_switch.
- **Q-F opcao 2**: criar tabela nova `audio_telemetry` com shape generico.

Forcas em jogo:

1. **Lesson #10 (DRY de prompts) + lesson generalizada**: divergencia silenciosa entre tabelas de telemetria gera dificuldade de query cross-feature ("quantos events o user produziu hoje?" -> JOIN N tabelas).
2. **`user_activity` ja existe** (verificado em `shared/schema.ts:246`). Schema:
   ```typescript
   {
     id: varchar PK,
     userId: varchar FK -> users.userPlatformId,
     page: varchar NOT NULL,    // dashboard, grind, warm-up, studies, ...
     action: varchar NOT NULL,  // page_view, feature_use, session_start, session_end
     feature: varchar,
     duration: integer,
     metadata: jsonb,
     ipAddress, userAgent, createdAt
   }
   ```
   Index existente: `idx_user_activity_user_id ON user_activity(user_id, id DESC)` (migration 0064 perf indexes).

3. **Shape match**: campo `action` aceita event_name livre (varchar). Campo `metadata` JSONB carrega payload arbitrario. Campo `page` carrega contexto (`'mini_player'`). Campo `feature` carrega sub-contexto opcional (`'sleep_timer'`, `'spotify'`, `'driver_switch'`). **Nenhum campo precisa ser adicionado.**

4. **Volume**: spec MP2 estima `audio_driver_active` heartbeat 60s. Em sessao 11h: ~660 events/sessao/user. Cohort 100 users ativos = 66k events/dia. Comparado com `library_events` (lesson plays, page views) ja em escala similar — `user_activity` ja foi otimizado em migration 0064 pra esse range.

5. **Queries de analytics MP2 (RF-04.3)**:
   ```sql
   -- % users que trocaram driver em sessao
   SELECT COUNT(DISTINCT user_id) FILTER (WHERE action = 'audio_driver_switch') * 100.0
        / COUNT(DISTINCT user_id) AS pct
   FROM user_activity
   WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '7 days';

   -- Sleep timer fire rate
   SELECT
     COUNT(*) FILTER (WHERE action = 'sleep_timer_fired') * 100.0
       / NULLIF(COUNT(*) FILTER (WHERE action = 'sleep_timer_activated'), 0) AS fire_rate
   FROM user_activity
   WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '30 days';

   -- Premium gate fail rate
   SELECT COUNT(*) FROM user_activity
   WHERE page = 'mini_player' AND action = 'spotify_premium_check_failed'
     AND created_at > NOW() - INTERVAL '30 days';
   ```
   Index `(user_id, id DESC)` cobre filtro por user. Filtros por `action` cross-user farao sequential scan **em sessoes ad-hoc de analytics** — aceitavel MVP. Follow-up se queries virarem dashboard live: adicionar index `(action, created_at DESC) WHERE page = 'mini_player'`. Migration 0078 (RESERVADA, nao criada agora — lazy provisioning).

## Opcoes Consideradas

### Opcao 1: tabela nova `audio_telemetry`

`CREATE TABLE audio_telemetry (id, user_id, event_name, payload jsonb, created_at)` + indexes dedicados.

- **Pros:**
  - Queries dashboard mais rapidas (index `(event_name, created_at)` por padrao).
  - Cleanup independente (e.g. delete events > 90d) sem afetar outras telemetrias.
  - Schema dedicado torna evolucao mais simples (adicionar campos especificos sem mexer em `user_activity`).
- **Contras:**
  - Migration nova + tabela nova + rollback + storage helper.
  - Quebra unidade conceitual de "atividade do user" — analytics cross-feature precisa UNION ALL.
  - Premature optimization: volume MP2 esta em range do `user_activity` ja otimizado (migration 0064).
  - Manutencao: 2 tabelas com mesma intent + retention policy duplicada.

### Opcao 2: `library_events` reuse

Reusar `library_events` com prefix `audio_*`.

- **Pros:**
  - Mesmo provedor de eventos do MP1.
- **Contras:**
  - Schema tem colunas especificas (`lesson_id`, `course_id`, `position_seconds`) que ficam NULL em audio_driver_switch / sleep_timer_* etc. Polui schema.
  - `library_events` foi desenhada pra Biblioteca-1 (eventos de lesson playback). Audio player generico nao e feature de biblioteca — Spotify content nem aparece em Biblioteca.

### Opcao 3 (escolhida): reuse `user_activity` com `page='mini_player'`

Mapeamento:

| Campo `user_activity` | Valor pra audio telemetry |
|---|---|
| `page` | `'mini_player'` (sempre — filtro principal nas queries) |
| `action` | event_name livre (`'audio_driver_active'`, `'audio_driver_switch'`, `'sleep_timer_fired'`, `'spotify_premium_check_failed'`, etc) |
| `feature` | sub-contexto opcional (`'spotify'`, `'html_audio'`, `'sleep_timer'`, `'driver_switch'`) — facilita filtro por sub-area |
| `duration` | onde aplicavel (`audio_driver_active` -> `sessionDurationSeconds`; `sleep_timer_fired` -> `actualDurationMinutes * 60`) |
| `metadata` | payload JSONB especifico do evento (ver lista abaixo) |
| `createdAt` | server-side `NOW()` (cliente envia `clientTimestamp` em metadata se quiser delta-debug) |

- **Pros:**
  - Zero migration nova (apenas reuse).
  - Unifica analytics cross-feature ("atividade total do user X" = 1 SELECT).
  - Index existente `(user_id, id DESC)` cobre filtros principais.
  - Lesson #10 generalizada: DRY de telemetria.
- **Contras:**
  - Queries cross-user por `action` farao sequential scan em ad-hoc. **Mitigacao:** documentar como follow-up (migration 0078 RESERVADA, criar so se virar dashboard live).
  - Schema generico nao tem colunas dedicadas como `event_version`. **Mitigacao:** versionar dentro de `metadata.v` se necessario.

## Decisao

**Reusar tabela `user_activity` para toda telemetria audio. Sem migration nova.**

### Eventos novos (9 total)

Spec MP2 § RF-04.2 lista 9 eventos. Aqui o mapping detalhado para `user_activity`:

| `action` (event_name) | `feature` | `duration` | `metadata` payload | Quando emite |
|---|---|---|---|---|
| `audio_driver_active` | driver name (`spotify` ou `html_audio`) | sessionDurationSeconds | `{ driver, trackId, source: 'library'|'spotify', sessionStartedAt }` | Heartbeat 60s enquanto driver ativo |
| `audio_driver_switch` | `driver_switch` | gapMs entre pause(old) e play(new) | `{ from, to, reason: 'user_picked_lesson'|'user_picked_spotify_track'|'manual_disconnect'|'token_expired' }` | Cada troca de driver via Engine.swapDriver() |
| `audio_focus_lost` | driver name que perdeu | gapMs | `{ driverWhoLost, driverWhoTook }` | Paralelo a driver_switch — driver antigo emite event focus_lost antes de destroy |
| `sleep_timer_activated` | `sleep_timer` | null | `{ durationMinutes, presetIndex }` | User escolhe preset no Popover |
| `sleep_timer_fired` | `sleep_timer` | actualDurationMinutes*60 | `{ targetMinutes, actualDurationMinutes, driftMs, driverAtFire }` | setTimeout fire dispara fade-out |
| `sleep_timer_cancelled` | `sleep_timer` | remainingMinutes*60 | `{ remainingMinutes, reason: 'user_interaction'|'manual_cancel'|'driver_change' }` | User cancela ou interage |
| `spotify_connected` | `spotify` | null | `{ displayNameHash, productTier: 'premium'|'free', scopes }` | Pos OAuth + Premium check OK |
| `spotify_disconnected` | `spotify` | sessionDurationSeconds | `{ reason: 'user_initiated'|'token_refresh_failed_3x'|'reconnect_failed_3x' }` | User clica Desconectar OU server limpa cookie |
| `spotify_token_refreshed` | `spotify` | timeBeforeExpirySeconds | `{ success: true, retryCount }` | Refresh proativo bem-sucedido |

### PII strip

- **Nunca** persistir email, displayName cru, refresh_token, access_token.
- `displayNameHash` = SHA-256 truncado a 16 chars (suficiente pra correlacionar sem reverter).
- `ipAddress` ja capturado pelo middleware `requireAuth` server-side — manter conforme padrao do `user_activity`.

### Client-side emit

`client/src/lib/audio-telemetry.ts` exporta `emitAudioEvent(action, payload, options?)`:

```typescript
async function emitAudioEvent(
  action: AudioEventAction,
  payload: Record<string, unknown>,
  options?: { feature?: string; duration?: number; useBeacon?: boolean }
): Promise<void> {
  const body = {
    action,
    feature: options?.feature,
    duration: options?.duration,
    page: 'mini_player',
    metadata: { ...payload, clientTimestamp: Date.now(), v: 1 },
  };
  // Batch sendBeacon (cap 10/batch) — RNF-04 spec MP2
  if (options?.useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/user-activity/batch', JSON.stringify(body));
  } else {
    fetch('/api/user-activity', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(/* swallow — telemetry never blocks */);
  }
}
```

`audio-telemetry.ts` mantem backlog queue localStorage offline (RNF-04, cap 100 events) — flush on `navigator.onLine` true.

### Endpoint reuse

- `POST /api/user-activity` — **existente**, ja com auth + Zod + rate limit. **Adicionar** suporte a `action` livre + `metadata` arbitrario (validar Zod schema permissivo so para `page='mini_player'`).
- `POST /api/user-activity/batch` — **novo**, aceita array `events: [{action, feature, duration, page, metadata}]` para sendBeacon batches. Rate limit por IP.

### Index strategy

- Index existente `idx_user_activity_user_id ON (user_id, id DESC)` cobre **filtro por user** (cenario quente). OK MVP.
- Index `(action, created_at DESC) WHERE page = 'mini_player'` (parcial) **NAO criado agora**. Migration 0078 **RESERVADA** se queries cross-user por action virarem dashboard live (pos-MVP). Lazy provisioning evita criar index caro que nao sera usado.

## Consequencias

### Positivas

- **Zero migration nova** pra telemetria audio.
- **Unifica analytics cross-feature**: 1 SELECT em `user_activity` cobre lesson plays + audio events + page views + grind sessions.
- Lesson #10 generalizada (DRY de telemetria) aplicada.
- Index existente (migration 0064 perf indexes) cobre cenario quente.
- Cleanup policy unificado: `user_activity` ja tem TTL implicito (review periodico de retention).
- Pattern reusavel para futuros eventos client-side (sem provisionar tabelas dedicadas por feature).

### Negativas

- Queries cross-user por `action` (e.g. "total fire rate do sleep timer") farao sequential scan. **Mitigacao:** queries de analytics rodam em background ad-hoc; dashboard live nao precisa em MP2. Migration 0078 RESERVADA.
- Schema generico nao tem `event_version` dedicado — versionar em `metadata.v` (custo zero).

### Neutras

- Endpoint `POST /api/user-activity/batch` novo — adicionar test coverage.
- Spec MP2 secao 7.2 (Q-F audio_telemetry tabela) **revogada**. Migration 0077 (que estava RESERVADA) agora vira `spotify_tokens` (ADR-190).
- Spec MP2 D11 + Q-F + Q-M consolidadas neste ADR.

## Confianca

Alta. Decisao alinha com:
- Schema `user_activity` ja existe e cobre shape necessario.
- Index existente otimiza cenario quente.
- Lesson #10 (DRY).
- Volume MP2 dentro de range ja otimizado em migration 0064.
- Sem premature optimization (tabela dedicada).

## Referencias

- ADR-189 (Audio queue strategy homogenea — esta telemetria valida a decisao via RF-04.3).
- ADR-190 (Spotify token storage httpOnly cookie — separa preocupacoes de seguranca da telemetria).
- Migration 0064 (perf indexes — `idx_user_activity_user_id`).
- Spec `Docs/specs/sprint-mini-player-2.md` § RF-04 + Q-F + Q-M.
- `shared/schema.ts:246` (tabela `user_activity`).
- Diagrama `Docs/architecture/diagrams/mini-player-2/driver-switch-sleep-timer.mermaid`.
