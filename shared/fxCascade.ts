// =============================================================================
// fxCascade — Sprint AI-2B / RF-04 (ADR-169 §2.6)
//
// Helpers de FX para conversão USD/BRL no Quarterly Report (IRPF) + compute_irpf
// _summary tool. Multi-source: BCB (PTAX) preferred → frankfurter fallback.
// Cache 24h in-memory.
//
// Lessons aplicadas:
//   - #9 — log antes do fallback.
//   - DRY — shared, mockável via vi.doMock.
// =============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _cache: Map<string, { value: number; expiresAt: number }> = new Map();

function cacheKey(from: string, to: string): string {
  return `avgPtax|${from}|${to}`;
}

/**
 * Calcula a média simples dos rates PTAX do BCB no range [from, to].
 * Fallback: frankfurter se BCB falhar OU retornar array vazio.
 * Throw 'no_fx_data' se ambos retornarem vazio.
 */
export async function getAveragePtaxForRange(from: string, to: string): Promise<number> {
  const key = cacheKey(from, to);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let bcbRates: Array<{ value: number }> | null = null;
  try {
    const bcb: any = await import("./fx/bcbClient");
    const fn = bcb.fetchBcbRatesForRange ?? bcb.default?.fetchBcbRatesForRange;
    if (typeof fn === "function") {
      bcbRates = await fn(from, to);
    }
  } catch (err) {
    console.error("fxCascade.bcb.error", { from, to, err: err instanceof Error ? err.message : String(err) });
    bcbRates = null;
  }

  if (Array.isArray(bcbRates) && bcbRates.length > 0) {
    const sum = bcbRates.reduce((acc, r) => acc + Number(r?.value ?? 0), 0);
    const avg = sum / bcbRates.length;
    _cache.set(key, { value: avg, expiresAt: Date.now() + CACHE_TTL_MS });
    return avg;
  }

  // Fallback frankfurter.
  let frankRates: Array<{ value: number }> | null = null;
  try {
    const frank: any = await import("./fx/frankfurterClient");
    const fn = frank.fetchFrankfurterRatesForRange ?? frank.default?.fetchFrankfurterRatesForRange;
    if (typeof fn === "function") {
      frankRates = await fn(from, to);
    }
  } catch (err) {
    console.error("fxCascade.frankfurter.error", { from, to, err: err instanceof Error ? err.message : String(err) });
    frankRates = null;
  }

  if (Array.isArray(frankRates) && frankRates.length > 0) {
    const sum = frankRates.reduce((acc, r) => acc + Number(r?.value ?? 0), 0);
    const avg = sum / frankRates.length;
    _cache.set(key, { value: avg, expiresAt: Date.now() + CACHE_TTL_MS });
    return avg;
  }

  throw new Error("no_fx_data");
}

export const fxCascade = {
  getAveragePtaxForRange,
};

/** Reset helper para testes. */
export function _resetFxCascadeCacheForTests(): void {
  _cache.clear();
}
