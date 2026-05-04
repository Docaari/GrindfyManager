-- 0043_user_focus_stats.sql
-- Sprint home-reform-4 Item 7 — Focus Stats schema
-- ADR-116, ADR-117, ADR-118
--
-- Cria tabela user_focus_stats com escopo mensal (varchar month YYYY-MM)
-- + UNIQUE (user_id, stat_id, month) + indices auxiliares + trigger
-- updated_at. Limite 3 enforced no servico (ver ADR-116 §2.4).

CREATE TABLE IF NOT EXISTS user_focus_stats (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    stat_id         VARCHAR(64) NOT NULL,
    study_theme_id  VARCHAR(21) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
    month           VARCHAR(7) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_focus_stats_user_stat_month
    ON user_focus_stats (user_id, stat_id, month);

CREATE INDEX IF NOT EXISTS idx_user_focus_stats_user_month
    ON user_focus_stats (user_id, month);

CREATE INDEX IF NOT EXISTS idx_user_focus_stats_theme
    ON user_focus_stats (study_theme_id);

-- Reusa funcao set_updated_at() ja criada em migration 0036.
DROP TRIGGER IF EXISTS trg_user_focus_stats_updated_at ON user_focus_stats;
CREATE TRIGGER trg_user_focus_stats_updated_at
    BEFORE UPDATE ON user_focus_stats
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rollback (manual, se necessario):
-- DROP TRIGGER IF EXISTS trg_user_focus_stats_updated_at ON user_focus_stats;
-- DROP TABLE IF EXISTS user_focus_stats;
