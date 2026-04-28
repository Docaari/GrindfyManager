# Data Model — Indice de Tabelas

Schema completo em `shared/schema.ts` (~1300 linhas). Todas as tabelas usam `varchar` PK gerado via `nanoid`. FK na maioria via `userPlatformId` (formato `USER-XXXX`).

Para diagramas Mermaid: `Docs/architecture/data-model.mermaid`, `data-model-studies.mermaid`.

---

## Core (autenticacao, torneios, sessoes)

| Tabela | Descricao | Campos-chave |
|--------|-----------|--------------|
| `users` | Usuarios do sistema | id, userPlatformId (USER-XXXX), email, password, role, status, subscriptionPlan, emailVerified |
| `auth_tokens` | Tokens de verificacao/reset (substituiu Map em memoria) | userId, token, type, expiresAt |
| `sessions` | Sessoes Express (connect-pg-simple) | sid, sess (jsonb), expire |
| `tournaments` | Torneios importados do historico | userId, name, buyIn, prize, position, site, format, category, speed, fieldSize, datePlayed |
| `tournament_templates` | Templates agrupados da biblioteca | userId, name, site, format, category, avgBuyIn, avgRoi, totalPlayed |
| `planned_tournaments` | Torneios planejados na grade | userId, dayOfWeek, profile (A/B/C), site, time, buyIn, type, speed, status |
| `weekly_plans` | Planos semanais | userId, weekStart, targetBuyins, targetProfit, targetVolume |
| `grind_sessions` | Sessoes de grind | userId, date, status (planned/active/completed), profitLoss, duration, metricas mentais |
| `session_tournaments` | Torneios de uma sessao em tempo real | sessionId, site, buyIn, result, position, bounty, prize, status |
| `break_feedbacks` | Feedback durante breaks | sessionId, foco, energia, confianca, inteligenciaEmocional, interferencias |
| `preparation_logs` | Logs de preparacao mental (3 campos pos-sessao orfaos depreciados em Cooldown-3) | sessionId, mentalState, focusLevel, confidenceLevel, exercisesCompleted |
| `cooldown_logs` | Cool-down pos-sessao (1:1 com grind_sessions) — Sprint Cooldown-1 | userId, sessionId (UNIQUE), startedAt, completedAt, mode (full/quick), blocksCompleted (jsonb), abGameAnswers (jsonb), tiltSelfAssessment (jsonb, Sprint 2), sleepIntent (Sprint 2). Indices: `uq_cooldown_user_session`, `idx_cooldown_user_completed`. CASCADE em userId e sessionId. |
| `starred_hands` | Maos criticas estreladas durante cool-down — Sprint Cooldown-1 | userId, sessionId, sessionTournamentId, cooldownLogId (nullable, ON DELETE SET NULL), type (8 valores: tilt/leak/soulread/hero-call/cooler/mistake/sick/other), spot (8 valores: preflop/flop/turn/river/icm/final-table/bubble/other), notes (max 500). Indices: `idx_starred_user_session`, `idx_starred_user_type`. CASCADE em userId, sessionId, sessionTournamentId. |

## Bankroll (multi-wallet)

| Tabela | Descricao |
|--------|-----------|
| `wallets` | Carteiras multi-moeda (USD/BRL/EUR/CNY) com optimistic concurrency |
| `wallet_transactions` | Transacoes (deposit/withdrawal/session_result/manual_adjustment/rakeback) |
| `bankroll_snapshots` | Snapshots multi-wallet com FX freezes |

Detalhes: `Docs/architecture/bankroll-index.md`.

## Coach AI

| Tabela | Descricao |
|--------|-----------|
| `coach_conversations` | Conversas do coach AI |
| `coach_messages` | Mensagens (role, content, tokens, model, latencyMs) |
| `coach_usage` | Tracking de tokens (input/output/cache_*) por conversation |
| `coach_feedback` | Thumbs up/down + comentarios |

Detalhes: `Docs/api/coach.md`, `Docs/api/coach-tools.md`.

## Estudos

| Tabela | Descricao |
|--------|-----------|
| `study_cards` | Cards de estudo com topicos de poker (3bet, ICM, etc.) |
| `study_themes` | Temas (categorizacao) |
| `study_tabs` | Abas dentro de tema (boards, ranges, hand_notes, tags) |
| `study_materials` | Materiais (video, artigo, pdf) |
| `study_notes` | Notas de estudo |
| `study_sessions` | Sessoes de estudo com duracao e scores |
| `study_schedules` | Agendamentos de estudo |

## Calendario

