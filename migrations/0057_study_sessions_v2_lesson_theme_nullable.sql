-- =============================================================================
-- Sprint Estudos-Coach-Biblio-2 — Migration 0057
-- ADR-135: Errata ADR-126 — mode='lesson' aceita theme_id NULL quando aula
--          nao tem mapping em study_themes.linked_lessons.
--
-- IMPORTANTE: Esta migration eh NO-OP em ambientes ja consistentes.
-- Migration 0052 ja criou theme_id como NULLABLE sem CHECK exigindo NOT NULL
-- para mode='lesson'. Esta migration apenas:
--   1. Reafirma ausencia de CHECK desnecessario (DROP CONSTRAINT IF EXISTS defensivo)
--   2. Atualiza COMMENT da coluna documentando comportamento.
--
-- Nenhum dado eh modificado. Zero downtime.
-- =============================================================================

-- =============================================================================
-- 1. Defensivo: DROP CHECK constraint que exigiria theme_id NOT NULL em mode=lesson
--    (caso algum ambiente legacy tenha sido criado com regra mais rigida)
-- =============================================================================

DO $$
BEGIN
    -- Drop apenas se existe (idempotente)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ssv2_lesson_theme'
        AND conrelid = 'study_sessions_v2'::regclass
    ) THEN
        ALTER TABLE study_sessions_v2 DROP CONSTRAINT ssv2_lesson_theme;
        RAISE NOTICE 'Dropped legacy CHECK ssv2_lesson_theme — mode=lesson now permite theme_id NULL';
    ELSE
        RAISE NOTICE 'No legacy CHECK ssv2_lesson_theme found — schema ja correto (no-op)';
    END IF;
END $$;

-- =============================================================================
-- 2. Atualiza COMMENT documentando comportamento (errata ADR-135)
-- =============================================================================

COMMENT ON COLUMN study_sessions_v2.theme_id IS
    'FK study_themes.id ON DELETE SET NULL. Nullable em todos os modos. Mode=drill_gto e mode=other exigem NOT NULL via CHECK (ssv2_drill_gto_theme, ssv2_other_theme). Mode=lesson PERMITE NULL quando aula nao tem mapping em study_themes.linked_lessons curated (errata ADR-135 supersedes prose ADR-126). Mode=tournament_review e mode=hand_review nao exigem theme_id.';

-- =============================================================================
-- 3. Garantir CHECK ssv2_lesson_id continua exigindo lesson_id (nao theme_id)
--    Reafirma constraint existente — no-op se ja existe.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ssv2_lesson_id'
        AND conrelid = 'study_sessions_v2'::regclass
    ) THEN
        ALTER TABLE study_sessions_v2
            ADD CONSTRAINT ssv2_lesson_id
            CHECK (mode <> 'lesson' OR lesson_id IS NOT NULL);
        RAISE NOTICE 'Re-created missing CHECK ssv2_lesson_id (defensivo)';
    ELSE
        RAISE NOTICE 'CHECK ssv2_lesson_id ja existe (no-op)';
    END IF;
END $$;

-- =============================================================================
-- Verificacao final
-- =============================================================================
-- Rodar verificacao manual pos-aplicacao:
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'study_sessions_v2'::regclass
--   AND conname LIKE 'ssv2_%';
--
-- Esperado: ssv2_lesson_id presente; ssv2_lesson_theme AUSENTE.
-- =============================================================================
