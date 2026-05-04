// =============================================================================
// leakToTag — Sprint home-reform-4 / Item 4 (RF-04, ADR-113).
//
// Mapeia codigos de leak (emitidos por server/coachLeakDetection.ts) para
// arrays de tags da Biblioteca. Usado pelo fallback Tier 2 (leak->tag).
//
// Codigos reais que detectLeaks emite (auditoria 2026-05):
//   - roi_by_format (ROI negativo em formato especifico)
//   - weak_site (site com ROI ruim)
//   - early_bust (bust precoce em torneios)
//   - low_ft_conversion (baixa conversao em final table)
//   - declining_trend (tendencia ROI caindo)
//   - insufficient_volume (volume baixo)
//   - no_study (sem sessoes de estudo)
//
// Pode evoluir sem migration (TS).
// =============================================================================

export const LEAK_TO_TAGS: Record<string, string[]> = {
  // ROI negativo num formato (turbo/hyper/regular) — estrategias por formato
  roi_by_format: ["formato", "turbo-strategy", "hyper-strategy", "fundamentos"],
  // Site fraco — adaptacao de pool / variancia
  weak_site: ["fundamentos", "site-selection", "gestao-mental"],
  // Early bust — open-shoves, jogo early
  early_bust: ["fundamentos", "early-stage", "preflop"],
  // Final table — ICM, bubble, closer
  low_ft_conversion: ["ICM", "final-table", "bubble", "closer"],
  // Tendencia caindo — variancia + revisao
  declining_trend: ["gestao-mental", "fundamentos", "variancia"],
  // Volume baixo — disciplina
  insufficient_volume: ["disciplina", "volume", "rotina"],
  // Sem estudo — fundamentos
  no_study: ["fundamentos", "estudo", "rotina"],
  // Catch-all
  DEFAULT: ["fundamentos", "gestao-mental"],
};

export function getTagsForLeakCode(code: string): string[] {
  if (!code) return LEAK_TO_TAGS.DEFAULT;
  const key = String(code);
  if (Object.prototype.hasOwnProperty.call(LEAK_TO_TAGS, key)) {
    return LEAK_TO_TAGS[key];
  }
  return LEAK_TO_TAGS.DEFAULT;
}
