-- Rollback 0085: dropa indices. O backfill de FX e IRREVERSIVEL em dados
-- (multiplica de volta pela cotacao perderia precisao e nao da p/ distinguir as
-- linhas originalmente nativas das ja-USD). Restaurar de backup se necessario.

DROP INDEX IF EXISTS idx_tournaments_user_speed;
DROP INDEX IF EXISTS idx_tournaments_user_field_size;
