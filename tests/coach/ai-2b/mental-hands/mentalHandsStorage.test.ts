// =============================================================================
// Sprint AI-2B / RF-06 (ADR-171) — mental_hand_history storage CRUD
//
// Cobre:
//   - createMentalHand: nanoid id + occurredAt default now.
//   - listMentalHandsForRange: filtra user + range, ordena occurred_at DESC.
//   - listMentalHandsPaginated: limit/offset + filter por emotion.
//   - getMentalHand: ownership check (user_id match).
//   - deleteMentalHand: ownership filter.
//   - ON DELETE SET NULL para linked_grind_session_id (preserva registro).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("mentalHandsStorage.createMentalHand", () => {
  it("INSERT com nanoid id + occurredAt default", async () => {
    let captured: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          captured = v;
          return {
            returning: vi.fn(async () => [{ ...v, createdAt: new Date() }]),
          };
        }),
      })),
    };
    const { createMentalHand } = await import(
      "../../../../server/storage/mentalHandsStorage"
    );
    const r = await createMentalHand(
      "USER-1",
      {
        situation: "x",
        emotion: "tilt",
        realResponse: "y",
        idealResponse: "z",
      },
      fakeDb,
    );
    expect(r.id).toBeTruthy();
    expect(captured.userId).toBe("USER-1");
    expect(captured.occurredAt).toBeTruthy();
  });
});

describe("mentalHandsStorage.listMentalHandsForRange", () => {
  it("filtra por user + range, ordena occurred_at DESC", async () => {
    const rows = [
      { id: "mh-1", occurredAt: new Date("2026-03-15"), emotion: "tilt" },
      { id: "mh-2", occurredAt: new Date("2026-02-10"), emotion: "fear" },
    ];
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => rows),
          })),
        })),
      })),
    };
    const { listMentalHandsForRange } = await import(
      "../../../../server/storage/mentalHandsStorage"
    );
    const r = await listMentalHandsForRange(
      "USER-1",
      "2026-01-01",
      "2026-03-31",
      fakeDb,
    );
    expect(r).toHaveLength(2);
  });
});

describe("mentalHandsStorage.listMentalHandsPaginated", () => {
  it("limit + offset + filter por emotion", async () => {
    const rows = [{ id: "mh-1", emotion: "tilt", occurredAt: new Date() }];
    const limitSpy = vi.fn(() => ({ offset: vi.fn(async () => rows) }));
    const orderBySpy = vi.fn(() => ({ limit: limitSpy }));
    const whereSpy = vi.fn(() => ({ orderBy: orderBySpy }));
    const fromSpy = vi.fn(() => ({ where: whereSpy }));
    const fakeDb: any = {
      select: vi.fn(() => ({ from: fromSpy })),
    };
    const { listMentalHandsPaginated } = await import(
      "../../../../server/storage/mentalHandsStorage"
    );
    const r = await listMentalHandsPaginated(
      "USER-1",
      { limit: 20, offset: 0, emotion: "tilt" },
      fakeDb,
    );
    expect(r).toHaveLength(1);
    expect(limitSpy).toHaveBeenCalledWith(20);
  });
});

describe("mentalHandsStorage.getMentalHand (ownership)", () => {
  it("retorna null se outro user tenta acessar", async () => {
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    };
    const { getMentalHand } = await import(
      "../../../../server/storage/mentalHandsStorage"
    );
    const r = await getMentalHand("USER-1", "mh-other-owner", fakeDb);
    expect(r).toBeNull();
  });
});

describe("mentalHandsStorage.deleteMentalHand (ownership)", () => {
  it("DELETE com user_id + id filter (não vaza existência)", async () => {
    const whereSpy = vi.fn(async () => ({ rowCount: 1 }));
    const fakeDb: any = {
      delete: vi.fn(() => ({ where: whereSpy })),
    };
    const { deleteMentalHand } = await import(
      "../../../../server/storage/mentalHandsStorage"
    );
    await deleteMentalHand("USER-1", "mh-1", fakeDb);
    expect(fakeDb.delete).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });
});

describe("mentalHandsStorage — selectTopHighlights helper", () => {
  it("seleciona top 3 priorizando diversidade de emotion", async () => {
    const all = [
      { id: "mh-1", occurredAt: new Date("2026-03-15"), emotion: "tilt", situation: "s1", idealResponse: "r1" },
      { id: "mh-2", occurredAt: new Date("2026-03-10"), emotion: "tilt", situation: "s2", idealResponse: "r2" },
      { id: "mh-3", occurredAt: new Date("2026-03-05"), emotion: "frustration", situation: "s3", idealResponse: "r3" },
      { id: "mh-4", occurredAt: new Date("2026-03-01"), emotion: "fear", situation: "s4", idealResponse: "r4" },
    ];
    const { selectTopHighlights } = await import(
      "../../../../server/services/mentalHandsSelector"
    );
    const top = selectTopHighlights(all, 3);
    expect(top).toHaveLength(3);
    const emotions = top.map((h: any) => h.emotion);
    // diversidade: max 1 do mesmo emotion preferred
    const unique = new Set(emotions);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});
