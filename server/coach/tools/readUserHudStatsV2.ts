// =============================================================================
// Sprint Stats-V2 — Coach tool V2 grouped (RF-07, ADR-062)
//
// Substitui o shape flat do V1 por estrutura `groups[].stats[]` + `summary`.
// Stats com value=null retornam not_reported=true (em vez de excluidas).
// summary.biggest_leak ponderado por direction (ADR-063).
// =============================================================================

import { z } from "zod";
import type { CoachTool } from "../../coachTools/registry";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  HUD_STAT_CATALOG,
  type HudGroupId,
} from "../../../shared/hud-stat-catalog";

const inputSchema = z.object({
  layoutName: z.string().optional(),
  statKeys: z.array(z.string()).optional(),
});

// Heuristica ADR-062: stats 'context' so entram no ranking de leaks se |delta|
// exceder esta fracao do range entre targetMin/targetMax.
const CONTEXT_LEAK_RANGE_FRACTION = 0.5;

export interface PayloadStat {
  id: string;
  label: string;
  value: number | null;
  target_min: number;
  target_max: number;
  delta: number | null;
  direction: string;
  off_target: boolean;
  not_reported: boolean;
}

export interface PayloadGroup {
  id: HudGroupId;
  name: string;
  stats: PayloadStat[];
}

export interface PayloadSummary {
  total_off_target: number;
  total_on_target: number;
  total_null: number;
  biggest_leak: {
    id: string;
    label: string;
    group: HudGroupId;
    delta: number;
    direction: string;
  } | null;
}

export interface HudStatsPayloadV2 {
  layoutId?: string;
  layoutName?: string;
  capturedAt?: string | Date | null;
  sampleSize?: number | null;
  groups: PayloadGroup[];
  summary: PayloadSummary;
}

// -----------------------------------------------------------------------------
// Helpers para extrair fields do layout (suporta V2 fields[] e V1 sections[])
// -----------------------------------------------------------------------------

interface FieldLike {
  id: string;
  label?: string;
  group?: HudGroupId | string;
  targetMin?: number;
  targetMax?: number;
  direction?: string;
  unit?: string;
}

function extractFields(layout: any): FieldLike[] {
  if (!layout) return [];
  if (Array.isArray(layout.fields)) return layout.fields as FieldLike[];
  // V1 layout: sections[].stats[].key
  if (!Array.isArray(layout.sections)) return [];
  const fields: FieldLike[] = [];
  for (const sec of layout.sections) {
    for (const s of sec.stats ?? []) {
      const id = s.id ?? s.key;
      if (!id) continue;
      const catalog = HUD_STAT_CATALOG.find((c) => c.id === id);
      fields.push({
        id,
        label: s.label ?? catalog?.label ?? id,
        group: catalog?.group ?? "basics",
        targetMin: catalog?.targetMin ?? 0,
        targetMax: catalog?.targetMax ?? 100,
        direction: catalog?.direction ?? "context",
        unit: catalog?.unit ?? "pct",
      });
    }
  }
  return fields;
}

// -----------------------------------------------------------------------------
// Build payload
// -----------------------------------------------------------------------------

