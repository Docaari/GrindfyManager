-- Hotfix 2026-04-26: ADR-014 (Add-on/Reentry) declarado em shared/schema.ts em
-- 4 tabelas, mas a migration 0005 so cobriu planned_tournaments. As 3 outras
-- (tournaments, session_tournaments, tournament_library) crasham qualquer
-- SELECT com "coluna allows_addon nao existe", quebrando:
--   - GET /api/session-tournaments (live session)
--   - GET /api/tournaments (history)
--   - getTournamentLibraryEntries (selector + library)
-- Idempotente (IF NOT EXISTS).

-- =============================================================================
-- tournaments (history table)
-- =============================================================================
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "allows_addon" boolean DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "addon_cost" decimal;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "addon_taken" boolean DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "allows_reentry" boolean DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "max_reentries" integer;

-- =============================================================================
-- session_tournaments (live session)
-- =============================================================================
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "allows_addon" boolean DEFAULT false;
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "addon_cost" decimal;
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "addon_taken" boolean DEFAULT false;
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "allows_reentry" boolean DEFAULT false;
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "max_reentries" integer;
ALTER TABLE "session_tournaments" ADD COLUMN IF NOT EXISTS "reentries" integer DEFAULT 0;

-- =============================================================================
-- tournament_library (library entries)
-- =============================================================================
ALTER TABLE "tournament_library" ADD COLUMN IF NOT EXISTS "allows_addon" boolean DEFAULT false;
ALTER TABLE "tournament_library" ADD COLUMN IF NOT EXISTS "addon_cost" decimal;
ALTER TABLE "tournament_library" ADD COLUMN IF NOT EXISTS "allows_reentry" boolean DEFAULT false;
ALTER TABLE "tournament_library" ADD COLUMN IF NOT EXISTS "max_reentries" integer;
