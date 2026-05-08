# ADR-126 — Criar `study_sessions_v2` como tabela nova (nao estender legado)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: estudos-habito-1
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-habito-1.md`, ADR-067 (studies reform), ADR-117 (study_sessions.theme_id Opcao C), ADR-068 (cross-feature recommendations)
- Diagramas: `Docs/architecture/data-model-estudos-habito-1.mermaid`, `feature-flow-log-estudo.mermaid`

---

## 1. Contexto

A spec Estudos-Habito-1 (RF-1) precisa persistir 4 modos primarios + escape hatch (`drill_gto`, `tournament_review`, `hand_review`, `lesson`, `other`) com estado de cronometro live (`running` / `completed`), 3 sources distintos (`manual_post_hoc`, `manual_live`, `auto_lesson`, `auto_grind_finalize`), idempotency cross-source (auto_lesson 24h window) e auditoria (soft delete 24h gate, audit trail).

A tabela `study_sessions` existente (`shared/schema.ts:870`) foi criada na era "Replit/study cards" e ja recebeu uma extensao em home-reform-4 Item 7 (ADR-117 — coluna `theme_id` nullable SET NULL). O schema atual:

```ts
export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(...),
  studyCardId: varchar("study_card_id"),                     // legado (study_cards)
  themeId: varchar("theme_id", { length: 21 }),              // Item 7
  date: timestamp("date").notNull(),                         // sem TZ awareness
  duration: integer("duration").notNull(),                   // minutos
  activities: jsonb("activities").$type<string[]>().default([]),
  focusScore: integer("focus_score"),                        // 0-10 — feature antiga
  productivityScore: integer("productivity_score"),          // 0-10 — feature antiga
  insights: text("insights"),                                // legado
  createdAt: timestamp("created_at").defaultNow(),
});
```

A spec exige 23 colunas novas (`mode`, `source`, `status`, `lesson_id`, `tournament_id`, `starred_hand_ids`, `drill_platform`, `drill_accuracy`, `difficult_spots`, `started_at`, `ended_at`, `registered_at`, `idle_periods`, `notes`, `attachments`, `was_productive`, `daily_goal_met`, `xp_awarded`, `deleted_at`, `updated_at` + 5 indices novos + 6 CHECK constraints discriminator-based). Estender significaria: (a) carregar 4 colunas mortas (`study_card_id`, `activities`, `focus_score`, `productivity_score`, `insights`) eternamente; (b) re-escrever a coluna `date` (sem TZ awareness — incompativel com auto-pause smart e regra "anchora em started_at"); (c) re-mapear `duration` integer para `duration_minutes` integer com semantica nova; (d) atualizar a query de Sprint home-reform-4 Item 7 (ADR-117) que ja consome `theme_id` para `studyMinutesMonth` no `FocusStatsCard`.

ADR-117 ja documenta a coluna `theme_id` como "preparada para foco-do-mes accountability" e foi aplicada via migration 0044. Essa coluna **continua relevante** para o FocusStatsCard mesmo apos Sprint Estudos-Habito-1 — a query `studyMinutesMonth` precisa funcionar enquanto `study_sessions_v2` ainda nao existe (back-fill nao previsto, spec §Notas-de-Implementacao).

---

## 2. Decisao

**Criar tabela nova `study_sessions_v2` com schema completo da spec RF-1. Manter `study_sessions` (legado) read-only — sem novos inserts, sem back-fill cross-table, sem alteracoes de schema.**

A coluna `study_sessions.theme_id` (ADR-117) **continua alimentando** o `FocusStatsCard` durante e apos o sprint. O `FocusStatsCard.studyMinutesMonth` query passa a fazer **UNION ALL** dos dois lados:

```sql
SELECT
  COALESCE(SUM(duration), 0) AS legacy_minutes,
  (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions_v2
   WHERE user_id = $1 AND theme_id = $2 AND status = 'completed'
     AND deleted_at IS NULL
     AND date_trunc('month', started_at) = date_trunc('month', now()))
   AS v2_minutes
FROM study_sessions
WHERE user_id = $1 AND theme_id = $2
  AND date_trunc('month', date) = date_trunc('month', now());
