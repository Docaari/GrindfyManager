-- Migration 0045 — News-3 RSS/X Refactor (ADR-107)
-- Sprint News-3: substitui Grok-LLM por scrapers reais + xAI Live Search.
-- Idempotente. Wipe news_items (todos fake conforme audit 2026-05-04).

-- =============================================================================
-- RF-01 — news_sources: rename + add columns + CHECK
-- =============================================================================

-- 1. Rename live_search_handle -> x_handle (preserva valores).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'news_sources' AND column_name = 'live_search_handle'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'news_sources' AND column_name = 'x_handle'
  ) THEN
    ALTER TABLE news_sources RENAME COLUMN live_search_handle TO x_handle;
  END IF;
END $$;

-- 2. Adiciona rss_url (NULL).
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS rss_url text;

-- 3. Adiciona scrape_strategy (NOT NULL DEFAULT 'html').
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS scrape_strategy varchar(32) NOT NULL DEFAULT 'html';

-- 4. CHECK constraint nas 6 strategies validas (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'news_sources' AND constraint_name = 'news_sources_scrape_strategy_check'
  ) THEN
    ALTER TABLE news_sources ADD CONSTRAINT news_sources_scrape_strategy_check
      CHECK (scrape_strategy IN ('rss', 'html', 'x_only', 'rss_and_x', 'html_and_x', 'rss_or_html'));
  END IF;
END $$;

-- =============================================================================
-- RF-08.1 — news_items: url_canonical + title_fingerprint + indices
-- =============================================================================

ALTER TABLE news_items ADD COLUMN IF NOT EXISTS url_canonical text NOT NULL DEFAULT '';
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS title_fingerprint varchar(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_news_items_url_canonical_fetched
  ON news_items (url_canonical, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_title_fingerprint_fetched
  ON news_items (title_fingerprint, fetched_at DESC);

-- =============================================================================
-- RF-01 — Drop legacy sources (CASCADE limpa news_items orfaos)
-- =============================================================================

DELETE FROM news_sources WHERE id IN (
  'cravadas-br',
  'chico',
  'ipoker',
  'intuitive-table',
  'holdem-manager',
  'pokertracker'
);

-- =============================================================================
-- RF-01 — Wipe news_items (todos os items existentes sao fake — audit 2026-05-04)
-- =============================================================================

DELETE FROM news_items;

-- =============================================================================
-- RF-01 — UPSERT 15 sources locked (Docs/audits/news-x-handles.md)
-- =============================================================================

-- gossip
INSERT INTO news_sources (id, category, name, platform, scrape_strategy, rss_url, homepage_url, x_handle, enabled) VALUES
  ('mundopoker', 'gossip', 'MundoPoker', 'mundopoker', 'html', NULL, 'https://mundopoker.com.br', NULL, true),
  ('superpoker', 'gossip', 'SuperPoker', 'superpoker', 'html', NULL, 'https://superpoker.com.br', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  scrape_strategy = EXCLUDED.scrape_strategy,
  rss_url = EXCLUDED.rss_url,
  homepage_url = EXCLUDED.homepage_url,
  x_handle = EXCLUDED.x_handle,
  enabled = EXCLUDED.enabled,
  updated_at = now();

-- sites
INSERT INTO news_sources (id, category, name, platform, scrape_strategy, rss_url, homepage_url, x_handle, enabled) VALUES
  ('888poker', 'sites', '888poker', '888poker', 'x_only', NULL, NULL, '888poker', true),
  ('bodog', 'sites', 'Bodog/Bovada', 'bodog', 'x_only', NULL, NULL, 'IgnitionCasino', true),
  ('coinpoker', 'sites', 'CoinPoker', 'coinpoker', 'x_only', NULL, NULL, 'CoinPoker_OFF', true),
  ('ggpoker', 'sites', 'GGPoker', 'ggpoker', 'html_and_x', NULL, 'https://ggpoker.com/pt-br/blog/', 'GGPoker', true),
  ('partypoker', 'sites', 'PartyPoker', 'partypoker', 'x_only', NULL, NULL, 'partypoker', true),
  ('pokerstars', 'sites', 'PokerStars', 'pokerstars', 'html_and_x', NULL, 'https://www.pokerstars.com/pt-BR/poker/learn/news/?&no_redirect=1', 'PokerStars', true),
  ('wpn-acr', 'sites', 'WPN/ACR', 'wpn-acr', 'x_only', NULL, NULL, 'ACR_POKER', true)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  scrape_strategy = EXCLUDED.scrape_strategy,
  rss_url = EXCLUDED.rss_url,
  homepage_url = EXCLUDED.homepage_url,
  x_handle = EXCLUDED.x_handle,
  enabled = EXCLUDED.enabled,
  updated_at = now();

-- studies
INSERT INTO news_sources (id, category, name, platform, scrape_strategy, rss_url, homepage_url, x_handle, enabled) VALUES
  ('gto-wizard-studies', 'studies', 'GTO Wizard - Estudos', 'gto-wizard', 'rss_or_html', NULL, 'https://blog.gtowizard.com/articles/', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  scrape_strategy = EXCLUDED.scrape_strategy,
  rss_url = EXCLUDED.rss_url,
  homepage_url = EXCLUDED.homepage_url,
  x_handle = EXCLUDED.x_handle,
  enabled = EXCLUDED.enabled,
  updated_at = now();

-- tools
INSERT INTO news_sources (id, category, name, platform, scrape_strategy, rss_url, homepage_url, x_handle, enabled) VALUES
  ('gto-wizard', 'tools', 'GTO Wizard - What''s New', 'gto-wizard', 'rss_or_html', NULL, 'https://blog.gtowizard.com/whats-new-in-gto-wizard/', NULL, true),
  ('hand2note', 'tools', 'Hand2Note', 'hand2note', 'html_and_x', NULL, 'https://hand2note.com/Blog', 'hand2note', true),
  ('hrc', 'tools', 'HRC', 'hrc', 'html', NULL, 'https://www.holdemresources.net/blog', NULL, true),
  ('jurojin', 'tools', 'Jurojin', 'jurojin', 'html', NULL, 'https://jurojinpoker.com/pt/blog', NULL, true),
  ('sharkscope', 'tools', 'SharkScope', 'sharkscope', 'x_only', NULL, NULL, 'sharkscope', true)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  scrape_strategy = EXCLUDED.scrape_strategy,
  rss_url = EXCLUDED.rss_url,
  homepage_url = EXCLUDED.homepage_url,
  x_handle = EXCLUDED.x_handle,
  enabled = EXCLUDED.enabled,
  updated_at = now();
