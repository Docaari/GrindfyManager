-- =============================================================================
-- Sprint Estudos-Coach-Biblio-2 — Migration 0056
-- ADR-133: Cache de coach_session_insights em tabela dedicada (vs memoria/Redis)
-- ADR-134: Coach tool coachSessionInsights persiste output com UPSERT race-safe
-- =============================================================================

-- =============================================================================
-- 1. coach_session_insights — tabela nova (cache 24h + auditoria)
-- =============================================================================

CREATE TABLE IF NOT EXISTS coach_session_insights (
    id                  VARCHAR(21) PRIMARY KEY,
    user_id             VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    grind_session_id    VARCHAR(21) NOT NULL REFERENCES grind_sessions(id) ON DELETE CASCADE,
    insights_jsonb      JSONB NOT NULL,                          -- SessionInsights shape
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,                    -- generated_at + 24h
    cost_tokens_used    INTEGER,
    model               VARCHAR(64),                             -- ex: claude-opus-4-7
    prompt_version      VARCHAR(32),                             -- rastreabilidade
    tokens_in           INTEGER,
    tokens_out          INTEGER,
    regenerated_count   INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- CHECK constraints (ADR-133 §2.1)
    CONSTRAINT csi_expires_after_generated
        CHECK (expires_at >= generated_at),
    CONSTRAINT csi_regenerated_count_nonnegative
        CHECK (regenerated_count >= 0),
    CONSTRAINT csi_tokens_nonnegative
        CHECK (
            (tokens_in IS NULL OR tokens_in >= 0)
            AND (tokens_out IS NULL OR tokens_out >= 0)
            AND (cost_tokens_used IS NULL OR cost_tokens_used >= 0)
        )
);

-- Indices (ADR-133 §2.1)

-- 1 insight por sessao — idempotency + race safety via INSERT ON CONFLICT DO UPDATE
CREATE UNIQUE INDEX IF NOT EXISTS uq_csi_session
    ON coach_session_insights (grind_session_id);

-- Listagem por user (auditoria, debug)
CREATE INDEX IF NOT EXISTS idx_csi_user_generated
    ON coach_session_insights (user_id, generated_at DESC);

-- Cleanup batch futuro (purge expirados > 30d)
CREATE INDEX IF NOT EXISTS idx_csi_expires
    ON coach_session_insights (expires_at);

-- =============================================================================
-- Comments (documentacao inline)
-- =============================================================================

COMMENT ON TABLE coach_session_insights IS
    'Cache + auditoria de insights Coach pos-sessao /grind-live (RF-4). 1 row por grind_session_id (UNIQUE). expires_at = generated_at + 24h. Cache miss em GET /api/coach/session-insights/:sessionId chama Coach (5-12s). Ref ADR-133.';

COMMENT ON COLUMN coach_session_insights.insights_jsonb IS
    'Shape: { summary, topHands: [{handId, title, rationale, action, ctaUrl, handBadge}], suggestedLessons: [{lessonId, title, courseSlug, lessonSlug, rationale, durationSeconds}], spotsToReview: [{spotId, label, suggestedAction}], focusStatsHighlight: [{statId, statName, occurredCount, rationale}] }. Validado por Zod (SessionInsightsSchema) antes de INSERT.';

COMMENT ON COLUMN coach_session_insights.expires_at IS
    'Cache TTL 24h. GET handler verifica WHERE expires_at > now(). Apos expirar, novo GET re-gera + UPDATE bumpa regenerated_count.';

COMMENT ON COLUMN coach_session_insights.regenerated_count IS
    'Bumpado em UPDATE (POST /regenerate ou cache miss apos expiracao). Signal qualidade Coach — se mediana > 2, prompt gera insight ruim.';

COMMENT ON COLUMN coach_session_insights.prompt_version IS
    'Versao do system prompt usado. Permite re-gerar insights antigos com prompt novo (debug A/B).';

-- =============================================================================
-- Verificacao final (idempotente)
-- =============================================================================
-- A migration eh segura para rodar multiple vezes (IF NOT EXISTS em todos os DDLs).
-- Reverter: DROP TABLE coach_session_insights CASCADE.