```

(Resolvido via composer no storage layer; nao migration). O storage `getStudyMinutesByThemeAndMonth` agrega ambas as fontes ate que a deprecation de `study_sessions` seja decidida (Sprint futuro).

### 2.1 Estrutura final da tabela nova

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `varchar(21)` | PK NOT NULL | nanoid |
| `user_id` | `varchar(21)` | NOT NULL FK `users.user_platform_id` ON DELETE CASCADE | |
| `mode` | `varchar(32)` | NOT NULL CHECK enum 5 valores | |
| `source` | `varchar(32)` | NOT NULL CHECK enum 4 valores | |
| `status` | `varchar(16)` | NOT NULL DEFAULT `'completed'` CHECK ∈ `('running','completed')` | |
| `theme_id` | `varchar(21)` | FK `study_themes.id` ON DELETE SET NULL nullable | |
| `tournament_id` | `varchar` | FK `tournaments.id` ON DELETE SET NULL nullable | |
| `lesson_id` | `varchar` | FK `library_lessons.id` ON DELETE SET NULL nullable | |
| `starred_hand_ids` | `jsonb` | nullable | array de varchar |
| `drill_platform` | `varchar(32)` | nullable | enum livre: `gto_wizard`/`pio`/`monker`/`other` |
| `drill_accuracy` | `integer` | CHECK 0-100 nullable | |
| `difficult_spots` | `jsonb` | nullable | array max 5 |
| `duration_minutes` | `integer` | NOT NULL CHECK >=1 AND <=1440 | |
| `started_at` | `timestamptz` | nullable | apenas em manual_live (anchor de "today") |
| `ended_at` | `timestamptz` | nullable | apenas em manual_live |
| `registered_at` | `timestamptz` | NOT NULL DEFAULT now() | quando o LOG aconteceu (anchor do streak) |
| `idle_periods` | `jsonb` | nullable | auto-pause smart |
| `notes` | `text` | CHECK length<=500 | |
| `attachments` | `jsonb` | nullable | max 5 itens `{key,url}` |
| `was_productive` | `boolean` | nullable | apenas live |
| `daily_goal_met` | `boolean` | NOT NULL DEFAULT false | calculado pelo handler RF-2 |
| `xp_awarded` | `integer` | NOT NULL DEFAULT 0 | reservado |
| `deleted_at` | `timestamptz` | nullable | soft delete 24h gate |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | trigger `set_updated_at` |

### 2.2 CHECK constraints discriminator-based

Validacao mode-based em DB-level + Zod (defesa em profundidade):

```sql
-- mode='drill_gto' exige theme
CHECK (mode <> 'drill_gto' OR theme_id IS NOT NULL);
-- mode='lesson' exige lesson_id
CHECK (mode <> 'lesson' OR lesson_id IS NOT NULL);
-- mode='hand_review' exige starred_hand_ids nao vazio
CHECK (mode <> 'hand_review' OR (
  starred_hand_ids IS NOT NULL
  AND jsonb_typeof(starred_hand_ids) = 'array'
  AND jsonb_array_length(starred_hand_ids) >= 1
));
-- mode='other' exige theme
CHECK (mode <> 'other' OR theme_id IS NOT NULL);
-- status='running' exige started_at populado e ended_at nulo
CHECK (status <> 'running' OR (started_at IS NOT NULL AND ended_at IS NULL));
-- status='completed' exige duration_minutes populado (ja eh NOT NULL global, mas ok)
CHECK (status <> 'completed' OR duration_minutes IS NOT NULL);
```

### 2.3 Indices

```sql
-- list por user (default ordenado por started_at desc)
CREATE INDEX idx_ssv2_user_started     ON study_sessions_v2(user_id, started_at DESC NULLS LAST);
-- filtro por modo
CREATE INDEX idx_ssv2_user_mode_started ON study_sessions_v2(user_id, mode, started_at DESC);
-- ordering por log time (uso pelo FAB "ultima session 7d")
CREATE INDEX idx_ssv2_user_registered  ON study_sessions_v2(user_id, registered_at DESC);
-- auto_lesson idempotency lookup
CREATE INDEX idx_ssv2_user_lesson_partial
  ON study_sessions_v2(user_id, lesson_id, registered_at DESC)
  WHERE lesson_id IS NOT NULL;
-- check session ativa (max 1 running por user) — parcial fast path
CREATE UNIQUE INDEX uq_ssv2_user_running
  ON study_sessions_v2(user_id) WHERE status = 'running';
-- aggregate por tema + mes (FocusStatsCard v2)
CREATE INDEX idx_ssv2_user_theme_month
  ON study_sessions_v2(user_id, theme_id, started_at)
  WHERE theme_id IS NOT NULL AND status = 'completed' AND deleted_at IS NULL;
