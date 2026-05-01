-- ============================================================================
-- Sprint F3 — Stats Analyzer
--
-- Spec: Docs/specs/sprint-f3-stats-analyzer.md
-- ADRs: 051 (layout schema), 052 (Coach tool integration)
--
-- Tabelas:
--   1. hud_layouts          — presets de stats HUD por usuario
--   2. hud_stat_snapshots   — medicoes pontuais por layout
-- ============================================================================

CREATE TABLE IF NOT EXISTS "hud_layouts" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "is_default" boolean NOT NULL DEFAULT FALSE,
  "sections" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_hud_layouts_user"
  ON "hud_layouts" ("user_id");

-- 1 default layout por user (parcial)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hud_layouts_default"
  ON "hud_layouts" ("user_id")
  WHERE "is_default" = TRUE;

CREATE TABLE IF NOT EXISTS "hud_stat_snapshots" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "layout_id" varchar NOT NULL REFERENCES "hud_layouts"("id") ON DELETE CASCADE,
  "captured_at" timestamp NOT NULL DEFAULT now(),
  "source" varchar(16) NOT NULL DEFAULT 'manual',
  "values" jsonb NOT NULL,
  "sample_size" integer,
  "session_id" varchar REFERENCES "grind_sessions"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_hud_snapshots_user_layout"
  ON "hud_stat_snapshots" ("user_id", "layout_id", "captured_at" DESC);
