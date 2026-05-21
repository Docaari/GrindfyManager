// =============================================================================
// Sprint AI-3 / RF-03 (ADR-174 §2.3) — cgameRecent persistido em
// users.ai_structured_profile JSONB
//
// Cobre:
//   - updateCgameRecent(userId, snapshot) helper novo em
//     server/storage/aiStructuredProfile.ts. Internamente chama
//     updateAiStructuredProfile(userId, { cgameRecent: snapshot }).
//   - Idempotente: 2 chamadas mesmo snapshot → mesmo resultado (sobrescreve).
//   - normalizeAiStructuredProfile valida shape:
//       - aPct/bPct/cPct/sampleSize numéricos finitos.
//       - confidence ∈ {'high', 'medium', 'low'}.
//       - period.{start, end} strings.
//       - updatedAt string.
//     Shape inválido → cgameRecent omitido (não throw).
//   - getAiStructuredProfile retorna cgameRecent após update.
//   - Merge raso preserva outros campos do profile (focoDoMes, tomPreferido, metas).
//
// Lessons aplicadas:
//   - #34 — injectedDb? mantém testabilidade.
//   - #36 — schema lazy import (já no módulo; RF-03 só amplia).
//   - #11 — default mínimo (campos desconhecidos → omite).
//
// Status esperado: TODOS FALHAM (updateCgameRecent não existe; cgameRecent
// não está na interface AiStructuredProfile).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbSelectMock = vi.fn();
const dbUpdateMock = vi.fn();

vi.mock("../../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => dbSelectMock(),
        }),
      }),
    }),
    update: () => ({
      set: (payload: any) => {
        dbUpdateMock(payload);
        return { where: () => Promise.resolve() };
      },
    }),
  },
  pool: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => ({ type: "eq", a })),
  and: vi.fn((...a: any[]) => ({ type: "and", a })),
  sql: Object.assign(vi.fn((...a: any[]) => ({ type: "sql", a })), { raw: (s: string) => ({ raw: s }) }),
}));

vi.mock("nanoid", () => ({ nanoid: vi.fn(() => "meta-mock-id") }));

async function loadModule() {
  const mod: any = await import("../../../server/storage/aiStructuredProfile");
  if (typeof mod._resetAiStructuredProfileCacheForTests === "function") {
    mod._resetAiStructuredProfileCacheForTests();
  }
  return mod;
}

beforeEach(() => {
  dbSelectMock.mockReset();
  dbUpdateMock.mockReset();
});

const VALID_CGAME = {
  aPct: 60,
  bPct: 30,
  cPct: 10,
  sampleSize: 25,
  confidence: "high" as const,
  period: { start: "2026-01-01", end: "2026-03-31" },
  updatedAt: "2026-05-20T10:00:00.000Z",
};

describe("updateCgameRecent — helper novo (RF-03)", () => {
  it("aceita snapshot válido e persiste em ai_structured_profile.cgameRecent", async () => {
    dbSelectMock.mockResolvedValue([
      { id: "u-1", userPlatformId: "USER-1", aiStructuredProfile: { schemaVersion: 1 } },
    ]);
    const mod = await loadModule();
    expect(typeof mod.updateCgameRecent).toBe("function");

    await mod.updateCgameRecent("USER-1", VALID_CGAME);
    expect(dbUpdateMock).toHaveBeenCalled();
    const lastCall = dbUpdateMock.mock.calls[dbUpdateMock.mock.calls.length - 1];
    const setPayload = lastCall[0];
    // O drizzle .set() recebe { aiStructuredProfile: { ..., cgameRecent: {...} } }
    const profileWritten = setPayload?.aiStructuredProfile;
    expect(profileWritten?.cgameRecent).toBeTruthy();
    expect(profileWritten.cgameRecent.aPct).toBe(60);
    expect(profileWritten.cgameRecent.bPct).toBe(30);
    expect(profileWritten.cgameRecent.cPct).toBe(10);
    expect(profileWritten.cgameRecent.sampleSize).toBe(25);
    expect(profileWritten.cgameRecent.confidence).toBe("high");
  });

  it("idempotente — 2 chamadas mesmo snapshot → segundo sobrescreve (não append)", async () => {
    dbSelectMock.mockResolvedValue([
      { id: "u-1", userPlatformId: "USER-1", aiStructuredProfile: { schemaVersion: 1 } },
    ]);
    const mod = await loadModule();
    await mod.updateCgameRecent("USER-1", VALID_CGAME);
    await mod.updateCgameRecent("USER-1", VALID_CGAME);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    // Cada write tem cgameRecent (não array, não append).
    for (const call of dbUpdateMock.mock.calls) {
      const profile = call[0]?.aiStructuredProfile;
      expect(Array.isArray(profile?.cgameRecent)).toBe(false);
      expect(profile?.cgameRecent?.aPct).toBe(60);
    }
  });

  it("merge raso preserva outros campos preexistentes (focoDoMes, tomPreferido)", async () => {
    dbSelectMock.mockResolvedValue([
      {
        id: "u-1",
        userPlatformId: "USER-1",
        aiStructuredProfile: {
          schemaVersion: 1,
          focoDoMes: "ICM bubble",
          tomPreferido: "direct",
        },
      },
    ]);
    const mod = await loadModule();
    await mod.updateCgameRecent("USER-1", VALID_CGAME);
    const setPayload = dbUpdateMock.mock.calls[dbUpdateMock.mock.calls.length - 1][0];
    const profile = setPayload?.aiStructuredProfile;
    expect(profile?.focoDoMes).toBe("ICM bubble");
    expect(profile?.tomPreferido).toBe("direct");
    expect(profile?.cgameRecent?.aPct).toBe(60);
  });

  it("aceita injectedDb opcional (lesson #34)", async () => {
    // Mock db injetado direto via terceiro arg.
    const injSelect = vi.fn(() => Promise.resolve([
      { id: "u-1", userPlatformId: "USER-1", aiStructuredProfile: { schemaVersion: 1 } },
    ]));
    const injUpdateSet = vi.fn();
    const injectedDb: any = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => injSelect() }),
        }),
      }),
      update: () => ({
        set: (payload: any) => {
          injUpdateSet(payload);
          return { where: () => Promise.resolve() };
        },
      }),
    };
    const mod = await loadModule();
    // O helper aceita injectedDb como 3o arg (igual a updateAiStructuredProfile).
    await mod.updateCgameRecent("USER-1", VALID_CGAME, injectedDb);
    expect(injUpdateSet).toHaveBeenCalled();
  });
});

