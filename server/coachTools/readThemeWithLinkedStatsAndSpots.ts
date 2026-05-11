// =============================================================================
// Coach Tool: read_theme_with_linked_stats_and_spots
// Sprint stats-themes-linking-1 (ADR-142) — substitui read_theme_with_linked_spots
//
// Estende a tool de Studies-Reform incluindo stats HUD linkadas com:
//   - currentValue (ultimo snapshot extraido de hud_stat_snapshots.values jsonb)
//   - sparkline30d (ordem cronologica ASC, max 30 elementos)
//   - targetMin/targetMax + direction (catalog OU fieldsJson custom)
//   - direction-aware stats_in_range / stats_alarm em summary
//
// Alias `read_theme_with_linked_spots` continua aceito por 1 sprint
// (stats-themes-linking-2 remove). Emite console.warn no handler do alias.
//
// Lesson #10 (DRY de prompts): description vive em readThemeWithLinkedStatsAndSpots.prompts.ts.
// =============================================================================

import { z } from "zod";
import { storage } from "../storage";
import {
  STAT_INDEX_BY_ID,
  HUD_GROUP_LABELS,
  type StatField,
  type HudGroupId,
} from "@shared/hud-stat-catalog";
import { READ_THEME_TOOL_DESCRIPTION } from "./readThemeWithLinkedStatsAndSpots.prompts";
import { scrubInjectionTokens } from "../coachPageContext";

const MAX_TABS = 5;
const MAX_SPOTS = 10;
const MAX_SPARKLINE = 30;
const CONTENT_PREVIEW_CHARS = 200;

const inputSchema = z
  .object({
    theme_id: z.string().min(1).optional(),
    theme_name: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.theme_id) !== Boolean(v.theme_name), {
    message: "Forneca theme_id OU theme_name (XOR).",
  });

type ReadThemeInput = z.infer<typeof inputSchema>;

interface ReadThemeContext {
  userPlatformId?: string;
  userId?: string;
}

