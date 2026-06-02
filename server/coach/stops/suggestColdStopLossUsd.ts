/**
 * Fase D #5 — Stop-loss cold-commit (RF-02, ADR-235 D-2).
 *
 * LOW-1 layering: a implementação canônica vive em `shared/stops/suggestColdStopLossUsd`
 * (consumida por client + server). Este módulo re-exporta para back-compat de imports
 * existentes (`server/coach/stops/...`) sem duplicar a regra.
 */

export {
  suggestColdStopLossUsd,
  type ColdStopSuggestion,
} from "../../../shared/stops/suggestColdStopLossUsd";
