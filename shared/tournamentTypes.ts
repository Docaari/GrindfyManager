/**
 * Tournament Types Single Source of Truth (SSoT)
 *
 * Sprint 1 — Tournament Types Extension (ADR-031: modelo ortogonal).
 *
 * Modelo ortogonal:
 *   - Tipo primario (mutex): Vanilla | PKO | Mystery | Satellite
 *   - Modificadores (booleanos independentes): isFlight, isLive
 *
 * Motivacao: enum monolitico nao escala (cardinalidade combinatoria).
 * Modelo ortogonal permite combinacoes (PKO + isFlight + isLive) sem
 * explosao de valores no enum.
 *
 * Documentacao:
 *   - Docs/specs/tournament-types-extension-and-manual-add-fix.md
 *   - Docs/architecture/decisions/031-tournament-types-orthogonal-model.md
 *   - Docs/architecture/decisions/032-deprecation-category-column.md
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constantes principais
// ---------------------------------------------------------------------------

/**
 * Tipos primarios de torneio (mutex). Apenas um por torneio.
 *
 * NAO confundir com modificadores (`isFlight`, `isLive`). Flight foi removido
 * do enum primario porque pode coexistir com PKO/Mystery/Satellite.
 */
export const TOURNAMENT_PRIMARY_TYPES = [
  'Vanilla',
  'PKO',
  'Mystery',
  'Satellite',
  'Add-on',
] as const;

export type TournamentPrimaryType = (typeof TOURNAMENT_PRIMARY_TYPES)[number];

/**
 * Modificadores ortogonais (boolean). Podem coexistir com qualquer tipo
 * primario (incluindo entre si).
 */
export const TOURNAMENT_MODIFIERS = ['isFlight', 'isLive'] as const;

export type TournamentModifier = (typeof TOURNAMENT_MODIFIERS)[number];

/**
 * Tipos de premio para torneios Satellite.
 *
 * - ticket: ganhador recebe ticket para outro torneio
 * - package: ganhador recebe pacote (buy-in + acomodacao + viagem)
 * - cash: ganhador recebe valor em dinheiro
 * - mixed: ganhador recebe ticket + extra cash
 */
export const SATELLITE_REWARD_TYPES = ['ticket', 'package', 'cash', 'mixed'] as const;

export type SatelliteRewardType = (typeof SATELLITE_REWARD_TYPES)[number];

// ---------------------------------------------------------------------------
// Zod Schema (validacao runtime)
// ---------------------------------------------------------------------------

export const TournamentPrimaryTypeSchema = z.enum(TOURNAMENT_PRIMARY_TYPES);

export const SatelliteRewardTypeSchema = z.enum(SATELLITE_REWARD_TYPES);

// ---------------------------------------------------------------------------
// Cores (Tailwind + hex para uso em SVG / charts)
// ---------------------------------------------------------------------------

export interface TypeColor {
  bg: string;
  text: string;
  ring: string;
  hex: string;
}

export const TYPE_COLORS: Record<TournamentPrimaryType, TypeColor> = {
  Vanilla: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-200',
    ring: 'ring-zinc-300 dark:ring-zinc-600',
    hex: '#71717a',
  },
  PKO: {
    bg: 'bg-violet-100 dark:bg-violet-950',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-300 dark:ring-violet-700',
    hex: '#a78bfa',
  },
  Mystery: {
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-950',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    ring: 'ring-fuchsia-300 dark:ring-fuchsia-700',
    hex: '#e879f9',
  },
  Satellite: {
    bg: 'bg-amber-100 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-700',
    hex: '#fbbf24',
  },
  'Add-on': {
    bg: 'bg-orange-100 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-300 dark:ring-orange-700',
    hex: '#fb923c',
  },
};

export const MODIFIER_COLORS: Record<TournamentModifier, TypeColor> = {
  isFlight: {
    bg: 'bg-cyan-100 dark:bg-cyan-950',
    text: 'text-cyan-700 dark:text-cyan-300',
    ring: 'ring-cyan-300 dark:ring-cyan-700',
    hex: '#22d3ee',
  },
  isLive: {
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-300 dark:ring-emerald-700',
    hex: '#34d399',
  },
};

export function getTypeColor(type: TournamentPrimaryType): TypeColor {
  return TYPE_COLORS[type];
}

export function getModifierColor(mod: TournamentModifier): TypeColor {
  return MODIFIER_COLORS[mod];
}

// ---------------------------------------------------------------------------
// Labels PT-BR
// ---------------------------------------------------------------------------

export const TYPE_LABELS_PT_BR: Record<TournamentPrimaryType, string> = {
  Vanilla: 'Vanilla',
  PKO: 'PKO (Bounty)',
  Mystery: 'Mystery Bounty',
  Satellite: 'Satélite',
  'Add-on': 'Add-on',
};

export const MODIFIER_LABELS_PT_BR: Record<TournamentModifier, string> = {
  isFlight: 'Flight (Multi-dia)',
  isLive: 'Live (Presencial)',
};

