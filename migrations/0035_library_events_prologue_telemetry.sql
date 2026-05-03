-- =============================================================================
-- Sprint Bloco-A-Polish / RF-09 + ADR-097
-- Adiciona valores 'prologue_viewed' e 'prologue_skipped' ao enum
-- library_event_type para telemetria do prologue Netflix.
--
-- Idempotente via IF NOT EXISTS (Postgres 12+; Grindfy roda 16).
-- ALTER TYPE ADD VALUE NAO pode rodar dentro de transacao em PG < 12;
-- em 12+ pode, e drizzle-kit push aplica fora de transacao automaticamente.
-- =============================================================================

ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_viewed';
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_skipped';

-- Rollback: nao ha. ALTER TYPE DROP VALUE nao existe em Postgres.
-- Caminho deprecate-forward: marcar como // DEPRECATED no shared/schema.ts e
-- futura migration adiciona check constraint que rejeita inserts (sem remover
-- o valor do enum em si).
