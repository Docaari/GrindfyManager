-- =============================================================================
-- 0101 — Rebuy nao e Add-on (ADR-251)
--
-- Spec: Docs/specs/tournament-type-rebuy-vs-addon.md
--
-- A bandeira `Rebuy` do Sharkscope ligava `allows_addon` e promovia o torneio ao
-- tipo primario 'Add-on'. Resultado no dado real: 4307 linhas classificadas como
-- Add-on sendo que NENHUMA tem add-on de verdade (zero linhas com token `add*`
-- em `flags`). Isso contamina a familia da Biblioteca, o ROI por tipo, o
-- dashboard, o Selector e o contexto do Coach.
--
-- O backfill e DETERMINISTICO, nao heuristico: `flags` preservou o token
-- original em 100% das linhas afetadas, e e ele quem decide.
--
-- Additive + corretivo. Reversivel via _rollback.sql enquanto `flags` existir.
-- =============================================================================

-- 1. Atributo proprio -------------------------------------------------------
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS allows_rebuy BOOLEAN DEFAULT FALSE;

-- 2. Marca quem tem rebuy, independente do tipo gravado ---------------------
-- Cobre tambem as linhas que ja estavam com o tipo certo (PKO/Satellite com
-- rebuy): o atributo passa a existir para todas elas.
UPDATE tournaments
SET allows_rebuy = TRUE
WHERE flags IS NOT NULL
  AND flags::text ILIKE '%rebuy%';

-- 3. Reclassifica o que so era 'Add-on' por causa do rebuy ------------------
-- Condicao estrita: tipo Add-on + tem token rebuy + NAO tem token de add-on.
-- O tipo novo respeita a precedencia Satellite > Mystery > PKO > Vanilla lida
-- das proprias flags, para nao rebaixar um satelite com rebuy a Vanilla.
UPDATE tournaments
SET
  allows_addon = FALSE,
  type = CASE
    WHEN flags::text ILIKE '%satellite%'  THEN 'Satellite'
    WHEN flags::text ILIKE '%mystery%'    THEN 'Mystery'
    WHEN flags::text ILIKE '%bounty%'
      OR flags::text ILIKE '%knockout%'   THEN 'PKO'
    ELSE 'Vanilla'
  END,
  category = CASE
    WHEN flags::text ILIKE '%satellite%'  THEN 'Satellite'
    WHEN flags::text ILIKE '%mystery%'    THEN 'Mystery'
    WHEN flags::text ILIKE '%bounty%'
      OR flags::text ILIKE '%knockout%'   THEN 'PKO'
    ELSE 'Vanilla'
  END
WHERE type = 'Add-on'
  AND flags IS NOT NULL
  AND flags::text ILIKE '%rebuy%'
  AND flags::text NOT ILIKE '%add-on%'
  AND flags::text NOT ILIKE '%addon%';

-- 4. addon_cost pendurado nas linhas reclassificadas ------------------------
-- O mapper preenchia addon_cost sempre que allows_addon era true; sem add-on
-- esse custo nao existe.
UPDATE tournaments
SET addon_cost = NULL
WHERE allows_addon = FALSE
  AND addon_cost IS NOT NULL
  AND addon_taken IS NOT TRUE;