export function buildHudStatsPayloadV2(
  layout: any,
  snapshots: Array<{
    id?: string;
    layoutId?: string;
    capturedAt?: Date | string;
    sampleSize?: number | null;
    values?: Record<string, number | null>;
  }>,
): HudStatsPayloadV2 {
  // MAJOR-5 reviewer: short-circuit quando nao ha snapshots — evita iterar
  // catalogo inteiro retornando 200 stats com not_reported=true (payload
  // gigante e sem semantica). Coach espera groups=[] e summary zerado.
  if (!snapshots || snapshots.length === 0) {
    return {
      layoutId: layout?.id,
      layoutName: layout?.name,
      capturedAt: null,
      sampleSize: null,
      groups: [],
      summary: {
        total_off_target: 0,
        total_on_target: 0,
        total_null: 0,
        biggest_leak: null,
      },
    };
  }

  const fields = extractFields(layout);

  // Snapshot mais recente
  const sorted = [...(snapshots ?? [])].sort((a, b) => {
    const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return tb - ta;
  });
  const latest = sorted[0] ?? null;
  const values = latest?.values ?? {};

  // Agrupa fields por group respeitando ordem de HUD_GROUP_IDS
  const groupsMap = new Map<HudGroupId, PayloadStat[]>();
  for (const groupId of HUD_GROUP_IDS) {
    groupsMap.set(groupId, []);
  }

  let totalOffTarget = 0;
  let totalOnTarget = 0;
  let totalNull = 0;
  let biggestLeak: PayloadSummary["biggest_leak"] = null;
  let biggestLeakAbs = -Infinity;

  for (const field of fields) {
    const groupId = (field.group ?? "basics") as HudGroupId;
    const targetMin = typeof field.targetMin === "number" ? field.targetMin : 0;
    const targetMax = typeof field.targetMax === "number" ? field.targetMax : 100;
    const direction = (field.direction ?? "context") as string;
    const label = field.label ?? field.id;

    const rawValue = values[field.id];
    const value =
      typeof rawValue === "number" && Number.isFinite(rawValue)
        ? rawValue
        : null;

    let delta: number | null = null;
    let offTarget = false;
    const notReported = value === null;

    if (value !== null) {
      const midpoint = (targetMin + targetMax) / 2;
      delta = +(value - midpoint).toFixed(4);
      offTarget = value < targetMin || value > targetMax;
    }

    if (notReported) {
      totalNull++;
    } else if (offTarget) {
      totalOffTarget++;
      if (direction !== "neutral" && delta !== null) {
        const absDelta = Math.abs(delta);
        const range = Math.abs(targetMax - targetMin);
        const passesContext =
          direction !== "context"
          || absDelta >= range * CONTEXT_LEAK_RANGE_FRACTION;
        if (passesContext && absDelta > biggestLeakAbs) {
          biggestLeakAbs = absDelta;
          biggestLeak = { id: field.id, label, group: groupId, delta, direction };
        }
      }
    } else {
      totalOnTarget++;
    }

    const stats = groupsMap.get(groupId);
    if (stats) {
      stats.push({
        id: field.id,
        label,
        value,
        target_min: targetMin,
        target_max: targetMax,
        delta,
        direction,
        off_target: offTarget,
        not_reported: notReported,
      });
    }
  }

  // Inclui apenas grupos com >=1 stat (reduz payload; ordem segue HUD_GROUP_IDS).
  const groups: PayloadGroup[] = [];
  for (const groupId of HUD_GROUP_IDS) {
    const stats = groupsMap.get(groupId);
    if (stats && stats.length > 0) {
      groups.push({ id: groupId, name: HUD_GROUP_LABELS[groupId], stats });
    }
  }

  return {
    layoutId: layout?.id,
    layoutName: layout?.name,
    capturedAt: latest?.capturedAt ?? null,
    sampleSize: latest?.sampleSize ?? null,
    groups,
    summary: {
      total_off_target: totalOffTarget,
      total_on_target: totalOnTarget,
      total_null: totalNull,
      biggest_leak: biggestLeak,
    },
  };
}

// -----------------------------------------------------------------------------
// Tool descriptor
// -----------------------------------------------------------------------------

export const readUserHudStatsToolV2: CoachTool<
  { layoutName?: string; statKeys?: string[] },
  any
> = {
  name: "read_user_hud_stats",
  description:
    "Le snapshots HUD do usuario e retorna grouped output (16 grupos) com " +
    "delta, direction e summary de leaks. Stats nao reportadas marcadas " +
    "com not_reported=true.",
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
              (l: any) =>
                l.name?.toLowerCase() === input.layoutName!.toLowerCase(),
            )
          : layouts.find((l: any) => l.isDefault)) ?? layouts[0];

      const snapshots = await storage.getHudStatSnapshots(userId, {
        layoutId: layout.id,
        limit: 50,
      });

      const data = buildHudStatsPayloadV2(layout, snapshots ?? []);

      return {
        __type: "ToolResult",
        tool: "read_user_hud_stats",
        ok: true,
        data,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[read_user_hud_stats_v2] storage error", {
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
