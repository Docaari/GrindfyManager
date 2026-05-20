// =============================================================================
// Sprint AI-2B / RF-02 (ADR-168) — storage helpers CRUD para career_goals
//
// Cobre:
//   - createCareerGoal: nanoid id + status='active' + horizon default 'trimestre'.
//   - listActiveCareerGoals: filtra status='active' + ordena por createdAt DESC.
//   - getCareerGoal: ownership (user_id match) — retorna null se outro user.
//   - updateCareerGoal: PATCH status, progress_note, targetValue, targetDeadline.
//   - deleteCareerGoal: ownership + hard delete.
//   - countActiveCareerGoals: cap enforcement.
//
// Lesson #36: storage module com @shared/schema lazy + fallback (drizzle-orm
// mock parcial em testes).
// Lesson #34: helpers aceitam injectedDb? como 3o arg (testability).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("careerGoalsStorage.createCareerGoal", () => {
  it("INSERT com nanoid id + status='active' + horizon default 'trimestre'", async () => {
    const insertedRow: any = {};
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          Object.assign(insertedRow, v);
          return {
            returning: vi.fn(async () => [{ ...v, createdAt: new Date(), updatedAt: new Date() }]),
          };
        }),
      })),
    };
    const { createCareerGoal } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await createCareerGoal(
      "USER-1",
      {
        title: "Meta",
        targetMetric: "profit_usd",
        targetValue: 10000,
      },
      fakeDb,
    );
    expect(r).toBeTruthy();
    expect(r.id).toBeTruthy();
    expect(typeof r.id).toBe("string");
    expect(insertedRow.userId).toBe("USER-1");
    expect(insertedRow.status).toBe("active");
    expect(insertedRow.horizon).toBe("trimestre");
  });
});

describe("careerGoalsStorage.listActiveCareerGoals", () => {
  it("filtra status='active' + ordena por createdAt DESC", async () => {
    const rows = [
      { id: "cg-1", title: "Meta 1", status: "active", createdAt: new Date("2026-01-01") },
      { id: "cg-2", title: "Meta 2", status: "active", createdAt: new Date("2026-03-01") },
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
    const { listActiveCareerGoals } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await listActiveCareerGoals("USER-1", fakeDb);
    expect(r).toHaveLength(2);
  });
});

describe("careerGoalsStorage.getCareerGoal (ownership)", () => {
  it("retorna null se career_goals.user_id != ctx userId", async () => {
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    };
    const { getCareerGoal } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await getCareerGoal("USER-1", "cg-different-owner", fakeDb);
    expect(r).toBeNull();
  });

  it("retorna a row quando ownership bate", async () => {
    const row = {
      id: "cg-1",
      userId: "USER-1",
      title: "Meta",
      status: "active",
    };
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [row]),
          })),
        })),
      })),
    };
    const { getCareerGoal } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await getCareerGoal("USER-1", "cg-1", fakeDb);
    expect(r).toEqual(row);
  });
});

describe("careerGoalsStorage.updateCareerGoal", () => {
  it("UPDATE status + updatedAt", async () => {
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "cg-1", status: "achieved" }]),
        })),
      })),
    }));
    const fakeDb: any = {
      update: updateSpy,
    };
    const { updateCareerGoal } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await updateCareerGoal(
      "USER-1",
      "cg-1",
      { status: "achieved" },
      fakeDb,
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(r?.status).toBe("achieved");
  });
});

describe("careerGoalsStorage.deleteCareerGoal", () => {
  it("DELETE com ownership filter (user_id+id)", async () => {
    const whereSpy = vi.fn(async () => ({ rowCount: 1 }));
    const fakeDb: any = {
      delete: vi.fn(() => ({
        where: whereSpy,
      })),
    };
    const { deleteCareerGoal } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    await deleteCareerGoal("USER-1", "cg-1", fakeDb);
    expect(fakeDb.delete).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });
});

describe("careerGoalsStorage.countActiveCareerGoals", () => {
  it("retorna count das ativas (cap enforcement)", async () => {
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ count: 3 }]),
        })),
      })),
    };
    const { countActiveCareerGoals } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const c = await countActiveCareerGoals("USER-1", fakeDb);
    expect(c).toBe(3);
  });
});