```

O **UNIQUE parcial** `uq_ssv2_user_running` enforce DB-level a regra "max 1 cronometro live por user em qualquer momento" (RF-1.4) — race condition em 2 tabs vira PG 23505 ⇒ 409 SESSION_ALREADY_RUNNING. Sem isso, o handler precisaria usar advisory lock ou SELECT FOR UPDATE no users + SELECT da tabela; o partial index resolve em uma operacao atomica.

### 2.4 Migration sequence

| Migration | Conteudo | Ordem |
|---|---|---|
| `0052_study_sessions_v2.sql` | CREATE TABLE + CHECK constraints + 6 indices + trigger `set_updated_at` | 1 |
| `0053_user_focus_stats_nullable_theme.sql` | ALTER TABLE `user_focus_stats` ALTER COLUMN `study_theme_id` DROP NOT NULL | 2 |
| `0054_users_habit_columns.sql` | ALTER TABLE `users` ADD `daily_study_goal_minutes`, `study_streak_freezes_used_this_month`, `last_freeze_reset_month` | 3 |

Migrations sao **independentes** (sem ordem entre 0053 e 0054). 0052 deve preceder ambas porque criar tabela base.

---

## 3. Opcoes Consideradas

### Opcao A: Estender `study_sessions` legado com 23 colunas + reaproveitar `theme_id`

- **Pros:** uma tabela so; `theme_id` ja existente reaproveitado; FocusStatsCard sem composer (continua single-source).
- **Cons:** carrega 4 colunas mortas (`study_card_id`, `activities`, `focus_score`, `productivity_score`, `insights`); precisa renomear `date` → `started_at` (rename column em prod = bloqueante curto, ok mas adiciona coordenacao); precisa renomear `duration` → `duration_minutes` (semantica era "duracao geral", agora "minutos cronometrados") com risco de quebra em qualquer query legada; ADR-117 ja referencia `theme_id` da tabela legada — divisao de propriedade entre sprints (Item 7 dono do `theme_id` legado, Estudos-Habito-1 dono dos 23 novos campos) gera ambiguidade de ownership.

### Opcao B: Criar `study_sessions_v2` nova + back-fill agora dos rows legados

- **Pros:** schema limpo; FocusStatsCard single-source apos back-fill; deprecation imediata.
- **Cons:** rows legados nao tem `mode`/`source`/`status`/`registered_at` — precisaria assumir `mode='other'`+`source='manual_post_hoc'`+`status='completed'` para todos, perdendo signal historico; back-fill de ~? rows (founder N=1 + beta) eh barato, mas estabelece precedente ruim (rows historicos com defaults arbitrarios poluem analytics); CHECK constraint `mode='other' → theme_id NOT NULL` quebra back-fill de rows com `theme_id=NULL` (a maioria do legado).

### Opcao C (escolhida): Tabela nova + legado read-only + composer no FocusStatsCard

- **Pros:** schema novo limpo, sem colunas mortas; analytics novas rodam apenas em `study_sessions_v2` (sem ruido); ADR-117 continua valido como source paralela ate decisao formal de deprecation; sem back-fill (sem assumir defaults arbitrarios); zero risco de regressao em queries legadas.
- **Cons:** FocusStatsCard precisa fazer UNION ALL para mes corrente (custo: 2 queries em vez de 1 — irrelevante com indices certos); 2 tabelas com proposito sobreposto durante deprecation gradual; query de "quantos minutos no tema X" requer composer ate cleanup futuro.

---

## 4. Consequencias

**Positivas:**
- Schema novo limpo, sem legacy debt.
- Analytics novas (drill_gto accuracy avg, mode distribution, etc.) rodam apenas em `study_sessions_v2` — sem filtros `WHERE source IS NOT NULL`.
- Migration baixo risco (CREATE TABLE + ALTER 2 colunas, sem rename/drop).
- Sprint Estudos-Habito-2 (auto_lesson trigger Mux) pode fazer INSERT direto em `study_sessions_v2` com idempotency lookup pelo indice parcial `idx_ssv2_user_lesson_partial`.

**Negativas:**
- 2 tabelas com responsabilidade sobreposta de "minutos estudados" durante a janela de deprecation. Composer no FocusStatsCard adiciona complexidade.
- Rows legados nunca migrados — reports historicos pre-Sprint nao recebem analytics novas (mode distribution, etc.).
- Decisao de cleanup `study_sessions` legado fica pendente (futuro Sprint Estudos-Cleanup-1).

**Neutras:**
- Storage cresce ~2x (registros novos vao apenas em v2; legados continuam em legacy). Total absoluto < 1MB para founder N=1.
- Drizzle types ganham `studySessionsV2` separado de `studySessions`. Ambos exportados de `shared/schema.ts`.

---

## 5. Confianca

**Alta.** Padrao "v2 + legacy read-only" ja foi usado em outros sprints (Coach-2A reescreveu coach_messages structure sem migrar legacy threads; Studies-Reform manteve `study_cards` read-only sem deprecar). Schema novo respeita lessons learned (#7 deprecation gradual via Zod optional+default em campos novos; #6 conversao explicita; #14 CHECK constraints DB-level alem de Zod). Composer FocusStatsCard tem custo conhecido (2 queries; cache 30s ja existente).

---

## 6. Anexos

- Diagrama ER: `Docs/architecture/data-model-estudos-habito-1.mermaid`
- Sequence POST /api/study-sessions: `Docs/architecture/feature-flow-log-estudo.mermaid`
- Spec: `Docs/specs/estudos-habito-1.md` §RF-1, §6 Modelos de Dados
