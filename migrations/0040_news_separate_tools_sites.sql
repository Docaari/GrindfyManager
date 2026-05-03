-- Migration 0040 — separa 'market' em 'tools' (softwares) + 'sites' (redes de poker).
-- Adiciona HRC (Holdem Resources Calculator).
-- Sprint News-1 ajuste pos-feedback founder 2026-05-03.

-- Re-categorizar tools (softwares de tracker/HUD/solver/registro).
UPDATE news_sources SET category = 'tools' WHERE id IN (
  'hand2note', 'pokertracker', 'holdem-manager', 'jurojin',
  'intuitive-table', 'gto-wizard', 'sharkscope'
);

-- Re-categorizar sites (redes de poker).
UPDATE news_sources SET category = 'sites' WHERE id IN (
  'pokerstars', 'ggpoker', 'wpn-acr', 'partypoker', '888poker',
  'coinpoker', 'bodog', 'chico', 'ipoker'
);

-- Adicionar HRC (Holdem Resources Calculator).
INSERT INTO news_sources (id, category, name, description, platform, live_search_handle, query_template) VALUES
  ('hrc', 'tools', 'HRC (Holdem Resources)', 'ICM solver / push-fold trainer', 'hrc', NULL,
   'Atualizacoes recentes do HRC (Holdem Resources Calculator) - icmizer.com - nos ultimos 7 dias: novas versoes, features, mudancas.')
ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description, query_template=EXCLUDED.query_template, updated_at=now();

-- Atualizar prompts: tools focam em features/versoes; sites focam em anuncios oficiais.
UPDATE news_sources SET query_template =
  'Atualizacoes recentes do software {{platform}} (perfil X oficial + site) nos ultimos 7 dias: novas versoes, features, bugfixes, integracoes.'
WHERE category = 'tools';

UPDATE news_sources SET query_template =
  'Anuncios oficiais da rede de poker {{platform}} (perfil X oficial + site) nos ultimos 7 dias: lancamentos, mudancas de software, promos, novas series de torneios. NAO incluir resultados de torneios individuais.'
WHERE category = 'sites';

-- Re-categorizar news_items existentes (limpa cache antiga).
DELETE FROM news_items WHERE category = 'market';
