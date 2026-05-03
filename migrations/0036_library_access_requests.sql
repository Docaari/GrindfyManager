-- =============================================================================
-- Sprint UX-Biblioteca-1 / RF-02 + ADR-103
-- Tabela library_access_requests + enum library_access_request_status.
--
-- Idempotencia via UNIQUE INDEX parcial WHERE status = 'pending'.
-- Race condition: 23505 unique violation eh capturado pelo handler e
-- convertido em 409 request_already_pending.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE library_access_request_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS library_access_requests (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  subscription_plan_snapshot varchar(50) NOT NULL,
  reason text NOT NULL,
  status library_access_request_status NOT NULL DEFAULT 'pending',
  reviewed_by varchar REFERENCES users(user_platform_id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

-- UNIQUE INDEX parcial garante idempotencia: 1 pending por user. Re-pedido
-- apos approved/denied permitido (status final nao bate o partial WHERE).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_library_access_requests_user_pending
  ON library_access_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_library_access_requests_user_status
  ON library_access_requests (user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_library_access_requests_status_created
  ON library_access_requests (status, created_at);

-- ADR-103 §2.4: trigger auto-bump updated_at em UPDATE (audit trail).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_library_access_requests_updated_at ON library_access_requests;
CREATE TRIGGER trg_library_access_requests_updated_at
  BEFORE UPDATE ON library_access_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rollback (manual, se necessario):
-- DROP TRIGGER IF EXISTS trg_library_access_requests_updated_at ON library_access_requests;
-- DROP TABLE IF EXISTS library_access_requests;
-- DROP TYPE IF EXISTS library_access_request_status;
