import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-02: find_top_leaks (read tool — substituir stub)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-02)
// Storage/serv: server/coachLeakDetection.ts -> detectLeaks(userId, { period })
//
// TDD red-phase: hoje find_top_leaks e um STUB que retorna { code:'not_implemented' }.
//
// Lessons:
//   - #3: mock do shape REAL de detectLeaks (overload (userId, opts) => Promise<Leak[]>).
//   - #9: detectLeaks que explode -> loga + handler_error; sem leaks -> note + ok.
// =============================================================================

const detectLeaksMock = vi.fn();

vi.mock('../../../server/coachLeakDetection', async () => {
  const actual = await vi.importActual<any>('../../../server/coachLeakDetection');
  return {
    ...actual,
    detectLeaks: detectLeaksMock,
  };
});

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  vi.clearAllMocks();
  detectLeaksMock.mockResolvedValue([]);
});

async function loadTool() {
  const { getTool, _resetRegistry } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  const tool = getTool('find_top_leaks');
  if (!tool) throw new Error('find_top_leaks nao registrada');
  return tool;
}

// Shape interno aproximado de Leak / CoachLeakSummary — o handler mapeia pro
// shape externo { severity, code, description, evidence:{dimension,value,n} }.
function fakeLeak(severity: 'low' | 'medium' | 'high', code: string, n = 50) {
  return {
    severity,
    code,
    type: code,
    description: `Leak ${code} (${severity})`,
    label: `Leak ${code}`,
    dimension: 'category',
    value: -12.3,
    sampleSize: n,
    n,
  };
}

describe('find_top_leaks · inputSchema (RF-02)', () => {
  it('aceita limit/minSeverity/period validos', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ limit: 5, minSeverity: 'medium', period: '90d' }).success).toBe(true);
  });

  it('aplica defaults limit=5, minSeverity=low, period=90d', async () => {
    const tool = await loadTool();
    const r = tool.inputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).limit).toBe(5);
      expect((r.data as any).minSeverity).toBe('low');
      expect((r.data as any).period).toBe('90d');
    }
  });

  it('rejeita limit > 20 e minSeverity fora do enum', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ minSeverity: 'critical' }).success).toBe(false);
  });

  it('rejeita period invalido (60d)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ period: '60d' }).success).toBe(false);
  });
});

describe('find_top_leaks · handler (RF-02)', () => {
  it('chama detectLeaks com userId do ctx (NUNCA do input) e o period', async () => {
    detectLeaksMock.mockResolvedValue([fakeLeak('high', 'low_itm_turbos')]);
    const tool = await loadTool();
    await tool.handler({ limit: 5, minSeverity: 'low', period: '90d' }, ctx as any);
    expect(detectLeaksMock).toHaveBeenCalled();
    const callArg = detectLeaksMock.mock.calls[0][0];
    expect(callArg).toBe('USER-0001');
    const opts = detectLeaksMock.mock.calls[0][1];
    expect(opts).toMatchObject({ period: '90d' });
  });

  it('output: leaks[] com {severity,code,description,evidence:{dimension,value,n}} + total + (note?)', async () => {
    detectLeaksMock.mockResolvedValue([
      fakeLeak('high', 'low_itm_turbos', 120),
      fakeLeak('medium', 'negative_roi_pko', 45),
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 5, minSeverity: 'low', period: '90d' }, ctx as any);
    const data = out.data ?? out;
    expect(Array.isArray(data.leaks)).toBe(true);
    expect(data.leaks.length).toBe(2);
    const l = data.leaks[0];
    expect(['low', 'medium', 'high']).toContain(l.severity);
    expect(typeof l.code).toBe('string');
    expect(typeof l.description).toBe('string');
    expect(l.evidence).toBeDefined();
    expect(typeof l.evidence.dimension).toBe('string');
    expect(typeof l.evidence.value).toBe('number');
    expect(typeof l.evidence.n).toBe('number');
    expect(typeof data.total).toBe('number');
  });

  it('minSeverity:"medium" filtra leaks "low"', async () => {
    detectLeaksMock.mockResolvedValue([
      fakeLeak('low', 'minor_one'),
      fakeLeak('medium', 'mid_one'),
      fakeLeak('high', 'big_one'),
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 10, minSeverity: 'medium', period: '90d' }, ctx as any);
    const data = out.data ?? out;
    const sevs = data.leaks.map((x: any) => x.severity);
    expect(sevs).not.toContain('low');
  });

  it('limit:3 trunca em 3 e total reflete o total ANTES do truncamento', async () => {
    detectLeaksMock.mockResolvedValue([
      fakeLeak('high', 'a'), fakeLeak('high', 'b'), fakeLeak('high', 'c'),
      fakeLeak('high', 'd'), fakeLeak('high', 'e'),
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 3, minSeverity: 'low', period: '90d' }, ctx as any);
    const data = out.data ?? out;
    expect(data.leaks.length).toBe(3);
    expect(data.total).toBe(5);
  });

  it('evidence.n e o sample size do leak (usado na confidence tag)', async () => {
    detectLeaksMock.mockResolvedValue([fakeLeak('high', 'low_itm_turbos', 137)]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 5, minSeverity: 'low', period: '90d' }, ctx as any);
    const data = out.data ?? out;
    expect(data.leaks[0].evidence.n).toBe(137);
  });
});

describe('find_top_leaks · falta de dado (RF-02)', () => {
  it('sem leaks => leaks:[], total:0, note preenchido, sem throw', async () => {
    detectLeaksMock.mockResolvedValue([]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 5, minSeverity: 'low', period: '90d' }, ctx as any);
    const data = out.data ?? out;
    expect(data.leaks).toEqual([]);
    expect(data.total).toBe(0);
    expect(typeof data.note).toBe('string');
  });

  it('detectLeaks que EXPLODE => loga + handler_error (lesson #9)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    detectLeaksMock.mockRejectedValue(new Error('analytics gather failed'));
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 5, minSeverity: 'low', period: '90d' }, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error ?? out.code).toMatch(/handler_error/);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('find_top_leaks · descriptor (RF-02)', () => {
  it('nao e mais stub; requiresConfirmation false; auditLevel log; gateByTier Pro+', async () => {
    const tool = await loadTool();
    expect((tool as any).__stub).toBeUndefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(tool.gateByTier).toEqual(expect.arrayContaining(['pro', 'premium', 'admin']));
  });
});
