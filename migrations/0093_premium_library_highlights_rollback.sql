-- Rollback 0093 — Biblioteca Premium curada (ADR-240).
--
-- Reverte a tabela premium_library_highlights e o seed da permissao.
-- ATENCAO: remover a permissao premium_library_curate tambem deleta (via FK
-- ON DELETE CASCADE de user_permissions.permission_id -> permissions.id) as
-- concessoes feitas as contas curadoras. Isso e intencional no rollback total.

DROP INDEX IF EXISTS idx_premium_highlight_created;
DROP INDEX IF EXISTS idx_premium_highlight_site;
DROP INDEX IF EXISTS uq_premium_highlight_family;
DROP TABLE IF EXISTS premium_library_highlights;

-- Remove a permissao seedada (CASCADE limpa user_permissions associadas).
DELETE FROM permissions WHERE name = 'premium_library_curate';
