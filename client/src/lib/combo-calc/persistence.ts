// Serializacao do estado da calculadora (persistencia localStorage + spots salvos).
import type { Card, RangeEntry } from "./types";
import { parseCard, cardKey } from "./cards";
import { parseNotation, clampFreq } from "./combos";

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
