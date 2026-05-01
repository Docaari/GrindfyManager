-- Sprint Bankroll-Reports-Detail RF-04 (ADR-069 + D13)
-- Adiciona 'manual-report' ao CHECK constraint de bankroll_snapshots.origin.
-- Idempotente: so altera se constraint existir, recria com nova lista.
--
-- Ordem nova: 'manual', 'auto-cooldown', 'transfer', 'import', 'migration_v1', 'manual-report'.
-- Pre-requisito: 0018_auto_snapshot_meta.sql (constraint existente).

DO $$
BEGIN
  -- Drop CHECK existente se houver (nome convencional)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bankroll_snapshots_origin_check'
  ) THEN
    ALTER TABLE bankroll_snapshots DROP CONSTRAINT bankroll_snapshots_origin_check;
  END IF;

  -- Recria com 'manual-report' incluido
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bankroll_snapshots' AND column_name = 'origin'
  ) THEN
    ALTER TABLE bankroll_snapshots
      ADD CONSTRAINT bankroll_snapshots_origin_check
      CHECK (origin IN ('manual', 'auto-cooldown', 'transfer', 'import', 'migration_v1', 'manual-report'));
  ELSE
    RAISE NOTICE 'bankroll_snapshots.origin nao existe ainda; pulando.';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
