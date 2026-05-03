-- Migration 0037: registration_time column on session_tournaments,
-- planned_tournaments, tournament_library.
--
-- Founder convention 2026-05-03: usuario define horario de registro
-- intencional por torneio (HH:MM); /grind-live ordena/agrupa por esse
-- campo, fallback time + late_reg_minutes.

ALTER TABLE session_tournaments
  ADD COLUMN IF NOT EXISTS registration_time VARCHAR;

ALTER TABLE planned_tournaments
  ADD COLUMN IF NOT EXISTS registration_time VARCHAR;

ALTER TABLE tournament_library
  ADD COLUMN IF NOT EXISTS registration_time VARCHAR;
