// Serializacao do estado da calculadora (persistencia localStorage + spots salvos).
import type { Card, RangeEntry } from "./types";
import { parseCard, cardKey } from "./cards";
import { parseNotation, clampFreq } from "./combos";
import { heroRangeFromHand } from "./spotV2";

export interface SerializedSpot {
  board: string[]; // cardKeys
  hero: string[];
  entries: RangeEntry[];
  potInput: string;
  callInput: string;
  bbInput: string;
}

export interface SavedSpot extends SerializedSpot {
  id: string;
  name: string;
  savedAt: number; // epoch ms (passado pelo caller; modulo nao usa Date)
}

export interface CalcState {
  board: Card[];
  hero: Card[];
  entries: RangeEntry[];
  potInput: string;
  callInput: string;
  bbInput: string;
}

const DRAFT_KEY = "grindfy.comboCalc.draft.v1";
const SPOTS_KEY = "grindfy.comboCalc.spots.v1";

export function serializeState(s: CalcState): SerializedSpot {
  return {
    board: s.board.map(cardKey),
    hero: s.hero.map(cardKey),
    entries: s.entries,
    potInput: s.potInput,
    callInput: s.callInput,
    bbInput: s.bbInput,
  };
}

/** Saneia uma entry vinda do storage (descarta shapes invalidos). */
function sanitizeEntry(raw: unknown): RangeEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.notation !== "string") return null;
  const parsed = parseNotation(e.notation);
  if (!parsed) return null;
  const freq = typeof e.frequency === "number" ? clampFreq(e.frequency) : 1;
  const out: RangeEntry = { notation: e.notation, kind: parsed.kind, frequency: freq };
  if (Array.isArray(e.suits) && e.suits.every((x) => typeof x === "string")) {
    out.suits = e.suits as string[];
  }
  if (e.comboFreqOverrides && typeof e.comboFreqOverrides === "object") {
    out.comboFreqOverrides = e.comboFreqOverrides as Record<string, number>;
  }
  return out;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Filtra uma lista crua de cartas para cardKeys validos e normalizados ("10c" -> "Tc"). */
function sanitizeCardKeys(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const c = parseCard(item);
    if (c) out.push(cardKey(c));
  }
  return out;
}

/**
 * Saneia UM spot salvo. Antes so o conjunto era checado (`Array.isArray`) e item
 * nenhum: um item com `board` string derrubava a pagina inteira no
 * `s.board.join(" ")` do render. Item ilegivel some em silencio; a tela fica de pe.
 */
export function sanitizeSavedSpot(raw: unknown): SavedSpot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  // id e a chave de React e o alvo do delete; sem ele o item nao e utilizavel.
  if (typeof s.id !== "string" || s.id === "") return null;
  if (typeof s.name !== "string") return null;
  if (!Array.isArray(s.board) || !Array.isArray(s.hero) || !Array.isArray(s.entries)) {
    return null;
  }
  return {
    id: s.id,
    name: s.name,
    savedAt: typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : 0,
    board: sanitizeCardKeys(s.board),
    hero: sanitizeCardKeys(s.hero),
    entries: s.entries.map(sanitizeEntry).filter((e): e is RangeEntry => e != null),
    potInput: asStr(s.potInput),
    callInput: asStr(s.callInput),
    bbInput: asStr(s.bbInput),
  };
}

/**
 * Estado pronto para a calculadora a partir de um spot salvo — sempre a partir
 * dos campos SANEADOS. O `loadSpot` antigo lia `s.potInput` cru ao lado do
 * `deserializeState`, entao um numero no storage vazava para um `<Input value>`.
 */
export function hydrateSpot(raw: unknown): CalcState | null {
  const s = sanitizeSavedSpot(raw);
  if (!s) return null;
  return {
    board: s.board.map(parseCard).filter((c): c is Card => c != null),
    hero: s.hero.map(parseCard).filter((c): c is Card => c != null),
    entries: s.entries,
    potInput: s.potInput,
    callInput: s.callInput,
    bbInput: s.bbInput,
  };
}

