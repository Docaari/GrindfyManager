-- ============================================================================
-- Sprint Stats-V3 — OCR + 3-way compare schema delta
--
-- Spec: docs/specs/sprint-stats-v3.md (Schema delta migration 0020)
-- ADR : 065 (OCR via Claude Vision), 066 (3-way comparison semantics)
--
-- Adiciona:
--   - hud_stat_snapshots.capture_method (manual|paste|csv|ocr)
--   - hud_stat_snapshots.source_image_key (FK opaca pra SpotImageStorage)
--   - hud_stat_snapshots.ocr_confidence (jsonb por-stat)
--   - hud_stat_snapshots.ocr_raw_response (jsonb com SHA256 + matched/unmatched)
--   - Indexes para cache lookup OCR e filtro por capture_method
--
-- Foundermode: NAO rodar db:push automatico — apenas commit do .sql.
-- ============================================================================

ALTER TABLE "hud_stat_snapshots"
  ADD COLUMN IF NOT EXISTS "capture_method" varchar(20) NOT NULL DEFAULT 'manual'
    CHECK ("capture_method" IN ('manual','paste','csv','ocr'));

ALTER TABLE "hud_stat_snapshots"
  ADD COLUMN IF NOT EXISTS "source_image_key" varchar(255);

ALTER TABLE "hud_stat_snapshots"
  ADD COLUMN IF NOT EXISTS "ocr_confidence" jsonb;

ALTER TABLE "hud_stat_snapshots"
  ADD COLUMN IF NOT EXISTS "ocr_raw_response" jsonb;

-- V3 fields_json: persistencia para custom stats (RF-07) e target overrides
-- (RF-05). NAO substitui catalog (ADR-058 estatico) — apenas extensoes do user.
-- Default '[]' por seguranca; back-fill abaixo.
ALTER TABLE "hud_layouts"
  ADD COLUMN IF NOT EXISTS "fields_json" jsonb NOT NULL DEFAULT '[]';

UPDATE "hud_layouts"
  SET "fields_json" = '[]'::jsonb
  WHERE "fields_json" IS NULL;

-- Backfill seguro: DEFAULT cuida de novas rows; UPDATE sanitiza qualquer existente.
UPDATE "hud_stat_snapshots"
  SET "capture_method" = 'manual'
  WHERE "capture_method" IS NULL OR "capture_method" = '';

CREATE INDEX IF NOT EXISTS "idx_hud_snapshots_capture_method"
  ON "hud_stat_snapshots" ("user_id", "capture_method");

-- Cache lookup OCR (RF-09): usado em handleOcrExtract para evitar re-chamada
-- da Anthropic quando mesmo buffer (SHA256) ja foi processado.
CREATE INDEX IF NOT EXISTS "idx_hud_snapshots_source_image_key"
  ON "hud_stat_snapshots" ("user_id", "source_image_key")
  WHERE "source_image_key" IS NOT NULL;

-- Tabela de auditoria (RF-12 rate limit + telemetria OCR) — leitura-only por user.
CREATE TABLE IF NOT EXISTS "hud_ocr_audit" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_hud_ocr_audit_user_created"
  ON "hud_ocr_audit" ("user_id", "created_at" DESC);
