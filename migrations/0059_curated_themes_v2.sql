-- =============================================================================
-- Migration 0059 — Curated Study Themes v2 (soft-drop v1)
-- =============================================================================
-- Sprint Themes-V2 (2026-05-08): substitui catalog v1 (30 temas / 5 categorias)
-- por v2 (20 temas / 3 categorias: preflop / postflop / multiway).
--
-- Estrategia: SOFT-DROP. Flip is_curated=false nos slugs v1 ao inves de DELETE
-- para preservar FKs:
--   - study_sessions_v2.theme_id (ON DELETE SET NULL ja existe, mas evitamos perder linkagem)
--   - study_theme_spot_links.theme_id (ON DELETE CASCADE — DELETE causaria perda de spot links)
--   - user_focus_stats.theme_id
--
-- Os 20 temas v2 sao inseridos lazy via storage.ensureCuratedThemesForUser(userId)
-- no primeiro GET /api/study-themes pos-deploy.
--
-- ROLLBACK: re-flip is_curated=true via slugs listados + DELETE manual dos v2 inseridos.
-- =============================================================================

BEGIN;

-- Atualiza CHECK constraint do enum category para incluir 'multiway' (v2).
-- Mantem categorias v1 (icm/mental/specific) para sobreviver rows soft-dropped
-- que possam ainda ter category nao-NULL em ambientes que customizaram o flow.
ALTER TABLE study_themes DROP CONSTRAINT IF EXISTS study_themes_category_enum;
ALTER TABLE study_themes
  ADD CONSTRAINT study_themes_category_enum
  CHECK (
    category IS NULL
    OR category::text = ANY (ARRAY[
      'preflop'::varchar,
      'postflop'::varchar,
      'multiway'::varchar,
      -- Legacy v1 (mantidos para nao falhar rows existentes):
      'icm'::varchar,
      'mental'::varchar,
      'specific'::varchar
    ]::text[])
  );

-- Soft-drop dos slugs v1
UPDATE study_themes
SET
  is_curated = false,
  category = NULL,
  updated_at = NOW()
WHERE
  is_curated = true
  AND slug IN (
    -- v1 preflop (8)
    'preflop-rfi-tight',
    'preflop-rfi-loose',
    'preflop-3bet-ip',
    'preflop-3bet-oop',
    'preflop-vs-3bet',
    'preflop-bb-defense',
    'preflop-blind-war-squeeze',
    'preflop-late-reg-deep',
    -- v1 postflop (8)
    'postflop-cbet-oop-small',
    'postflop-cbet-oop-polar',
    'postflop-donk-leads',
    'postflop-turn-barrel',
    'postflop-river-bluff-value',
    'postflop-multiway-cbet',
    'postflop-cooler-river',
    'postflop-board-texture',
    -- v1 icm (6)
    'icm-bubble-play',
    'icm-final-table',
    'icm-pay-jumps',
    'icm-ft-ladder',
    'icm-stack-aware',
    'icm-mtt-push-fold',
    -- v1 mental (5)
    'mental-tilt-control',
    'mental-a-game',
    'mental-loss-recovery',
    'mental-variance-acceptance',
    'mental-decision-fatigue',
    -- v1 specific (3)
    'specific-short-stack',
    'specific-phased-day2',
    'specific-satellite-bubble'
  );

-- Sanity check (informativo, nao falha):
-- SELECT user_id, COUNT(*) FROM study_themes
--   WHERE is_curated = true GROUP BY user_id;
-- Esperado: 0 rows imediatamente apos migration. Re-popula via lazy seed.

COMMIT;
