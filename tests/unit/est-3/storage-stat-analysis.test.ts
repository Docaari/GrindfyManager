import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 storage delta
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-02/06/07)
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-1/D-4/D-5, Q-OPEN-3)
//
// Metodos de storage (NOVOS / estendidos) a testar:
//   - createStudySessionV2: aceita statId + statAnalysisEntries + 3 campos B;
//     cada entry recebe id + createdAt server-side; re-checa cap 10 (D-5).
//   - updateStudySessionV2: merge entries por id (Q-OPEN-3), statId NUNCA muda
//     (D-4), cap 10 re-checado (D-5), keys de imagem nao-mencionadas preservadas.
//   - getStatAnalysisEntries(userId, themeId, statId?): flatten cross-session +
//     agrupa por statId + entryCount; devolve keys CRUAS (handler monta URLs, D-1).
//   - updateStatEntryImage(sessionId,userId,entryId,slot,key) -> { oldKey }.
//   - getStatEntryImageKey(sessionId,userId,entryId,slot) -> key | null.
//
// Pattern lesson #36/#37: vi.doMock("drizzle-orm") augmenta relations; mock
// server/db com chainable builder. resetModules antes de cada caso.
// =============================================================================

// Builder chainable que resolve para `rows`. Cada metodo retorna o proprio
// builder (thenable no final via select chain). Captura inserts/updates.
function makeChainableDb(rows: any[]) {
  const captured: any = { insertValues: null, updateSet: null };
  const selectChain: any = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: () => selectChain,
    offset: () => Promise.resolve(rows),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  const db: any = {
    select: () => selectChain,
    insert: () => ({
      values: (v: any) => {
        captured.insertValues = v;
        return { returning: () => Promise.resolve([{ ...v }]) };
      },
    }),
    update: () => ({
      set: (s: any) => {
        captured.updateSet = s;
        return {
          where: () => ({ returning: () => Promise.resolve([{ ...rows[0], ...s }]) }),
        };
      },
    }),
  };
  return { db, captured };
}

