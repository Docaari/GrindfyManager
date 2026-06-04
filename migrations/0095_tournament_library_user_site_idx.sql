-- =============================================================================
-- 0095 — Indices de suporte a dedup canonica da Biblioteca (ADR-200 Parte A).
--
-- A key canonica de dedup (libraryCanonicalKey) e calculada em memoria (nao e
-- coluna), entao a query de candidatos do auto-populate passa a ser COARSE por
-- (user_id, site). Este indice cobre essa busca em alto volume.
--
-- 1) idx_tournament_library_user_site (user_id, site): cobre a busca coarse do
--    auto-populate (ensureLibraryEntryForPlanned) e o sinal de lixeira (Fatia 5).
--    SEM clausula parcial WHERE deleted_at IS NULL DE PROPOSITO — o auto-populate
--    precisa enxergar entries trashed para o `skip` da D5 (respeita exclusao do
--    user). O idx_tournament_library_user_active existente (parcial em ativos)
--    continua servindo a tela Administrar / deteccao de grupos.
--
-- 2) idx_planned_tournaments_library_template (library_template_id) WHERE NOT NULL:
--    cobre o re-aponte da Grade no merge (Fatia 3) — UPDATE ... WHERE
--    library_template_id IN (...). Parcial porque a maioria das rows tem o link
--    nulo.
--
-- Aditivo, idempotente (IF NOT EXISTS), sem coluna nova.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tournament_library_user_site
  ON tournament_library (user_id, site);

CREATE INDEX IF NOT EXISTS idx_planned_tournaments_library_template
  ON planned_tournaments (library_template_id)
  WHERE library_template_id IS NOT NULL;
