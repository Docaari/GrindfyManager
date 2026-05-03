-- Migration 0041 — adiciona homepage_url em news_sources.
-- Sprint home-reform-4 item 11 (bug fix). Usado como fallback quando o URL
-- especifico do item retornado pelo Grok 404'a (hallucination tipica do LLM).
-- Garante que cards do NewsFeed sempre tenham link clicavel valido.

ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS homepage_url TEXT;

-- Backfill homepages reais (verificadas manualmente). Usadas como fallback
-- quando upsertNewsItem detecta URL quebrada.
UPDATE news_sources SET homepage_url = 'https://hand2note.com'           WHERE id = 'hand2note';
UPDATE news_sources SET homepage_url = 'https://www.pokertracker.com'    WHERE id = 'pokertracker';
UPDATE news_sources SET homepage_url = 'https://www.holdemmanager.com'   WHERE id = 'holdem-manager';
UPDATE news_sources SET homepage_url = 'https://jurojin.com'             WHERE id = 'jurojin';
UPDATE news_sources SET homepage_url = 'https://intuitivetable.com'      WHERE id = 'intuitive-table';
UPDATE news_sources SET homepage_url = 'https://gtowizard.com'           WHERE id = 'gto-wizard';
UPDATE news_sources SET homepage_url = 'https://sharkscope.com'          WHERE id = 'sharkscope';
UPDATE news_sources SET homepage_url = 'https://www.holdemresources.net' WHERE id = 'hrc';

UPDATE news_sources SET homepage_url = 'https://www.pokerstars.com'      WHERE id = 'pokerstars';
UPDATE news_sources SET homepage_url = 'https://www.ggpoker.com'         WHERE id = 'ggpoker';
UPDATE news_sources SET homepage_url = 'https://www.americascardroom.eu' WHERE id = 'wpn-acr';
UPDATE news_sources SET homepage_url = 'https://www.partypoker.com'      WHERE id = 'partypoker';
UPDATE news_sources SET homepage_url = 'https://www.888poker.com'        WHERE id = '888poker';
UPDATE news_sources SET homepage_url = 'https://www.coinpoker.com'       WHERE id = 'coinpoker';
UPDATE news_sources SET homepage_url = 'https://www.bodog.eu'            WHERE id = 'bodog';
UPDATE news_sources SET homepage_url = 'https://www.chico.tv'            WHERE id = 'chico';
UPDATE news_sources SET homepage_url = 'https://www.ipoker.com'          WHERE id = 'ipoker';

UPDATE news_sources SET homepage_url = 'https://blog.gtowizard.com'      WHERE id = 'gto-wizard-studies';

UPDATE news_sources SET homepage_url = 'https://www.mundopoker.com.br'   WHERE id = 'mundopoker';
UPDATE news_sources SET homepage_url = 'https://www.superpoker.com'      WHERE id = 'superpoker';

UPDATE news_sources SET homepage_url = 'https://www.pokerstars.com/news' WHERE id = 'cravadas-br';
