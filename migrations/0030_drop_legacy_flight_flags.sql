-- ============================================================================
-- Sprint Flight-1 — DROP COLUMN flags legados ADR-031
--
-- Spec: Docs/specs/sprint-flight-1.md (RF-17b)
-- ADR: 090 (Tournament Series single source of truth)
--
-- ============================================================================
-- ATENCAO: MIGRATION MANUAL — NAO ROTAR AUTOMATICAMENTE NO DEPLOY
-- ============================================================================
--
-- Esta migration eh IRREVERSIVEL (DROP COLUMN nao tem rollback simples no
-- Postgres — re-criar coluna e popular dados historicamente eh custoso).
--
-- Pre-requisitos OBRIGATORIOS antes de rodar:
--   1. Migration 0029_add_tournament_series.sql aplicada com sucesso em prod.
--   2. Janela minima de 7 dias de uso normal sem incidentes.
--   3. Founder validou amostra de 5-10 series migradas via /flight (RF-10).
--   4. Wizard manual refatorado (RF-17a) deployado e em uso.
--   5. grep no codebase confirmando ZERO referencias a:
--        - tournaments.is_flight, tournaments.flight_day,
--          tournaments.flight_parent_id, tournaments.flight_advanced
--        - planned_tournaments.is_flight, planned_tournaments.flight_day,
--          planned_tournaments.flight_parent_id
--      em arquivos .ts/.tsx fora de comentarios DEPRECATED.
--   6. Endpoints /api/analytics/by-modifier (e similares) migrados para
--      filtrar por series_id IS NOT NULL.
--
-- Como rodar:
--   $ psql "$DATABASE_URL" -f migrations/0030_drop_legacy_flight_flags.sql
--
-- Rollback de emergencia (se descobrir uso residual pos-drop):
--   1. Re-adicionar colunas via ALTER TABLE ADD COLUMN (rapido).
--   2. Popular via UPDATE FROM tournament_series (custoso, requer mapping).
--   Por isso: validacao previa eh CRITICA.
-- ============================================================================

BEGIN;

-- 1. Drop indices parciais ADR-031 (nao usados mais)
DROP INDEX IF EXISTS "idx_tournaments_user_flight_parent";
DROP INDEX IF EXISTS "idx_tournaments_user_is_flight";

-- 2. Drop colunas em tournaments
ALTER TABLE "tournaments"
  DROP COLUMN IF EXISTS "is_flight",
  DROP COLUMN IF EXISTS "flight_day",
  DROP COLUMN IF EXISTS "flight_parent_id",
  DROP COLUMN IF EXISTS "flight_advanced";

-- 3. Drop colunas em planned_tournaments
ALTER TABLE "planned_tournaments"
  DROP COLUMN IF EXISTS "is_flight",
  DROP COLUMN IF EXISTS "flight_day",
  DROP COLUMN IF EXISTS "flight_parent_id";

COMMIT;

-- ============================================================================
-- POS-DROP: atualizacoes obrigatorias no codigo
-- ============================================================================
--   1. Atualizar shared/schema.ts removendo as colunas dos table objects.
--   2. Atualizar Docs/architecture/data-model.mermaid removendo campos
--      DEPRECATED + invariantes ADR-031 obsoletos.
--   3. npm run check (typecheck) deve passar sem erros.
--   4. npx vitest deve manter cobertura sem regressoes.
--
-- Single source of truth = tournament_series.
-- ============================================================================
