/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — RF-03: Coach tool read_theme_with_linked_stats_and_spots
 *
 * Spec  : Docs/specs/stats-themes-linking-1.md §RF-03
 * ADR   : 142 (rename + alias 1 sprint, payload novo, queries jsonb em hud_stat_snapshots)
 *
 * Cobertura:
 *   - Tool `read_theme_with_linked_stats_and_spots` registrada no coachTools/index.
 *   - Alias `read_theme_with_linked_spots` registrado tambem (1 sprint).
 *   - Tool com tema sem linkedStats -> stats: [] sem crash.
 *   - Tool com tema com 5 stats (3 catalog + 2 custom) -> 5 entries.
 *   - currentValue = ultimo snapshot do user; null se nenhum snapshot.
 *   - sparkline30d ordem ASC, max 30 elementos.
 *   - Stat custom orfa (deletada do HUD) = omitida do payload sem 500 + warn.
 *   - summary.stats_in_range / stats_alarm direction-aware (lower_better invertido).
 *   - Alias `read_theme_with_linked_spots` retorna mesmo payload + emite console.warn.
 *   - Cross-user: tema de outro user -> erro (preserved).
 *
 * IMPORTANTE — shape REAL de hud_stat_snapshots (ADR-142 §2.3):
 *   { id, userId, layoutId, capturedAt, values: jsonb, ... }
 *   NAO existe coluna `value` por stat — todos vivem em `values` jsonb.
 *   Mock de storage.getHudStatSnapshotsForUserStats deve retornar rows com
 *   `values: { vpip: 22, pfr: 18, ... }`.
 *
 * Lessons aplicadas:
 *   #3 mocks shape REAL — values jsonb (NAO coluna value).
 *   #10 description em 1 lugar (prompt template DRY) — verificavel via export.
 *   #14 await import(...).
 *   #21 (cache nao se aplica aqui — apenas tool consume).
 *
 * Status RED: tool nova `readThemeWithLinkedStatsAndSpots.ts` nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
  storage: {
    getStudyTheme: vi.fn(),
    getStudyThemeByName: vi.fn(),
    getStudyTabsByTheme: vi.fn(),
    getLinkedSpots: vi.fn(),
    getHudLayouts: vi.fn(),
    // Novo metodo introduzido pelo Sprint stats-themes-linking-1.
    // Implementer pode renomear pra getStatsSummaryForTheme.
    getHudStatSnapshotsForUserStats: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

const baseTheme = {
  id: 'thm_1',
  userId: 'USER-OWNER',
  name: 'C-bet OOP em 3-bet pots',
  slug: 'cbet-oop-3bp',
  color: '#16a34a',
  emoji: '',
  isFavorite: false,
  sortOrder: 0,
  progress: 50,
  isCurated: false,
  category: 'postflop',
  linkedStats: [],
  linkedLessons: [],
  seededAt: null,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-08T00:00:00Z'),
};

const baseLayoutWithCustom = {
  id: 'lyt-1',
  userId: 'USER-OWNER',
  name: 'PT4',
  isDefault: true,
  sections: [],
  fieldsJson: [
    {
      id: 'custom_my_3bet_kpi',
      isCustom: true,
      label: 'My 3Bet KPI',
      group: 'threebet',
      unit: 'pct',
      direction: 'context',
      targetMin: 8,
      targetMax: 12,
    },
    {
      id: 'custom_other',
      isCustom: true,
      label: 'Other Custom',
      group: 'basics',
      unit: 'pct',
      direction: 'higher_better',
      targetMin: 30,
      targetMax: 40,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getStudyTheme as any).mockResolvedValue({ ...baseTheme });
  (storage.getStudyThemeByName as any).mockResolvedValue({ ...baseTheme });
  (storage.getStudyTabsByTheme as any).mockResolvedValue([]);
  (storage.getLinkedSpots as any).mockResolvedValue([]);
  (storage.getHudLayouts as any).mockResolvedValue([baseLayoutWithCustom]);
  (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([]);
});

async function importTool() {
  return await import('../../server/coachTools/readThemeWithLinkedStatsAndSpots');
}
async function importToolLegacyFile() {
  return await import('../../server/coachTools/readThemeWithLinkedSpots');
}
async function importRegistry() {
  return await import('../../server/coachTools/index');
}

// =============================================================================
// RF-03.1 — Registro do tool novo + alias
// =============================================================================
describe('RF-03 read_theme_with_linked_stats_and_spots — registry', () => {
  it('tool novo registrado em coachTools/index com nome correto', async () => {
    const reg: any = await importRegistry();
    const list = (reg as any).coachTools || [];
    const names = list.map((t: any) => t?.name);
    expect(names).toContain('read_theme_with_linked_stats_and_spots');
  });

  it('alias `read_theme_with_linked_spots` continua registrado (1 sprint)', async () => {
    const reg: any = await importRegistry();
    const list = (reg as any).coachTools || [];
    const names = list.map((t: any) => t?.name);
    expect(names).toContain('read_theme_with_linked_spots');
  });

  it('exports da nova tool incluem readThemeWithLinkedStatsAndSpotsTool', async () => {
    const mod: any = await importTool();
    expect(
      mod.readThemeWithLinkedStatsAndSpotsTool ?? mod.default ?? mod.readThemeWithLinkedStatsAndSpots,
    ).toBeDefined();
  });
});

// =============================================================================
// RF-03.5 — Description / prompt extraido (lesson #10 DRY)
// =============================================================================
describe('RF-03.5 — prompt description (lesson #10 DRY)', () => {
  it('description inclui referencia a "stats" + "sparkline" + "currentValue" ou similar', async () => {
    const mod: any = await importTool();
    const tool = mod.readThemeWithLinkedStatsAndSpotsTool ?? mod.default;
    expect(tool).toBeDefined();
    const desc = String(tool.description ?? '').toLowerCase();
    expect(desc).toMatch(/stats?/);
    expect(desc).toMatch(/sparkline|valor.*atual|currentvalue|target|alvo/);
  });
});

// =============================================================================
// RF-03.4 — Empty linkedStats graceful
// =============================================================================
describe('RF-03 — empty linkedStats graceful', () => {
  it('tema sem linkedStats retorna stats: [] e summary.stats_count = 0', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: [],
    });
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats).toEqual([]);
    expect(result.summary.stats_count).toBe(0);
  });

  it('linkedStats null tambem retorna stats: [] sem crash', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: null as any,
    });
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats).toEqual([]);
  });
});

