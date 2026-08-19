-- =============================================================================
-- ROLLBACK 0101 — Rebuy nao e Add-on (ADR-251)
--
-- Reconstroi o estado anterior a partir de `flags`, que a migration nao toca.
-- A regra antiga era: token rebuy -> allows_addon = TRUE -> tipo 'Add-on'
-- (quando nenhum sinal mais forte existia nas flags).
--
-- Perda aceita: linhas que JA nasceram com allows_addon = FALSE e tinham rebuy
-- (nao existiam no dado real — o parser antigo sempre ligava a flag) voltariam
-- marcadas. Reversao pratica, nao bit-a-bit.
-- =============================================================================

-- 1. Volta o tipo 'Add-on' para quem so tinha rebuy -------------------------
UPDATE tournaments
SET
  allows_addon = TRUE,
  type = 'Add-on',
  category = 'Add-on'
WHERE allows_rebuy = TRUE
  AND flags IS NOT NULL
  AND flags::text ILIKE '%rebuy%'
  AND flags::text NOT ILIKE '%satellite%'
  AND flags::text NOT ILIKE '%mystery%'
  AND flags::text NOT ILIKE '%bounty%'
  AND flags::text NOT ILIKE '%knockout%';

-- 2. allows_addon volta tambem para os que tem sinal mais forte -------------
-- (o tipo deles nunca foi 'Add-on', mas a flag era ligada pelo parser antigo)
UPDATE tournaments
SET allows_addon = TRUE
WHERE allows_rebuy = TRUE
  AND allows_addon = FALSE;

-- 3. Derruba o atributo -----------------------------------------------------
-- NAO restaura addon_cost: o valor era derivado (stake do torneio) e o
-- re-import/mapper repreenche. Deixar NULL e mais honesto que chutar.
ALTER TABLE tournaments
  DROP COLUMN IF EXISTS allows_rebuy;
