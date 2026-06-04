-- =============================================================================
-- 0094_goal_daily_logs — Metas 4DX: relatorio diario + datas de inicio/prazo
-- (ADR-241). Additive-only. Aplicar LOCAL (localhost:5433) + PROD (Neon) no deploy.
--
-- 1) goal_daily_logs: 1 relatorio/user/dia (chave UTC via ymdUtc). Estado leve
--    do "calendario de metas" — medidas exercidas no dia + nota + nº torneios +
--    horas/conteudo de estudo + aprendizado + o que fez de bom/ruim.
--    Sem CHECK DB nos enums (Zod-only, padrao 0088/0089). Nullable sem default
--    (lesson #7). UNIQUE (user_id, log_date) = idempotencia do upsert do dia.
--
-- 2) goals.start_date + goals.deadline: toda meta passa a ter inicio + prazo
--    EXPLICITOS. Antes a medida (goals) nao tinha deadline -> a pace line do
--    scoreboard saturava em target imediatamente (span<=0). Leitura usa
--    fallback start_date ?? created_at e deadline derivado do horizon quando null.
-- =============================================================================

CREATE TABLE IF NOT EXISTS goal_daily_logs (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  log_date date NOT NULL,
  measures_exercised jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  tournaments_played integer,
  study_hours numeric,
  study_content text,
  learning text,
  did_good text,
  did_bad text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT goal_daily_logs_user_date_unique UNIQUE (user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_goal_daily_logs_user_date
  ON goal_daily_logs (user_id, log_date);

-- datas de inicio/prazo explicitas nas metas (medidas). Nullable: legado e
-- back-fillado em leitura (start_date ?? created_at; deadline derivado do horizon).
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline date;
