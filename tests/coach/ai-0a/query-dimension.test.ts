import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-01: query_dimension (read tool religada)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-01)
// ADR  : 145 (enums canonicos: speed Normal|Turbo|Hyper, category +Satellite,
//             groupBy +fieldSize, period +180d; groupBy:'fieldSize' -> getAnalyticsByField)
// Diagrama: Docs/architecture/diagrams/coach-ai-0a/seq-read-tool-citable.mermaid
//
// TDD red-phase: handler `server/coachTools/handlers/queryDimension.ts` (ou onde
// o architect indicar) ainda nao existe / nao esta registrado.
//
// Lessons:
//   - #3: mock do SHAPE REAL do storage (getAnalyticsBySite retorna [{site, roi, count}]).
//   - #9: storage que explode -> loga + propaga handler_error; "no rows" -> note + ok.
//   - #14/#26: await import.
// =============================================================================

const getAnalyticsBySiteMock = vi.fn();
const getAnalyticsByCategoryMock = vi.fn();
const getAnalyticsBySpeedMock = vi.fn();
const getAnalyticsByBuyinRangeMock = vi.fn();
const getAnalyticsByDayOfWeekMock = vi.fn();
const getAnalyticsByMonthMock = vi.fn();
const getAnalyticsByFieldMock = vi.fn();
const getAnalyticsByFieldSizeMock = vi.fn();
const getDashboardStatsMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getAnalyticsBySite: getAnalyticsBySiteMock,
    getAnalyticsByCategory: getAnalyticsByCategoryMock,
    getAnalyticsBySpeed: getAnalyticsBySpeedMock,
    getAnalyticsByBuyinRange: getAnalyticsByBuyinRangeMock,
    getAnalyticsByDayOfWeek: getAnalyticsByDayOfWeekMock,
    getAnalyticsByMonth: getAnalyticsByMonthMock,
    getAnalyticsByField: getAnalyticsByFieldMock,
    getAnalyticsByFieldSize: getAnalyticsByFieldSizeMock,
    getDashboardStats: getDashboardStatsMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  vi.clearAllMocks();
  getAnalyticsBySiteMock.mockResolvedValue([]);
  getAnalyticsByCategoryMock.mockResolvedValue([]);
  getAnalyticsBySpeedMock.mockResolvedValue([]);
  getAnalyticsByBuyinRangeMock.mockResolvedValue([]);
  getAnalyticsByDayOfWeekMock.mockResolvedValue([]);
  getAnalyticsByMonthMock.mockResolvedValue([]);
  getAnalyticsByFieldMock.mockResolvedValue([]);
  getAnalyticsByFieldSizeMock.mockResolvedValue([]);
  getDashboardStatsMock.mockResolvedValue({ totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 });
});

async function loadTool() {
  const { getTool, _resetRegistry } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  const tool = getTool('query_dimension');
  if (!tool) throw new Error('query_dimension nao registrada');
  return tool;
}

describe('query_dimension · inputSchema (RF-01, ADR-145 enums canonicos)', () => {
  it('aceita dimension valida + groupBy + period', async () => {
    const tool = await loadTool();
    const r = tool.inputSchema.safeParse({ dimension: 'roi', groupBy: 'site', period: '30d' });
    expect(r.success).toBe(true);
  });

  it('aplica default period = "all" quando omitido', async () => {
    const tool = await loadTool();
    const r = tool.inputSchema.safeParse({ dimension: 'profit' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).period).toBe('all');
  });

  it('rejeita dimension fora do enum (xyz)', async () => {
    const tool = await loadTool();
    const r = tool.inputSchema.safeParse({ dimension: 'xyz' });
    expect(r.success).toBe(false);
  });

  it('aceita period "180d" (ADR-145 — corrige doc antiga)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ dimension: 'roi', period: '180d' }).success).toBe(true);
  });

  it('aceita groupBy "fieldSize" (ADR-145 — corrige doc antiga)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ dimension: 'roi', groupBy: 'fieldSize' }).success).toBe(true);
  });

  it('filters.category aceita "Satellite" (ADR-145 — alinhado ao type primario)', async () => {
    const tool = await loadTool();
    expect(
      tool.inputSchema.safeParse({ dimension: 'roi', filters: { category: 'Satellite' } }).success,
    ).toBe(true);
  });

  it('filters.speed aceita "Normal" e rejeita "Regular" (ADR-145 — "Regular" era artefato da doc)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ dimension: 'roi', filters: { speed: 'Normal' } }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ dimension: 'roi', filters: { speed: 'Regular' } }).success).toBe(false);
  });
});

