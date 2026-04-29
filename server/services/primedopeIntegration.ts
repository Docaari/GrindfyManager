// =============================================================================
// Sprint F4 W0/W1 — primedopeIntegration.ts
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-04, RF-08, RF-09, RF-12)
// ADR-054: PrimeDope external provider + cache 30min + fallback 24h + retry 1x
//          + semaphore inline max=3 + telemetria + interface plugavel.
// ADR-033: FX cascata users.exchangeRates > wallets.exchangeRates > constantes.
// ADR-055: tracker.emit(event, payload) telemetria.
//
// Interface plugavel: quando engine nativo (Sprint F5+) entrar, trocar so a
// implementacao de runSimulation mantendo a mesma assinatura.
// =============================================================================

import crypto from "crypto";
import { nanoid } from "nanoid";
import { storage } from "../storage";
import { walletService } from "./walletService";
import { emit as trackerEmit } from "../utils/tracker";
import {
  FX_FALLBACK_CONSTANTS,
  PRIMEDOPE_LIMITS,
} from "../../shared/primedopeDefaults";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SimulationBucket {
  name: string;
  network: string;
  count: number;
  buyinOriginal: number;
  currency: string;
  playersAvg: number;
  placesPaid: number;
  rakePct: number;
  roiPct: number;
  walletMissing?: boolean;
  // post-FX (preenchido internamente)
  buyinUsd?: number;
}

export interface SimulationInput {
  userId: string;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  multiplier: 1 | 4 | 12 | 52;
  bankrollUsd: number;
  buckets: SimulationBucket[];
  force?: boolean;
}

export interface SimulationResult {
  source: "primedope" | "cache" | "fallback-stale";
  data: any;
  histogramUrl?: string;
  randomRunsUrl?: string;
  latencyMs: number;
  inputHash?: string;
  runId?: string;
  cacheHit?: boolean;
  staleAgeMs?: number;
  pinned?: boolean;
  cachedAtMs?: number;
}

export interface PrimedopeError extends Error {
  code?: string;
  errorType?: string;
  statusCode?: number;
  inputHash?: string;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// PrimeDope HTTP endpoint
// ---------------------------------------------------------------------------

const PRIMEDOPE_URL =
  process.env.PRIMEDOPE_URL ??
  "https://www.primedope.com/prime.php?p=tournament-variance-calculator";

// ---------------------------------------------------------------------------
// Semaphore inline (max=3)
// ---------------------------------------------------------------------------

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      // Mantem permit ocupado ao passar pro proximo
      next();
      return;
    }
    this.permits++;
  }
}

const semaphore = new Semaphore(PRIMEDOPE_LIMITS.CONCURRENT_FETCHES);

// ---------------------------------------------------------------------------
// FX cascade: users.exchangeRates > wallets[active] > FX_FALLBACK_CONSTANTS
// ---------------------------------------------------------------------------

async function resolveExchangeRates(
  userId: string,
): Promise<Record<string, number>> {
  // 1. user-level
  let userSettings: any = null;
  try {
    userSettings = await (storage as any).getUserSettings(userId);
  } catch {
    userSettings = null;
  }
  const userRates = userSettings?.exchangeRates;
  if (userRates && typeof userRates === "object") {
    const keys = Object.keys(userRates);
    if (keys.length > 0) {
      return { ...FX_FALLBACK_CONSTANTS, ...userRates };
    }
  }

  // 2. wallets-level
  let wallets: any[] = [];
  try {
    wallets = (await (storage as any).listWalletsByUser(userId)) ?? [];
  } catch {
    wallets = [];
  }
  for (const w of wallets) {
    if (!w) continue;
    const wRates = w.exchangeRates;
    if (wRates && typeof wRates === "object" && Object.keys(wRates).length > 0) {
      return { ...FX_FALLBACK_CONSTANTS, ...wRates };
    }
  }

  // 3. fallback constante
  return { ...FX_FALLBACK_CONSTANTS };
}

function nativeToUsd(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (!currency || currency === "USD") return amount;
  const rate = rates[currency];
  if (typeof rate === "number" && rate > 0) {
    // ADR-033: usd = native / rate
    return amount / rate;
  }
  // Sem rate confiavel — retorna 0 (deterministico, nao crash)
  return 0;
}

// ---------------------------------------------------------------------------
// Hash determinista do input (sha256 hex)
// ---------------------------------------------------------------------------

