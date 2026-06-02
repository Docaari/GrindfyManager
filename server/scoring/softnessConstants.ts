/**
 * Fase F #12 — Game Selection Score (softness) — constantes (ADR-237 D-2/D-3).
 *
 * Pesos, thresholds, regex e allowlist do detector de softness. Arquivo NOVO,
 * dedicado: NAO tocar `scoringConstants.ts` (caminho calibrado do scorer — D-6).
 *
 * Calibracao v1 (D-2-calibracao): todos os numeros sao PROPOSTAS sem ground
 * truth real de softness; ajuste fino fica para a fase F.1.
 */

/**
 * Threshold do overlay: `guaranteedUSD / buyInUSD >= 100` dispara o indicador.
 */
export const SOFTNESS_OVERLAY_RATIO_THRESHOLD = 100;

/**
 * Allowlist de redes com cross-sell de aposta esportiva conhecido (influxo
 * recreacional). Match contra `built.sct.site`. Inclui variantes porque o
 * `site` cru varia por fonte. Suprema NAO incluida (rede BR de poker puro) —
 * decisao de produto v1, pendente aval do founder.
 */
// NÃO "deduplicar": mistura PROPOSITAL de duas origens de `site`. O parser
// (csvParser.ts) grava `GGPoker`/`888poker`/`PokerStars`/`PartyPoker` (library);
// o enum de wallet (WALLET_PLATFORMS) usa `GGNetwork`/`888`. Ambos chegam ao
// detector via campos distintos — manter os dois cobre os dois caminhos.
export const SOFTNESS_SPORTSBOOK_SITES: string[] = [
  "GGNetwork",
  "GGPoker",
  "PokerStars",
  "888poker",
  "888",
  "PartyPoker",
];

/**
 * Pesos por indicador (soma maxima teorica = 100, sem renormalizacao).
 * overlay 30 + prime-nobre 25 + sportsbook 15 + satelite 15 + multiday 10 +
 * regional 5 = 100. Prime-time conta UMA vez (nobre OU cedo, mutuamente
 * exclusivos pelo bucket).
 */
export const SOFTNESS_WEIGHTS = {
  overlay: 30,
  primetimeNobre: 25,
  primetimeCedo: 10,
  sportsbook: 15,
  satellite: 15,
  multiday: 10,
  regional: 5,
} as const;

/** Tiers por score: mole >= 50, medio >= 25, senao duro. */
export const SOFTNESS_TIER_MOLE_THRESHOLD = 50;
export const SOFTNESS_TIER_MEDIO_THRESHOLD = 25;

/**
 * Regex de nome (D-3) — aplicados sobre o `name` JA normalizado (stripAccents +
 * lowercase). Risco de falso-positivo aceito (D-7): proxies de nome carregam
 * confidence='weak'.
 */
export const SOFTNESS_SATELLITE_RE =
  /(satelit|satellite|\bsat\b|qualif|\bqualy\b|\bstep\b|\bseat\b|ticket|classificat)/;
export const SOFTNESS_MULTIDAY_RE = /(day\s?1\b|\bd1\b|\b1[ab]\b|flight|multi.?day)/;
export const SOFTNESS_REGIONAL_RE =
  /(brasil|brazil|\bbr\b|latam|americas|nacional|regional|\bsa\b|sul.?americ)/;
