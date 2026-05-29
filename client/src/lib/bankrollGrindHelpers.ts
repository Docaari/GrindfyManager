/**
 * Bankroll helpers para Grind Live (RF-08)
 *
 * Funcoes puras — extraidas de GrindSessionLive.tsx para permitir testes unit.
 * Mesmo algoritmo usado pelo componente, para que os testes cubram de fato a
 * logica que afeta o usuario.
 */

export const SESSION_BANKROLL_WARNING_PCT = 0.1;

export interface BankrollStateLike {
  configured: boolean;
  amount: number | null;
  maxBuyInUSD?: number | null;
  hardLimitUSD?: number | null;
  softLimitUSD?: number | null;
  maxBuyInDisplay?: { USD: number | null; BRL?: number };
}

/**
 * Normaliza buy-in para USD. Suprema = BRL; demais sites tratados como USD.
 * Fail-open: se taxa nao pode ser inferida, retorna raw (assume 1:1).
 */
export function normalizeBuyInToUSD(
  buyIn: number | string,
  site: string,
  bankroll: BankrollStateLike | undefined | null,
): number {
  const raw = typeof buyIn === "string" ? parseFloat(buyIn) : buyIn;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (site !== "Suprema") return raw;

  const usdToBrl =
    bankroll?.maxBuyInUSD != null &&
    bankroll?.maxBuyInDisplay?.BRL != null &&
    bankroll.maxBuyInUSD > 0
      ? bankroll.maxBuyInDisplay.BRL / bankroll.maxBuyInUSD
      : undefined;
  if (usdToBrl && usdToBrl > 0) return raw / usdToBrl;
  return raw;
}

export type BankrollDecision =
  | { kind: "pass" }
  | { kind: "warn-soft"; buyInUSD: number }
  | { kind: "block-hard"; buyInUSD: number; hardLimitUSD: number };

/**
 * Aplica regra de banca a um buy-in. Retorna decisao para o UI renderizar.
 * Se bankroll nao configurado, sempre 'pass' (feature transparente).
 *
 * @deprecated O ultimo consumer (Bankroll Shot Modal em GrindSessionLive) foi
 * removido no sprint bankroll-toggle-audit-and-shot-removal. A funcao permanece
 * exportada apenas por back-compat (Q-E, deprecacao gradual — lesson §10.7) e
 * candidata a delecao quando os testes de helper forem reavaliados. Nao adicionar
 * novos consumers: o bloqueio rigido por hard limit (`block-hard`) foi descontinuado.
 */
export function decideBankrollAction(
  buyIn: number | string,
  site: string,
  bankroll: BankrollStateLike | undefined | null,
): BankrollDecision {
  if (!bankroll?.configured) return { kind: "pass" };
  const buyInUSD = normalizeBuyInToUSD(buyIn, site, bankroll);
  if (buyInUSD <= 0) return { kind: "pass" };

  const hardLimit = bankroll.hardLimitUSD ?? bankroll.maxBuyInUSD ?? null;
  const softLimit = bankroll.softLimitUSD ?? null;

  if (hardLimit != null && buyInUSD > hardLimit) {
    return { kind: "block-hard", buyInUSD, hardLimitUSD: hardLimit };
  }
  if (softLimit != null && buyInUSD > softLimit) {
    return { kind: "warn-soft", buyInUSD };
  }
  return { kind: "pass" };
}

/**
 * Dado o accumulator da sessao + novo buy-in, retorna se deve disparar
 * warning de 10% (spec Q5).
 */
export function shouldWarnAccumulator(
  previousAccumulatorUSD: number,
  newBuyInUSD: number,
  bankrollAmount: number | null,
): { warn: boolean; newAccumulator: number; pctExposed: number } {
  const newAccumulator = previousAccumulatorUSD + newBuyInUSD;
  if (!bankrollAmount || bankrollAmount <= 0) {
    return { warn: false, newAccumulator, pctExposed: 0 };
  }
  const pctExposed = newAccumulator / bankrollAmount;
  return {
    warn: pctExposed > SESSION_BANKROLL_WARNING_PCT,
    newAccumulator,
    pctExposed,
  };
}

/**
 * Tiers discretos para throttle de avisos de bankroll exposure (UX
 * 2026-04-24 — GL-E). Valores sao porcentagens inteiras (10 = 10%).
 *
 * Uso: armazene o ultimo tier ja notificado. Avise apenas quando o novo
 * tier for maior (cruzou um limite qualitativo, nao ruido de 1%).
 */
export const BANKROLL_WARNING_TIERS = [10, 15, 25, 50] as const;
export type BankrollWarningTier = (typeof BANKROLL_WARNING_TIERS)[number];

/**
 * Dada uma porcentagem de exposure em [0..1], retorna o maior tier
 * em BANKROLL_WARNING_TIERS que foi atravessado. Retorna 0 se nenhum.
 */
export function getCurrentBankrollTier(pctExposed: number): number {
  if (!Number.isFinite(pctExposed) || pctExposed <= 0) return 0;
  const pct = pctExposed * 100;
  let highest = 0;
  for (const tier of BANKROLL_WARNING_TIERS) {
    if (pct >= tier) highest = tier;
  }
  return highest;
}

/**
 * Decide se deve disparar warning dado:
 *  - tier atual (derivado de pctExposed)
 *  - tier ja alertado (lastAlertedTier)
 *
 * Retorna {shouldWarn, newTier}. Se shouldWarn, chamador deve atualizar
 * seu lastAlertedTier com newTier e disparar o toast.
 */
export function shouldWarnForTier(
  pctExposed: number,
  lastAlertedTier: number,
): { shouldWarn: boolean; newTier: number } {
  const newTier = getCurrentBankrollTier(pctExposed);
  return {
    shouldWarn: newTier > 0 && newTier > lastAlertedTier,
    newTier,
  };
}
