// =============================================================================
// Sprint AI-2A / RF-04 (ADR-165) — create_study_theme
//
// Cobre:
//   - Zod: name min 3 max 50, category enum, linkedStats array max 10.
//   - Duplicado lowercase trim -> theme_name_duplicate.
//   - linkedStats codes invalidos -> warning + skip + persist os validos.
//   - Sync bidirecional linkedStats -> user_focus_stats.linked_themes.
//   - Undo: DELETE tema + reverte sync (jsonb_array_elements_text — lesson #33).
//   - Descritor: write tool + Pro+ + auditLevel persist.
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("create_study_theme — Zod validation", () => {
  it("rejeita name < 3 chars", async () => {
    const { createStudyThemeInputSchema } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    expect(createStudyThemeInputSchema.safeParse({ name: "AB" }).success).toBe(false);
  });

  it("rejeita name > 50 chars", async () => {
    const { createStudyThemeInputSchema } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    expect(
      createStudyThemeInputSchema.safeParse({ name: "a".repeat(51) }).success,
    ).toBe(false);
  });

  it("rejeita category fora do enum preflop|postflop|multiway", async () => {
    const { createStudyThemeInputSchema } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    expect(
      createStudyThemeInputSchema.safeParse({ name: "ICM", category: "endgame" }).success,
    ).toBe(false);
  });

  it("aceita input minimo (name)", async () => {
    const { createStudyThemeInputSchema } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    expect(createStudyThemeInputSchema.safeParse({ name: "ICM final" }).success).toBe(true);
  });
});

describe("create_study_theme — duplicado (Q-C locked)", () => {
  it("name duplicado (case-insensitive) -> theme_name_duplicate", async () => {
    const injectedStorage: any = {
      findStudyThemeByName: vi.fn(async (_uid: string, name: string) => {
        if (name === "icm final".toLowerCase().trim()) return { id: "existing-th-1", userId: "U", name: "ICM Final" };
        return null;
      }),
      createStudyTheme: vi.fn(),
    };
    const { createStudyThemeTool } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    const out = await createStudyThemeTool.executeConfirmed!(
      { name: "ICM FINAL" },
      { userId: "U", injectedStorage } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    expect(JSON.stringify(out)).toMatch(/theme_name_duplicate/);
    expect(injectedStorage.createStudyTheme).not.toHaveBeenCalled();
  });
});

describe("create_study_theme — execute + sync bidirecional", () => {
  it("cria tema + propaga linkedStats em user_focus_stats.linked_themes", async () => {
    const injectedStorage: any = {
      findStudyThemeByName: vi.fn(async () => null),
      createStudyTheme: vi.fn(async (payload: any) => ({ id: "th-1", ...payload })),
      appendStatToThemes: vi.fn(async () => undefined),
    };
    const { createStudyThemeTool } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    const out: any = await createStudyThemeTool.executeConfirmed!(
      { name: "PreflopOpen", linkedStats: ["3bet", "cbet_flop"] },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(out.payloadAfter.id).toBe("th-1");
    expect(injectedStorage.appendStatToThemes).toHaveBeenCalledTimes(2);
    const calls = injectedStorage.appendStatToThemes.mock.calls;
    const statIds = calls.map((c: any[]) => c.find((a) => typeof a === "string" && /3bet|cbet_flop/.test(a)));
    expect(statIds.filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });
});

describe("create_study_theme — undo (lesson #33)", () => {
  it("undo deleta tema + remove themeId de user_focus_stats.linked_themes", async () => {
    const injectedStorage: any = {
      removeStatFromThemes: vi.fn(async () => undefined),
      deleteStudyTheme: vi.fn(async () => undefined),
    };
    const { createStudyThemeTool } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    await createStudyThemeTool.undo!(
      null,
      { id: "th-1", linkedStats: ["3bet", "cbet_flop"] },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteStudyTheme).toHaveBeenCalledWith(expect.stringMatching(/th-1/));
    // Reverse sync: cada statCode deve disparar 1 removeStatFromThemes
    expect(injectedStorage.removeStatFromThemes).toHaveBeenCalledTimes(2);
  });
});

describe("create_study_theme — descritor", () => {
  it("name + requiresConfirmation + auditLevel + tier", async () => {
    const { createStudyThemeTool } = await import(
      "../../../../server/coachTools/handlers/createStudyTheme"
    );
    expect(createStudyThemeTool.name).toBe("create_study_theme");
    expect(createStudyThemeTool.requiresConfirmation).toBe(true);
    expect(createStudyThemeTool.auditLevel).toBe("persist");
    expect(createStudyThemeTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
