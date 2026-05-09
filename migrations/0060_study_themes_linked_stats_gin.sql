-- Sprint stats-themes-linking-1 (ADR-141)
-- GIN index para reverse lookup performatico de stats linkadas a temas.
-- ATENCAO: ADR-127 §2.1 ja criou um indice parcial (WHERE is_curated=true)
-- chamado `idx_study_themes_curated_stats`. Este indice novo NAO eh parcial —
-- cobre user custom themes tambem. Ambos coexistem (planner usa o melhor).
--
-- Operadores cobertos por GIN sem jsonb_path_ops: @>, ?, ?&, ?|.
-- Usado por:
--   - GET /api/stats/:statId/linked-themes (RF-02 reverse lookup)
--   - storage.getThemesLinkingStat
--   - storage.listThemesContainingStat
--
-- CONCURRENTLY evita lock — safe para deploy live (PG 11+).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_themes_linked_stats_gin
  ON study_themes USING gin (linked_stats);

ANALYZE study_themes;