| Tabela | Descricao |
|--------|-----------|
| `calendar_categories` | Categorias customizaveis de eventos |
| `calendar_events` | Eventos com recorrencia |
| `weekly_routines` | Rotinas semanais auto-geradas |
| `active_days` | Dias ativos na grade (por usuario) |
| `profile_states` | Perfil ativo por dia (A, B ou C) |

## Tickets de Satelite

| Tabela | Descricao |
|--------|-----------|
| `satellite_tickets` | Tickets ganhos em satelites |
| `ticket_uses` | Usos de tickets em torneios target |

## Admin / Sistema

| Tabela | Descricao |
|--------|-----------|
| `permissions` | Permissoes do sistema (admin_full, etc.) |
| `user_permissions` | Relacao usuario-permissao com expiracao |
| `subscriptions` | Assinaturas de usuarios |
| `subscription_plans` | Planos disponiveis |
| `user_subscriptions` | Assinaturas ativas |
| `notifications` | Notificacoes do sistema |
| `bug_reports` | Reports de bugs dos usuarios |
| `upload_history` | Historico de uploads CSV/XLSX |
| `access_logs` | Logs de acesso e tentativas negadas |
| `user_activity` | Tracking de atividade (consolidado em 2026-03-20, antes era `user_activities` + `user_activity`) |
| `analytics_daily` | Resumo diario de analytics |
| `engagement_metrics` | Metricas de engajamento |
| `user_settings` | Configuracoes do usuario (moeda, notificacoes, exchange rates, **`bankroll_management_enabled` boolean default true** — Sprint B2/M2) |
| `custom_groups` | Grupos customizados de templates |
| `custom_group_templates` | Relacao grupo-template |
| `coaching_insights` | Insights de coaching |

## Convencoes

- IDs `varchar` via `nanoid()` — nunca auto-increment.
- `userPlatformId` formato `USER-XXXX` (sequencial, separado de `id` interno).
- Validacao Zod via `drizzle-zod` em `shared/schema.ts`.
- Snapshots para auditoria (bankroll); soft-delete raro (preferir hard-delete + tracking).
- ADRs relevantes: 014 (add-on/rea), 017 (snapshot vs derived), 028 (warmup_rituals dedicada), 031-032 (tournament types), 033 (FX rate), 038 (optimistic concurrency wallet), 039 (rakeback as wallet tx), 040 (session-end reconciliation), 041 (cooldown_logs + starred_hands dedicadas), 046 (session_wallet_snapshots), 047 (summary inline reconcile), 048 (wallets eligibility por plataformas jogadas).

---

## Schema Delta — Sprint B2 (`bankroll_management_enabled`)

ADR-047 + ADR-048 adicionam coluna em `user_settings`:

```mermaid
erDiagram
    USERS ||--|| USER_SETTINGS : "1:1"
    USER_SETTINGS {
        varchar user_id PK_FK
        varchar default_currency "default 'USD'"
        boolean notifications_enabled "default true"
        jsonb exchange_rates "FX freezes (ADR-033)"
        boolean bankroll_management_enabled "NEW B2 — default true"
        timestamp created_at
        timestamp updated_at
    }
    USER_SETTINGS ||--o{ WALLETS : "guards-render"
    USER_SETTINGS ||--o{ SESSION_WALLET_SNAPSHOTS : "guards-write<br/>(skip se false)"
```

Migracao SQL (em `migrations/` quando implementer aplicar):

