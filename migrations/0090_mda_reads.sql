-- =============================================================================
-- Migration 0090 — MDA-1 Registro de MDA / Tendencias da Populacao (ADR-230)
--
-- Cria 2 tabelas:
--   * mda_reads        — card de referencia da tendencia da populacao (exploit
--                        do field) num spot. SEM duracao/XP (NAO e sessao, NAO e
--                        mode em study_sessions_v2). Soft delete via deleted_at.
--   * mda_read_themes  — junction N:N (1 MDA → N temas), espelha
--                        study_theme_spot_links. UNIQUE (mda_read_id, theme_id)
--                        garante idempotencia da tag (re-tagear nao duplica).
--
-- Convencoes (CLAUDE.md §6/§10):
--   * Enums Zod-only, SEM CHECK DB (validacao em shared/mda.ts).
--   * Colunas opcionais nullable SEM default (lesson #7) — back-fill = o proprio
--     NULL; tabelas nascem vazias, sem back-fill.
--   * SEM FK rigida — ownership validado em app por user_id (espelha 0088/0089).
--   * PKs via nanoid() (varchar), nunca auto-increment.
--   * Cleanup de tags orfas no delete do tema e APP-LEVEL (sem FK / ON DELETE):
--     storage.deleteTheme faz DELETE FROM mda_read_themes WHERE theme_id=? .
--
-- APLICAR via psql local (localhost:5433) / db:push na finalizacao; PENDENTE PROD
-- (Neon) no deploy — documentar em CLAUDE.md §6 (mesmo padrao das 0086/0087/0088/
-- 0089). Sem ela em PROD: criar/ler/tagear MDA falha (tabela ausente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela mda_reads — o artefato (card de referencia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mda_reads (
  id            varchar       PRIMARY KEY,              -- nanoid()
  user_id       varchar       NOT NULL,                 -- ownership app-level
  title         varchar(120)  NOT NULL,                 -- rotulo curto
  spot_context  varchar(200),                           -- posicao+acao (texto livre, opt)
  filters       text,                                   -- filtros do banco (max 500 Zod, opt)
  tendency_text text,                                   -- tendencia + como explorar (max 2000 Zod, opt)
  stat_id       varchar(64),                            -- catalog id OU custom_*; NAO FK; opt
  images        jsonb,                                  -- MdaImage[] [{id,key,caption}] cap 8; opt
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  deleted_at    timestamptz                             -- soft delete (nullable)
);

-- Query "MDAs do user" (biblioteca opcional fase 2) — cobre o filtro de soft delete.
CREATE INDEX IF NOT EXISTS idx_mda_reads_user
  ON mda_reads (user_id, deleted_at);

-- -----------------------------------------------------------------------------
-- Tabela mda_read_themes — junction N:N (espelha study_theme_spot_links)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mda_read_themes (
  mda_read_id  varchar      NOT NULL,
  theme_id     varchar      NOT NULL,
  user_id      varchar      NOT NULL,                   -- denormalizado p/ filtro ownership
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT mda_read_themes_read_theme_unique
    UNIQUE (mda_read_id, theme_id)                      -- idempotencia da tag
);

-- Query "MDAs por tema" (QUENTE — ThemeDetailView + painel de estudo).
CREATE INDEX IF NOT EXISTS idx_mda_read_themes_theme
  ON mda_read_themes (user_id, theme_id);

-- Lookup das tags de 1 read (montar themeIds no GET detalhe + diff no PATCH).
CREATE INDEX IF NOT EXISTS idx_mda_read_themes_read
  ON mda_read_themes (mda_read_id);

-- FK opcional para users/study_themes — mantida FORA do CREATE (convencao do
-- projeto: varchar user ids, app valida ownership). Se desejado em PROD:
--   ALTER TABLE mda_reads
--     ADD CONSTRAINT mda_reads_user_fk
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
--   ALTER TABLE mda_read_themes
--     ADD CONSTRAINT mda_read_themes_read_fk
--     FOREIGN KEY (mda_read_id) REFERENCES mda_reads(id) ON DELETE CASCADE;
-- NB: mesmo com FK p/ study_themes, o cleanup de tags no delete do tema continua
-- app-level (deleteTheme), por paridade com 0088/0089 (sem FK rigida).
