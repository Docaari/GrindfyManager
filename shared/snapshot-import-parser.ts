// =============================================================================
// Sprint Stats-V2 — Paste + CSV snapshot import parser (RF-05)
//
// `parsePastedSnapshot(text)` aceita formato PT4 (tab/comma/whitespace).
// `parseCsvSnapshot(csv)`     aceita CSV com header opcional.
//
// Retorna `{ matched, unmatched, invalid }` (e opcionalmente `warnings` para
// CSV out-of-range em stats pct).
//
// Match strategy:
//   1. Match por `id` exato (case-insensitive).
//   2. Match por `label` (case-insensitive, normalize espacos).
//   3. Aliases conhecidos (RF-05 D7).
//   4. Fallback: rawName -> unmatched.
// =============================================================================

import { HUD_STAT_CATALOG, type StatField } from "./hud-stat-catalog";

export interface ParsedSnapshotResult {
  matched: Record<string, number | null>;
  unmatched: Array<{ rawName: string; value: number | null }>;
  invalid: Array<{ rawName: string; rawValue: string; reason: string }>;
  warnings?: Array<{ id?: string; rawName?: string; reason: string }>;
}

// -----------------------------------------------------------------------------
// Aliases conhecidos (lowercase). Retornam id do catalogo.
// -----------------------------------------------------------------------------
const ALIASES: Record<string, string> = {
  vp: "vpip",
  "voluntarily put $": "vpip",
  "voluntarily put money in pot": "vpip",
  vpip: "vpip",
  "pre-flop raise": "pfr",
  "pre flop raise": "pfr",
  pfr: "pfr",
  "3b": "threebet_total",
  "3bet": "threebet_total",
  "3-bet": "threebet_total",
  three_bet: "threebet_total",
};

// Pre-build label index (case-insensitive, normalized)
const LABEL_INDEX: Map<string, StatField> = (() => {
  const map = new Map<string, StatField>();
  for (const stat of HUD_STAT_CATALOG) {
    const labelKey = normalizeName(stat.label);
    if (!map.has(labelKey)) map.set(labelKey, stat);
    const idKey = normalizeName(stat.id);
    if (!map.has(idKey)) map.set(idKey, stat);
  }
  return map;
})();

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveStatId(rawName: string): string | undefined {
  const norm = normalizeName(rawName);
  if (ALIASES[norm]) return ALIASES[norm];
  const direct = LABEL_INDEX.get(norm);
  if (direct) return direct.id;
  // Try snake_case: "RFI BTN" -> "rfi_btn"
  const snaked = norm.replace(/[\s-]+/g, "_");
  const snakedHit = LABEL_INDEX.get(snaked);
  if (snakedHit) return snakedHit.id;
  // Try matching against id (case-insensitive)
  for (const stat of HUD_STAT_CATALOG) {
    if (stat.id.toLowerCase() === norm) return stat.id;
  }
  return undefined;
}

const NULL_TOKENS = new Set(["n/a", "na", "-", "—", "null", ""]);

function parseValueToken(rawValue: string, ptDecimal = false): {
  value: number | null;
  invalid: boolean;
  reason?: string;
} {
  const trimmed = rawValue.trim().replace(/%$/, "").trim();
  const lower = trimmed.toLowerCase();
  if (NULL_TOKENS.has(lower)) {
    return { value: null, invalid: false };
  }
  let candidate = trimmed;
  if (ptDecimal && /,\d+$/.test(candidate)) {
    candidate = candidate.replace(",", ".");
  } else if (ptDecimal && /^\d+,\d+$/.test(candidate)) {
    candidate = candidate.replace(",", ".");
  }
  const num = Number(candidate);
  if (!Number.isFinite(num)) {
    return { value: null, invalid: true, reason: `valor nao numerico: '${rawValue}'` };
  }
  return { value: num, invalid: false };
}

// -----------------------------------------------------------------------------
// Separator detection (paste)
// -----------------------------------------------------------------------------
function detectSeparator(line: string): "tab" | "comma" | "whitespace" {
  if (line.includes("\t")) return "tab";
  if (line.includes(",")) return "comma";
  return "whitespace";
}

function splitLine(line: string, sep: "tab" | "comma" | "whitespace"): string[] {
  switch (sep) {
    case "tab":
      return line.split("\t");
    case "comma":
      return line.split(",");
    case "whitespace":
      return line.trim().split(/\s{2,}|\s+(?=\S+$)/);
  }
}