function previewFromContent(content: any): string {
  if (!content) return "";
  if (Array.isArray(content)) {
    const text = content
      .map((node: any) => {
        if (node && typeof node === "object" && "content" in node) {
          return String((node as any).content ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    return text.slice(0, CONTENT_PREVIEW_CHARS);
  }
  return String(content).slice(0, CONTENT_PREVIEW_CHARS);
}

interface StatPayloadEntry {
  statId: string;
  label: string;
  groupId: HudGroupId | string;
  groupLabel: string;
  currentValue: number | null;
  targetMin: number;
  targetMax: number;
  direction: string;
  unit: string;
  sparkline30d: number[];
  isCustom: boolean;
}

interface StatMetadata {
  label: string;
  groupId: HudGroupId | string;
  groupLabel: string;
  targetMin: number;
  targetMax: number;
  direction: string;
  unit: string;
  isCustom: boolean;
}

function metadataFromCatalog(stat: StatField): StatMetadata {
  return {
    label: stat.label,
    groupId: stat.group,
    groupLabel: HUD_GROUP_LABELS[stat.group] ?? String(stat.group),
    targetMin: stat.targetMin,
    targetMax: stat.targetMax,
    direction: stat.direction,
    unit: stat.unit,
    isCustom: false,
  };
}

function metadataFromCustom(field: any): StatMetadata {
  const groupId = (field.group ?? "basics") as HudGroupId | string;
  return {
    label: typeof field.label === "string" ? field.label : field.id,
    groupId,
    groupLabel:
      (HUD_GROUP_LABELS as any)[groupId] ?? String(groupId),
    targetMin:
      typeof field.targetMin === "number" ? field.targetMin : 0,
    targetMax:
      typeof field.targetMax === "number" ? field.targetMax : 0,
    direction:
      typeof field.direction === "string" ? field.direction : "context",
    unit: typeof field.unit === "string" ? field.unit : "pct",
    isCustom: true,
  };
}

function isInRange(
  value: number,
  min: number,
  max: number,
  direction: string,
): boolean {
  if (direction === "higher_better") return value >= min;
  if (direction === "lower_better") return value <= max;
  return value >= min && value <= max;
}

export async function readThemeWithLinkedStatsAndSpots(
  rawInput: unknown,
  ctx: ReadThemeContext,
): Promise<any> {
  const input = inputSchema.parse(rawInput) as ReadThemeInput;
  const userId = ctx?.userPlatformId ?? ctx?.userId;
  if (!userId) {
    throw new Error("User context obrigatorio");
  }

  // Lookup theme.
  let theme: any = null;
  if (input.theme_id) {
    theme = await (storage as any).getStudyTheme(input.theme_id);
  } else if (input.theme_name) {
    theme = await (storage as any).getStudyThemeByName(
      input.theme_name,
      userId,
    );
  }
  if (!theme) {
    throw new Error("Tema nao encontrado");
  }
  // Sprint coach-launch-fix (P1 #3): ownership fail-closed. Antes a comparacao
  // `theme.userId && theme.userId !== userId` permitia passar quando
  // theme.userId vinha null (legado, drift, edge case). Agora exigimos que
  // theme.userId seja exatamente igual ao userId solicitante.
  if (!theme.userId || theme.userId !== userId) {
    throw new Error("Acesso negado: tema de outro usuario");
  }

  const [tabsRaw, linkedSpotsRaw] = await Promise.all([
    (storage as any).getStudyTabsByTheme(theme.id),
    (storage as any).getLinkedSpots(theme.id),
  ]);

  const tabs = (Array.isArray(tabsRaw) ? tabsRaw : [])
    .slice(0, MAX_TABS)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      // Sprint coach-launch-fix (P1 #5): scrub injection tokens do preview.
      // Tab content e user-generated; preview vai direto pro LLM.
      content_preview: scrubInjectionTokens(previewFromContent(t.content)),
    }));

  // Sprint coach-launch-fix (P1 #4): filtrar linked spots cujo userId nao
  // corresponde ao usuario corrente. getLinkedSpots faz JOIN via theme_id e
  // pode retornar spots que ficaram orfaos OU foram linkados antes de algum
  // refactor de ownership; defensa em profundidade contra cross-user leak.
  const linkedSpots = (Array.isArray(linkedSpotsRaw) ? linkedSpotsRaw : [])
    .filter((s: any) => s.userId === userId)
    .slice(0, MAX_SPOTS)
    .map((s: any) => ({
      id: s.id,
      // P1 #5: conclusion eh user-generated; scrub.
      conclusion: scrubInjectionTokens(s.conclusion ?? ""),
      type: s.type ?? null,
      spot: s.spot ?? null,
      screenshotUrl: s.screenshotUrl ?? s.imageUrl ?? null,
    }));

  // Build stats payload.
  const linkedStats: string[] = Array.isArray(theme.linkedStats)
    ? theme.linkedStats
    : [];

  const stats: StatPayloadEntry[] = [];
  let inRange = 0;
  let alarm = 0;

  if (linkedStats.length > 0) {
    // Carrega user custom stats (uma vez para todos os linkedStats).
    let customMap: Map<string, any> | null = null;
    const needCustom = linkedStats.some((s) => !STAT_INDEX_BY_ID.has(s));
    if (needCustom) {
      customMap = new Map();
      try {
        const layouts = (await (storage as any).getHudLayouts(userId)) || [];
        for (const layout of layouts) {
          const fields = Array.isArray(layout?.fieldsJson)
            ? layout.fieldsJson
            : Array.isArray(layout?.fields_json)
              ? layout.fields_json
              : [];
          for (const f of fields) {
            if (f?.isCustom && typeof f?.id === "string") {
              customMap.set(f.id, f);
            }
          }
        }
      } catch {
        // sem layouts -> custom resolvido como orphans (omite + warn).
      }
    }

    // Batch query snapshots dos ultimos 30 dias para os stats relevantes.
    let snapshots: Array<{
      capturedAt: Date;
      values: Record<string, number | null>;
    }> = [];
    try {
      snapshots = (await (storage as any).getHudStatSnapshotsForUserStats(
        userId,
        linkedStats,
      )) ?? [];
    } catch {
      snapshots = [];
    }

    for (const statId of linkedStats) {
      const catalog = STAT_INDEX_BY_ID.get(statId);
      let meta: StatMetadata | null = null;
      if (catalog) {
        meta = metadataFromCatalog(catalog);
      } else if (customMap?.has(statId)) {
        meta = metadataFromCustom(customMap.get(statId));
      } else {
        // Stat orfa (custom deletada ou catalog removido).
        console.warn("[read_theme_with_linked_stats_and_spots] stat orfa", {
          themeId: theme.id,
          statId,
          userPlatformId: userId,
        });
        continue;
      }

      // sparkline + currentValue extraidos dos snapshots batched.
      const sparkValues: number[] = [];
      let currentValue: number | null = null;
      // snapshots vem em ordem ASC; iteramos e extraimos values[statId]; o ultimo
      // numero valido eh o currentValue.
      for (const snap of snapshots) {
        const raw = snap.values ? (snap.values as any)[statId] : undefined;
        if (raw === undefined || raw === null) continue;
        const num = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(num)) continue;
        sparkValues.push(num);
        currentValue = num;
      }
      // Cap 30.
      const sparkline30d =
        sparkValues.length > MAX_SPARKLINE
          ? sparkValues.slice(sparkValues.length - MAX_SPARKLINE)
          : sparkValues;

      stats.push({
        statId,
        label: meta.label,
        groupId: meta.groupId,
        groupLabel: meta.groupLabel,
        currentValue,
        targetMin: meta.targetMin,
        targetMax: meta.targetMax,
        direction: meta.direction,
        unit: meta.unit,
        sparkline30d,
        isCustom: meta.isCustom,
      });

      if (currentValue !== null) {
        if (isInRange(currentValue, meta.targetMin, meta.targetMax, meta.direction)) {
          inRange += 1;
        } else {
          alarm += 1;
        }
      }
    }
  }

  const lastVisited =
    (theme as any).lastVisitedAt ?? theme.updatedAt ?? null;

  return {
    theme: {
      id: theme.id,
      name: theme.name,
      color: theme.color ?? null,
      emoji: theme.emoji ?? "",
      progress: theme.progress ?? 0,
      lastVisitedAt: lastVisited,
    },
    tabs,
    linked_spots: linkedSpots,
    stats,
    summary: {
      spots_count: linkedSpots.length,
      tabs_count: tabs.length,
      last_activity_at: lastVisited,
      stats_count: stats.length,
      stats_in_range: inRange,
      stats_alarm: alarm,
    },
  };
}

