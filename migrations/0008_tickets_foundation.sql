-- Sprint Tickets-1 (Foundation) — 2026-04-26
-- Spec: docs/specs/satellite-tickets-management.md (RF-01)
-- Data model: docs/architecture/data-model/tickets.md
-- ADR-036, ADR-037
--
-- Idempotente: usa IF NOT EXISTS em todas as criacoes.
-- ATENCAO: a sequencia FK -> tickets.id em session_tournaments/tournaments
-- so e adicionada APOS a tabela tickets ser criada.

-- ============================================================================
-- 1. Tabela tickets
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tickets" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "source_tournament_id" varchar REFERENCES "tournaments"("id") ON DELETE SET NULL,
  "source_session_tournament_id" varchar REFERENCES "session_tournaments"("id") ON DELETE SET NULL,
  "target_template_id" varchar REFERENCES "tournament_templates"("id") ON DELETE SET NULL,
  "target_name" varchar,
  "target_site" varchar,
  "ticket_value_usd" decimal NOT NULL,
  "extra_cash_usd" decimal,
  "status" varchar NOT NULL DEFAULT 'available',
  "used_in_tournament_id" varchar REFERENCES "tournaments"("id") ON DELETE SET NULL,
  "used_in_session_tournament_id" varchar REFERENCES "session_tournaments"("id") ON DELETE SET NULL,
  "earned_at" timestamp NOT NULL DEFAULT NOW(),
  "expires_at" timestamp,
  "used_at" timestamp,
  "cancelled_at" timestamp,
  "transferred_at" timestamp,
  "transferred_to_user_id" varchar,
  "notified_expiring_at" timestamp,
  "note" text,
  "source" varchar NOT NULL DEFAULT 'manual',
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  -- Z2: XOR usedInTournamentId vs usedInSessionTournamentId quando status='used'
  CONSTRAINT "tickets_used_xor_check" CHECK (
    status <> 'used' OR (
      ((used_in_tournament_id IS NOT NULL)::int + (used_in_session_tournament_id IS NOT NULL)::int) = 1
      AND used_at IS NOT NULL
    )
  ),
  -- Z3: cancelled exige cancelledAt
  CONSTRAINT "tickets_cancelled_check" CHECK (
    status <> 'cancelled' OR cancelled_at IS NOT NULL
  ),
  -- Z4: ticketValueUSD > 0
  CONSTRAINT "tickets_value_positive_check" CHECK (ticket_value_usd > 0),
  -- extraCashUSD nao-negativo
  CONSTRAINT "tickets_extracash_nonneg_check" CHECK (extra_cash_usd IS NULL OR extra_cash_usd >= 0),
  -- Z5: expiresAt > earnedAt
  CONSTRAINT "tickets_expires_logical_check" CHECK (expires_at IS NULL OR expires_at > earned_at),
  -- Z1: pelo menos um target
  CONSTRAINT "tickets_target_check" CHECK (
    target_template_id IS NOT NULL OR target_name IS NOT NULL
  )
);

-- ============================================================================
-- 2. Indexes em tickets
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_tickets_user_status"
  ON "tickets" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "idx_tickets_user_target_template"
  ON "tickets" ("user_id", "target_template_id");

-- Indice funcional case-insensitive para match medio (RF-05)
CREATE INDEX IF NOT EXISTS "idx_tickets_user_target_name"
  ON "tickets" ("user_id", LOWER("target_name"), LOWER("target_site"));

-- Indice parcial para cron de expiracao (RF-09 Sprint 2)
CREATE INDEX IF NOT EXISTS "idx_tickets_user_expires"
  ON "tickets" ("user_id", "expires_at")
  WHERE status = 'available';

-- Audit reverso
CREATE INDEX IF NOT EXISTS "idx_tickets_source_tournament"
  ON "tickets" ("source_tournament_id")
  WHERE source_tournament_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_tickets_used_in_tournament"
  ON "tickets" ("used_in_tournament_id")
  WHERE used_in_tournament_id IS NOT NULL;

-- 1 satelite = 1 ticket por player (defaults aprovados pelo dev)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tickets_unique_source"
  ON "tickets" ("source_tournament_id")
  WHERE source_tournament_id IS NOT NULL AND source = 'satellite_result';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tickets_unique_source_session"
  ON "tickets" ("source_session_tournament_id")
  WHERE source_session_tournament_id IS NOT NULL AND source = 'satellite_result';

-- ============================================================================
-- 3. ALTER session_tournaments
-- ============================================================================

ALTER TABLE "session_tournaments"
  ADD COLUMN IF NOT EXISTS "entered_via_satellite" boolean NOT NULL DEFAULT false;

ALTER TABLE "session_tournaments"
  ADD COLUMN IF NOT EXISTS "consumed_ticket_id" varchar;

-- FK separada (DROP TABLE-safe). PostgreSQL nao tem ADD CONSTRAINT IF NOT EXISTS,
-- por isso usamos DO block para idempotencia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_tournaments_consumed_ticket_id_fkey'
  ) THEN
    ALTER TABLE "session_tournaments"
      ADD CONSTRAINT "session_tournaments_consumed_ticket_id_fkey"
      FOREIGN KEY ("consumed_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_session_tournaments_consumed_ticket"
  ON "session_tournaments" ("consumed_ticket_id")
  WHERE consumed_ticket_id IS NOT NULL;

-- ============================================================================
-- 4. ALTER tournaments
-- ============================================================================

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "consumed_ticket_id" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_consumed_ticket_id_fkey'
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "tournaments_consumed_ticket_id_fkey"
      FOREIGN KEY ("consumed_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_tournaments_consumed_ticket"
  ON "tournaments" ("consumed_ticket_id")
  WHERE consumed_ticket_id IS NOT NULL;