function computeInputHash(payload: any): string {
  const json = JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

function buildHashableInput(
  input: SimulationInput,
  bucketsWithUsd: SimulationBucket[],
  fxRatesUsed: Record<string, number>,
): any {
  return {
    profileLetter: input.profileLetter,
    dayOfWeek: input.dayOfWeek,
    multiplier: input.multiplier,
    bankrollUsd: input.bankrollUsd,
    buckets: bucketsWithUsd.map((b) => ({
      name: b.name,
      network: b.network,
      count: b.count,
      currency: b.currency,
      buyinOriginal: b.buyinOriginal,
      buyinUsd: b.buyinUsd,
      playersAvg: b.playersAvg,
      placesPaid: b.placesPaid,
      rakePct: b.rakePct,
      roiPct: b.roiPct,
    })),
    fxRatesUsed,
  };
}

// ---------------------------------------------------------------------------
// Fetch PrimeDope com timeout + retry (5xx) — SEM retry em 4xx
// ---------------------------------------------------------------------------

async function fetchPrimedopeOnce(payload: any): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(),
    PRIMEDOPE_LIMITS.FETCH_TIMEOUT_MS,
  );
  try {
    const res = await fetch(PRIMEDOPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) {
      const err: PrimedopeError = new Error(
        `PrimeDope upstream HTTP ${res.status}`,
      );
      err.statusCode = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPrimedopeWithRetry(payload: any): Promise<any> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= PRIMEDOPE_LIMITS.RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchPrimedopeOnce(payload);
    } catch (err: any) {
      lastError = err;
      const status = err?.statusCode;
      const isAbort = err?.name === "AbortError";
      // 4xx fatal — sem retry
      if (typeof status === "number" && status >= 400 && status < 500) {
        throw err;
      }
      // 5xx ou timeout: retry se ainda ha tentativa
      if (attempt < PRIMEDOPE_LIMITS.RETRY_MAX_ATTEMPTS) {
        await new Promise((r) =>
          setTimeout(r, PRIMEDOPE_LIMITS.RETRY_BACKOFF_MS),
        );
        continue;
      }
      // Esgotou tentativas
      throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// runSimulation — entrypoint principal
// ---------------------------------------------------------------------------

export async function runSimulation(
  input: SimulationInput,
): Promise<SimulationResult> {
  const startedAt = Date.now();

  // 1. FX cascade --------------------------------------------------------------
  const fxRatesUsed = await resolveExchangeRates(input.userId);

  // 2. Conversao buyinOriginal -> buyinUsd ------------------------------------
  const bucketsWithUsd: SimulationBucket[] = input.buckets.map((b) => ({
    ...b,
    buyinUsd: nativeToUsd(b.buyinOriginal, b.currency, fxRatesUsed),
  }));

  // 3. Hash input pos-FX ------------------------------------------------------
  const hashableInput = buildHashableInput(input, bucketsWithUsd, fxRatesUsed);
  const inputHash = computeInputHash(hashableInput);

  // 4. Cache lookup (30min) ---------------------------------------------------
  if (!input.force) {
    try {
      const cached = await (storage as any).findRecentPrimedopeRunByHash(
        inputHash,
        PRIMEDOPE_LIMITS.CACHE_TTL_MS / 60_000,
      );
      if (cached) {
        const cachedAt =
          cached.createdAt instanceof Date
            ? cached.createdAt.getTime()
            : new Date(cached.createdAt).getTime();
        const result: SimulationResult = {
          source: "cache",
          data: cached.resultJson ?? cached.result_json ?? {},
          histogramUrl: cached.histogramPath ?? cached.histogram_path,
          randomRunsUrl: cached.randomRunsPath ?? cached.random_runs_path,
          latencyMs: Date.now() - startedAt,
          inputHash,
          runId: cached.id,
          cacheHit: true,
          cachedAtMs: cachedAt,
          pinned: cached.pinned,
        };
        try {
          trackerEmit("primedope_simulation_run", {
            userId: input.userId,
            profileLetter: input.profileLetter,
            dayOfWeek: input.dayOfWeek,
            cacheHit: true,
            source: "cache",
            inputHash,
            latencyMs: result.latencyMs,
          });
        } catch {}
        return result;
      }
    } catch {
      // segue para fetch externo
    }
  }

  // 5. Semaphore + fetch externo + retry --------------------------------------
  await semaphore.acquire();
  try {
    let raw: any;
    try {
      raw = await fetchPrimedopeWithRetry(hashableInput);
    } catch (err: any) {
      const status = err?.statusCode;
      const isAbort = err?.name === "AbortError";

      // 4xx — fatal, sem fallback
      if (typeof status === "number" && status >= 400 && status < 500) {
        const e: PrimedopeError = new Error(
          `PRIMEDOPE upstream 4xx (${status}) — provavel schema change.`,
        );
        e.code = "UPSTREAM_4XX";
        e.errorType = "upstream_4xx_schema_change";
        e.statusCode = status;
        e.inputHash = inputHash;
        try {
          trackerEmit("primedope_simulation_error", {
            errorType: "upstream_4xx_schema_change",
            statusCode: status,
            inputHash,
          });
        } catch {}
        throw e;
      }

      // 5xx ou timeout — tentar fallback stale
      try {
        const stale = await (storage as any).findFallbackPrimedopeRun(
          input.userId,
          input.profileLetter,
          input.dayOfWeek,
          PRIMEDOPE_LIMITS.FALLBACK_STALE_MS / 3600_000,
        );
        if (stale) {
          const staleCreatedAt =
            stale.createdAt instanceof Date
              ? stale.createdAt.getTime()
              : new Date(stale.createdAt).getTime();
          const staleAgeMs = Date.now() - staleCreatedAt;
          try {
            trackerEmit("primedope_simulation_error", {
              errorType: "upstream_5xx_recovered",
              statusCode: status ?? 0,
              inputHash,
              staleAgeMs,
            });
          } catch {}
          return {
            source: "fallback-stale",
            data: stale.resultJson ?? stale.result_json ?? {},
            histogramUrl: stale.histogramPath ?? stale.histogram_path,
            randomRunsUrl: stale.randomRunsPath ?? stale.random_runs_path,
            latencyMs: Date.now() - startedAt,
            inputHash,
            runId: stale.id,
            staleAgeMs,
          };
        }
      } catch {
        // sem fallback => unavailable
      }

      const e: PrimedopeError = new Error(
        "PRIMEDOPE_UNAVAILABLE: upstream 5xx and no fallback available.",
      );
      e.code = "PRIMEDOPE_UNAVAILABLE";
      e.errorType = "upstream_5xx_no_fallback";
      e.statusCode = status ?? 503;
      e.inputHash = inputHash;
      try {
        trackerEmit("primedope_simulation_error", {
          errorType: "upstream_5xx_no_fallback",
          statusCode: status ?? 0,
          inputHash,
        });
      } catch {}
      throw e;
    }

    // 6. Sucesso — persistir row ---------------------------------------------
    const histogramUrl = raw?.histogram_path
      ? `/api/primedope/chart/${inputHash}-h`
      : undefined;
    const randomRunsUrl = raw?.random_runs_path
      ? `/api/primedope/chart/${inputHash}-r`
      : undefined;

    const expiresAt = new Date(Date.now() + 90 * 86400_000);
    const insertRow = {
      id: `pdr_${nanoid(16)}`,
      userId: input.userId,
      profileLetter: input.profileLetter,
      dayOfWeek: input.dayOfWeek,
      multiplier: input.multiplier,
      inputHash,
      inputJson: hashableInput,
      resultJson: raw,
      histogramPath: raw?.histogram_path ?? null,
      randomRunsPath: raw?.random_runs_path ?? null,
      latencyMs: Date.now() - startedAt,
      source: "primedope" as const,
      pinned: false,
      expiresAt,
    };
    let inserted: any;
    try {
      inserted = await (storage as any).insertPrimedopeRun(insertRow);
    } catch (insertErr) {
      console.error("[primedope] insertPrimedopeRun failed", insertErr);
      inserted = insertRow;
    }

    const latencyMs = Date.now() - startedAt;
    try {
      trackerEmit("primedope_simulation_run", {
        userId: input.userId,
        profileLetter: input.profileLetter,
        dayOfWeek: input.dayOfWeek,
        cacheHit: false,
        source: "primedope",
        inputHash,
        latencyMs,
      });
    } catch {}

    return {
      source: "primedope",
      data: raw,
      histogramUrl,
      randomRunsUrl,
      latencyMs,
      inputHash,
      runId: inserted?.id ?? insertRow.id,
      cacheHit: false,
      pinned: false,
    };
  } finally {
    semaphore.release();
  }
}

// ---------------------------------------------------------------------------
// Helpers expostos para chart serving (referenciados pelas routes)
// ---------------------------------------------------------------------------

export function getChartFsPath(hash: string): string {
  return `uploads/primedope-charts/${hash}.png`;
}

export async function saveChartFromUrl(
  _hash: string,
  _url: string,
): Promise<void> {
  // Stub — implementacao futura faz fetch + write em fs.
  // Em testes, fs path eh checado e arquivo nao existe (404 esperado).
  return;
}
