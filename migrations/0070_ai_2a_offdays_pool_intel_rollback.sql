-- Rollback da migration 0070_ai_2a_offdays_pool_intel.sql
-- ATENCAO: dropa as 2 tabelas + perde todos os dados (off-days dos users + pool intelligence seed).
-- Rodar SO se for descartar AI-2A inteiro.

BEGIN;

DROP TABLE IF EXISTS tournament_pool_intelligence CASCADE;
DROP TABLE IF EXISTS user_off_days CASCADE;

COMMIT;