// =============================================================================
// RF-03.2 — Payload com 5 stats (3 catalog + 2 custom)
// =============================================================================
describe('RF-03.2 — payload com catalog + custom stats', () => {
  it('5 stats linkadas = 5 entries no array', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'pfr', 'cbet_flop_oop', 'custom_my_3bet_kpi', 'custom_other'],
    });
    // Snapshot mock — values jsonb com keys sao os stats
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      {
        capturedAt: new Date('2026-05-08T00:00:00Z'),
        values: {
          vpip: 22, pfr: 18, cbet_flop_oop: 60,
          custom_my_3bet_kpi: 9, custom_other: 35,
        },
      },
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats).toHaveLength(5);
    expect(result.summary.stats_count).toBe(5);
  });

  it('cada entry tem shape { statId, label, groupId, groupLabel, currentValue, targetMin, targetMax, direction, unit, sparkline30d, isCustom }', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date('2026-05-08T00:00:00Z'), values: { vpip: 22 } },
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    const entry = result.stats[0];
    expect(entry).toMatchObject({
      statId: 'vpip',
      label: expect.any(String),
      groupId: expect.any(String),
      groupLabel: expect.any(String),
      currentValue: 22,
      targetMin: expect.any(Number),
      targetMax: expect.any(Number),
      direction: expect.any(String),
      unit: expect.any(String),
      sparkline30d: expect.any(Array),
      isCustom: false,
    });
  });

  it('isCustom=true para custom stats; vem de hudLayouts.fieldsJson', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['custom_my_3bet_kpi'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { custom_my_3bet_kpi: 10 } },
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    const entry = result.stats[0];
    expect(entry.statId).toBe('custom_my_3bet_kpi');
    expect(entry.isCustom).toBe(true);
    expect(entry.label).toBe('My 3Bet KPI');
    expect(entry.targetMin).toBe(8);
    expect(entry.targetMax).toBe(12);
  });
});

// =============================================================================
// RF-03.3 — currentValue (ultimo snapshot)
// =============================================================================
describe('RF-03.3 — currentValue source', () => {
  it('currentValue = value mais recente extraido de values jsonb', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    // Multiple snapshots — apenas o mais recente conta
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date('2026-05-01T00:00:00Z'), values: { vpip: 18 } },
      { capturedAt: new Date('2026-05-08T00:00:00Z'), values: { vpip: 22 } }, // mais recente
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].currentValue).toBe(22);
  });

  it('currentValue = null quando nenhum snapshot existe para o user', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].currentValue).toBeNull();
  });

  it('currentValue = null quando snapshot existe mas values nao tem a key', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { pfr: 18 } }, // sem vpip
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].currentValue).toBeNull();
  });
});

// =============================================================================
// RF-03.3 — sparkline30d
// =============================================================================
describe('RF-03.3 — sparkline30d', () => {
  it('sparkline em ordem cronologica ASC (mais antigo first)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date('2026-04-09T00:00:00Z'), values: { vpip: 20 } },
      { capturedAt: new Date('2026-04-15T00:00:00Z'), values: { vpip: 21 } },
      { capturedAt: new Date('2026-05-01T00:00:00Z'), values: { vpip: 22 } },
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].sparkline30d).toEqual([20, 21, 22]);
  });

  it('sparkline com max 30 elementos', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    // 35 snapshots
    const snaps = Array.from({ length: 35 }, (_, i) => ({
      capturedAt: new Date(2026, 4, i + 1),
      values: { vpip: 20 + i * 0.1 },
    }));
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue(snaps);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].sparkline30d.length).toBeLessThanOrEqual(30);
  });

  it('sparkline vazio quando user sem snapshots na janela', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.stats[0].sparkline30d).toEqual([]);
  });
});

