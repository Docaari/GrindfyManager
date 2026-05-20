-- Migration 0070: AI-2A — user_off_days + tournament_pool_intelligence
--
-- Sprint AI-2A (Fase 2 do plano de IA — "Tecnico de carreira").
-- Cria 2 tabelas novas:
--   1. user_off_days     — dias de folga do user (consumido por mark_off_day tool + bulk_propose_grade)
--   2. tournament_pool_intelligence — knowledge base BR de torneios MTT (consumido por query_pool_intelligence)
--
-- NAO mexe em user_coach_preferences — os toggles nudgeBDownswing/nudgeBVolume/nudgeBGrade
-- ja existem (shared/schema.ts:4501-4504, NOT NULL DEFAULT true).
--
-- Rollback: migrations/0070_ai_2a_offdays_pool_intel_rollback.sql
-- ADRs: ADR-165 (write tools strict/confirm/undo), ADR-167 (nudges + isToolEligibleTier).

BEGIN;

-- =========================================================================
-- 1. user_off_days
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_off_days (
    id            VARCHAR(21) PRIMARY KEY,
    user_id       VARCHAR(21) NOT NULL
                  REFERENCES users(user_platform_id) ON DELETE CASCADE,
    off_date      DATE        NOT NULL,
    reason        TEXT,
    source        VARCHAR(32) NOT NULL DEFAULT 'coach_tool',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT user_off_days_user_date_unique UNIQUE (user_id, off_date)
);

CREATE INDEX IF NOT EXISTS idx_user_off_days_user_date
    ON user_off_days(user_id, off_date);

COMMENT ON TABLE user_off_days IS
    'Sprint AI-2A. Dias de folga marcados via mark_off_day tool (ou UI futura). UNIQUE (user_id, off_date) garante idempotencia. bulk_propose_grade pula dias listados.';

COMMENT ON COLUMN user_off_days.source IS
    'coach_tool | manual_ui | cron_default — snapshot da origem (auditoria); nao gateia delete.';


-- =========================================================================
-- 2. tournament_pool_intelligence
-- =========================================================================
CREATE TABLE IF NOT EXISTS tournament_pool_intelligence (
    id                   VARCHAR(21)  PRIMARY KEY,
    site                 VARCHAR(32)  NOT NULL,
    tournament_pattern   VARCHAR(120) NOT NULL,
    buy_in_min           NUMERIC,
    buy_in_max           NUMERIC,
    field_avg            INTEGER,
    field_volatility     NUMERIC,
    pool_quality         VARCHAR(16),
    notes                TEXT,
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT pool_quality_enum
        CHECK (pool_quality IS NULL OR pool_quality IN ('soft','medium','tough'))
);

CREATE INDEX IF NOT EXISTS idx_pool_intel_site
    ON tournament_pool_intelligence(site);

CREATE INDEX IF NOT EXISTS idx_pool_intel_pattern_trgm
    ON tournament_pool_intelligence(tournament_pattern);

COMMENT ON TABLE tournament_pool_intelligence IS
    'Sprint AI-2A. Knowledge base BR de torneios MTT (read-only, seed manual via scripts/seed-pool-intelligence.sql). 12 rows iniciais. Sem endpoint admin CRUD neste sprint. query_pool_intelligence tool faz LIKE no tournament_pattern.';

COMMENT ON COLUMN tournament_pool_intelligence.tournament_pattern IS
    'Pattern para matchar nome (LIKE case-insensitive). Ex: "Sunday Million", "Bounty Builder", "Venom".';

COMMENT ON COLUMN tournament_pool_intelligence.pool_quality IS
    'soft | medium | tough — qualidade subjetiva do pool (recreational mix). Curadoria manual.';


-- =========================================================================
-- 3. Seed inicial (Q-F locked 2026-05-20) — 12 torneios BR
-- =========================================================================
-- NOTA: Seed via INSERT inline aqui para garantir que esta presente apos
-- db:push. Caso founder queira manter separado, mover para
-- scripts/seed-pool-intelligence.sql (recomendado pela spec) e remover
-- este bloco — o handler de query_pool_intelligence ja tolera tabela
-- vazia (retorna { rows: [], note: 'pool_intelligence_not_seeded' }).

INSERT INTO tournament_pool_intelligence
    (id, site, tournament_pattern, buy_in_min, buy_in_max, field_avg, field_volatility, pool_quality, notes)
VALUES
    ('pool_seed_001', 'WPN',   'Sunday Million',          200,  250,  1800,  250, 'medium', 'Domingo 19h BRT. Field BR consistente'),
    ('pool_seed_002', 'WPN',   'Venom',                   500, 2650,  2500,  800, 'tough',  'Saturday warmup; recreational mix baixo'),
    ('pool_seed_003', 'WPN',   'Big 100K',                100,  109,  1200,  200, 'medium', 'Diario, anchor de grind BR'),
    ('pool_seed_004', 'WPN',   'Mystery Bounty',           50,  530,   900,  180, 'soft',   'KO multi-tier; recreational alto'),
    ('pool_seed_005', 'GG',    'Bounty Builder',           22,  525,  3500, 1200, 'medium', 'Daily; field grande, casual >40%'),
    ('pool_seed_006', 'GG',    'Sunday Bounty Builder',   210,  215,  4800,  700, 'medium', 'Anchor weekend GG'),
    ('pool_seed_007', 'GG',    'Global MILLION$',           5,   10, 12000, 2500, 'soft',   'Field gigante; ROI bom mas variancia alta'),
    ('pool_seed_008', 'GG',    'Mystery Bounty Special',   55,  525,  2200,  500, 'soft',   'KO highlight'),
    ('pool_seed_009', 'Stars', 'Sunday Million',          109,  109,  6000,  800, 'tough',  'Veterano; field experiente'),
    ('pool_seed_010', 'Stars', 'Bounty Builder HR',       215,  215,  1500,  300, 'tough',  'HR Stars; pro-heavy'),
    ('pool_seed_011', 'Party', 'Big Game',                215,  215,   600,  100, 'medium', 'Domingo, field menor mas regs'),
    ('pool_seed_012', 'Bodog', 'Mystery Bounty',           25,  100,   800,  150, 'soft',   'Recreational rede latam')
ON CONFLICT (id) DO NOTHING;

COMMIT;
