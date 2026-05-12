import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-03: get_tournament_suggestions (read tool — registrar do zero)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-03)
// ADR  : 147 §1 — handler reusa tournamentScoringService.rankTournamentsForContext
//
// TDD red-phase: handler `server/coachTools/handlers/getTournamentSuggestions.ts`
// nao existe; tool nao registrada.
//
// Lessons:
//   - #3: mock do shape REAL do service.
//   - #9: service que explode -> loga + handler_error; sem torneios -> note + ok.
// =============================================================================

const rankTournamentsForContextMock = vi.fn();

// O handler importa o service — mockamos ambos os caminhos possiveis.
vi.mock('../../../server/services/tournamentScoringService', () => ({
  rankTournamentsForContext: rankTournamentsForContextMock,
  explainScoreForTournament: vi.fn(),
}));
vi.mock('../../../server/scoring/tournamentScoringService', () => ({
  rankTournamentsForContext: rankTournamentsForContextMock,
  explainScoreForTournament: vi.fn(),
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

function fakeSuggestion(overrides: any = {}) {
  return {
    id: 's-1',
    name: 'Big $22',
    site: 'PokerStars',
    buyIn: 22,
    buyInUSD: 22,
    type: 'PKO',
    speed: 'Normal',
    score: 78,
    grade: 'A',
    confidence: 'medium',
    rationale: 'ROI bom em PKO $22.',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rankTournamentsForContextMock.mockResolvedValue([]);
});

async function loadTool() {
  const { getTool, _resetRegistry } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  const tool = getTool('get_tournament_suggestions');
  if (!tool) throw new Error('get_tournament_suggestions nao registrada');
  return tool;
}

describe('get_tournament_suggestions · inputSchema (RF-03)', () => {
  it('aceita date / dayOfWeek / profile / maxBuyIn / limit validos', async () => {
    const tool = await loadTool();
    expect(
      tool.inputSchema.safeParse({ date: '2026-05-14', profile: 'A', maxBuyIn: 50, limit: 10 }).success,
    ).toBe(true);
  });

  it('aplica default limit=10 quando omitido', async () => {
    const tool = await loadTool();
    const r = tool.inputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).limit).toBe(10);
  });

  it('rejeita dayOfWeek > 6, profile fora de A|B|C, limit > 20, maxBuyIn negativo', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ dayOfWeek: 7 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ profile: 'D' }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ maxBuyIn: -5 }).success).toBe(false);
  });
});

describe('get_tournament_suggestions · handler (RF-03)', () => {
  it('usa userId do ctx e repassa maxBuyIn pro service', async () => {
    rankTournamentsForContextMock.mockResolvedValue([fakeSuggestion()]);
    const tool = await loadTool();
    await tool.handler({ maxBuyIn: 50, limit: 10 }, ctx as any);
    expect(rankTournamentsForContextMock).toHaveBeenCalled();
    expect(rankTournamentsForContextMock.mock.calls[0][0]).toBe('USER-0001');
    const opts = rankTournamentsForContextMock.mock.calls[0][1];
    expect(opts).toMatchObject({ maxBuyIn: 50 });
  });

  it('output: suggestions[] com {id,name,site,buyIn,buyInUSD,score,grade,confidence,rationale} + total + date', async () => {
    rankTournamentsForContextMock.mockResolvedValue([
      fakeSuggestion({ id: 'a', score: 90, grade: 'S' }),
      fakeSuggestion({ id: 'b', score: 70, grade: 'B' }),
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 10 }, ctx as any);
    const data = out.data ?? out;
    expect(Array.isArray(data.suggestions)).toBe(true);
    const s = data.suggestions[0];
    expect(typeof s.id).toBe('string');
    expect(typeof s.name).toBe('string');
    expect(typeof s.site).toBe('string');
    expect(typeof s.buyIn).toBe('number');
    expect(typeof s.buyInUSD).toBe('number');
    expect(typeof s.score).toBe('number');
    expect(['S', 'A', 'B', 'C', 'D']).toContain(s.grade);
    expect(['low', 'medium', 'high']).toContain(s.confidence);
    expect(typeof s.rationale).toBe('string');
    expect(typeof data.total).toBe('number');
    expect(typeof data.date).toBe('string');
  });

  it('suggestions ordenado por score desc; total >= suggestions.length', async () => {
    rankTournamentsForContextMock.mockResolvedValue([
      fakeSuggestion({ id: 'a', score: 95 }),
      fakeSuggestion({ id: 'b', score: 80 }),
      fakeSuggestion({ id: 'c', score: 60 }),
    ]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 10 }, ctx as any);
    const data = out.data ?? out;
    for (let i = 1; i < data.suggestions.length; i++) {
      expect(data.suggestions[i - 1].score).toBeGreaterThanOrEqual(data.suggestions[i].score);
    }
    expect(data.total).toBeGreaterThanOrEqual(data.suggestions.length);
  });
});

describe('get_tournament_suggestions · falta de dado (RF-03)', () => {
  it('sem torneios => suggestions:[], total:0, note preenchido, sem throw', async () => {
    rankTournamentsForContextMock.mockResolvedValue([]);
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 10 }, ctx as any);
    const data = out.data ?? out;
    expect(data.suggestions).toEqual([]);
    expect(data.total).toBe(0);
    expect(typeof data.note).toBe('string');
  });

  it('service que EXPLODE => loga + handler_error (lesson #9)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rankTournamentsForContextMock.mockRejectedValue(new Error('bundle load failed'));
    const tool = await loadTool();
    const out: any = await tool.handler({ limit: 10 }, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error ?? out.code).toMatch(/handler_error/);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('get_tournament_suggestions · descriptor (RF-03)', () => {
  it('registrada (nao stub); requiresConfirmation false; auditLevel log; gateByTier Pro+', async () => {
    const tool = await loadTool();
    expect((tool as any).__stub).toBeUndefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(tool.gateByTier).toEqual(expect.arrayContaining(['pro', 'premium', 'admin']));
  });
});
