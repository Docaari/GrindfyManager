// F2 — RF-02.5, parser puro de range colavel (formato solver / GTO Wizard),
// espelha o token-loop que `CombosCalculator.applyRangeString` ja validava
// (RF-00.6/RF-00.7) — extraido para ser reutilizavel por `RangeLibrary.tsx`
// sem duplicar a gramatica. `expandRangeToken`/`parseImportedFrequency`
// continuam sendo a fonte unica (D9 do indice do Range Lab: sem gramatica
// paralela).
import type { RangeEntry } from "./types";
import { expandRangeToken, parseNotation } from "./combos";
import { parseImportedFrequency } from "./uiRules";

export interface ParsedRangeText {
  entries: RangeEntry[];
  warnings: string[];
}

/**
 * Parseia texto colavel ("99+, ATs+:50, A5s-A2s, QhJh") em `RangeEntry[]`.
 * Token ilegivel ou frequencia fora da faixa vira aviso nomeado, nao silencio
 * (00-produto.md: numero errado perde para numero ausente). Token repetido no
 * mesmo texto: o ULTIMO vence (mesma regra do `applyRangeString` original).
 */
export function parseRangeText(text: string): ParsedRangeText {
  // A virgula e separador de token E separador decimal em PT-BR — normaliza
  // ANTES de separar, so a virgula dentro de uma frequencia.
  const tokens = text
    .replace(/([:=]\s*\d+),(\d)/g, "$1.$2")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const entries: RangeEntry[] = [];

  for (const tok of tokens) {
    const m = tok.match(/^(.+?)\s*[:=]\s*(\S+?)%?$/) ?? tok.match(/^(\S+)$/);
    if (!m) {
      warnings.push(`Token ignorado: ${tok}`);
      continue;
    }

    let freq = 1;
    if (m[2] != null) {
      const parsedFreq = parseImportedFrequency(m[2]);
      if (!parsedFreq.ok) {
        warnings.push(
          parsedFreq.reason === "out_of_range"
            ? `Frequencia fora da faixa 0-100 em "${tok}" (${parsedFreq.raw}) — token recusado.`
            : `Frequencia ilegivel em "${tok}" (${parsedFreq.raw}) — token recusado.`,
        );
        continue;
      }
      freq = parsedFreq.frequency;
    }

    const expanded = expandRangeToken(m[1].trim());
    if (expanded.length === 0) {
      warnings.push(`Notacao nao reconhecida: ${m[1].trim()}`);
      continue;
    }

    for (const base of expanded) {
      const parsed = parseNotation(base);
      if (!parsed) continue;
      const idx = entries.findIndex((e) => e.notation === base);
      if (idx >= 0) entries[idx] = { ...entries[idx], frequency: freq };
      else entries.push({ notation: base, kind: parsed.kind, frequency: freq });
    }
  }

  return { entries, warnings };
}