export function deserializeState(s: SerializedSpot | null): Partial<CalcState> | null {
  if (!s || typeof s !== "object") return null;
  const board = (Array.isArray(s.board) ? s.board : [])
    .map(parseCard)
    .filter((c): c is Card => c != null);
  const hero = (Array.isArray(s.hero) ? s.hero : [])
    .map(parseCard)
    .filter((c): c is Card => c != null);
  const entries = (Array.isArray(s.entries) ? s.entries : [])
    .map(sanitizeEntry)
    .filter((e): e is RangeEntry => e != null);
  return {
    board,
    hero,
    entries,
    potInput: asStr(s.potInput),
    callInput: asStr(s.callInput),
    bbInput: asStr(s.bbInput),
  };
}

function safeGet(key: string): unknown {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* quota / privacy mode — ignora */
  }
}

export function saveDraft(s: CalcState): void {
  safeSet(DRAFT_KEY, serializeState(s));
}
export function loadDraft(): Partial<CalcState> | null {
  return deserializeState(safeGet(DRAFT_KEY) as SerializedSpot | null);
}

export function loadSavedSpots(): SavedSpot[] {
  const v = safeGet(SPOTS_KEY);
  if (!Array.isArray(v)) return [];
  return v.map(sanitizeSavedSpot).filter((s): s is SavedSpot => s != null);
}
export function persistSavedSpots(spots: SavedSpot[]): void {
  safeSet(SPOTS_KEY, spots);
}

// ── v2: o heroi tambem e um range (F1, ADR-246 D-F1-9) ───────
//
// As chaves v2 sao NOVAS e as v1 NAO sao apagadas. Nao apagar e barato e compra o
// caminho de volta: se a F1 precisar ser revertida em producao, o dado do jogador
// continua no formato que a versao anterior le.

export const DRAFT_KEY_V2 = "grindfy.comboCalc.draft.v2";
export const SPOTS_KEY_V2 = "grindfy.comboCalc.spots.v2";

export interface CalcStateV2 {
  board: Card[];
  heroRange: RangeEntry[];
  entries: RangeEntry[];
  potInput: string;
  callInput: string;
  bbInput: string;
}

export interface SavedSpotV2 {
  id: string;
  name: string;
  savedAt: number;
  board: string[]; // cardKeys
  heroRange: RangeEntry[];
  entries: RangeEntry[];
  potInput: string;
  callInput: string;
  bbInput: string;
}

function sanitizeEntries(raw: unknown): RangeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeEntry).filter((e): e is RangeEntry => e != null);
}

/**
 * Converte um rascunho v1 (`hero: string[]`) para v2 (`heroRange`). Heroi
 * incompleto ou ilegivel vira `heroRange: []` — nao null e nao lixo: o resto do
 * rascunho (bordo, range do vilao, apostas) continua servindo.
 */
export function migrateDraftV1ToV2(raw: unknown): CalcStateV2 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;

  const board = (Array.isArray(s.board) ? s.board : [])
    .map((k) => (typeof k === "string" ? parseCard(k) : null))
    .filter((c): c is Card => c != null);

  const heroCards = (Array.isArray(s.hero) ? s.hero : [])
    .map((k) => (typeof k === "string" ? parseCard(k) : null))
    .filter((c): c is Card => c != null);
  const heroRange =
    heroCards.length === 2 ? heroRangeFromHand([heroCards[0], heroCards[1]]) : [];

  return {
    board,
    heroRange,
    entries: sanitizeEntries(s.entries),
    potInput: asStr(s.potInput),
    callInput: asStr(s.callInput),
    bbInput: asStr(s.bbInput),
  };
}

function deserializeStateV2(raw: unknown): CalcStateV2 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  return {
    board: (Array.isArray(s.board) ? s.board : [])
      .map((k) => (typeof k === "string" ? parseCard(k) : null))
      .filter((c): c is Card => c != null),
    heroRange: sanitizeEntries(s.heroRange),
    entries: sanitizeEntries(s.entries),
    potInput: asStr(s.potInput),
    callInput: asStr(s.callInput),
    bbInput: asStr(s.bbInput),
  };
}

