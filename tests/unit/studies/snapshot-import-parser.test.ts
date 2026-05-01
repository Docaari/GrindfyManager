// =============================================================================
// Sprint Stats-V2 — Paste-from-PT4 parser (RF-05)
//
// Red phase. Modulo `client/src/lib/snapshot-import-parser.ts` ainda nao existe.
//
// Funcao `parsePastedSnapshot(text: string)` retorna:
//   { matched, unmatched, invalid }
//   - matched: Record<statId, number>
//   - unmatched: Array<{ rawName, value }>
//   - invalid: Array<{ rawName, rawValue, reason }>
//
// Aliases conhecidos (RF-05 D7):
//   - 'vp' / 'voluntarily put $' => vpip
//   - 'pre-flop raise' => pfr
//   - '3b' => threebet_total
// =============================================================================

import { describe, it, expect } from "vitest";
import { parsePastedSnapshot } from "../../../client/src/lib/snapshot-import-parser";

describe("parsePastedSnapshot() — separator detection", () => {
  it("detecta tab-separated (PT4 default)", () => {
    const text = "VPIP\t22.5\nPFR\t18.0";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("detecta comma-separated", () => {
    const text = "VPIP,22.5\nPFR,18.0";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("detecta whitespace-separated (multiple spaces)", () => {
    const text = "VPIP   22.5\nPFR   18.0";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
  });

  it("retorna shape consistente { matched, unmatched, invalid }", () => {
    const text = "VPIP\t22.5";
    const result = parsePastedSnapshot(text);
    expect(result).toHaveProperty("matched");
    expect(result).toHaveProperty("unmatched");
    expect(result).toHaveProperty("invalid");
    expect(Array.isArray(result.unmatched)).toBe(true);
    expect(Array.isArray(result.invalid)).toBe(true);
  });
});

describe("parsePastedSnapshot() — matching", () => {
  it("match case-insensitive (vpip == VPIP == Vpip)", () => {
    const text = "vpip\t22.5\nVPIP\t23.0\nVpip\t24.0";
    // 3 linhas; ultima ganha (ou primeira; testa que ao menos uma matcha)
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBeDefined();
    expect(typeof result.matched.vpip).toBe("number");
  });

  it("match por id snake_case (rfi_btn => rfi_btn)", () => {
    const text = "rfi_btn\t40";
    const result = parsePastedSnapshot(text);
    expect(result.matched.rfi_btn).toBe(40);
  });

  it("alias 'vp' resolve para vpip", () => {
    const text = "VP\t22.5";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
  });

  it("alias 'voluntarily put $' resolve para vpip", () => {
    const text = "Voluntarily Put $\t22.5";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
  });

  it("alias 'pre-flop raise' resolve para pfr", () => {
    const text = "Pre-Flop Raise\t18.0";
    const result = parsePastedSnapshot(text);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("alias '3b' resolve para threebet_total", () => {
    const text = "3B\t7.2";
    const result = parsePastedSnapshot(text);
    expect(result.matched.threebet_total).toBe(7.2);
  });
});

describe("parsePastedSnapshot() — value normalization", () => {
  it("strip de '%' suffix em valores", () => {
    const text = "VPIP\t22.5%\nPFR\t18.0%";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("'N/A' vira null (mas nao invalid)", () => {
    const text = "VPIP\tN/A";
    const result = parsePastedSnapshot(text);
    // matched com null, OU unmatched (any of these is acceptable per spec)
    if ("vpip" in result.matched) {
      expect(result.matched.vpip).toBeNull();
    }
  });

  it("'-' vira null", () => {
    const text = "VPIP\t-";
    const result = parsePastedSnapshot(text);
    if ("vpip" in result.matched) {
      expect(result.matched.vpip).toBeNull();
    }
  });

  it("valor nao-numerico vira invalid", () => {
    const text = "VPIP\tfoo";
    const result = parsePastedSnapshot(text);
    const invalidEntry = result.invalid.find(
      (e) => e.rawName.toLowerCase() === "vpip",
    );
    expect(invalidEntry).toBeDefined();
    expect(invalidEntry?.reason).toBeTruthy();
  });
});

describe("parsePastedSnapshot() — edge cases", () => {
  it("linha vazia eh ignorada", () => {
    const text = "VPIP\t22.5\n\nPFR\t18.0\n";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("header nao-numerico (primeira linha) eh skipped", () => {
    const text = "Stat\tValue\nVPIP\t22.5";
    const result = parsePastedSnapshot(text);
    expect(result.matched.vpip).toBe(22.5);
    // 'Stat' nao deve aparecer em matched/unmatched/invalid (linha header skipped).
    const allRawNames = [
      ...result.unmatched.map((u) => u.rawName.toLowerCase()),
      ...result.invalid.map((i) => i.rawName.toLowerCase()),
    ];
    expect(allRawNames).not.toContain("stat");
  });

  it("stat name desconhecido vai pra unmatched (nao invalid)", () => {
    const text = "MEU_STAT_INVENTADO\t99";
    const result = parsePastedSnapshot(text);
    const unmatched = result.unmatched.find(
      (u) => u.rawName.toUpperCase() === "MEU_STAT_INVENTADO",
    );
    expect(unmatched).toBeDefined();
  });

  it("texto vazio retorna sem matches sem erro", () => {
    const result = parsePastedSnapshot("");
    expect(result.matched).toEqual({});
    expect(result.unmatched).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});
