-- Migration 0046 — News-3.1 RSS URLs + strategies update
-- Sprint News-3.1: descobertas pos-orchestrator run (2026-05-04):
--   xAI Live Search deprecated → migrado XSearchProvider Agent Tools API
--   4 sources tem RSS feeds funcionando → switch para strategy RSS-first
-- Idempotente.

-- =============================================================================
-- Atualizar sources com RSS feeds reais descobertos
-- =============================================================================

-- mundopoker — WordPress feed (redirect para /feed/)
UPDATE news_sources
SET rss_url = 'https://mundopoker.com.br/feed/',
    scrape_strategy = 'rss_or_html',
    updated_at = now()
WHERE id = 'mundopoker';

-- hand2note — sem RSS real (/feed retorna HTML). Mantem x_only via X handle.
UPDATE news_sources
SET rss_url = NULL,
    scrape_strategy = 'x_only',
    updated_at = now()
WHERE id = 'hand2note';

-- jurojin — RSS valido em /feed.xml (URL global, sem prefixo /pt)
UPDATE news_sources
SET rss_url = 'https://jurojinpoker.com/feed.xml',
    scrape_strategy = 'rss_or_html',
    updated_at = now()
WHERE id = 'jurojin';

-- gto-wizard-studies + gto-wizard ambos compartilham mesmo blog feed
-- (blog.gtowizard.com publica articles + whats-new no mesmo /feed/)
-- Layer 2 dedupe collapsa items duplicados entre as 2 sources.
UPDATE news_sources
SET rss_url = 'https://blog.gtowizard.com/feed/',
    scrape_strategy = 'rss_or_html',
    updated_at = now()
WHERE id IN ('gto-wizard-studies', 'gto-wizard');

-- =============================================================================
-- HTML-only sources (sem RSS — pendentes adapter real selectors Sprint News-3.2):
--   superpoker, ggpoker, pokerstars (blog), hrc
-- Mantém scrape_strategy = 'html' / 'html_and_x' como esta.
-- Adapters retornam 0 items ate Sprint News-3.2 fixar selectors.
-- =============================================================================
