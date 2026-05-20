// =============================================================================
// Sprint AI-2A / RF-06.5 (ADR-166) — query_pool_intelligence
//
// Cobre:
//   - Zod: site/namePattern optionals.
//   - Filtra por site e namePattern LIKE case-insensitive.
//   - Tabela vazia -> { rows:[], note:'pool_intelligence_not_seeded' }.
//   - Sem match -> { rows:[], note:'no_match' }.
//   - Descritor: read tool + Pro+.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("query_pool_intelligence — Zod validation", () => {
  it("aceita input vazio (todos optional)", async () => {
    const { queryPoolIntelligenceInputSchema } = await import(
      "../../../../server/coachTools/handlers/queryPoolIntelligence"
    );
    expect(queryPoolIntelligenceInputSchema.safeParse({}).success).toBe(true);
  });

  it("aceita site + namePattern", async () => {
    const { queryPoolIntelligenceInputSchema } = await import(
      "../../../../server/coachTools/handlers/queryPoolIntelligence"
    );
    expect(
      queryPoolIntelligenceInputSchema.safeParse({ site: "WPN", namePattern: "sunday" }).success,
    ).toBe(true);
  });
});

describe("query_pool_intelligence — execucao", () => {
  it("tabela vazia -> note='pool_intelligence_not_seeded'", async () => {
    const injectedStorage: any = {
      queryTournamentPoolIntelligence: vi.fn(async () => ({ rows: [], totalRows: 0 })),
    };
    const { queryPoolIntelligenceTool } = await import(
      "../../../../server/coachTools/handlers/queryPoolIntelligence"
    );
    const r: any = await queryPoolIntelligenceTool.handler(
      {},
      { userId: "U", injectedStorage } as any,
    );
    expect(Array.isArray(r.rows)).toBe(true);
    expect(r.rows.length).toBe(0);
    // Quando vazio, queremos sinalizar — pool_intelligence_not_seeded ou no_match.
    expect(r.note).toMatch(/pool_intelligence_not_seeded|no_match/);
  });

  it("retorna rows do storage quando match", async () => {
    const injectedStorage: any = {
      queryTournamentPoolIntelligence: vi.fn(async () => ({
        rows: [
          {
            site: "WPN",
            tournamentPattern: "Sunday Million",
            buyInMin: 200,
            buyInMax: 250,
            fieldAvg: 1800,
            poolQuality: "medium",
            notes: "Domingo 19h BRT",
          },
        ],
        totalRows: 1,
      })),
    };
    const { queryPoolIntelligenceTool } = await import(
      "../../../../server/coachTools/handlers/queryPoolIntelligence"
    );
    const r: any = await queryPoolIntelligenceTool.handler(
      { site: "WPN", namePattern: "sunday" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].tournamentPattern).toMatch(/Sunday/);
    // namePattern -> chamou storage com filtro
    expect(injectedStorage.queryTournamentPoolIntelligence).toHaveBeenCalled();
    const args = injectedStorage.queryTournamentPoolIntelligence.mock.calls[0][0];
    expect(args.site).toBe("WPN");
    expect(args.namePattern).toBe("sunday");
  });
});

describe("query_pool_intelligence — descritor", () => {
  it("read tool + tier Pro+", async () => {
    const { queryPoolIntelligenceTool } = await import(
      "../../../../server/coachTools/handlers/queryPoolIntelligence"
    );
    expect(queryPoolIntelligenceTool.name).toBe("query_pool_intelligence");
    expect(queryPoolIntelligenceTool.requiresConfirmation).toBeFalsy();
    expect(queryPoolIntelligenceTool.auditLevel).toBe("log");
    expect(queryPoolIntelligenceTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
