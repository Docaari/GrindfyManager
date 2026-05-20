// =============================================================================
// Sprint AI-1C / RF-06 (ADR-160) — smoke tests para bulk_query_dimensions.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const fakeQuerySchema = z.object({
  dimension: z.enum(["roi", "profit", "volume", "itm", "abi", "fts", "cravadas"]),
  groupBy: z.enum(["site", "category", "speed", "buyinRange", "dayOfWeek", "month", "fieldSize"]).optional(),
  filters: z.any().optional(),
  period: z.enum(["all", "30d", "90d", "ytd", "180d"]).optional().default("all"),
});

beforeEach(() => {
  vi.resetModules();
});

describe("bulk_query_dimensions — batching", () => {
  it("validation_failed quando queries vazio", async () => {
    const { bulkQueryDimensionsTool } = await import("../../../server/coachTools/handlers/bulkQueryDimensions");
    const r = await bulkQueryDimensionsTool.handler({ queries: [] }, { userId: "U" } as any);
    expect(r?.ok).toBe(false);
    expect(r?.error).toBe("validation_failed");
  });

  it("validation_failed quando queries > 10", async () => {
    const { bulkQueryDimensionsTool } = await import("../../../server/coachTools/handlers/bulkQueryDimensions");
    const queries = Array.from({ length: 11 }, () => ({ dimension: "roi" }));
    const r = await bulkQueryDimensionsTool.handler({ queries }, { userId: "U" } as any);
    expect(r?.ok).toBe(false);
    expect(r?.error).toBe("validation_failed");
  });

  it("executa cada query via queryDimensionTool e retorna results na ordem", async () => {
    const handlerMock = vi.fn(async (input: any, ctx: any) => ({
      dimension: input.dimension,
      groupBy: input.groupBy ?? null,
      rows: [{ key: input.dimension, value: 1, count: 1 }],
      totalCount: 1,
      period: input.period ?? "all",
      userId: ctx.userId,
    }));
    vi.doMock("../../../server/coachTools/handlers/queryDimension", () => ({
      queryDimensionTool: { handler: handlerMock },
      queryDimensionInputSchema: fakeQuerySchema,
    }));
    const { bulkQueryDimensionsTool } = await import("../../../server/coachTools/handlers/bulkQueryDimensions");
    const r = await bulkQueryDimensionsTool.handler(
      {
        queries: [
          { label: "A", dimension: "roi" },
          { label: "B", dimension: "profit", groupBy: "site" },
        ],
      },
      { userId: "USER-1" } as any,
    );
    expect(r?.results).toHaveLength(2);
    expect(r.results[0].label).toBe("A");
    expect(r.results[0].dimension).toBe("roi");
    expect(r.results[1].label).toBe("B");
    expect(r.results[1].dimension).toBe("profit");
    expect(handlerMock).toHaveBeenCalledTimes(2);
  });

  it("erro em um item nao quebra os outros", async () => {
    let callCount = 0;
    const handlerMock = vi.fn(async (input: any) => {
      callCount += 1;
      if (callCount === 1) throw new Error("boom");
      return {
        dimension: input.dimension,
        rows: [],
        totalCount: 0,
        period: "all",
      };
    });
    vi.doMock("../../../server/coachTools/handlers/queryDimension", () => ({
      queryDimensionTool: { handler: handlerMock },
      queryDimensionInputSchema: fakeQuerySchema,
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bulkQueryDimensionsTool } = await import("../../../server/coachTools/handlers/bulkQueryDimensions");
    const r = await bulkQueryDimensionsTool.handler(
      { queries: [{ dimension: "roi" }, { dimension: "profit" }] },
      { userId: "U" } as any,
    );
    expect(r?.results).toHaveLength(2);
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].error).toBe("handler_error");
    expect(r.results[1].ok).not.toBe(false);
    errSpy.mockRestore();
  });

  it("tool meta: tier gate Pro+, auditLevel log, no confirmation", async () => {
    const { bulkQueryDimensionsTool } = await import("../../../server/coachTools/handlers/bulkQueryDimensions");
    expect(bulkQueryDimensionsTool.name).toBe("bulk_query_dimensions");
    expect(bulkQueryDimensionsTool.gateByTier).toEqual(["pro", "premium", "admin"]);
    expect(bulkQueryDimensionsTool.requiresConfirmation).toBe(false);
    expect(bulkQueryDimensionsTool.auditLevel).toBe("log");
  });
});