async function loadStorageWithDb(rows: any[]) {
  vi.resetModules();
  vi.doMock('drizzle-orm', async () => {
    const actual = await vi.importActual<any>('drizzle-orm');
    return { ...actual, relations: vi.fn() };
  });
  const { db, captured } = makeChainableDb(rows);
  vi.doMock('../../../server/db', () => ({ db }));
  const mod = await import('../../../server/storage');
  return { storage: mod.storage as any, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// createStudySessionV2 — campos novos + id/createdAt server-side + cap 10
// =============================================================================

describe('EST-3 storage.createStudySessionV2 — stat_analysis', () => {
  it('persiste statId + statAnalysisEntries no insert', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createStudySessionV2({
      userId: 'USER-0001',
      mode: 'stat_analysis',
      source: 'manual_post_hoc',
      themeId: 'theme_1',
      statId: 'vpip',
      statAnalysisEntries: [
        { filters: 'BTN vs BB', errorText: 'erro', learnedText: 'aprendi' },
      ],
      durationMinutes: 30,
    });
    expect(captured.insertValues.statId).toBe('vpip');
    expect(Array.isArray(captured.insertValues.statAnalysisEntries)).toBe(true);
    expect(captured.insertValues.statAnalysisEntries.length).toBe(1);
  });

  it('gera id + createdAt server-side em cada entry mesmo se cliente nao enviar', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createStudySessionV2({
      userId: 'USER-0001',
      mode: 'stat_analysis',
      source: 'manual_post_hoc',
      themeId: 'theme_1',
      statId: 'vpip',
      statAnalysisEntries: [
        { filters: 'f1', errorText: 'e1', learnedText: 'l1' },
        { filters: 'f2', errorText: 'e2', learnedText: 'l2' },
      ],
      durationMinutes: 30,
    });
    const entries = captured.insertValues.statAnalysisEntries;
    for (const e of entries) {
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
      expect(typeof e.createdAt).toBe('string');
    }
    // ids unicos por entry
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('inicializa playImageKey/solutionImageKey null nas entries criadas', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createStudySessionV2({
      userId: 'USER-0001',
      mode: 'stat_analysis',
      source: 'manual_post_hoc',
      themeId: 'theme_1',
      statId: 'vpip',
      statAnalysisEntries: [{ filters: 'f', errorText: 'e', learnedText: 'l' }],
      durationMinutes: 30,
    });
    const e = captured.insertValues.statAnalysisEntries[0];
    expect(e.playImageKey ?? null).toBeNull();
    expect(e.solutionImageKey ?? null).toBeNull();
  });

  it('re-checa cap 10 (D-5) — 11 entries lanca { code: TOO_MANY_ENTRIES }', async () => {
    const { storage } = await loadStorageWithDb([]);
    await expect(
      storage.createStudySessionV2({
        userId: 'USER-0001',
        mode: 'stat_analysis',
        source: 'manual_post_hoc',
        themeId: 'theme_1',
        statId: 'vpip',
        statAnalysisEntries: Array.from({ length: 11 }, (_v, i) => ({
          filters: `f${i}`,
          errorText: 'e',
          learnedText: 'l',
        })),
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ENTRIES' });
  });

  it('back-fill ?? null nos campos B ausentes (lesson #7)', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createStudySessionV2({
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_post_hoc',
      themeId: 'theme_1',
      durationMinutes: 20,
    });
    expect(captured.insertValues.handsSolvedCount ?? null).toBeNull();
    expect(captured.insertValues.filtersAnalyzedCount ?? null).toBeNull();
    expect(captured.insertValues.lessonInsights ?? null).toBeNull();
    expect(captured.insertValues.statId ?? null).toBeNull();
  });
});

// =============================================================================
// updateStudySessionV2 — merge por id, statId imutavel, cap 10 (Q-OPEN-3 / D-4)
// =============================================================================

describe('EST-3 storage.updateStudySessionV2 — merge entries por id', () => {
  const existingSession = {
    id: 'sess_1',
    userId: 'USER-0001',
    mode: 'stat_analysis',
    statId: 'vpip',
    statAnalysisEntries: [
      {
        id: 'e1',
        filters: 'old f1',
        errorText: 'old e1',
        learnedText: 'old l1',
        playImageKey: 'USER-0001/sess_1/play1.png',
        solutionImageKey: 'USER-0001/sess_1/sol1.png',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  };

  it('preserva playImageKey/solutionImageKey quando a entry do patch NAO as menciona (lesson #43)', async () => {
    const { storage, captured } = await loadStorageWithDb([existingSession]);
    await storage.updateStudySessionV2('sess_1', 'USER-0001', {
      statAnalysisEntries: [
        { id: 'e1', filters: 'new f1', errorText: 'new e1', learnedText: 'new l1' },
      ],
    });
    const merged = captured.updateSet.statAnalysisEntries;
    const e1 = merged.find((e: any) => e.id === 'e1');
    expect(e1.filters).toBe('new f1');
    // Keys preservadas (campo ausente != null).
    expect(e1.playImageKey).toBe('USER-0001/sess_1/play1.png');
    expect(e1.solutionImageKey).toBe('USER-0001/sess_1/sol1.png');
  });

  it('zera key quando entry do patch envia playImageKey: null explicito', async () => {
    const { storage, captured } = await loadStorageWithDb([existingSession]);
    await storage.updateStudySessionV2('sess_1', 'USER-0001', {
      statAnalysisEntries: [
        { id: 'e1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: null },
      ],
    });
    const e1 = captured.updateSet.statAnalysisEntries.find((e: any) => e.id === 'e1');
    expect(e1.playImageKey).toBeNull();
  });

  it('cria entry nova (sem id) com id + createdAt server-side, keys null', async () => {
    const { storage, captured } = await loadStorageWithDb([existingSession]);
    await storage.updateStudySessionV2('sess_1', 'USER-0001', {
      statAnalysisEntries: [
        { id: 'e1', filters: 'f1', errorText: 'e1', learnedText: 'l1' },
        { filters: 'f2', errorText: 'e2', learnedText: 'l2' },
      ],
    });
    const merged = captured.updateSet.statAnalysisEntries;
    const novel = merged.find((e: any) => e.filters === 'f2');
    expect(typeof novel.id).toBe('string');
    expect(novel.id.length).toBeGreaterThan(0);
    expect(novel.playImageKey ?? null).toBeNull();
  });

  it('NUNCA seta statId no update (D-4 — statId imutavel no storage)', async () => {
    const { storage, captured } = await loadStorageWithDb([existingSession]);
    await storage.updateStudySessionV2('sess_1', 'USER-0001', {
      statId: 'pfr',
      notes: 'x',
    } as any);
    expect('statId' in (captured.updateSet ?? {})).toBe(false);
  });

  it('re-checa cap 10 no update — 11 entries lanca TOO_MANY_ENTRIES', async () => {
    const { storage } = await loadStorageWithDb([existingSession]);
    await expect(
      storage.updateStudySessionV2('sess_1', 'USER-0001', {
        statAnalysisEntries: Array.from({ length: 11 }, (_v, i) => ({
          filters: `f${i}`,
          errorText: 'e',
          learnedText: 'l',
        })),
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ENTRIES' });
  });
});

// =============================================================================
// getStatAnalysisEntries — flatten cross-session + group por stat + entryCount
// =============================================================================

describe('EST-3 storage.getStatAnalysisEntries — flatten + group (D-1)', () => {
  const rows = [
    {
      id: 'sess_A',
      userId: 'USER-0001',
      themeId: 'theme_1',
      statId: 'vpip',
      mode: 'stat_analysis',
      durationMinutes: 30,
      registeredAt: '2026-06-02T00:00:00.000Z',
      deletedAt: null,
      statAnalysisEntries: [
        { id: 'a1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: 'k1', solutionImageKey: null, createdAt: '2026-06-02T00:00:00.000Z' },
        { id: 'a2', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: null, solutionImageKey: 'k2', createdAt: '2026-06-02T00:00:00.000Z' },
      ],
    },
    {
      id: 'sess_B',
      userId: 'USER-0001',
      themeId: 'theme_1',
      statId: 'vpip',
      mode: 'stat_analysis',
      durationMinutes: 15,
      registeredAt: '2026-06-01T00:00:00.000Z',
      deletedAt: null,
      statAnalysisEntries: [
        { id: 'b1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: null, solutionImageKey: null, createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    },
    {
      id: 'sess_C',
      userId: 'USER-0001',
      themeId: 'theme_1',
      statId: 'pfr',
      mode: 'stat_analysis',
      durationMinutes: 20,
      registeredAt: '2026-06-01T00:00:00.000Z',
      deletedAt: null,
      statAnalysisEntries: [
        { id: 'c1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: 'k3', solutionImageKey: 'k4', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    },
  ];

  it('eh uma funcao exportada em storage', async () => {
    const { storage } = await loadStorageWithDb([]);
    expect(typeof storage.getStatAnalysisEntries).toBe('function');
  });

  it('agrupa por statId; vpip soma entries de sess_A + sess_B (entryCount 3)', async () => {
    const { storage } = await loadStorageWithDb(rows);
    const groups = await storage.getStatAnalysisEntries('USER-0001', 'theme_1');
    const vpip = groups.find((g: any) => g.statId === 'vpip');
    expect(vpip).toBeDefined();
    // 2 sessoes agrupadas sob vpip
    expect(vpip.sessions.length).toBe(2);
    // entryCount achatado = 2 + 1 = 3
    expect(vpip.entryCount).toBe(3);
  });

  it('pfr forma grupo separado com entryCount 1', async () => {
    const { storage } = await loadStorageWithDb(rows);
    const groups = await storage.getStatAnalysisEntries('USER-0001', 'theme_1');
    const pfr = groups.find((g: any) => g.statId === 'pfr');
    expect(pfr).toBeDefined();
    expect(pfr.entryCount).toBe(1);
  });

  it('devolve keys CRUAS (storage NAO monta URLs — handler faz, D-1)', async () => {
    const { storage } = await loadStorageWithDb(rows);
    const groups = await storage.getStatAnalysisEntries('USER-0001', 'theme_1');
    const vpip = groups.find((g: any) => g.statId === 'vpip');
    const entryWithKey = vpip.sessions
      .flatMap((s: any) => s.entries)
      .find((e: any) => e.playImageKey != null);
    expect(entryWithKey.playImageKey).toBe('k1');
    // Nao deve haver campo de URL montada no nivel do storage.
    expect(entryWithKey.playImageUrl ?? undefined).toBeUndefined();
  });
});

// =============================================================================
// updateStatEntryImage / getStatEntryImageKey
// =============================================================================

describe('EST-3 storage.updateStatEntryImage / getStatEntryImageKey', () => {
  const session = {
    id: 'sess_1',
    userId: 'USER-0001',
    mode: 'stat_analysis',
    statId: 'vpip',
    statAnalysisEntries: [
      {
        id: 'e1',
        filters: 'f',
        errorText: 'e',
        learnedText: 'l',
        playImageKey: 'USER-0001/sess_1/old.png',
        solutionImageKey: null,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  };

  it('updateStatEntryImage retorna oldKey do slot play para cleanup', async () => {
    const { storage } = await loadStorageWithDb([session]);
    const result = await storage.updateStatEntryImage(
      'sess_1',
      'USER-0001',
      'e1',
      'play',
      'USER-0001/sess_1/new.png',
    );
    expect(result.oldKey).toBe('USER-0001/sess_1/old.png');
  });

  it('getStatEntryImageKey retorna a key do slot solution (null quando vazio)', async () => {
    const { storage } = await loadStorageWithDb([session]);
    const key = await storage.getStatEntryImageKey('sess_1', 'USER-0001', 'e1', 'solution');
    expect(key ?? null).toBeNull();
  });

  it('getStatEntryImageKey retorna a key do slot play', async () => {
    const { storage } = await loadStorageWithDb([session]);
    const key = await storage.getStatEntryImageKey('sess_1', 'USER-0001', 'e1', 'play');
    expect(key).toBe('USER-0001/sess_1/old.png');
  });
});
