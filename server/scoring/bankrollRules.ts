/**
 * Bankroll Rules — Funcoes puras (Sprint 2)
 *
 * Fonte: docs/specs/bankroll-management.md (RF-01, RF-02, RF-10)
 *        docs/architecture/decisions/018-bankroll-tolerance-hardcoded.md
 *
 *   export const BANKROLL_TOLERANCE = 1.5
 *   export function parseRule(rule):
 *     { pct: number; valid: boolean; raw: string }
 *   export function computeThresholds({ amount, rule }):
 *     { softLimitUSD, hardLimitUSD, maxBuyInUSD, rulePct }
 *
 * Regras pre-definidas: "1pct" (1%), "2pct" (2%), "5pct" (5%).
 * Regras custom: "custom:<pct>" com pct em [0.1, 20] e ate 1 casa decimal.
 *
 * Invariante: hardLimit = softLimit * BANKROLL_TOLERANCE.
 */

export const BANKROLL_TOLERANCE = 1.5;

const PRESET_RULES: Record<string, number> = {
  "1pct": 1.0,
  "2pct": 2.0,
  "5pct": 5.0,
};

const CUSTOM_RULE_PREFIX = "custom:";
const CUSTOM_MIN = 0.1;
const CUSTOM_MAX = 20;

/**
 * Parseia string de rule e retorna a porcentagem. Nao aplica fallback — caller
 * (bankrollService) decide se usa 1pct como default.
 */
export function parseRule(rule: string | null | undefined): {
  pct: number;
  valid: boolean;
  raw: string;
} {
  const raw = rule ?? "";

  if (raw in PRESET_RULES) {
    return { pct: PRESET_RULES[raw], valid: true, raw };
  }

  if (typeof raw !== "string" || !raw.startsWith(CUSTOM_RULE_PREFIX)) {
    return { pct: NaN, valid: false, raw };
  }

  const valueStr = raw.slice(CUSTOM_RULE_PREFIX.length);
  if (valueStr === "") {
    return { pct: NaN, valid: false, raw };
  }

  // Valida formato: permite inteiro ou decimal com ate 1 casa (spec Q2).
  // Rejeita multi-dot, letras, etc.
  const decimalRegex = /^-?\d+(?:\.\d)?$/;
  if (!decimalRegex.test(valueStr)) {
    return { pct: NaN, valid: false, raw };
  }

  const n = parseFloat(valueStr);
  if (!Number.isFinite(n)) {
    return { pct: NaN, valid: false, raw };
  }

  if (n < CUSTOM_MIN || n > CUSTOM_MAX) {
    return { pct: n, valid: false, raw };
  }

  return { pct: n, valid: true, raw };
}

export function computeThresholds(args: {
  amount: number | null;
  rule: string;
}): {
  softLimitUSD: number | null;
  hardLimitUSD: number | null;
  maxBuyInUSD: number | null;
  rulePct: number;
} {
  const parsed = parseRule(args.rule);
  const pct = parsed.valid ? parsed.pct : PRESET_RULES["1pct"]; // Fallback RF-01

  if (args.amount == null) {
    return {
      softLimitUSD: null,
      hardLimitUSD: null,
      maxBuyInUSD: null,
      rulePct: pct,
    };
  }

  const softLimitUSD = args.amount * (pct / 100);
  const hardLimitUSD = softLimitUSD * BANKROLL_TOLERANCE;

  return {
    softLimitUSD,
    hardLimitUSD,
    maxBuyInUSD: hardLimitUSD, // alias historico (ADR-018)
    rulePct: pct,
  };
}