export function getTypeLabel(type: TournamentPrimaryType): string {
  return TYPE_LABELS_PT_BR[type];
}

export function getModifierLabel(mod: TournamentModifier): string {
  return MODIFIER_LABELS_PT_BR[mod];
}

// ---------------------------------------------------------------------------
// Helpers booleanos
// ---------------------------------------------------------------------------

export function isSatellite(type: TournamentPrimaryType | string | null | undefined): boolean {
  return type === 'Satellite';
}

export function isPKO(type: TournamentPrimaryType | string | null | undefined): boolean {
  return type === 'PKO';
}

export function isAddOn(type: TournamentPrimaryType | string | null | undefined): boolean {
  return type === 'Add-on';
}

/**
 * Recebe um objeto tournament-like e retorna se eh Flight (modificador).
 * Tolera null/undefined no campo (retorna false).
 */
export function isFlight(t: { isFlight?: boolean | null }): boolean {
  return t?.isFlight === true;
}

/**
 * Recebe um objeto tournament-like e retorna se eh Live (modificador).
 * Tolera null/undefined no campo (retorna false).
 */
export function isLive(t: { isLive?: boolean | null }): boolean {
  return t?.isLive === true;
}

// ---------------------------------------------------------------------------
// getTypeBadges (UI-friendly: array de badges para renderizar)
// ---------------------------------------------------------------------------

export interface TournamentBadge {
  label: string;
  color: TypeColor;
}

/**
 * Retorna array de badges (label + color) para renderizar:
 *   - Sempre 1 badge para o tipo primario
 *   - +1 badge se isFlight=true
 *   - +1 badge se isLive=true
 *
 * Ordem: [tipo, ...modificadores]
 */
export function getTypeBadges(t: {
  type: TournamentPrimaryType | string;
  isFlight?: boolean | null;
  isLive?: boolean | null;
}): TournamentBadge[] {
  const badges: TournamentBadge[] = [];

  // Tipo primario
  const typeColor = TYPE_COLORS[t.type as TournamentPrimaryType];
  if (typeColor) {
    badges.push({
      label: TYPE_LABELS_PT_BR[t.type as TournamentPrimaryType],
      color: typeColor,
    });
  }

  // Modificadores (so adiciona se TRUE explicito)
  if (t.isFlight === true) {
    badges.push({
      label: MODIFIER_LABELS_PT_BR.isFlight,
      color: MODIFIER_COLORS.isFlight,
    });
  }

  if (t.isLive === true) {
    badges.push({
      label: MODIFIER_LABELS_PT_BR.isLive,
      color: MODIFIER_COLORS.isLive,
    });
  }

  return badges;
}

// ---------------------------------------------------------------------------
// parseFlightDay
// ---------------------------------------------------------------------------

export interface ParsedFlightDay {
  day: number;
  group: string | null;
  isFinal: boolean;
}

/**
 * Parse de flightDay para componentes ordenaveis.
 *
 * Formatos aceitos:
 *   - "1A", "1B", ..., "1E"  -> {day:1, group:"A", isFinal:false}
 *   - "Day 1", "Day 2", ...  -> {day:N, group:null, isFinal:false}
 *   - "2", "3", ...           -> {day:N, group:null, isFinal:false}
 *   - "Final"                 -> {day:Infinity, group:null, isFinal:true}
 *
 * Retorna null para entradas invalidas (incluindo string vazia/null).
 */
export function parseFlightDay(value: string | null | undefined): ParsedFlightDay | null {
  if (value === null || value === undefined) return null;
  const v = String(value);
  if (v.length === 0) return null;

  if (v === 'Final') {
    return { day: Infinity, group: null, isFinal: true };
  }

  // "1A", "1B", ... "9Z" — digits seguido de UMA letra maiuscula
  const dayLetterMatch = /^(\d+)([A-Z])$/.exec(v);
  if (dayLetterMatch) {
    return {
      day: parseInt(dayLetterMatch[1], 10),
      group: dayLetterMatch[2],
      isFinal: false,
    };
  }

  // "Day 1", "Day 2" — com ou sem espaco
  const dayWordMatch = /^Day\s?(\d+)$/.exec(v);
  if (dayWordMatch) {
    return {
      day: parseInt(dayWordMatch[1], 10),
      group: null,
      isFinal: false,
    };
  }

  // "1", "2", "3" — so numero
  const numberOnlyMatch = /^(\d+)$/.exec(v);
  if (numberOnlyMatch) {
    return {
      day: parseInt(numberOnlyMatch[1], 10),
      group: null,
      isFinal: false,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// FLIGHT_DAY_SUGGESTIONS (sugestoes para autocomplete)
// ---------------------------------------------------------------------------

/**
 * Sugestoes para autocomplete do campo flightDay.
 * Todas batem com o regex de validacao: /^(Final|Day\s?\d+|\d+[A-Z]?)$/
 */
export const FLIGHT_DAY_SUGGESTIONS: readonly string[] = [
  '1A',
  '1B',
  '1C',
  '1D',
  '1E',
  '2',
  '3',
  'Final',
] as const;
