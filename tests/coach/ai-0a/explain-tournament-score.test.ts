import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-04: explain_tournament_score (read tool — registrar do zero)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-04)
// ADR  : 147 §1 — handler reusa tournamentScoringService.explainScoreForTournament
//
// TDD red-phase: handler `server/coachTools/handlers/explainTournamentScore.ts`
// nao existe; tool nao registrada.
// =============================================================================

const explainScoreForTournamentMock = vi.fn();

vi.mock('../../../server/services/tournamentScoringService', () => ({
  rankTournamentsForContext: vi.fn(),
  explainScoreForTournament: explainScoreForTournamentMock,
}));
vi.mock('../../../server/scoring/tournamentScoringService', () => ({
  rankTournamentsForContext: vi.fn(),
  explainScoreForTournament: explainScoreForTournamentMock,
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

function fakeBreakdown(overrides: any = {}) {
  return {
    tournamentRef: { kind: 'library', id: 'lib-1', name: 'Sunday Million', site: 'PokerStars' },
    score: 82,
    grade: 'S',
    confidence: 'high',
    breakdown: [
      { signalName: 'playerEdge', weight: 0.3, value: 80, contribution: 24, sampleSize: 200, confidence: 'high' },
      { signalName: 'fieldFit', weight: 0.2, value: 70, contribution: 14, sampleSize: 150, confidence: 'high' },
      { signalName: 'scheduleFit', weight: 0.2, value: 60, contribution: 12, sampleSize: 90, confidence: 'medium' },
      { signalName: 'bankrollFit', weight: 0.15, value: 90, contribution: 13.5, sampleSize: 50, confidence: 'medium' },
      { signalName: 'structureFit', weight: 0.15, value: 75, contribution: 11.25, sampleSize: 40, confidence: 'medium' },
    ],
    rationale: 'Edge bom no campo, ABI compativel.',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  explainScoreForTournamentMock.mockResolvedValue(fakeBreakdown());
});

async function loadTool() {
  const { getTool, _resetRegistry } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  const tool = getTool('explain_tournament_score');
  if (!tool) throw new Error('explain_tournament_score nao registrada');
  return tool;
}

describe('explain_tournament_score · inputSchema XOR (RF-04 — superRefine)', () => {
  it('exatamente 1 ID => aceita (tournamentId)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ tournamentId: 't-1' }).success).toBe(true);
  });

  it('exatamente 1 ID => aceita (libraryTemplateId)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ libraryTemplateId: 'lib-1' }).success).toBe(true);
  });

  it('exatamente 1 ID => aceita (plannedTournamentId)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ plannedTournamentId: 'pt-1' }).success).toBe(true);
  });

  it('0 IDs => rejeita', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({}).success).toBe(false);
  });

  it('2 IDs => rejeita', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ tournamentId: 't-1', libraryTemplateId: 'lib-1' }).success).toBe(false);
  });

  it('3 IDs => rejeita', async () => {
    const tool = await loadTool();
    expect(
      tool.inputSchema.safeParse({ tournamentId: 't-1', libraryTemplateId: 'lib-1', plannedTournamentId: 'pt-1' }).success,
    ).toBe(false);
  });
});

describe('explain_tournament_score · handler (RF-04)', () => {
  it('input invalido (0 IDs) nao chama o service', async () => {
    const tool = await loadTool();
    const out: any = await tool.handler({}, ctx as any);
    expect(explainScoreForTournamentMock).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    expect(out.error ?? out.code).toMatch(/validation_failed/);
  });

  it('libraryTemplateId valido => breakdown com 5 sinais (weight, value, contribution, sampleSize, confidence)', async () => {
    explainScoreForTournamentMock.mockResolvedValue(fakeBreakdown());
    const tool = await loadTool();
    const out: any = await tool.handler({ libraryTemplateId: 'lib-1' }, ctx as any);
    expect(explainScoreForTournamentMock).toHaveBeenCalled();
    expect(explainScoreForTournamentMock.mock.calls[0][0]).toBe('USER-0001'); // userId do ctx
    const data = out.data ?? out;
    expect(typeof data.score).toBe('number');
    expect(['S', 'A', 'B', 'C', 'D']).toContain(data.grade);
    expect(['low', 'medium', 'high']).toContain(data.confidence);
    expect(Array.isArray(data.breakdown)).toBe(true);
    expect(data.breakdown.length).toBeGreaterThanOrEqual(5);
    for (const sig of data.breakdown) {
      expect(typeof sig.signalName).toBe('string');
      expect(typeof sig.weight).toBe('number');
      expect(typeof sig.value).toBe('number');
      expect(typeof sig.contribution).toBe('number');
      expect(typeof sig.sampleSize).toBe('number');
      expect(['low', 'medium', 'high']).toContain(sig.confidence);
    }
    expect(data.tournamentRef).toBeDefined();
    expect(['tournament', 'library', 'planned']).toContain(data.tournamentRef.kind);
  });

  it('tournamentId de outro usuario => erro de handler tournament_not_found (nao vaza dado)', async () => {
    explainScoreForTournamentMock.mockRejectedValue(new Error('tournament_not_found'));
    const tool = await loadTool();
    const out: any = await tool.handler({ tournamentId: 't-alheio' }, ctx as any);
    expect(out.ok).toBe(false);
    // mensagem clara, nao throw nu.
    const msg = out.message ?? out.error ?? out.code ?? '';
    expect(String(msg)).toMatch(/tournament_not_found|handler_error/);
  });
});

describe('explain_tournament_score · descriptor (RF-04)', () => {
  it('registrada (nao stub); requiresConfirmation false; auditLevel log; gateByTier Pro+', async () => {
    const tool = await loadTool();
    expect((tool as any).__stub).toBeUndefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(tool.gateByTier).toEqual(expect.arrayContaining(['pro', 'premium', 'admin']));
  });
});
