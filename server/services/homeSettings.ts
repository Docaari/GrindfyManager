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
  HOME_VISIBILITY_KEYS,
  type HomeLayoutSettings,
  type HomeVisibilitySettings,
} from '@shared/types/homeSettings';

const visibilityShape = Object.fromEntries(
  HOME_VISIBILITY_KEYS.map((key) => [key, z.boolean().optional()]),
) as Record<string, z.ZodOptional<z.ZodBoolean>>;

const visibilityPatchSchema = z.object(visibilityShape).strict();

const homeLayoutSettingsPatchSchema = z
  .object({
    visibility: visibilityPatchSchema.optional(),
    performanceFromGrind: z.boolean().optional(),
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

export function resolveHomeLayoutSettings(stored: unknown): HomeLayoutSettings {
  if (!isPlainObject(stored)) {
    return cloneDefaults();
  }
  const visibility = pickVisibility((stored as any).visibility);
  const performanceFromGrind =
    typeof (stored as any).performanceFromGrind === 'boolean'
      ? (stored as any).performanceFromGrind
      : DEFAULT_HOME_LAYOUT_SETTINGS.performanceFromGrind;
  return {
    visibility: { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility, ...visibility },
    performanceFromGrind,
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
  return { visibility, performanceFromGrind };
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
  };
}
