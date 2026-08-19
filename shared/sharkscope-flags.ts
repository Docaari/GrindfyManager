/**
 * sharkscope-flags — le a coluna `Bandeiras` / `Flags` do export do SharkScope.
 *
 * Sprint import-otimizacao (ADR-243). Antes esta coluna so alimentava
 * `detectCategory(name, flags)` por substring do NOME; o resultado medido no
 * export real de 1.183 torneios do founder:
 *   - `Satellite` aparecia em 104 linhas e so 6 eram classificadas como satelite
 *   - `Rebuy` (256) e `Multi-Entry` (815) nao viravam allowsAddOn/allowsReentry
 *     (ficavam false em 1179/1179 linhas)
 *
 * ESCOPO: exclusivo do formato SharkScope. Cada rede tem export proprio e
 * semantica propria — NAO reaproveitar este parser em parser de rede nativa sem
 * conferir os tokens daquela rede (lesson: generalizar formato quebra rede).
 *
 * Funcao PURA (sem Date, sem I/O). Tokens desconhecidos NAO sao descartados:
 * voltam em `flags` para persistir em `tournaments.flags` (jsonb) — assim uma
 * bandeira nova do SharkScope nunca vira perda silenciosa de dado.
 */

import type { TournamentPrimaryType } from "./tournamentTypes";

export interface SharkscopeFlagSignals {
  /** Tokens crus (normalizados em Title-Case-Hifen), na ordem do CSV. */
  flags: string[];
  /**
   * Tipo primario sugerido pelas bandeiras, ou null quando as bandeiras nao
   * dizem nada sobre tipo (caller mantem o que veio do nome).
   * Precedencia: Satellite > Mystery > PKO > Add-on.
   * `allowsRebuy` NAO entra aqui (ADR-251): permitir rebuy e atributo do
   * torneio, nao a categoria dele.
   */
  primaryType: TournamentPrimaryType | null;
  /** `Multi-Entry` / `Re-Entry` / `Unlimited-Re-Entry`. */
  allowsReentry: boolean;
  /**
   * `Add-On` de verdade — a compra unica do intervalo. NAO inclui rebuy:
   * sao estruturas diferentes e independentes (ADR-251).
   */
  allowsAddOn: boolean;
  /** `Rebuy` — recompra de stack durante o periodo de rebuy. */
  allowsRebuy: boolean;
  /** `Deep-Stack`. */
  deepStack: boolean;
  /** `Multi-Day` (day 1 + day 2). */
  isMultiDay: boolean;
  /** `6-Max` -> 6, `Heads-Up` -> 2, `4-Max` -> 4. null quando nao declarado. */
  maxPlayersPerTable: number | null;
  /** Qualquer variante de bounty (bounty puro, progressivo, mystery, jackpot). */
  isBounty: boolean;
  /** `Progressive-Bounty` / `Progressive-Knockout`. */
  isProgressive: boolean;
  /** `Shootout`. */
  isShootout: boolean;
  /** `Freezeout` (sem re-entry por definicao). */
  isFreezeout: boolean;
}

/** Token cru -> forma canonica. Comparacao case-insensitive e sem separador. */
function canonicalToken(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Chave de comparacao: minusculo, sem hifen/espaco/underscore. */
function compareKey(token: string): string {
  return token.toLowerCase().replace(/[\s\-_]/g, "");
}

const SATELLITE_KEYS = new Set(["satellite", "satellites", "sat", "sats", "steps", "step"]);
const MYSTERY_KEYS = new Set(["mysterybounty", "mystery", "mysteryko"]);
const BOUNTY_KEYS = new Set([
  "bounty",
  "knockout",
  "ko",
  "bountyhunter",
  "jackpotbounty",
  "tieredbounty",
]);
const PROGRESSIVE_KEYS = new Set(["progressivebounty", "progressiveknockout", "pko", "progressive"]);
const REENTRY_KEYS = new Set([
  "multientry",
  "reentry",
  "reentries",
  "unlimitedreentry",
  "multientries",
]);
// ADR-251: `rebuy` saiu daqui. A bandeira Rebuy ligava allowsAddOn e o torneio
// virava tipo "Add-on" — 4307 linhas do historico real classificadas errado,
// nenhuma delas com add-on de verdade.
const ADDON_KEYS = new Set(["addon", "addons", "rebuyaddon"]);
const REBUY_KEYS = new Set(["rebuy", "rebuys", "rebuyaddon"]);
const DEEP_KEYS = new Set(["deepstack", "deep", "superdeep", "hyperdeep"]);
const MULTIDAY_KEYS = new Set(["multiday", "twoday", "day1", "day2"]);
const SHOOTOUT_KEYS = new Set(["shootout"]);
const FREEZEOUT_KEYS = new Set(["freezeout"]);

/** `6-Max` / `8-Max` / `Heads-Up` -> numero de jogadores por mesa. */
function tableSizeFromToken(key: string): number | null {
  if (key === "headsup" || key === "hu") return 2;
  const m = /^(\d{1,2})max$/.exec(key);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 2 && n <= 10 ? n : null;
  }
  return null;
}

/**
 * Interpreta a string de bandeiras do SharkScope (tokens separados por espaco).
 * Aceita null/undefined/vazio -> sinais todos neutros, `flags: []`.
 */
export function parseSharkscopeFlags(raw: unknown): SharkscopeFlagSignals {
  const out: SharkscopeFlagSignals = {
    flags: [],
    primaryType: null,
    allowsReentry: false,
    allowsAddOn: false,
    allowsRebuy: false,
    deepStack: false,
    isMultiDay: false,
    maxPlayersPerTable: null,
    isBounty: false,
    isProgressive: false,
    isShootout: false,
    isFreezeout: false,
  };
  if (raw === null || raw === undefined) return out;
  const text = String(raw).trim();
  if (text === "") return out;

  let satellite = false;
  let mystery = false;

  for (const rawToken of text.split(/\s+/)) {
    const token = canonicalToken(rawToken);
    if (token === "") continue;
    out.flags.push(token);
    const key = compareKey(token);

    if (SATELLITE_KEYS.has(key)) satellite = true;
    if (MYSTERY_KEYS.has(key)) {
      mystery = true;
      out.isBounty = true;
    }
    if (PROGRESSIVE_KEYS.has(key)) {
      out.isProgressive = true;
      out.isBounty = true;
    }
    if (BOUNTY_KEYS.has(key)) out.isBounty = true;
    if (REENTRY_KEYS.has(key)) out.allowsReentry = true;
    if (ADDON_KEYS.has(key)) out.allowsAddOn = true;
    if (REBUY_KEYS.has(key)) out.allowsRebuy = true;
    if (DEEP_KEYS.has(key)) out.deepStack = true;
    if (MULTIDAY_KEYS.has(key)) out.isMultiDay = true;
    if (SHOOTOUT_KEYS.has(key)) out.isShootout = true;
    if (FREEZEOUT_KEYS.has(key)) out.isFreezeout = true;

    const tableSize = tableSizeFromToken(key);
    if (tableSize !== null) out.maxPlayersPerTable = tableSize;
  }

  // Freezeout e declaracao explicita de "sem re-entry": vence Multi-Entry se
  // ambos aparecerem (nao deveriam coexistir; defesa contra export inconsistente).
  if (out.isFreezeout) out.allowsReentry = false;

  // Precedencia do tipo primario (mutex — ADR-031).
  if (satellite) out.primaryType = "Satellite";
  else if (mystery) out.primaryType = "Mystery";
  else if (out.isBounty) out.primaryType = "PKO";
  else if (out.allowsAddOn) out.primaryType = "Add-on";

  return out;
}
