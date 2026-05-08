/**
 * homeSettings — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11 (engrenagem) + item 8 (flag).
 *
 * Service puro:
 *   - resolveHomeLayoutSettings(stored): hidrata payload do storage. NULL,
 *     undefined ou shape invalido -> defaults. Aceita partial -> merge.
 *   - mergeHomeLayoutSettings(current, patch): aplica patch deep-shallow
 *     em cima de current (ou defaults quando current null).
 *   - parseHomeLayoutSettingsPatch(body): valida via Zod (strict). Lanca
 *     ZodError em caso de shape invalido. Aceita patch vazio.
 */

import { z } from 'zod';
import {
  DEFAULT_HOME_LAYOUT_SETTINGS,
  DEFAULT_FOCUS_STATS_VISIBILITY,
  HOME_VISIBILITY_KEYS,
  FOCUS_STATS_PLACEMENTS,
  type HomeLayoutSettings,
  type HomeVisibilitySettings,
  type FocusStatsVisibility,
} from '@shared/types/homeSettings';

const visibilityShape = Object.fromEntries(
  HOME_VISIBILITY_KEYS.map((key) => [key, z.boolean().optional()]),
) as Record<string, z.ZodOptional<z.ZodBoolean>>;

const visibilityPatchSchema = z.object(visibilityShape).strict();

const focusStatsVisibilityShape = Object.fromEntries(
  FOCUS_STATS_PLACEMENTS.map((key) => [key, z.boolean().optional()]),
) as Record<string, z.ZodOptional<z.ZodBoolean>>;

const focusStatsVisibilityPatchSchema = z.object(focusStatsVisibilityShape).strict();

const homeLayoutSettingsPatchSchema = z
  .object({
    visibility: visibilityPatchSchema.optional(),
    performanceFromGrind: z.boolean().optional(),
    focusStatsVisibility: focusStatsVisibilityPatchSchema.optional(),
  })
  .strict();

export type HomeLayoutSettingsPatch = z.infer<typeof homeLayoutSettingsPatchSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pickVisibility(stored: unknown): Partial<HomeVisibilitySettings> {
  if (!isPlainObject(stored)) return {};
  const out: Partial<HomeVisibilitySettings> = {};
  for (const key of HOME_VISIBILITY_KEYS) {
    const v = (stored as any)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

function pickFocusStatsVisibility(stored: unknown): Partial<FocusStatsVisibility> {
  if (!isPlainObject(stored)) return {};
  const out: Partial<FocusStatsVisibility> = {};
  for (const key of FOCUS_STATS_PLACEMENTS) {
    const v = (stored as any)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export function resolveHomeLayoutSettings(stored: unknown): HomeLayoutSettings {
  if (!isPlainObject(stored)) {
    return cloneDefaults();
  }
  const visibility = pickVisibility((stored as any).visibility);
  const performanceFromGrind =
    typeof (stored as any).performanceFromGrind === 'boolean'
      ? (stored as any).performanceFromGrind
      : DEFAULT_HOME_LAYOUT_SETTINGS.performanceFromGrind;
  // Sprint Estudos-Habito-1 (ADR-129): lazy back-fill de focusStatsVisibility.
  // Migra showFocusStatsBar legado se nao houver shape novo.
  let focusStatsVisibility: FocusStatsVisibility;
  const fsvRaw = (stored as any).focusStatsVisibility;
  if (isPlainObject(fsvRaw)) {
    const partial = pickFocusStatsVisibility(fsvRaw);
    focusStatsVisibility = { ...DEFAULT_FOCUS_STATS_VISIBILITY, ...partial };
  } else {
    const legacy =
      typeof (stored as any).showFocusStatsBar === 'boolean'
        ? (stored as any).showFocusStatsBar
        : true;
    focusStatsVisibility = {
      home: legacy,
      grindLive: legacy,
      coach: legacy,
      estudos: legacy,
      statsAnalyzer: legacy,
    };
  }
  return {
    visibility: { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility, ...visibility },
    performanceFromGrind,
    focusStatsVisibility,
  };
}

export function mergeHomeLayoutSettings(
  current: unknown,
  patch: HomeLayoutSettingsPatch,
): HomeLayoutSettings {
  const base = resolveHomeLayoutSettings(current);
  const visibility = patch.visibility
    ? { ...base.visibility, ...patch.visibility }
    : base.visibility;
  const performanceFromGrind =
    typeof patch.performanceFromGrind === 'boolean'
      ? patch.performanceFromGrind
      : base.performanceFromGrind;
  const focusStatsVisibility = patch.focusStatsVisibility
    ? { ...base.focusStatsVisibility, ...patch.focusStatsVisibility }
    : base.focusStatsVisibility;
  return { visibility, performanceFromGrind, focusStatsVisibility };
}

export function parseHomeLayoutSettingsPatch(body: unknown): HomeLayoutSettingsPatch {
  if (!isPlainObject(body)) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: [],
        message: 'Expected object body',
      },
    ]);
  }
  return homeLayoutSettingsPatchSchema.parse(body);
}

function cloneDefaults(): HomeLayoutSettings {
  return {
    visibility: { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility },
    performanceFromGrind: DEFAULT_HOME_LAYOUT_SETTINGS.performanceFromGrind,
    focusStatsVisibility: { ...DEFAULT_FOCUS_STATS_VISIBILITY },
  };
}
