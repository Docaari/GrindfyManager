-- ============================================================================
-- Sprint Cooldown-2 — Sleep Gate + Plan Closed
--
-- Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4 + RF-03 Sprint 2)
-- ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
--
-- Delta sobre 0009 (cooldown_foundation):
--   grind_sessions.plan_closed     boolean default false   (NOVO)
--   users.dashboard_snoozed_until  timestamp nullable      (NOVO)
--
-- Defensiva: 0009 ja cria cooldown_logs com tilt_self_assessment + sleep_intent
-- (ver 0009_cooldown_foundation.sql linhas 22-23). Mas se algum ambiente foi
-- atualizado via `db:push` (Sprint 1 dev) e a migration 0009 nao foi rodada
-- formalmente, os ADD COLUMN IF NOT EXISTS abaixo garantem idempotencia.
--
-- Reviewer fix HIGH #1: expandido para incluir tilt_self_assessment +
-- sleep_intent defensivamente; SAFE pois IF NOT EXISTS torna no-op em DBs
-- ja sincronizados.
-- ============================================================================

ALTER TABLE "grind_sessions"
  ADD COLUMN IF NOT EXISTS "plan_closed" boolean DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "dashboard_snoozed_until" timestamp;

-- Defensive (apenas no-op se 0009 ja rodou):
ALTER TABLE "cooldown_logs"
  ADD COLUMN IF NOT EXISTS "tilt_self_assessment" jsonb;

ALTER TABLE "cooldown_logs"
  ADD COLUMN IF NOT EXISTS "sleep_intent" boolean;

-- ============================================================================
-- DOWN (manual rollback — NAO automatico):
--
--   ALTER TABLE "users"          DROP COLUMN IF EXISTS "dashboard_snoozed_until";
--   ALTER TABLE "grind_sessions" DROP COLUMN IF EXISTS "plan_closed";
--   ALTER TABLE "cooldown_logs"  DROP COLUMN IF EXISTS "sleep_intent";
--   ALTER TABLE "cooldown_logs"  DROP COLUMN IF EXISTS "tilt_self_assessment";
--
-- Atencao: drop de tilt_self_assessment/sleep_intent so faz sentido se 0009
-- tambem for revertida (o owner real eh 0009).
-- ============================================================================
