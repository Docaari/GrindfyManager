-- Migration 0066 — Sprint AI-1A / RF-02 (ADR-152)
-- Estado de auto-congelamento por categoria em user_coach_preferences.
-- Mapa categoria -> { frozenAt, reason, dismissRate?, windowDays? }.
-- coach_nudge_log: nenhuma coluna nova (status 'unsubscribed' + triggeredByEvent
-- 'auto_freeze_notice' cabem nos varchars existentes).
-- Idempotente.

ALTER TABLE user_coach_preferences
  ADD COLUMN IF NOT EXISTS frozen_categories jsonb NOT NULL DEFAULT '{}'::jsonb;
