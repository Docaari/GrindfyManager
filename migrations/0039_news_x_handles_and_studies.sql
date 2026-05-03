-- Migration 0039 — adiciona X handles aos market sources + categoria 'studies' (GTO Wizard).
-- Sprint News-1 ajuste pos-feedback founder 2026-05-03.

UPDATE news_sources SET live_search_handle = CASE id
  WHEN 'hand2note' THEN 'Hand2Note'
  WHEN 'pokertracker' THEN 'PokerTracker'
  WHEN 'holdem-manager' THEN 'HoldemManager'
  WHEN 'jurojin' THEN 'JurojinPoker'
  WHEN 'gto-wizard' THEN 'GTOWizard'
  WHEN 'sharkscope' THEN 'SharkScope'
  WHEN 'pokerstars' THEN 'PokerStars'
  WHEN 'ggpoker' THEN 'GGPoker'
  WHEN 'wpn-acr' THEN 'ACR_POKER'
  WHEN 'partypoker' THEN 'partypoker'
  WHEN '888poker' THEN '888poker'
  WHEN 'coinpoker' THEN 'CoinPoker'
  WHEN 'bodog' THEN 'BovadaOfficial'
  WHEN 'mundopoker' THEN 'MundoPoker'
  WHEN 'superpoker' THEN 'SuperPokerBR'
  ELSE live_search_handle
END
WHERE id IN ('hand2note','pokertracker','holdem-manager','jurojin','gto-wizard','sharkscope','pokerstars','ggpoker','wpn-acr','partypoker','888poker','coinpoker','bodog','mundopoker','superpoker');

UPDATE news_sources SET query_template = 'Atualizacoes recentes da plataforma {{platform}} (perfil X oficial + site) nos ultimos 7 dias: novas versoes, features, mudancas, anuncios oficiais.'
WHERE category = 'market';

INSERT INTO news_sources (id, category, name, description, platform, live_search_handle, query_template) VALUES
  ('gto-wizard-studies', 'studies', 'GTO Wizard - Estudos', 'Artigos tecnicos e materiais de estudo do GTO Wizard (blog + perfil X).', 'gto-wizard', 'GTOWizard', 'Artigos tecnicos e materiais de estudo recentes publicados pelo GTO Wizard nos ultimos 30 dias (blog gtowizard.com + perfil X @GTOWizard). Foco: ranges, solucoes preflop/postflop, ICM, MTT theory, leak fixes.')
ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description, query_template=EXCLUDED.query_template, live_search_handle=EXCLUDED.live_search_handle, updated_at=now();
