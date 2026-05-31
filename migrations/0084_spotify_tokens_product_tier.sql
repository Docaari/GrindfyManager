-- Migration 0084 — B-PRODUCTTIER (Sprint Spotify Polish wave final)
-- Persiste o product tier do Spotify (me.product: premium/free/open) na
-- spotify_tokens. So premium conecta hoje (gate no callback), mas persistir
-- evita o hardcode "premium" no GET /api/audio/spotify/status.
ALTER TABLE spotify_tokens ADD COLUMN IF NOT EXISTS product_tier varchar;