// -----------------------------------------------------------------------------
// Header detection: a primeira linha e header se ambos os campos forem nao
// numericos (ex: "Stat\tValue").
// -----------------------------------------------------------------------------
function isHeaderLine(parts: string[]): boolean {
  if (parts.length < 2) return false;
  const first = parts[0]?.trim();
  const second = parts[1]?.trim();
  if (!first || !second) return false;
  const firstIsNumeric = Number.isFinite(Number(first.replace("%", "")));
  const secondIsNumeric = Number.isFinite(
    Number(second.replace(",", ".").replace("%", "")),
  );
  // Header = ambos nao-numericos. Mas se primeiro field eh stat conhecido
  // (vpip, pfr, etc.), nao eh header — eh dado de stat com valor invalido.
  if (firstIsNumeric || secondIsNumeric) return false;
  if (resolveStatId(first)) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Public: parsePastedSnapshot
// -----------------------------------------------------------------------------
export function parsePastedSnapshot(text: string): ParsedSnapshotResult {
  const result: ParsedSnapshotResult = {
    matched: {},
    unmatched: [],
    invalid: [],
  };
  if (!text || typeof text !== "string") return result;

  const rawLines = text.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return result;

  // Detect global separator from first non-empty line
  const sep = detectSeparator(nonEmpty[0]);

  let skippedHeader = false;
  for (let i = 0; i < nonEmpty.length; i++) {
    const line = nonEmpty[i];
    const parts = splitLine(line, sep)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length < 2) continue;

    // Skip header if first line and matches header pattern
    if (i === 0 && !skippedHeader && isHeaderLine(parts)) {
      skippedHeader = true;
      continue;
    }

    const rawName = parts[0];
    const rawValue = parts.slice(1).join(" ");

    const statId = resolveStatId(rawName);
    const parsed = parseValueToken(rawValue, false);

    if (parsed.invalid) {
      result.invalid.push({
        rawName,
        rawValue,
        reason: parsed.reason ?? "valor invalido",
      });
      continue;
    }

    if (statId) {
      result.matched[statId] = parsed.value;
    } else {
      result.unmatched.push({ rawName, value: parsed.value });
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Public: parseCsvSnapshot
// -----------------------------------------------------------------------------
export function parseCsvSnapshot(csvText: string): ParsedSnapshotResult {
  const result: ParsedSnapshotResult = {
    matched: {},
    unmatched: [],
    invalid: [],
    warnings: [],
  };
  if (!csvText || typeof csvText !== "string") return result;

  // Strip BOM
  let text = csvText.replace(/^﻿/, "");
  const rawLines = text.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return result;

  let skippedHeader = false;
  for (let i = 0; i < nonEmpty.length; i++) {
    const line = nonEmpty[i];
    // CSV: split por virgula. Em decimal PT-BR ("28,5"), 2 fields => detect.
    const allParts = line.split(",").map((p) => p.trim());
    // Filtrar apenas separadores vazios (linha "," vazia)
    const parts = allParts.filter((p) => p.length > 0);
    if (parts.length < 2) continue;

    // Skip header if first line and matches header pattern (stat,value)
    if (i === 0 && !skippedHeader && isHeaderLine(parts)) {
      skippedHeader = true;
      continue;
    }

    const rawName = parts[0];

    // Decimal PT-BR: "vpip,28,5" => parts=["vpip","28","5"] (3 parts).
    // Heuristica: se >2 parts e ultimo eh digit puro (curto), juntar com decimal.
    let rawValue: string;
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1]) && /^\d+$/.test(parts[parts.length - 2])) {
      rawValue = parts[parts.length - 2] + "." + parts[parts.length - 1];
    } else {
      rawValue = parts.slice(1).join(",");
    }

    const statId = resolveStatId(rawName);
    const parsed = parseValueToken(rawValue, true);

    if (parsed.invalid) {
      result.invalid.push({
        rawName,
        rawValue,
        reason: parsed.reason ?? "valor invalido",
      });
      continue;
    }

    if (statId) {
      // Out-of-range warning para stats pct
      if (parsed.value !== null) {
        const stat = HUD_STAT_CATALOG.find((s) => s.id === statId);
        if (stat?.unit === "pct" && (parsed.value < 0 || parsed.value > 100)) {
          // Estrategia: marcar invalid se claramente fora 0-100 (mais seguro;
          // teste aceita invalid OU warning).
          result.invalid.push({
            rawName,
            rawValue,
            reason: `valor fora 0-100 em stat pct (${parsed.value})`,
          });
          continue;
        }
      }
      result.matched[statId] = parsed.value;
    } else {
      result.unmatched.push({ rawName, value: parsed.value });
    }
  }

  return result;
}
