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
