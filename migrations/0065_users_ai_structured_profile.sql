-- Migration 0065 — Sprint AI-1A / RF-01 (ADR-151)
-- Adiciona coluna JSONB do perfil estruturado de IA ao users.
-- Lesson #7: nullable, com DEFAULT '{}'::jsonb (sem NOT NULL). O storage normaliza.
-- Idempotente.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_structured_profile jsonb DEFAULT '{}'::jsonb;
