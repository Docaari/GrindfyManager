-- Migration 0099 — Sprint import-otimizacao (ADR-243). CORRECAO DE FK.
--
-- BUG: `upload_history.user_id` guarda o userPlatformId (`USER-XXXX`) — e assim
-- que TODO o codigo grava (routes/upload.ts, storage.createUploadHistory) e e
-- como `tournaments` faz:
--     tournaments_user_id_users_user_platform_id_fk
--       FOREIGN KEY (user_id) REFERENCES users(user_platform_id) ON DELETE CASCADE
-- Mas a constraint de upload_history aponta para a PK nanoid:
--     upload_history_user_id_users_id_fk
--       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
--
-- Consequencia: TODO insert de historico de upload viola a FK (23503). Como os
-- callers isolam a escrita do historico em try/catch ("metadata nao bloqueia o
-- upload"), a falha era silenciosa — a tabela ficou com 0 linhas e o painel de
-- historico do jogador nunca teve o que mostrar. Detectado ao rodar o pipeline
-- real de import contra o DB local (2026-07-31).
--
-- Correcao: apontar a FK para users(user_platform_id), alinhando DB ao schema
-- drizzle (`shared/schema.ts`: references(() => users.userPlatformId)).
--
-- Seguranca: remove antes eventuais linhas orfas (user_id que nao existe em
-- users.user_platform_id) para a nova constraint poder ser validada.

DELETE FROM upload_history uh
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.user_platform_id = uh.user_id
);

ALTER TABLE upload_history
  DROP CONSTRAINT IF EXISTS upload_history_user_id_users_id_fk;

ALTER TABLE upload_history
  ADD CONSTRAINT upload_history_user_id_users_user_platform_id_fk
  FOREIGN KEY (user_id) REFERENCES users(user_platform_id) ON DELETE CASCADE;
