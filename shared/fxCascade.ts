// =============================================================================
// fxCascade — Sprint AI-2B / RF-04 (ADR-169 §2.6)
// Sprint AI-3 / RF-02 (ADR-174 §2.2) — wire real para adapters de produção.
//
// Helpers de FX para conversão USD/BRL no Quarterly Report (IRPF) + compute_irpf
// _summary tool. Multi-source: BCB (PTAX) preferred → frankfurter fallback.
// Cache 24h in-memory.
//
// Shape FxRow do adapter: { currency, date, ratePerUsd, source }.
// AI-3 RF-02: filtra BRL no resultado de frankfurter (que aceita N symbols),
// mapeia ratePerUsd → media.
//
// Lessons aplicadas:
//   - #9 — log antes do fallback (FxFetchError do BCB cai pro Frankfurter).
//   - #3 — mock shape REAL do adapter (FxRow, não {value} legado).
// =============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _cache: Map<string, { value: number; expiresAt: number }> = new Map();

function cacheKey(from: string, to: string): string {
  return `avgPtax|${from}|${to}`;
}

type AdapterRow = { currency?: string; date?: string; ratePerUsd?: number; source?: string };

function avgRatePerUsd(rows: AdapterRow[]): number {
  const valid = rows
    .map((r) => Number(r?.ratePerUsd))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return NaN;
  const sum = valid.reduce((acc, n) => acc + n, 0);
  return sum / valid.length;
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

  // 1) BCB PTAX adapter (autoridade para IRPF brasileiro).
  let bcbRows: AdapterRow[] | null = null;
  try {
    const bcb: any = await import("../server/services/fx/adapters/bcbPtaxAdapter");
    const fn = bcb.fetchTimeseriesBrl ?? bcb.bcbPtaxAdapter?.fetchTimeseriesBrl ?? bcb.default?.fetchTimeseriesBrl;
    if (typeof fn === "function") {
      bcbRows = await fn(from, to);
    }
  } catch (err) {
    // Lesson #9: log ANTES do fallback (distingue API down de vazio).
    console.error("fxCascade.bcb.error", { from, to, err: err instanceof Error ? err.message : String(err) });
    bcbRows = null;
  }

  if (Array.isArray(bcbRows) && bcbRows.length > 0) {
    const avg = avgRatePerUsd(bcbRows);
    if (Number.isFinite(avg) && avg > 0) {
      _cache.set(key, { value: avg, expiresAt: Date.now() + CACHE_TTL_MS });
      return avg;
    }
  }

  // 2) Fallback Frankfurter (ECB rates — útil em weekend/holiday).
  let frankRows: AdapterRow[] | null = null;
  try {
    const frank: any = await import("../server/services/fx/adapters/frankfurterAdapter");
    const fn = frank.fetchTimeseries ?? frank.frankfurterAdapter?.fetchTimeseries ?? frank.default?.fetchTimeseries;
    if (typeof fn === "function") {
      // adapter aceita symbols variádico — passa ['BRL'] como 3o arg.
      frankRows = await fn(from, to, ["BRL"]);
    }
  } catch (err) {
    console.error("fxCascade.frankfurter.error", { from, to, err: err instanceof Error ? err.message : String(err) });
    frankRows = null;
  }

  if (Array.isArray(frankRows) && frankRows.length > 0) {
    // Filtra currency==='BRL' (frankfurter pode retornar mix se chamado sem filtrar).
    const brlOnly = frankRows.filter((r) => String(r?.currency ?? "").toUpperCase() === "BRL");
    if (brlOnly.length > 0) {
      const avg = avgRatePerUsd(brlOnly);
      if (Number.isFinite(avg) && avg > 0) {
        _cache.set(key, { value: avg, expiresAt: Date.now() + CACHE_TTL_MS });
        return avg;
      }
    }
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