describe("normalizeAiStructuredProfile — validação shape de cgameRecent (RF-03)", () => {
  it("snapshot válido → mantém cgameRecent intacto", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: VALID_CGAME,
    });
    expect(normalized.cgameRecent).toBeTruthy();
    expect(normalized.cgameRecent.aPct).toBe(60);
    expect(normalized.cgameRecent.confidence).toBe("high");
    expect(normalized.cgameRecent.period.start).toBe("2026-01-01");
  });

  it("aPct = 'abc' (não-numérico) → cgameRecent omitido (não throw)", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: { ...VALID_CGAME, aPct: "abc" },
    });
    expect(normalized.cgameRecent).toBeUndefined();
  });

  it("confidence fora do enum (ex: 'super') → cgameRecent omitido", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: { ...VALID_CGAME, confidence: "super" },
    });
    expect(normalized.cgameRecent).toBeUndefined();
  });

  it("period.start não-string (ex: número 20260101) → cgameRecent omitido", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: { ...VALID_CGAME, period: { start: 20260101, end: "2026-03-31" } },
    });
    expect(normalized.cgameRecent).toBeUndefined();
  });

  it("aPct = NaN/Infinity (não finito) → cgameRecent omitido", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: { ...VALID_CGAME, aPct: NaN },
    });
    expect(normalized.cgameRecent).toBeUndefined();
  });

  it("cgameRecent ausente → omitido naturalmente (não throw)", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      focoDoMes: "ICM",
    });
    expect(normalized.cgameRecent).toBeUndefined();
    expect(normalized.focoDoMes).toBe("ICM");
  });

  it("cgameRecent = null explícito → omitido (lesson #11 default mínimo)", async () => {
    const mod = await loadModule();
    const normalized = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: null,
    });
    // Aceita undefined OU null — ambos significam "ausente". Convenção: omitir.
    expect(normalized.cgameRecent == null).toBe(true);
  });
});

describe("getAiStructuredProfile + updateCgameRecent — leitura pós-update", () => {
  it("após updateCgameRecent, leitura subsequente retorna cgameRecent", async () => {
    // 1a leitura (dentro do update): profile sem cgameRecent.
    dbSelectMock.mockResolvedValueOnce([
      { id: "u-1", userPlatformId: "USER-1", aiStructuredProfile: { schemaVersion: 1 } },
    ]);
    const mod = await loadModule();
    await mod.updateCgameRecent("USER-1", VALID_CGAME);

    // 2a leitura: o DB agora retorna cgameRecent populado (mock).
    dbSelectMock.mockResolvedValueOnce([
      {
        id: "u-1",
        userPlatformId: "USER-1",
        aiStructuredProfile: { schemaVersion: 1, cgameRecent: VALID_CGAME },
      },
    ]);
    const after = await mod.getAiStructuredProfile("USER-1");
    expect(after.cgameRecent).toBeTruthy();
    expect(after.cgameRecent.aPct).toBe(60);
    expect(after.cgameRecent.confidence).toBe("high");
  });
});

describe("AiStructuredProfile interface — cgameRecent opcional (TypeScript)", () => {
  it("interface aceita cgameRecent? sem quebrar perfis existentes", async () => {
    const mod = await loadModule();
    // Profile sem cgameRecent continua válido.
    const without = mod.normalizeAiStructuredProfile({ schemaVersion: 1 });
    expect(without.schemaVersion).toBe(1);

    // Profile com cgameRecent válido normaliza OK.
    const withCg = mod.normalizeAiStructuredProfile({
      schemaVersion: 1,
      cgameRecent: VALID_CGAME,
    });
    expect(withCg.cgameRecent).toBeTruthy();
  });
});