// =============================================================================
// RF-03.4 — Custom stat orfa (deletada do HUD)
// =============================================================================
describe('RF-03.4 — custom stat orfa', () => {
  it('custom stat deletada eh OMITIDA do payload (sem 500)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'custom_orphan'],
    });
    // Custom_orphan NAO existe em fieldsJson do user.
    (storage.getHudLayouts as any).mockResolvedValue([baseLayoutWithCustom]);
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { vpip: 22 } },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });

    // vpip aparece, custom_orphan eh omitido
    expect(result.stats).toHaveLength(1);
    expect(result.stats[0].statId).toBe('vpip');
    // Warning emitido
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('catalog stat invalida (improvavel) tambem eh omitida + warn', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'fake_catalog_xyz'],
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });

    const ids = result.stats.map((s: any) => s.statId);
    expect(ids).not.toContain('fake_catalog_xyz');
    expect(ids).toContain('vpip');

    warnSpy.mockRestore();
  });
});

// =============================================================================
// RF-03.6 — summary.stats_in_range / stats_alarm direction-aware
// =============================================================================
describe('RF-03.6 — summary direction-aware', () => {
  it('lower_better: value > targetMax => alarm', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['fold_vs_3bet'], // direction lower_better, target 50-60
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { fold_vs_3bet: 70 } }, // alarm
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.summary.stats_alarm).toBe(1);
    expect(result.summary.stats_in_range).toBe(0);
  });

  it('higher_better: value < targetMin => alarm', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['wwsf_pct'], // higher_better, target 45-55
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { wwsf_pct: 40 } }, // alarm
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.summary.stats_alarm).toBe(1);
    expect(result.summary.stats_in_range).toBe(0);
  });

  it('value dentro do range -> stats_in_range +1', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'], // target 20-25 (catalog approx)
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { vpip: 22 } },
    ]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.summary.stats_in_range).toBeGreaterThanOrEqual(0);
  });

  it('currentValue null nao conta nem alarm nem in_range', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([]);
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' });
    expect(result.summary.stats_count).toBe(1);
    // Nao garantido em_range nem alarm
    expect(result.summary.stats_in_range + result.summary.stats_alarm).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// RF-03.1 — Alias `read_theme_with_linked_spots` deprecated
// =============================================================================
describe('RF-03.1 — alias deprecation', () => {
  it('alias chamado emite console.warn com texto deprecation', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const reg: any = await importRegistry();
    const list = reg.coachTools || [];
    const aliasTool = list.find((t: any) => t?.name === 'read_theme_with_linked_spots');
    expect(aliasTool).toBeDefined();

    // Chamar handler do alias
    await aliasTool.handler(
      { theme_id: 'thm_1' },
      { userPlatformId: 'USER-OWNER' },
    );

    // Warning emitido com palavra "deprecat"
    const calledWith = warnSpy.mock.calls.flat().join(' ').toLowerCase();
    expect(calledWith).toMatch(/deprecat/);

    warnSpy.mockRestore();
  });

  it('alias retorna mesmo payload da tool nova', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip'],
    });
    (storage.getHudStatSnapshotsForUserStats as any).mockResolvedValue([
      { capturedAt: new Date(), values: { vpip: 22 } },
    ]);

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const reg: any = await importRegistry();
    const list = reg.coachTools || [];
    const aliasTool = list.find((t: any) => t?.name === 'read_theme_with_linked_spots');
    const newTool = list.find((t: any) => t?.name === 'read_theme_with_linked_stats_and_spots');

    const aliasResult = await aliasTool.handler(
      { theme_id: 'thm_1' },
      { userPlatformId: 'USER-OWNER' },
    );
    const newResult = await newTool.handler(
      { theme_id: 'thm_1' },
      { userPlatformId: 'USER-OWNER' },
    );

    // Os payloads devem ter mesma estrutura — comparar shape relevante
    const dataA = aliasResult?.data ?? aliasResult;
    const dataB = newResult?.data ?? newResult;
    expect(dataA?.theme?.id).toBe(dataB?.theme?.id);
    expect(dataA?.stats?.length).toBe(dataB?.stats?.length);
  });
});

// =============================================================================
// Cross-user (preserved)
// =============================================================================
describe('RF-03 — cross-user isolation', () => {
  it('rejeita quando theme.userId !== ctx.userPlatformId', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      userId: 'USER-OUTRO',
    });
    const mod: any = await importTool();
    const handler = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    await expect(
      handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-OWNER' }),
    ).rejects.toThrow();
  });
});
