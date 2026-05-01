-- =============================================================================
-- Sprint F2 — Spot Screenshots durante Grind + Cooldown
-- Spec: Docs/specs/sprint-f2-spot-screenshots.md
-- ADR : Docs/architecture/decisions/051-spot-screenshots-storage.md
--
-- Estende `starred_hands` com colunas para print colado/upload, ciclo de
-- revisao e auto-purge. Todos campos novos sao nullable (exceto review_later,
-- source, status — ja com default) para back-compat com Sprint Cooldown-1.
-- =============================================================================

ALTER TABLE starred_hands
  ADD COLUMN IF NOT EXISTS image_url     text,
  ADD COLUMN IF NOT EXISTS conclusion    text,
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamp,
  ADD COLUMN IF NOT EXISTS review_later  boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS expires_at    timestamp,
  ADD COLUMN IF NOT EXISTS pasted_at     timestamp,
  ADD COLUMN IF NOT EXISTS source        varchar(20) DEFAULT 'manual' NOT NULL,
  ADD COLUMN IF NOT EXISTS status        varchar(20) DEFAULT 'pending' NOT NULL;

-- Indices novos (lesson #7: idempotencia via IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_starred_user_status
  ON starred_hands (user_id, status);
CREATE INDEX IF NOT EXISTS idx_starred_expires
  ON starred_hands (expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_starred_session_source
  ON starred_hands (session_id, source);

-- =============================================================================
-- Back-fill: rows criadas pelo cooldown classico (Sprint Cooldown-1) sem print
-- sao consideradas 'reviewed' retroativamente — foram explicitamente
-- starradas pelo jogador via formulario (notes, type, spot ja preenchidos).
-- Isso garante que `pending` cobre apenas prints novos da Sprint F2.
-- =============================================================================
UPDATE starred_hands
   SET status     = 'reviewed',
       source     = 'manual',
       pasted_at  = COALESCE(pasted_at, created_at)
 WHERE image_url IS NULL
   AND status = 'pending';
