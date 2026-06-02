/**
 * Tournament Type Detector (extensao 2026-05-07).
 *
 * Convergence point para detectar campos derivados de `name`/`category`
 * antes de persistir no DB. Complementa `detectAddonReaFromName` e o parser
 * CSV — usado especialmente no caminho de upload em massa, onde a paridade
 * entre `category` (legacy) e `type` (SSoT ortogonal ADR-031) precisa ser
 * garantida sem percorrer 13 sites de parser.
 *
 * Lesson learned: parser CSV setava apenas `category`. `type` caia no
 * default DB ('Vanilla') para todos rows, mesmo PKO/Mystery/Add-on.
 * Este helper garante: type sempre espelha category, e quando `category`
 * for o legado 'Vanilla' mas o nome bater Satellite/Add-on/Flight, eleva.
 */

import {
  TOURNAMENT_PRIMARY_TYPES,
  type TournamentPrimaryType,
} from './tournamentTypes';
import { detectAddonReaFromName, type DetectedFlags } from './addon-rea-detector';

// Satellite — Sprint torneios-library-grouping: cobertura ampliada. Antes
// caia em Vanilla varios satelites comuns. Agora casa (boundaries previnem
// "Saturday"/"Sample"): satellite(s), satelite(s)/satélite(s), sat/sats (bare),
// sat/seat to, sub-sat to, step to, seats (plural), mega sat(ellite).
// "Mega" puro NAO casa de proposito (evita falso-positivo "Mega Deep/Stack").
const SATELLITE_REGEX =
  /(?<![A-Za-z])(satellites?|satelites?|sat[eé]lites?|sats?|sat[\s\-]?to|sub[\s\-]?sat[\s\-]?to|step[\s\-]?to|seats?[\s\-]?to|seats|mega[\s\-]?sat(?:ellite)?s?)(?![A-Za-z])/i;

const SATELLITE_BLOCKLIST = /(Saturday|Sample|Sat\s*\d{1,2}\b|saturate)/i;

// Flight — Day 1A/1B/...1Z, Day 2, Final. Tambem aceita "1A"/"2"/"Final" puro
// quando aparece no fim do nome (ex: "Big Game Day 1B").
const FLIGHT_DAY_REGEX = /(?:^|[\s\-_/])(Day\s?\d+|\d+[A-Z]|Final)(?:[\s\-_/]|$)/i;

// Patterns explicit "Phase" / "Flight" / "Multi-day" tambem indicam multi-flight.
const FLIGHT_KEYWORD_REGEX = /(?<![A-Za-z])(flight|phase|multi[\s\-]?day)(?![A-Za-z])/i;

export interface TypeDetectionInput {
  name?: string | null;
  category?: string | null;
}

export interface DetectedTypeFields {
  type: TournamentPrimaryType;
  isFlight: boolean;
  allowsAddOn: boolean;
  allowsReentry: boolean;
  // Sprint library-evolution Fase 3 — profundidade de stack.
  startingStackBb: number | null;
  deepStack: boolean;
}

// >= esse valor de BB inicial conta como deepstack (alem da keyword "deep").
export const DEEP_STACK_BB_THRESHOLD = 50;

/**
 * Detecta a profundidade de stack inicial a partir do nome do torneio.
 * Reconhece "[10BB]", "10 BB", "100bb" e a keyword "deep"/"deepstack".
 * Tolera null/undefined. startingStackBb = null quando nao ha numero no nome.
 */
export function detectStackDepthFromName(
  name: string | null | undefined,
): { startingStackBb: number | null; deepStack: boolean } {
  if (!name || typeof name !== "string") {
    return { startingStackBb: null, deepStack: false };
  }
  const m = name.match(/\[?\s*(\d{1,3})\s*bb\b\s*\]?/i);
  const startingStackBb = m ? parseInt(m[1], 10) : null;
  const deepKeyword = /\bdeep\s?stack\b|\bdeep\b/i.test(name);
  const deepStack =
    deepKeyword ||
    (startingStackBb !== null && startingStackBb >= DEEP_STACK_BB_THRESHOLD);
  return { startingStackBb, deepStack };
}

/**
 * Detecta se torneio e Satellite a partir do nome. Tolera null/undefined.
 */
export function detectSatelliteFromName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string' || name.trim() === '') return false;
  if (SATELLITE_BLOCKLIST.test(name)) {
    if (!SATELLITE_REGEX.test(name.replace(SATELLITE_BLOCKLIST, ''))) return false;
  }
  return SATELLITE_REGEX.test(name);
}

/**
 * Detecta se torneio e parte de uma serie multi-flight (Flight modifier
 * ortogonal ADR-031). Match permissivo: qualquer "Day X", "Final", "1A/1B",
 * "Phase", "Flight", "Multi-day".
 */
export function detectIsFlightFromName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string' || name.trim() === '') return false;
  return FLIGHT_DAY_REGEX.test(name) || FLIGHT_KEYWORD_REGEX.test(name);
}

/**
 * Pipeline completo: dado name + category (legacy), retorna o conjunto
 * de campos do modelo ortogonal (type, isFlight, allowsAddOn, allowsReentry).
 *
 * Regras de prioridade (igual ao parser CSV):
 *   1. Mystery > PKO > Satellite > Add-on > Vanilla (no `type`)
 *   2. Categoria explicita do parser (PKO/Mystery) sempre prevalece
 *   3. Satellite e Add-on sao detectados pelo nome se categoria=Vanilla
 *   4. Flight e modificador independente — pode coexistir com qualquer tipo
 *   5. allowsAddOn=true automatico quando type=Add-on (coerencia semantica)
 */
export function enrichTournamentTypeFields(input: TypeDetectionInput): DetectedTypeFields {
  const name = input.name ?? '';
  const category = (input.category ?? '').trim();

  // Default flags do nome
  const reaFlags: DetectedFlags = detectAddonReaFromName(name);
  const nameSaysSatellite = detectSatelliteFromName(name);
  const isFlight = detectIsFlightFromName(name);

  let type: TournamentPrimaryType;

  // Categoria explicita do parser tem prioridade quando ja eh um tipo SSoT valido
  if ((TOURNAMENT_PRIMARY_TYPES as readonly string[]).includes(category)) {
    type = category as TournamentPrimaryType;
  } else if (category === 'Bounty') {
    // Legacy alias: Bounty -> PKO
    type = 'PKO';
  } else {
    // Categoria nao informada ou desconhecida — derive do nome
    if (nameSaysSatellite) type = 'Satellite';
    else if (reaFlags.allowsAddOn) type = 'Add-on';
    else type = 'Vanilla';
  }

  // Override: se parser disse Vanilla mas nome bate Satellite/Add-on, eleva.
  // (parser nao detecta Satellite hoje; Add-on sim, mas defesa em profundidade.)
  if (type === 'Vanilla' && nameSaysSatellite) type = 'Satellite';
  if (type === 'Vanilla' && reaFlags.allowsAddOn) type = 'Add-on';

  // Coerencia semantica: type=Add-on -> allowsAddOn=true
  const allowsAddOn = reaFlags.allowsAddOn || type === 'Add-on';

  const { startingStackBb, deepStack } = detectStackDepthFromName(name);

  return {
    type,
    isFlight,
    allowsAddOn,
    allowsReentry: reaFlags.allowsReentry,
    startingStackBb,
    deepStack,
  };
}
