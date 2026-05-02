-- migrations/0021_studies_reform.sql
-- Sprint Studies-Reform — RF-08 (ADR-067 / ADR-068)
-- Adds: study_theme_spot_links (N:N association table) + streak fields on users

-- Tabela nova: study_theme_spot_links (relacao N:N entre themes e spots)
CREATE TABLE IF NOT EXISTS study_theme_spot_links (
    id VARCHAR(21) PRIMARY KEY,
    theme_id VARCHAR(21) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
    spot_id VARCHAR(21) NOT NULL REFERENCES starred_hands(id) ON DELETE CASCADE,
    user_id VARCHAR(21) NOT NULL,
    reasoning_text TEXT,
    linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (theme_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_theme ON study_theme_spot_links(theme_id);
CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_spot ON study_theme_spot_links(spot_id);
CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_user ON study_theme_spot_links(user_id);

-- Streak counter (cache em users)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS study_streak_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_study_activity_at TIMESTAMP;

-- Indice parcial para queries de streak ativa
CREATE INDEX IF NOT EXISTS idx_users_streak_active
    ON users(study_streak_days)
    WHERE study_streak_days > 0;
