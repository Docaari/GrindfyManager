-- Migration 0064 — Performance indexes (Fase 3 launch escalabilidade)
-- Audit Agent A 2026-05-11. Apply offline pre-launch (idempotente).
-- For post-launch additions, use CREATE INDEX CONCURRENTLY in 0064b (cannot
-- run inside drizzle-kit's transaction wrapper).
-- Sync `shared/schema.ts` index() declarations apos aplicar (drizzle-kit
-- drift detector pode tentar dropar indexes nao declarados em proximo db:push).

-- =========================================================================
-- P0 — hot path, per-user growing, seq scan hoje
-- =========================================================================

-- session_tournaments: declarado em shared/schema.ts:632 mas nunca migrou.
-- Usado por getSessionTournaments(userId, sessionId), listSessionTournaments,
-- /api/grind-sessions/:id/tournaments, /api/session-tournaments.
CREATE INDEX IF NOT EXISTS idx_session_tournaments_session_user
  ON session_tournaments (session_id, user_id);

-- notifications: polled em todo page load via /api/notifications/unread-count.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- notifications unread badge — partial index alinha com query da bell dropdown.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

-- planned_tournaments: Home subqueries (profileDetect/planned) + coach context
-- + grade-planner. storage.getPlannedTournaments(userId, dayOfWeek) filtra
-- (user_id, day_of_week, is_active).
CREATE INDEX IF NOT EXISTS idx_planned_tournaments_user_day
  ON planned_tournaments (user_id, day_of_week, is_active);

-- tournaments header strip "latest upload" timestamp (Home toda load).
-- Partial keeps it tight + alinha com CLAUDE.md §6.1 (dashboard usa NULL).
CREATE INDEX IF NOT EXISTS idx_tournaments_user_created_history
  ON tournaments (user_id, created_at DESC)
  WHERE grind_session_id IS NULL;

-- =========================================================================
-- P1 — per-user growing, run em hot pages
-- =========================================================================

-- session_tournaments por user (ORDER BY created_at DESC, sem sessionId).
CREATE INDEX IF NOT EXISTS idx_session_tournaments_user_created
  ON session_tournaments (user_id, created_at DESC);

-- weekly_plans usado em /grade-planner.
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_week
  ON weekly_plans (user_id, week_start DESC);

-- tournament_library — getTournamentLibrary filtra (user_id, deleted_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_tournament_library_user_active
  ON tournament_library (user_id) WHERE deleted_at IS NULL;

-- upload_history list /api/upload-history.
CREATE INDEX IF NOT EXISTS idx_upload_history_user_created
  ON upload_history (user_id, created_at DESC);

-- user_activity feed (Onda 2). PK eh varchar nanoid; backward PK scan filtrava
-- por user_id — explode em multi-user. Index composto resolve.
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id
  ON user_activity (user_id, id DESC);

-- profile_states (user, day) — getProfileStateForDay + getSessionTournamentsByDay.
CREATE INDEX IF NOT EXISTS idx_profile_states_user_day
  ON profile_states (user_id, day_of_week);

-- =========================================================================
-- P2 — defensivo
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status
  ON user_subscriptions (user_id, status);

-- getRecentSessions ordena por created_at; idx_grind_sessions_user_date eh
-- (user_id, date) e sort no heap pra recentes.
CREATE INDEX IF NOT EXISTS idx_grind_sessions_user_created
  ON grind_sessions (user_id, created_at DESC);

-- =========================================================================
-- ANALYZE — refresh stats pos-criacao
-- =========================================================================
ANALYZE session_tournaments;
ANALYZE notifications;
ANALYZE planned_tournaments;
ANALYZE tournaments;
ANALYZE weekly_plans;
ANALYZE tournament_library;
ANALYZE upload_history;
ANALYZE user_activity;
ANALYZE profile_states;
ANALYZE subscriptions;
ANALYZE user_subscriptions;
ANALYZE grind_sessions;