describe('query_dimension · handler routing para storage (RF-01)', () => {
  it('groupBy:"site" => chama storage.getAnalyticsBySite e devolve rows {key,value,count}', async () => {
    getAnalyticsBySiteMock.mockResolvedValue([
      { site: 'PokerStars', roi: 8.2, count: 142, profit: 320 },
      { site: 'GGPoker', roi: -1.4, count: 90, profit: -40 },
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ dimension: 'roi', groupBy: 'site', period: '30d' }, ctx as any);
    expect(getAnalyticsBySiteMock).toHaveBeenCalled();
    // userId vem do ctx, NUNCA do input
    expect(getAnalyticsBySiteMock.mock.calls[0][0]).toBe('USER-0001');
    const data = out.data ?? out;
    expect(data.dimension).toBe('roi');
    expect(data.groupBy).toBe('site');
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows[0]).toMatchObject({ key: 'PokerStars' });
    expect(typeof data.rows[0].value).toBe('number');
    expect(typeof data.rows[0].count).toBe('number');
  });

  it('groupBy:"category" => chama storage.getAnalyticsByCategory', async () => {
    getAnalyticsByCategoryMock.mockResolvedValue([{ category: 'PKO', roi: 5, count: 50 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'category' }, ctx as any);
    expect(getAnalyticsByCategoryMock).toHaveBeenCalled();
  });

  it('groupBy:"speed" => chama storage.getAnalyticsBySpeed', async () => {
    getAnalyticsBySpeedMock.mockResolvedValue([{ speed: 'Turbo', roi: -3, count: 60 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'speed' }, ctx as any);
    expect(getAnalyticsBySpeedMock).toHaveBeenCalled();
  });

  it('groupBy:"buyinRange" => chama storage.getAnalyticsByBuyinRange (labels antigos do dashboard)', async () => {
    getAnalyticsByBuyinRangeMock.mockResolvedValue([{ label: '$20-$50', roi: 2, count: 30 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'buyinRange' }, ctx as any);
    expect(getAnalyticsByBuyinRangeMock).toHaveBeenCalled();
  });

  it('groupBy:"dayOfWeek" => chama storage.getAnalyticsByDayOfWeek', async () => {
    getAnalyticsByDayOfWeekMock.mockResolvedValue([{ dayOfWeek: 3, roi: 1, count: 40 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'dayOfWeek' }, ctx as any);
    expect(getAnalyticsByDayOfWeekMock).toHaveBeenCalled();
  });

  it('groupBy:"month" => chama storage.getAnalyticsByMonth', async () => {
    getAnalyticsByMonthMock.mockResolvedValue([{ month: '2026-04', roi: 4, count: 80 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'month' }, ctx as any);
    expect(getAnalyticsByMonthMock).toHaveBeenCalled();
  });

  it('groupBy:"fieldSize" => chama storage.getAnalyticsByField (ADR-145 §4, NAO getAnalyticsByFieldSize)', async () => {
    getAnalyticsByFieldMock.mockResolvedValue([{ field: '<25%', roi: 0, count: 20 }]);
    const tool = await loadTool();
    await tool.handler({ dimension: 'roi', groupBy: 'fieldSize' }, ctx as any);
    expect(getAnalyticsByFieldMock).toHaveBeenCalled();
    expect(getAnalyticsByFieldSizeMock).not.toHaveBeenCalled();
  });

  it('sem groupBy => extrai a dimensao de storage.getDashboardStats', async () => {
    getDashboardStatsMock.mockResolvedValue({ totalTournaments: 200, roi: 7.3, profit: '1500', abi: 22, itmPercent: 18 });
    const tool = await loadTool();
    const out: any = await tool.handler({ dimension: 'roi', period: 'all' }, ctx as any);
    expect(getDashboardStatsMock).toHaveBeenCalled();
    const data = out.data ?? out;
    expect(data.groupBy == null).toBe(true);
    expect(typeof data.totalCount).toBe('number');
  });
});

describe('query_dimension · falta de dado (RF-01 — note, sem throw)', () => {
  it('rows vazio => rows:[], totalCount:0, note preenchido, sem throw', async () => {
    getAnalyticsBySiteMock.mockResolvedValue([]);
    const tool = await loadTool();
    const out: any = await tool.handler({ dimension: 'roi', groupBy: 'site' }, ctx as any);
    const data = out.data ?? out;
    expect(data.rows).toEqual([]);
    expect(data.totalCount).toBe(0);
    expect(typeof data.note).toBe('string');
    expect(data.note.length).toBeGreaterThan(0);
  });

  it('storage que EXPLODE (DB indisponivel) => loga + retorna handler_error, distinto de "no rows" (lesson #9)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAnalyticsBySiteMock.mockRejectedValue(new Error('connection terminated'));
    const tool = await loadTool();
    const out: any = await tool.handler({ dimension: 'roi', groupBy: 'site' }, ctx as any);
    // Distinto de note: e um erro, nao "sem dados".
    expect(out.ok).toBe(false);
    expect(out.error ?? out.code).toMatch(/handler_error/);
    // Loga ANTES do fallback.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('query_dimension · descriptor (RF-01)', () => {
  it('requiresConfirmation === false, auditLevel === log, gateByTier Pro+', async () => {
    const tool = await loadTool();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(tool.gateByTier).toEqual(expect.arrayContaining(['pro', 'premium', 'admin']));
  });
});