```sql
ALTER TABLE user_settings
  ADD COLUMN bankroll_management_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

Drizzle (em `shared/schema.ts`):

```ts
bankrollManagementEnabled: boolean('bankroll_management_enabled').notNull().default(true),
```

Zod schema (insert/update): `optional + default(true)` — lesson learned #7 (deprecation gradual).

**Comportamento por valor:**
- `true` (default): fluxo multi-wallet completo. Lista de wallets em `/settings`, secao "Bancas" no `SessionSummaryModal`, banner missing platforms (ADR-048), snapshot gravado.
- `false`: lista de wallets escondida em `/settings`, secao "Bancas" e banner missing NAO renderizados, snapshot NAO gravado server-side, telemetry `reconcile_skipped_setting_off`.

Banca legada (`bankroll_amount` + `bankroll_rule` em `user_settings`) **continua visivel** em ambos os modos.

---

## Schema Delta — Sprint F2 (`starred_hands` + spot screenshots)

ADR-051 + ADR-052 + ADR-053 (2026-04-27) estendem `starred_hands` para suportar prints
colados durante o grind live, com expiracao em 14 dias e cron diario de purge.
**Nenhuma tabela nova** — extensao de `starred_hands` com 8 colunas nullable + back-fill
de rows criadas pelo cooldown classico (Sprint Cooldown-1).

```mermaid
erDiagram
    GRIND_SESSIONS ||--o{ STARRED_HANDS : "1:N"
    SESSION_TOURNAMENTS ||--o{ STARRED_HANDS : "1:N"
    USERS ||--o{ STARRED_HANDS : "1:N (CASCADE)"
    COOLDOWN_LOGS ||--o{ STARRED_HANDS : "1:N (SET NULL)"

    STARRED_HANDS {
        varchar id PK
        varchar user_id FK
        varchar session_id FK
        varchar session_tournament_id FK
        varchar cooldown_log_id FK_NULL "ON DELETE SET NULL"
        varchar type "enum 9 valores (era 8 + 'spot_screenshot')"
        varchar spot "enum 9 valores (era 8 + 'screenshot_pending')"
        text notes "max 500"
        timestamp created_at
        text image_url "NEW F2 — relativo /uploads/spot-screenshots/&lt;file&gt;"
        text conclusion "NEW F2 — max 500"
        timestamp reviewed_at "NEW F2 — null = nao revisado"
        boolean review_later "NEW F2 — default false"
        timestamp expires_at "NEW F2 — pastedAt + 14d"
        timestamp pasted_at "NEW F2 — quando print foi colado"
        varchar source "NEW F2 — enum paste|upload|manual; default manual"
        varchar status "NEW F2 — enum pending|reviewed|discarded; default pending"
    }
```

Migration `migrations/0012_spot_screenshots.sql` (DDL preview):

```sql
ALTER TABLE starred_hands
  ADD COLUMN image_url     text,
  ADD COLUMN conclusion    text,
  ADD COLUMN reviewed_at   timestamp,
  ADD COLUMN review_later  boolean DEFAULT false NOT NULL,
  ADD COLUMN expires_at    timestamp,
  ADD COLUMN pasted_at     timestamp,
  ADD COLUMN source        varchar(20) DEFAULT 'manual' NOT NULL,
  ADD COLUMN status        varchar(20) DEFAULT 'pending' NOT NULL;

CREATE INDEX idx_starred_user_status    ON starred_hands (user_id, status);
CREATE INDEX idx_starred_expires        ON starred_hands (expires_at)
  WHERE status = 'pending';
CREATE INDEX idx_starred_session_source ON starred_hands (session_id, source);

-- Back-fill rows criadas pelo cooldown classico (sem print)
-- ja foram explicitamente starradas pelo jogador -> reviewed retroativamente.
UPDATE starred_hands
   SET status   = 'reviewed',
       source   = 'manual',
       pasted_at = created_at
 WHERE pasted_at IS NULL;
```

Drizzle (em `shared/schema.ts`):

```ts
imageUrl:     text('image_url'),
conclusion:   text('conclusion'),
reviewedAt:   timestamp('reviewed_at'),
reviewLater:  boolean('review_later').notNull().default(false),
expiresAt:    timestamp('expires_at'),
pastedAt:     timestamp('pasted_at'),
source:       varchar('source', { length: 20 }).notNull().default('manual'),
status:       varchar('status', { length: 20 }).notNull().default('pending'),
```

Zod schemas (insert/update): `optional + default` nas 8 colunas — lessons learned #7
(deprecation gradual). Enums novos:
- `STARRED_HAND_TYPES` += `'spot_screenshot'` (era 8 valores; agora 9).
- `STARRED_HAND_SPOTS` += `'screenshot_pending'`.
- `STARRED_HAND_SOURCES = ['paste', 'upload', 'manual'] as const` (novo).
- `STARRED_HAND_STATUSES = ['pending', 'reviewed', 'discarded'] as const` (novo).

**Lifecycle de uma row F2:**
- **paste** -> `status='pending'`, `source='paste'`, `pastedAt=NOW()`, `expiresAt=+14d`.
- **review (cooldown drag ou /studies)** -> `status='reviewed'`, `reviewedAt=NOW()`,
  `conclusion=...`, `type` e `spot` reclassificados.
- **review later** -> `reviewLater=true` (sem set `reviewedAt`); cron preserva.
- **discarded (DELETE soft)** -> `status='discarded'`, `reviewLater=false`. Cron purga.
- **expired (sem reviewLater + sem reviewedAt + > 14d)** -> cron purga (row + arquivo).

**ADRs relevantes:** 041 (cooldown_logs + starred_hands dedicadas, base), 051 (storage
local; S3 deferido para F3), 052 (ownership middleware em GET /image), 053 (node-cron
diario para purge). Detalhes completos em
[`cooldown-index.md`](cooldown-index.md#f2--spot-screenshots-sprint-f2-branch-featurespot-screenshots).
