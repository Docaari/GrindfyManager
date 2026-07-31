-- Rollback da Migration 0099 (ADR-243).
-- Volta a FK para users(id). ATENCAO: com a FK antiga nenhum insert de historico
-- funciona (o codigo grava userPlatformId) — este rollback so existe por
-- simetria; a limpeza de orfas feita na ida NAO e revertida.

ALTER TABLE upload_history
  DROP CONSTRAINT IF EXISTS upload_history_user_id_users_user_platform_id_fk;

ALTER TABLE upload_history
  ADD CONSTRAINT upload_history_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
