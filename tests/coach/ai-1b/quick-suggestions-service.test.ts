import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-12 — server/coach/quickSuggestions.ts (NAO EXISTE)
//   export async function computeSuggestions(userId, route, ctx, injectedStorage?): Promise<Array<{ id, text, sendOnClick: true }>>
//   export function _resetSuggestionsCacheForTests(): void
//   export const QUICK_SUGGESTIONS_BY_ROUTE: Record<string, ...>  (mapa estatico — opcional, aceitamos so a funcao)
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-12)
//   - Docs/architecture/decisions/158-quick-suggestions-anti-blank-page.md (§3.2, §3.3, §5)
//
// Lessons: #21 (cache server-side TTL 30s + _resetForTests exportado, chamado em
//   beforeEach), #3 (mock shape REAL — getDashboardStats/detectLeaks/getLastUploadAt),
//   #9 (erro -> cai pras genericas por rota; safe).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

function makeStorage(opts: { roiWeek?: number; hasData?: boolean; highLeaks?: boolean; focoDoMes?: string | null } = {}) {
  const hasData = opts.hasData ?? true;
  return {
    getDashboardStats: vi.fn(async (_uid: string, _p?: string) => hasData
      ? { totalTournaments: 30, totalProfit: opts.roiWeek != null && opts.roiWeek < 0 ? -300 : 300, roi: opts.roiWeek ?? 0.1 }
      : { totalTournaments: 0, totalProfit: 0, roi: 0 }),
    detectLeaks: vi.fn(async () => ({ leaks: opts.highLeaks ? [{ tag: 'x', severity: 'high' }] : [], hasHighSeverity: !!opts.highLeaks })),
    getLastUploadAt: vi.fn(async () => hasData ? new Date('2026-05-09T00:00:00Z') : null),
    getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, focoDoMes: opts.focoDoMes ?? 'ICM' })),
  } as any;
}

beforeEach(async () => {
  // lesson #21 — sempre resetar o cache antes de cada teste.
  try {
    const mod = await import('../../../server/coach/quickSuggestions');
    (mod as any)._resetSuggestionsCacheForTests?.();
  } catch { /* modulo ainda nao existe — red phase */ }
});

describe('computeSuggestions — mapa por rota + variantes de estado', () => {
  it('exporta _resetSuggestionsCacheForTests', async () => {
    const mod: any = await import('../../../server/coach/quickSuggestions');
    expect(typeof mod._resetSuggestionsCacheForTests).toBe('function');
  });

  it('route /dashboard sem downswing, com dados -> 2-4 sugestoes; cada { id, text, sendOnClick: true }', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/dashboard', {}, makeStorage({ hasData: true, roiWeek: 0.1 }));
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const s of out) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.text).toBe('string');
      expect(s.sendOnClick).toBe(true);
    }
  });

  it('route /dashboard COM downswing (ROI negativo na semana) -> inclui variante "por que estou perdendo / variancia"', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/dashboard', {}, makeStorage({ hasData: true, roiWeek: -0.2, highLeaks: true }));
    const txt = out.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(txt).toMatch(/perdendo|vari[âa]ncia/);
  });

  it('user SEM dados (qualquer rota) -> sugestoes de import/onboarding', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/grind', {}, makeStorage({ hasData: false }));
    const txt = out.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(txt).toMatch(/import|come[çc]o|por onde/);
  });

  it('route /bankroll -> banca/saque/simular', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/bankroll', {}, makeStorage({ hasData: true }));
    const txt = out.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(txt).toMatch(/banca|sacar|simular/);
  });

  it('route /grade-planner -> sugestoes de grade', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/grade-planner', {}, makeStorage({ hasData: true }));
    const txt = out.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(txt).toMatch(/grade/);
  });

  it('route /estudos -> "o que devo estudar agora?" / progresso no foco', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/estudos', {}, makeStorage({ hasData: true }));
    const txt = out.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(txt).toMatch(/estudar|foco|progresso/);
  });

  it('route desconhecida -> set generico, nao vazio', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const out = await computeSuggestions('USER-1', '/rota-xyz', {}, makeStorage({ hasData: true }));
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});

describe('computeSuggestions — cache TTL 30s + reset', () => {
  it('2a chamada na mesma janela nao re-consulta o storage (cache TTL)', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const storage = makeStorage({ hasData: true, roiWeek: 0.1 });
    await computeSuggestions('USER-1', '/dashboard', {}, storage);
    const n1 = storage.getDashboardStats.mock.calls.length;
    await computeSuggestions('USER-1', '/dashboard', {}, storage);
    expect(storage.getDashboardStats.mock.calls.length).toBe(n1);
  });

  it('_resetSuggestionsCacheForTests limpa o cache — apos reset, a query roda de novo', async () => {
    const mod: any = await import('../../../server/coach/quickSuggestions');
    const storage = makeStorage({ hasData: true });
    await mod.computeSuggestions('USER-1', '/dashboard', {}, storage);
    const n1 = storage.getDashboardStats.mock.calls.length;
    mod._resetSuggestionsCacheForTests();
    await mod.computeSuggestions('USER-1', '/dashboard', {}, storage);
    expect(storage.getDashboardStats.mock.calls.length).toBeGreaterThan(n1);
  });
});

describe('computeSuggestions — safe-degrade', () => {
  it('erro em todas as queries de estado -> cai pras genericas por rota (nao lanca; nao vazio)', async () => {
    const { computeSuggestions } = await import('../../../server/coach/quickSuggestions');
    const storage: any = {
      getDashboardStats: vi.fn(async () => { throw new Error('db down'); }),
      detectLeaks: vi.fn(async () => { throw new Error('db down'); }),
      getLastUploadAt: vi.fn(async () => { throw new Error('db down'); }),
      getAiStructuredProfile: vi.fn(async () => { throw new Error('db down'); }),
    };
    const out = await computeSuggestions('USER-1', '/dashboard', {}, storage);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