export default readThemeWithLinkedStatsAndSpots;

// -----------------------------------------------------------------------------
// Tool descriptors (compatible com server/coachTools/registry.ts)
// -----------------------------------------------------------------------------

export const readThemeWithLinkedStatsAndSpotsTool = {
  name: "read_theme_with_linked_stats_and_spots" as const,
  description: READ_THEME_TOOL_DESCRIPTION,
  inputSchema,
  requiresConfirmation: false,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  async handler(input: any, ctx: any) {
    try {
      const data = await readThemeWithLinkedStatsAndSpots(input, ctx);
      return {
        __type: "ToolResult",
        tool: "read_theme_with_linked_stats_and_spots",
        ok: true,
        data,
      };
    } catch (err) {
      console.error("[read_theme_with_linked_stats_and_spots] error", {
        userPlatformId: ctx?.userPlatformId ?? ctx?.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        __type: "ToolResult",
        tool: "read_theme_with_linked_stats_and_spots",
        ok: false,
        code: "tool_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/**
 * Alias deprecated — mantido por 1 sprint (stats-themes-linking-2 remove).
 * Emite console.warn cada vez que for chamado para sinalizar migration.
 */
export const readThemeWithLinkedSpotsToolAlias = {
  name: "read_theme_with_linked_spots" as const,
  description:
    "[Deprecated alias] Use read_theme_with_linked_stats_and_spots. Mesma logica + resposta.",
  inputSchema,
  requiresConfirmation: false,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  async handler(input: any, ctx: any) {
    console.warn(
      "[deprecation] read_theme_with_linked_spots — use read_theme_with_linked_stats_and_spots",
      {
        userPlatformId: ctx?.userPlatformId ?? ctx?.userId,
        messageId: ctx?.messageId,
      },
    );
    return readThemeWithLinkedStatsAndSpotsTool.handler(input, ctx);
  },
};
