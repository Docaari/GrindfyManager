// =============================================================================
// Tool: read_user_hud_stats
// Sprint F3 / ADR-052
//
// Le snapshots HUD do usuario e retorna ultimo snapshot + delta vs media
// historica + benchmark populacional estatico.
//
// Output sanitizado:
//   - NUNCA expoe `notes` (texto livre)
//   - Apenas keys numericas + agregados
// =============================================================================

import { z } from "zod";
import type { CoachTool } from "../../coachTools/registry";
import {
  HUD_STATS_BENCHMARK,
  classifyVsBenchmark,
} from "./hudStatsBenchmark";

const inputSchema = z.object({
  layoutName: z.string().optional(),
  statKeys: z.array(z.string()).optional(),
});

export interface DeltaEntry {
  current: number;
  average: number;
  delta: number;
}

export interface BenchmarkEntry {
  healthy: [number, number];
  current: number;
  status: "below_range" | "in_range" | "above_range";
}

export interface ReadHudStatsPayload {
  layoutName: string;
  layoutId: string;
  latestSnapshot: {
    capturedAt: string | Date;
    sampleSize: number | null;
    values: Record<string, number | null>;
  } | null;
  deltaVsAverage: Record<string, DeltaEntry>;
  populationBenchmark: Record<string, BenchmarkEntry>;
}

export function buildHudStatsPayload(
  layout: {
    id: string;
    name: string;
    sections: Array<{ stats: Array<{ key: string; label: string }> }>;
  },
  snapshots: Array<{
    capturedAt: Date | string;
    sampleSize: number | null;
    values: Record<string, number | null>;
  }>,
  filterKeys?: string[],
): ReadHudStatsPayload {
  const allLayoutKeys = new Set<string>();
  for (const sec of layout.sections ?? []) {
    for (const s of sec.stats ?? []) allLayoutKeys.add(s.key);
  }
  const keysToInclude =
    filterKeys && filterKeys.length > 0
      ? filterKeys.filter((k) => allLayoutKeys.has(k))
      : [...allLayoutKeys];

  const sortedSnapshots = [...snapshots].sort((a, b) => {
    const ta = new Date(a.capturedAt).getTime();
    const tb = new Date(b.capturedAt).getTime();
    return tb - ta;
  });

  const latest = sortedSnapshots[0] ?? null;

  const deltaVsAverage: Record<string, DeltaEntry> = {};
  const populationBenchmark: Record<string, BenchmarkEntry> = {};

  for (const key of keysToInclude) {
    const allValues = sortedSnapshots
      .map((s) => s.values?.[key])
      .filter((v): v is number => typeof v === "number");
    const currentValue = latest?.values?.[key] ?? null;

    if (typeof currentValue === "number" && allValues.length > 0) {
      const avg =
        allValues.reduce((acc, v) => acc + v, 0) / allValues.length;
      deltaVsAverage[key] = {
        current: +currentValue.toFixed(2),
        average: +avg.toFixed(2),
        delta: +(currentValue - avg).toFixed(2),
      };
    }

    const range = HUD_STATS_BENCHMARK[key];
    if (range && typeof currentValue === "number") {
      populationBenchmark[key] = {
        healthy: range.healthy,
        current: +currentValue.toFixed(2),
        status: classifyVsBenchmark(key, currentValue) ?? "in_range",
      };
    }
  }

  const filteredValues = latest
    ? Object.fromEntries(
        keysToInclude
          .filter((k) => k in (latest.values ?? {}))
          .map((k) => [k, latest.values?.[k] ?? null]),
      )
    : null;

  return {
    layoutName: layout.name,
    layoutId: layout.id,
    latestSnapshot: latest
      ? {
          capturedAt: latest.capturedAt,
          sampleSize: latest.sampleSize ?? null,
          values: filteredValues ?? {},
        }
      : null,
    deltaVsAverage,
    populationBenchmark,
  };
}

export const readUserHudStatsTool: CoachTool<
  { layoutName?: string; statKeys?: string[] },
  any
> = {
  name: "read_user_hud_stats",
  description:
    "Le snapshots HUD recentes do usuario (VPIP, PFR, 3Bet, etc.) " +
    "do layout indicado (ou default). Retorna ultimo snapshot, delta vs " +
    "media historica do usuario, e benchmark populacional estatico.",
  inputSchema,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],

  async handler(input, ctx) {
    const userId = ctx.userId;
    const { storage } = await import("../../storage");

    try {
      const layouts = await storage.getHudLayouts(userId);
      if (!layouts || layouts.length === 0) {
        return {
          __type: "ToolResult",
          tool: "read_user_hud_stats",
          ok: false,
          code: "no_layouts",
          message:
            "Usuario nao tem layouts HUD configurados. Sugira criar um via /studies.",
        };
      }

      const layout =
        (input.layoutName
          ? layouts.find(
              (l) => l.name.toLowerCase() === input.layoutName!.toLowerCase(),
            )
          : layouts.find((l) => l.isDefault)) ?? layouts[0];

      const snapshots = await storage.getHudStatSnapshots(userId, {
        layoutId: layout.id,
        limit: 50,
      });

      if (!snapshots || snapshots.length === 0) {
        return {
          __type: "ToolResult",
          tool: "read_user_hud_stats",
          ok: true,
          data: {
            layoutName: layout.name,
            layoutId: layout.id,
            latestSnapshot: null,
            deltaVsAverage: {},
            populationBenchmark: {},
            message:
              "Layout existe, mas nenhum snapshot foi salvo ainda.",
          },
        };
      }

      const data = buildHudStatsPayload(
        layout as any,
        snapshots as any,
        input.statKeys,
      );

      return {
        __type: "ToolResult",
        tool: "read_user_hud_stats",
        ok: true,
        data,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[read_user_hud_stats] storage error", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        __type: "ToolResult",
        tool: "read_user_hud_stats",
        ok: false,
        code: "storage_error",
        message: "Falha ao consultar snapshots HUD.",
      };
    }
  },
};
