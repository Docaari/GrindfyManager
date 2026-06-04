-- =============================================================================
-- Rollback de 0095 — remove os indices aditivos da dedup canonica (ADR-200).
-- Idempotente (IF EXISTS). Nao remove o idx_tournament_library_user_active
-- (preexistente, fora do escopo desta migration).
-- =============================================================================

DROP INDEX IF EXISTS idx_planned_tournaments_library_template;
DROP INDEX IF EXISTS idx_tournament_library_user_site;
