-- Migration 0075 — notifications.deep_link
-- Sprint D — Grind Live + Tickets cluster — fix wave pos-reviewer CRITICAL-1
-- ADR-184 §2.3 + §2.4 — dedupe via `deep_link LIKE '%ticket_id=' || $2 || '&%'`
--
-- Sem coluna `deep_link`, a query de dedupe de notifs de ticket (`hasRecentTicketNotif`)
-- nao tinha onde casar `ticket_id=...`. O ADR-184 preve `deep_link` no shape do payload
-- mas a tabela `notifications` foi criada em migrations anteriores sem essa coluna.
-- Esta migracao corrige a divergencia ADR-vs-schema sem tocar em rows existentes.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS deep_link varchar;

-- Index parcial p/ dedupe rapido por (user_id, type, deep_link) — janela 7d
-- adicionada via created_at na clausula WHERE da query. Composta cobre a maioria
-- das consultas do `hasRecentTicketNotif` (varios tickets por user).
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_deep_link
  ON notifications(user_id, type, deep_link)
  WHERE deep_link IS NOT NULL;
