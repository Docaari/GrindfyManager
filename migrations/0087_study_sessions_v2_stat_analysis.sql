-- Sprint EST-3 (ADR-222 / D7) — estende study_sessions_v2 para stat_analysis +
-- registro enriquecido. Numero 0086 estava previsto no ADR mas foi ocupado por
-- outra sessao (0086_coach_report_delivery_defaults_and_ledger); usamos 0087.
--
-- Todas as colunas nullable, SEM DEFAULT (lesson #7): o back-fill eh o proprio
-- NULL — sessoes existentes ficam legiveis com os 5 campos null, zero quebra.
-- hands/filters NULL distingue "nao informado" de "informou zero" (EST-2 nao
-- infla media com zeros falsos).

ALTER TABLE study_sessions_v2
  ADD COLUMN IF NOT EXISTS stat_id varchar(64),                 -- catalog id OU custom_*; NAO FK
  ADD COLUMN IF NOT EXISTS stat_analysis_entries jsonb,         -- array de entries (RF-02); cap 10 em servico/Zod
  ADD COLUMN IF NOT EXISTS hands_solved_count integer,          -- RF-03; >=0, cap 1000 em Zod
  ADD COLUMN IF NOT EXISTS filters_analyzed_count integer,      -- RF-03; >=0, cap 1000 em Zod
  ADD COLUMN IF NOT EXISTS lesson_insights text;                -- RF-03; max 2000 em Zod

-- Indice parcial (D-1) — recorte da revisao "por stat dentro do tema".
-- Parcial (so stat_analysis nao soft-deleted) mantem o custo de write baixo.
CREATE INDEX IF NOT EXISTS idx_ssv2_stat_analysis_theme_stat
  ON study_sessions_v2 (user_id, theme_id, stat_id)
  WHERE mode = 'stat_analysis' AND deleted_at IS NULL;
