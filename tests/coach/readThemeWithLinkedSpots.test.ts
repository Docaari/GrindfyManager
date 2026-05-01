/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-07: Coach tool read_theme_with_linked_spots
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-07, D6)
 * ADR-068: cross-feature recommendations engine — secao "Reuso pelo Coach tool"
 *
 * Lessons:
 *   #3 mocks shape REAL (storage)
 *   #5 vitest 4 + tools registry
 *   #10 DRY de prompts (descricao em 1 lugar para nao quebrar cache Anthropic)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
  storage: {
    getStudyTheme: vi.fn(),
    getStudyThemeByName: vi.fn(),
    getStudyTabsByTheme: vi.fn(),
    getLinkedSpots: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

async function importTool() {
  return await import('../../server/coachTools/readThemeWithLinkedSpots');
}

async function importRegistry() {
  return await import('../../server/coachTools/index');
}

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getStudyTheme as any).mockResolvedValue({
    id: 'thm_1', userId: 'USER-0001', name: 'IP vs BB', color: '#16a34a', emoji: '',
    progress: 50, lastVisitedAt: '2026-04-30T10:00:00Z',
  });
  (storage.getStudyThemeByName as any).mockResolvedValue({
    id: 'thm_1', userId: 'USER-0001', name: 'IP vs BB', color: '#16a34a', emoji: '',
    progress: 50, lastVisitedAt: '2026-04-30T10:00:00Z',
  });
  (storage.getStudyTabsByTheme as any).mockResolvedValue([
    { id: 'tab_1', name: 'Flop', content: [{ type: 'paragraph', content: 'flop notes here' }] },
  ]);
  (storage.getLinkedSpots as any).mockResolvedValue([
    { id: 'spt_1', conclusion: 'fold demais IP', type: 'tilt', spot: 'ip_vs_bb', screenshotUrl: null },
  ]);
});

describe('RF-07 read_theme_with_linked_spots — schema + execution', () => {
  it('tool registrada em coachTools/index com nome read_theme_with_linked_spots', async () => {
    const reg = await importRegistry();
    const tools = (reg as any).coachTools || (reg as any).default || (reg as any).tools;
    const list = Array.isArray(tools) ? tools : Object.values(tools || {});
    const names = list.map((t: any) => t?.name ?? t?.toolName);
    expect(names).toContain('read_theme_with_linked_spots');
  });

  it('schema input aceita { theme_id }', async () => {
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-0001' });
    expect(result).toHaveProperty('theme');
    expect(result.theme).toHaveProperty('name');
  });

  it('schema input aceita { theme_name }', async () => {
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    const result = await handler({ theme_name: 'IP vs BB' }, { userPlatformId: 'USER-0001' });
    expect(result).toHaveProperty('theme');
    expect(storage.getStudyThemeByName).toHaveBeenCalled();
  });

  it('output shape: { theme, tabs[max5], linked_spots[max10], summary }', async () => {
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    const result = await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-0001' });
    expect(result).toHaveProperty('theme');
    expect(result).toHaveProperty('tabs');
    expect(result).toHaveProperty('linked_spots');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('spots_count');
    expect(result.summary).toHaveProperty('tabs_count');
    expect(Array.isArray(result.tabs)).toBe(true);
    expect(Array.isArray(result.linked_spots)).toBe(true);
    expect(result.tabs.length).toBeLessThanOrEqual(5);
    expect(result.linked_spots.length).toBeLessThanOrEqual(10);
  });

  it('cross-user: rejeita se theme.userId !== ctx.userPlatformId', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      id: 'thm_1', userId: 'USER-OTHER', name: 'X', color: '#fff', emoji: '', progress: 50,
    });
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    await expect(
      handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-0001' }),
    ).rejects.toThrow();
  });

  it('theme not found: erro amigavel', async () => {
    (storage.getStudyTheme as any).mockResolvedValue(null);
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    await expect(
      handler({ theme_id: 'thm_x' }, { userPlatformId: 'USER-0001' }),
    ).rejects.toThrow(/n[aã]o encontrado/i);
  });

  it('DRY: tool reusa storage.getLinkedSpots (mesma fonte do studyRecommendationsService)', async () => {
    const tool: any = await importTool();
    const handler = tool.readThemeWithLinkedSpots || tool.default;
    await handler({ theme_id: 'thm_1' }, { userPlatformId: 'USER-0001' });
    expect(storage.getLinkedSpots).toHaveBeenCalled();
  });
});
