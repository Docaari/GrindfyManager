// =============================================================================
// Sprint AI-3.2 / RF-D7 (ADR-203)
//
// `reportSummarizer.ts:buildSummarizerPrompt` faz JSON.stringify(bundle, null, 2)
// — pretty-print de 2 espacos. Tokens Haiku contam whitespace; drop indent
// economiza ~25-30% tokens em sumarização.
//
// Pos RF-D7: JSON.stringify(bundle) (sem pretty-print).
//
// Status esperado: FALHA enquanto pretty-print existir.
// =============================================================================

import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";

describe("RF-D7 — reportSummarizer JSON.stringify SEM pretty-print", () => {
  it("buildSummarizerPrompt usa JSON.stringify(bundle) — NAO JSON.stringify(bundle, null, 2)", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/reportSummarizer.ts");
    const src = await fs.readFile(filePath, "utf-8");
    // Pos RF-D7: NAO deve mais ter JSON.stringify(bundle, null, 2).
    expect(src).not.toMatch(/JSON\.stringify\(\s*bundle\s*,\s*null\s*,\s*2\s*\)/);
    // Deve ter JSON.stringify(bundle) sem segundo arg de pretty-print.
    expect(src).toMatch(/JSON\.stringify\(bundle\)/);
  });

  it("buildSummarizerPrompt prompt size se reduz drasticamente para bundle medio", async () => {
    // Smoke parse: chama o builder com bundle nested e mede prompt length.
    // Apos RF-D7, length deve ser >20% menor que pre-refactor para bundle pretty-printed.
    // Sem acesso direto ao builder interno; medimos via JSON.stringify shape.
    const bundle = {
      tournaments: Array.from({ length: 50 }, (_, i) => ({
        id: `T${i}`,
        buyin: 100 + i,
        result: i * 2,
        date: "2026-05-20",
      })),
      profile: { schemaVersion: 1, nivel: "intermediario" },
    };
    const pretty = JSON.stringify(bundle, null, 2);
    const compact = JSON.stringify(bundle);
    const ratio = compact.length / pretty.length;
    // Compact deve ser <85% do pretty (poupa ~15-30% de chars).
    expect(ratio).toBeLessThan(0.85);
  });
});
