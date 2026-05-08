-- =============================================================================
-- Sprint Estudos-Habito-1 — Migration 0053
-- Spec RF-3.1: relax study_theme_id NOT NULL → permitir foco sem tema linkado.
-- ADR-116 (existing schema) prevalece para CASCADE behavior.
-- =============================================================================

ALTER TABLE user_focus_stats
    ALTER COLUMN study_theme_id DROP NOT NULL;

-- Indices preservados (uq_user_focus_stats_user_stat_month, idx_user_focus_stats_user_month, idx_user_focus_stats_theme).
-- Comportamento CASCADE em DELETE de study_themes mantido (rows antigas com theme deletado serao removidas — comportamento ADR-116 §nao mudou).
-- Rows existentes mantem theme_id populado; novas podem ser criadas com NULL.

-- =============================================================================
-- Verificacao
-- =============================================================================
-- Roda em prod com rows existentes — DROP NOT NULL eh forward-compatible (R9 mitigado, spec §RF-3.1).
-- Reverter: ALTER TABLE user_focus_stats ALTER COLUMN study_theme_id SET NOT NULL (apenas se zero rows com NULL).