export function saveDraftV2(state: CalcStateV2): void {
  safeSet(DRAFT_KEY_V2, {
    board: state.board.map(cardKey),
    heroRange: state.heroRange,
    entries: state.entries,
    potInput: state.potInput,
    callInput: state.callInput,
    bbInput: state.bbInput,
  });
}

/** Le a v2; na ausencia dela, le a v1 UMA vez e converte. A v1 fica onde esta. */
export function loadDraftV2(): CalcStateV2 | null {
  const v2 = deserializeStateV2(safeGet(DRAFT_KEY_V2));
  if (v2) return v2;
  return migrateDraftV1ToV2(safeGet(DRAFT_KEY));
}

function sanitizeSavedSpotV2(raw: unknown): SavedSpotV2 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id === "") return null;
  if (typeof s.name !== "string") return null;
  if (!Array.isArray(s.board) || !Array.isArray(s.entries)) return null;

  // Spot v1 nao tem `heroRange`; tem `hero: string[]`. Aceitar os dois e o que faz
  // o item 7 do handoff ("um spot salvo antes da F1 abre normal") valer.
  let heroRange: RangeEntry[];
  if (Array.isArray(s.heroRange)) {
    heroRange = sanitizeEntries(s.heroRange);
  } else if (Array.isArray(s.hero)) {
    const heroCards = s.hero
      .map((k) => (typeof k === "string" ? parseCard(k) : null))
      .filter((c): c is Card => c != null);
    heroRange = heroCards.length === 2 ? heroRangeFromHand([heroCards[0], heroCards[1]]) : [];
  } else {
    return null;
  }

  return {
    id: s.id,
    name: s.name,
    savedAt: typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : 0,
    board: sanitizeCardKeys(s.board),
    heroRange,
    entries: sanitizeEntries(s.entries),
    potInput: asStr(s.potInput),
    callInput: asStr(s.callInput),
    bbInput: asStr(s.bbInput),
  };
}

/** Le a v2; na ausencia dela, le a v1 e converte. Saneia item a item (F0 RF-00.4). */
export function loadSavedSpotsV2(): SavedSpotV2[] {
  const v2 = safeGet(SPOTS_KEY_V2);
  if (Array.isArray(v2)) {
    return v2.map(sanitizeSavedSpotV2).filter((s): s is SavedSpotV2 => s != null);
  }
  const v1 = safeGet(SPOTS_KEY);
  if (!Array.isArray(v1)) return [];
  return v1.map(sanitizeSavedSpotV2).filter((s): s is SavedSpotV2 => s != null);
}

export function persistSavedSpotsV2(spots: SavedSpotV2[]): void {
  safeSet(SPOTS_KEY_V2, spots);
}

// ── biblioteca de ranges (F2, RF-02.5) ────────────────────────
//
// Um range salvo e SEPARADO de um spot salvo: nao carrega bordo, mao do
// heroi, nem apostas — so a lista de classes, pra ser aplicavel em QUALQUER
// lado (heroi ou vilao) de qualquer spot. Chave propria, nao reaproveita
// `SPOTS_KEY_V2`.

export const RANGE_LIBRARY_KEY = "grindfy.comboCalc.rangeLibrary.v1";

export interface SavedRange {
  id: string;
  name: string;
  savedAt: number;
  entries: RangeEntry[];
}

function sanitizeSavedRange(raw: unknown): SavedRange | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id === "") return null;
  if (typeof s.name !== "string") return null;
  if (!Array.isArray(s.entries)) return null;
  return {
    id: s.id,
    name: s.name,
    savedAt: typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : 0,
    entries: sanitizeEntries(s.entries),
  };
}

export function loadRangeLibrary(): SavedRange[] {
  const v = safeGet(RANGE_LIBRARY_KEY);
  if (!Array.isArray(v)) return [];
  return v.map(sanitizeSavedRange).filter((r): r is SavedRange => r != null);
}

export function persistRangeLibrary(ranges: SavedRange[]): void {
  safeSet(RANGE_LIBRARY_KEY, ranges);
}
