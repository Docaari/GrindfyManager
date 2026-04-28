-- Sprint B2 (M2): coluna bankroll_management_enabled em user_settings.
-- Default TRUE para nao afetar usuarios existentes. Quando FALSE:
-- summary nao mostra secao "Bancas", reconcile nao eh tentado, snapshots
-- nao gravados. Banca legada (bankroll_amount + bankroll_rule) continua.
-- Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M2)
-- ADR: Docs/architecture/decisions/047-summary-inline-reconcile.md

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS bankroll_management_enabled BOOLEAN NOT NULL DEFAULT TRUE;
