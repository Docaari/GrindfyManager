// =============================================================================
// Sprint AI-3.2 / RF-E1 (ADR-203)
//
// Reviewer AI-3.1 MEDIUM: storage.countGrindSessions (AI-3.1) tem try/catch
// que engole `db.select is not a function` retornando 0. Sem teste garantindo
// que `gte(grindSessions.date, ...)` foi chamado, regressao pode passar silenciosa.
//
// Opcao B (unit) — mock db.select retornando [{n: count}] + spy em gte.
// Lesson #9 — log warn antes de retornar 0.
//
// Status esperado: FALHA porque o teste cobre cenarios novos (spy em gte, log).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RF-E1 — countGrindSessions: happy path com range filter", () => {
  it("retorna count do db.select quando rows = [{n: 5}]", async () => {
    const COUNT = 5;
    const whereSpy = vi.fn(() => Promise.resolve([{ n: COUNT }]));
    const fromSpy = vi.fn(() => ({ where: whereSpy }));
    const selectSpy = vi.fn(() => ({ from: fromSpy }));
    const dbMock = { select: selectSpy };

    vi.doMock("../../../server/db", () => ({ db: dbMock }));

    // Importa apos mock pra capturar o db modulado.
    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado (red phase)");
    }
    const result = await storage.countGrindSessions("USER-1", {
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(result).toBe(COUNT);
  });

  it("gte(grindSessions.date, fromDate) foi chamado quando range provided", async () => {
    // Spy via mock no drizzle-orm — gte fn registra calls.
    const gteSpy = vi.fn((col: any, val: any) => ({ _op: "gte", col, val }));
    const lteSpy = vi.fn((col: any, val: any) => ({ _op: "lte", col, val }));
    const eqSpy = vi.fn((col: any, val: any) => ({ _op: "eq", col, val }));
    const andSpy = vi.fn((...args: any[]) => ({ _op: "and", args }));

    // Pos-reviewer MEDIUM-1 (lesson #36) — mock drizzle precisa de `relations`
    // pra @shared/schema carregar (faz `import { relations } from "drizzle-orm"`).
    vi.doMock("drizzle-orm", () => ({
      eq: eqSpy,
      and: andSpy,
      gte: gteSpy,
      lte: lteSpy,
      sql: (template: TemplateStringsArray | string) => ({ _sql: String(template) }),
      relations: vi.fn(() => ({})),
    }));
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ n: 3 }]),
          }),
        }),
      },
    }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    await storage.countGrindSessions("USER-1", {
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(gteSpy).toHaveBeenCalled();
    expect(lteSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalled();
  });
});

describe("RF-E1 — countGrindSessions: throw path swallow + log #9", () => {
  it("db.select throw → handler retorna 0 + console.error chamado (lesson #9)", async () => {
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => {
          throw new Error("db.select is not a function");
        },
      },
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    const result = await storage.countGrindSessions("USER-1", {
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(result).toBe(0);
    // Lesson #9: log antes de fallback.
    const errorCalls = errorSpy.mock.calls.filter((c) => {
      const tag = String(c[0] ?? "");
      return tag.includes("storage.countGrindSessions");
    });
    expect(errorCalls.length).toBeGreaterThan(0);
  });

  it("range null → conta TODAS as sessoes do user (sem gte/lte)", async () => {
    const gteSpy = vi.fn((col: any, val: any) => ({ _op: "gte", col, val }));
    const lteSpy = vi.fn((col: any, val: any) => ({ _op: "lte", col, val }));
    const eqSpy = vi.fn((col: any, val: any) => ({ _op: "eq", col, val }));

    // Pos-reviewer MEDIUM-1 (lesson #36) — relations precisa estar mockado.
    vi.doMock("drizzle-orm", () => ({
      eq: eqSpy,
      and: vi.fn((...args: any[]) => ({ _op: "and", args })),
      gte: gteSpy,
      lte: lteSpy,
      sql: (template: TemplateStringsArray | string) => ({ _sql: String(template) }),
      relations: vi.fn(() => ({})),
    }));
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ n: 100 }]),
          }),
        }),
      },
    }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    const result = await storage.countGrindSessions("USER-1", null);
    expect(result).toBe(100);
    // Sem range — gte/lte NAO devem ser chamados.
    expect(gteSpy).not.toHaveBeenCalled();
    expect(lteSpy).not.toHaveBeenCalled();
    // user filter via eq ainda chamado.
    expect(eqSpy).toHaveBeenCalled();
  });
});

describe("RF-E1 — countGrindSessions: where() chamado com user filter", () => {
  it("where() invoca apos from() encadeado com user condition", async () => {
    const whereSpy = vi.fn(() => Promise.resolve([{ n: 7 }]));
    const fromSpy = vi.fn(() => ({ where: whereSpy }));
    const selectSpy = vi.fn(() => ({ from: fromSpy }));

    vi.doMock("../../../server/db", () => ({ db: { select: selectSpy } }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    await storage.countGrindSessions("USER-WHERE", null);

    expect(selectSpy).toHaveBeenCalled();
    expect(fromSpy).toHaveBeenCalled();
    expect(whereSpy).toHaveBeenCalled();
  });
});

describe("RF-E1 — countGrindSessions: edge cases", () => {
  it("rows vazio [] → retorna 0", async () => {
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      },
    }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    const result = await storage.countGrindSessions("USER-EMPTY", null);
    expect(result).toBe(0);
  });

  it("n NaN no row → fallback 0", async () => {
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ n: NaN }]),
          }),
        }),
      },
    }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    const result = await storage.countGrindSessions("USER-NAN", null);
    expect(result).toBe(0);
  });

  it("range com datas invalidas → ignora filter (nao throw)", async () => {
    const whereSpy = vi.fn(() => Promise.resolve([{ n: 12 }]));
    vi.doMock("../../../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({ where: whereSpy }),
        }),
      },
    }));

    const { storage } = await import("../../../server/storage");
    if (typeof storage.countGrindSessions !== "function") {
      throw new Error("storage.countGrindSessions nao implementado");
    }
    const result = await storage.countGrindSessions("USER-X", {
      from: "not-a-date",
      to: "also-bad",
    });
    expect(typeof result).toBe("number");
    expect(result).toBe(12);
  });
});
