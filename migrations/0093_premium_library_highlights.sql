-- =============================================================================
-- 0093 — Biblioteca Premium curada (ADR-240).
--
-- 1) Tabela nova premium_library_highlights: vitrine GLOBAL de familias de
--    torneios promovidas por curadores (permissao premium_library_curate).
--    Espelha saved_tournament_highlights (snapshot site/family_key/group_name/
--    buy_in_tier/type/metrics/reasons) + rastreabilidade de curadoria
--    (source / curated_by / source_user_id / source_highlight_id).
-- 2) Seed da permissao premium_library_curate na tabela permissions, para que
--    apareca no PermissionManager (AdminUsers) e possa ser concedida via
--    user_permissions as 3 contas curadoras.
--
-- Dedup global: UNIQUE(family_key) — uma familia entra na Premium 1x (corrida
-- entre dois curadores resolvida no DB, nao so app-level). family_key ja embute
-- o site (formato 'site|...'); a coluna site e denormalizada so para o filtro ?site=.
--
-- Additive-only. SEM FK rigida (ownership/rastreabilidade app-level, padrao das
-- tabelas 0088-0092). source_user_id / source_highlight_id sao ponteiros frouxos:
-- snapshot e COPIA congelada, sobrevive ao delete/edicao da origem.
-- SEM CHECK em source (Zod-only, padrao do projeto).
-- =============================================================================

CREATE TABLE IF NOT EXISTS premium_library_highlights (
  id                   VARCHAR PRIMARY KEY NOT NULL,
  site                 VARCHAR NOT NULL,
  family_key           VARCHAR NOT NULL,
  group_name           VARCHAR,
  buy_in_tier          VARCHAR,
  type                 VARCHAR,
  metrics              JSONB,
  reasons              JSONB,
  source               VARCHAR NOT NULL DEFAULT 'library',  -- 'library' (promocao direta) | 'import' (painel cross-user)
  curated_by           VARCHAR NOT NULL,                    -- user_platform_id do curador
  source_user_id       VARCHAR,                             -- dono do highlight pessoal importado (so source='import')
  source_highlight_id  VARCHAR,                             -- id da row saved_tournament_highlights de origem (so source='import')
  created_at           TIMESTAMP NOT NULL DEFAULT now()
);

-- Dedup global da familia (chave de promocao unica + barreira de corrida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_premium_highlight_family ON premium_library_highlights (family_key);
-- Filtro por plataforma na faixa.
CREATE INDEX IF NOT EXISTS idx_premium_highlight_site ON premium_library_highlights (site);
-- Ordenacao default (created_at DESC).
CREATE INDEX IF NOT EXISTS idx_premium_highlight_created ON premium_library_highlights (created_at);

-- Seed idempotente da permissao no catalogo (id literal estavel; permissions.id
-- e varchar/nanoid no app — aqui usamos um id deterministico para idempotencia).
INSERT INTO permissions (id, name, description, created_at)
VALUES (
  'perm_premium_library_curate',
  'premium_library_curate',
  'Curar a Biblioteca Premium global de torneios (promover, remover, painel cross-user)',
  now()
)
ON CONFLICT (name) DO NOTHING;
