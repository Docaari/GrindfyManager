// =============================================================================
// server/coach/goals/aggregateCurrentValue.ts — Metas 4DX fatia-1 (ADR-229 RF-05)
//
// Agregacao direta read-only do dado ja capturado. Despacha por sourceMetric
// (GOALS_SOURCE_METRIC_MAP). Fontes injetadas por composicao via `deps`
// (lesson #34) — sem vi.mock global.
//
//   volume      -> count(grind_sessions status='completed')
//   study       -> sum(durationMinutes)/count(study_sessions_v2 deletedAt IS NULL)
//   financial   -> wallets convertidas FX->USD (lesson #6); FX ausente NAO zera
//                  (fallback nativo + log, lesson #9)
//   performance -> getPerformanceByPeriod (historico, grind_session_id IS NULL §6.1)
//
// numeric da coluna = string JS -> parseFloat na boundary, NUNCA Number() cego.
// =============================================================================

import { GOALS_SOURCE_METRIC_MAP, parseMetricSource } from "./sourceMetricMap";
import { num } from "./num";

export interface AggregateWindow {
  weekStartDate: string; // YYYY-MM-DD (UTC)
  // ADR-241 — janela completa da meta (inicio->agora) p/ metricas de RESULTADO
  // (profit/volume cumulativos da WIG). Ausente -> usa a semana corrente.
  rangeStartYmd?: string;
  rangeEndYmd?: string;
}

export interface AggregateResult {
  value: number | null;
  dataSufficiency: "ok" | "low";
  note?: string;
}

export interface AggregateDeps {
  getGrindSessions?: (userId: string, window: AggregateWindow) => Promise<any[]>;
  getStudySessionsV2?: (userId: string, window: AggregateWindow) => Promise<any[]>;
  getWallets?: (userId: string) => Promise<any[]>;
  fxToUsd?: (amountNative: number, currency: string) => Promise<number | null>;
  getPerformanceByPeriod?: (userId: string, window: AggregateWindow) => Promise<any>;
  // ADR-241 — fonte 'grind' das metricas de resultado: sessoes de grind na janela
  // da meta (profitLoss USD-equiv) + count de session_tournaments dessa janela.
  getGrindSessionsInRange?: (userId: string, fromYmd: string, toYmd: string) => Promise<any[]>;
  getSessionTournamentCountInRange?: (userId: string, fromYmd: string, toYmd: string) => Promise<number>;
}

const LOW_SAMPLE_THRESHOLD = 2; // < 2 amostras -> dataSufficiency 'low' (D9)

export async function aggregateCurrentValue(
  userId: string,
  sourceMetric: string,
  window: AggregateWindow,
  deps: AggregateDeps = {},
): Promise<AggregateResult> {
  const { base, source } = parseMetricSource(sourceMetric);
  const spec = GOALS_SOURCE_METRIC_MAP[base];
  if (!spec) {
    return { value: null, dataSufficiency: "low", note: "no_data_source" };
  }

  // ADR-241 — fonte 'grind' (profit/volume): agrega da janela completa da meta.
  if (source === "grind" && (base === "profit" || base === "volume")) {
    const fromYmd = window.rangeStartYmd ?? window.weekStartDate;
    const toYmd = window.rangeEndYmd ?? window.weekStartDate;
    // Metrica de RESULTADO cumulativa (WIG, janela longa): 1 sessao ja e dado
    // valido — 'low' so quando NAO ha dado nenhum (reviewer MEDIUM: evita badge
    // "amostra fraca" enganoso em WIG de profit/volume com poucas sessoes).
    if (base === "profit") {
      const rows = (await deps.getGrindSessionsInRange?.(userId, fromYmd, toYmd)) ?? [];
      const completed = rows.filter((r: any) => r?.status === "completed");
      const value = completed.reduce((sum: number, r: any) => sum + num(r?.profitLoss), 0);
      return { value, dataSufficiency: completed.length === 0 ? "low" : "ok" };
    }
    // volume = count de session_tournaments registrados na janela.
    const count = (await deps.getSessionTournamentCountInRange?.(userId, fromYmd, toYmd)) ?? 0;
    return { value: count, dataSufficiency: count === 0 ? "low" : "ok" };
  }

  switch (spec.kind) {
    case "volume": {
      const rows = (await deps.getGrindSessions?.(userId, window)) ?? [];
      const completed = rows.filter((r: any) => r?.status === "completed");
      let value: number;
      if (base === "grind_days") {
        const days = new Set(
          completed.map((r: any) => {
            const d = r?.date instanceof Date ? r.date : new Date(r?.date);
            return Number.isNaN(d.getTime()) ? String(r?.date) : d.toISOString().slice(0, 10);
          }),
        );
        value = days.size;
      } else {
        value = completed.length;
      }
      return {
        value,
        dataSufficiency: completed.length < LOW_SAMPLE_THRESHOLD ? "low" : "ok",
      };
    }

    case "study": {
      const rows = ((await deps.getStudySessionsV2?.(userId, window)) ?? []).filter(
        (r: any) => !r?.deletedAt,
      );
      let value: number;
      if (base === "study_sessions_count") {
        value = rows.length;
      } else {
        value = rows.reduce((sum: number, r: any) => sum + num(r?.durationMinutes), 0);
      }
      return {
        value,
        dataSufficiency: rows.length < LOW_SAMPLE_THRESHOLD ? "low" : "ok",
      };
    }

    case "financial": {
      const wallets = (await deps.getWallets?.(userId)) ?? [];
      let totalUsd = 0;
      let fxMissing = false;
      for (const w of wallets) {
        const native = num(w?.balance);
        const currency = String(w?.currency ?? "USD");
        let usd: number | null = null;
        try {
          usd = deps.fxToUsd ? await deps.fxToUsd(native, currency) : native;
        } catch (err) {
          console.error("aggregateCurrentValue.fx.error", {
            userId,
            currency,
            err: err instanceof Error ? err.message : String(err),
          });
          usd = null;
        }
        if (usd === null || usd === undefined) {
          // FX ausente: NAO zera — fallback nativo + log (lesson #9).
          console.warn("aggregateCurrentValue.fx.missing.fallback_native", {
            userId,
            currency,
            native,
          });
          fxMissing = true;
          totalUsd += native;
        } else {
          totalUsd += usd;
        }
      }
      return {
        value: totalUsd,
        dataSufficiency: wallets.length === 0 ? "low" : "ok",
        ...(fxMissing ? { note: "fx_unavailable_native_fallback" } : {}),
      };
    }

    case "performance": {
      const perf = (await deps.getPerformanceByPeriod?.(userId, window)) ?? {};
      const field = spec.perfField ?? "roi";
      const raw = perf?.[field];
      const value = raw === undefined || raw === null ? null : num(raw);
      const total = num(perf?.totalTournaments);
      return {
        value,
        dataSufficiency: total < LOW_SAMPLE_THRESHOLD ? "low" : "ok",
      };
    }

    case "leak": {
      // METAS-2 fatia-2 (ADR-234 / D-4): leak_focus nao tem agregacao direta. O
      // scoreboard resolve via evaluateLeakFocusProgress ANTES de chamar este
      // helper; este early-return so existe para o despacho nao cair em default.
      return { value: null, dataSufficiency: "low", note: "leak_no_direct_aggregation" };
    }

    default:
      return { value: null, dataSufficiency: "low", note: "unknown_kind" };
  }
}
