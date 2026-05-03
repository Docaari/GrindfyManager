-- Migration 0038 — News Feed (ADR-106)
-- Sprint News-1: tabelas pra integracao xAI Grok + opt-in granular per user.
-- Idempotente (CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS news_sources (
  id varchar(64) PRIMARY KEY NOT NULL,
  category varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  description text,
  icon_url text,
  platform varchar(64) NOT NULL,
  query_template text,
  live_search_handle varchar(64),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_sources_category ON news_sources (category, enabled);
CREATE INDEX IF NOT EXISTS idx_news_sources_platform ON news_sources (platform);

CREATE TABLE IF NOT EXISTS news_items (
  id varchar PRIMARY KEY NOT NULL,
  source_id varchar(64) NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  category varchar(32) NOT NULL,
  platform varchar(64) NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  url text NOT NULL,
  thumbnail_url text,
  published_at timestamp NOT NULL,
  fetched_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  engagement_likes integer,
  engagement_views integer,
  engagement_comments integer,
  content_hash varchar(64) NOT NULL,
  tags jsonb,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_news_items_content_hash ON news_items (content_hash);
CREATE INDEX IF NOT EXISTS idx_news_items_category_published ON news_items (category, published_at);
CREATE INDEX IF NOT EXISTS idx_news_items_platform ON news_items (platform);
CREATE INDEX IF NOT EXISTS idx_news_items_expires ON news_items (expires_at);

CREATE TABLE IF NOT EXISTS user_news_preferences (
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  category varchar(32) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  platform_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_news_prefs_user_category
  ON user_news_preferences (user_id, category);

-- Seed: catalogo inicial de plataformas (idempotente via ON CONFLICT).
INSERT INTO news_sources (id, category, name, description, platform, query_template) VALUES
  ('hand2note',     'market', 'Hand2Note',      'Tracker e HUD',           'hand2note',     'Atualizacoes recentes do Hand2Note (versoes, features, bugfixes) nas ultimas 2 semanas.'),
  ('pokertracker',  'market', 'PokerTracker 4', 'Tracker classico',        'pokertracker',  'Atualizacoes recentes do PokerTracker 4 nas ultimas 2 semanas.'),
  ('holdem-manager','market', 'Holdem Manager 3','Tracker',                'holdem-manager','Atualizacoes recentes do Holdem Manager 3 nas ultimas 2 semanas.'),
  ('jurojin',       'market', 'Jurojin',         'Auto-registro / table manager', 'jurojin', 'Atualizacoes recentes do Jurojin nas ultimas 2 semanas.'),
  ('intuitive-table','market','Intuitive Table',  'Table manager + lobby auto', 'intuitive-table','Atualizacoes recentes do Intuitive Table nas ultimas 2 semanas.'),
  ('gto-wizard',    'market', 'GTO Wizard',      'Solver / trainer',       'gto-wizard',    'Atualizacoes recentes do GTO Wizard (features, expansao de solucoes) nas ultimas 2 semanas.'),
  ('sharkscope',    'market', 'SharkScope',      'Database de torneios',   'sharkscope',    'Atualizacoes recentes do SharkScope nas ultimas 2 semanas.'),
  ('pokerstars',    'market', 'PokerStars',       'Rede',                  'pokerstars',    'Anuncios recentes da PokerStars (lancamentos, mudancas de software, promos) nas ultimas 2 semanas.'),
  ('ggpoker',       'market', 'GGPoker',          'Rede',                  'ggpoker',       'Anuncios recentes da GGPoker nas ultimas 2 semanas.'),
  ('wpn-acr',       'market', 'WPN / ACR',        'Rede WPN/Americas Cardroom','wpn-acr',   'Anuncios recentes da rede WPN (Americas Cardroom, BlackChip) nas ultimas 2 semanas.'),
  ('partypoker',    'market', 'PartyPoker',       'Rede',                  'partypoker',    'Anuncios recentes da PartyPoker nas ultimas 2 semanas.'),
  ('888poker',      'market', '888poker',         'Rede',                  '888poker',      'Anuncios recentes da 888poker nas ultimas 2 semanas.'),
  ('coinpoker',     'market', 'CoinPoker',        'Rede crypto',           'coinpoker',     'Anuncios recentes da CoinPoker nas ultimas 2 semanas.'),
  ('bodog',         'market', 'Bodog / Bovada',   'Rede',                  'bodog',         'Anuncios recentes da Bodog/Bovada nas ultimas 2 semanas.'),
  ('chico',         'market', 'Chico Network',    'Rede',                  'chico',         'Anuncios recentes da Chico Network nas ultimas 2 semanas.'),
  ('ipoker',        'market', 'iPoker Network',   'Rede',                  'ipoker',        'Anuncios recentes da iPoker Network nas ultimas 2 semanas.')
ON CONFLICT (id) DO NOTHING;

-- Gossip BR — veiculos confirmados pelo founder (2026-05-03).
INSERT INTO news_sources (id, category, name, description, platform, query_template) VALUES
  ('mundopoker', 'gossip', 'MundoPoker', 'Veiculo brasileiro de poker', 'mundopoker', 'Pautas mais hypadas e curtidas do MundoPoker (mundopoker.com.br) nas ultimas 7 dias sobre poker brasileiro.'),
  ('superpoker', 'gossip', 'SuperPoker', 'Veiculo brasileiro de poker', 'superpoker', 'Pautas mais hypadas e curtidas do SuperPoker (superpoker.com.br) nas ultimas 7 dias sobre poker brasileiro.')
ON CONFLICT (id) DO NOTHING;

-- Tournament-results — ITM/cravadas grandes (categoria livre, opt-in).
INSERT INTO news_sources (id, category, name, description, platform, query_template) VALUES
  ('cravadas-br',     'tournament-results', 'Cravadas BR',    'Cravadas e ITM grandes de brasileiros',  'cravadas-br', 'Cravadas e ITM grandes de brasileiros nas ultimas 48h em torneios online (Sunday Million, MTT 100k+ GTD).')
ON CONFLICT (id) DO NOTHING;
