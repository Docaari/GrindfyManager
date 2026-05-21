/**
 * Sprint TS-3 RF-06 — selectorGrade + rationale no payload /api/tournament-library
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-06)
 *
 * Fecha drift risk: remove inferGradeFromScore local em LibraryCardScoreBadge.
 *
 * Cenarios:
 *  1) Payload SEMPRE tem selectorGrade quando selectorScore != null
 *  2) Payload SEMPRE tem selectorRationale quando score presente
 *  3) Score null -> grade null + rationale null (sem fallback)
 *  4) Rationale recomputed on-the-fly via cache hit
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTournamentLibraryEntries = vi.fn();
const mockGetOrLoadBundle = vi.fn();
const mockComputeTournamentScore = vi.fn();

vi.mock("../../../server/storage", () => ({
  storage: {
    getTournamentLibraryEntries: (...a: any[]) => mockGetTournamentLibraryEntries(...a),
  },
}));

vi.mock("../../../server/services/playerBundle", () => ({
  playerBundleCache: {
    getOrLoad: (...a: any[]) => mockGetOrLoadBundle(...a),
  },
}));

vi.mock("../../../server/scoring/tournamentScorer", () => ({
  computeTournamentScore: (...a: any[]) => mockComputeTournamentScore(...a),
}));

function libraryEntry(overrides: any = {}) {
  return {
    id: "lib-1",
    name: "Sunday Million",
    site: "PokerStars",
    buyIn: 22,
    type: "Vanilla",
    speed: "Normal",
    dayOfWeek: 0,
    time: "20:00",
    fieldSize: 5000,
    totalPlayed: 50,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetTournamentLibraryEntries.mockReset();
  mockGetOrLoadBundle.mockReset();
  mockComputeTournamentScore.mockReset();

  mockGetOrLoadBundle.mockResolvedValue({ /* bundle stub */ });
});

describe("RF-06 — /api/tournament-library payload grade", () => {
  it("torneio top com score recebe selectorGrade + selectorRationale", async () => {
    mockGetTournamentLibraryEntries.mockResolvedValue([libraryEntry()]);
    mockComputeTournamentScore.mockReturnValue({
      score: 87,
      grade: "S",
      rationale: "Forte ROI em PokerStars",
    });

    // Implementer expoe o builder do payload para testabilidade:
    const { buildLibraryPayload } = await import(
      "../../../server/routes/tournament-library"
    );

    const result = await buildLibraryPayload({ userId: "USER-1" } as any);

    expect(result).toHaveLength(1);
    expect(result[0].selectorScore).toBe(87);
    expect(result[0].selectorGrade).toBe("S");
    expect(result[0].selectorRationale).toBe("Forte ROI em PokerStars");
  });

  it("torneio fora do top (score null) -> grade null + rationale null", async () => {
    // mais que TOP_N entries -> os "extras" ficam fora do top com score null.
    // Como TOP_N=50 no implementer, simulamos com 51 entries.
    const entries = Array.from({ length: 51 }, (_, i) =>
      libraryEntry({ id: `lib-${i}`, totalPlayed: 51 - i })
    );
    mockGetTournamentLibraryEntries.mockResolvedValue(entries);
    mockComputeTournamentScore.mockReturnValue({
      score: 75,
      grade: "A",
      rationale: "x",
    });

    const { buildLibraryPayload } = await import(
      "../../../server/routes/tournament-library"
    );
    const result = await buildLibraryPayload({ userId: "USER-1" } as any);
    // ultimo entry (totalPlayed=1) fica fora do top -> sem score
    const last = result.find((r: any) => r.id === "lib-50");
    expect(last.selectorScore).toBeNull();
    expect(last.selectorGrade).toBeNull();
    expect(last.selectorRationale).toBeNull();
  });

  it("dayOfWeek ausente -> score null + grade null (skip scoring)", async () => {
    mockGetTournamentLibraryEntries.mockResolvedValue([libraryEntry({ dayOfWeek: null })]);
    const { buildLibraryPayload } = await import(
      "../../../server/routes/tournament-library"
    );
    const result = await buildLibraryPayload({ userId: "USER-1" } as any);
    expect(result[0].selectorScore).toBeNull();
    expect(result[0].selectorGrade).toBeNull();
    expect(result[0].selectorRationale).toBeNull();
  });

  it("cache hit retorna o mesmo grade+rationale do compute anterior (sem recomputar)", async () => {
    mockGetTournamentLibraryEntries.mockResolvedValue([libraryEntry()]);
    mockComputeTournamentScore.mockReturnValue({
      score: 87,
      grade: "S",
      rationale: "cached-rationale-1",
    });

    const { buildLibraryPayload } = await import(
      "../../../server/routes/tournament-library"
    );

    const a = await buildLibraryPayload({ userId: "USER-1" } as any);
    expect(a[0].selectorRationale).toBe("cached-rationale-1");

    // segunda chamada — se cache funciona, NAO recomputa
    mockComputeTournamentScore.mockClear();
    const b = await buildLibraryPayload({ userId: "USER-1" } as any);
    expect(b[0].selectorRationale).toBe("cached-rationale-1");
    expect(b[0].selectorGrade).toBe("S");
    // Cache hit -> compute nao deve ter sido invocado novamente
    expect(mockComputeTournamentScore).toHaveBeenCalledTimes(0);
  });

  it("INVARIANTE: selectorScore != null IMPLICA selectorGrade != null", async () => {
    mockGetTournamentLibraryEntries.mockResolvedValue([
      libraryEntry({ id: "a" }),
      libraryEntry({ id: "b", totalPlayed: 30 }),
    ]);
    mockComputeTournamentScore.mockReturnValue({
      score: 60,
      grade: "B",
      rationale: "ok",
    });

    const { buildLibraryPayload } = await import(
      "../../../server/routes/tournament-library"
    );
    const result = await buildLibraryPayload({ userId: "USER-1" } as any);

    for (const r of result) {
      if (r.selectorScore != null) {
        expect(r.selectorGrade).not.toBeNull();
        expect(r.selectorRationale).not.toBeNull();
      }
    }
  });
});
