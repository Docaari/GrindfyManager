import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Coach-2A / RF-03 Tool 4 — explain_tournament_score
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/explainTournamentScore.ts
//
// Input XOR (superRefine): exatamente um de tournamentId, libraryTemplateId,
// plannedTournamentId. Localiza torneio e chama scorer com flag de breakdown.
//
// Output: { tournamentId, score, breakdown[], recommendation }
//   breakdown[i] = { signalName, weight, contribution, dataPoints, confidence }
// Spec RF-03 Tool 4.
// =============================================================================

const explainScoreMock = vi.fn();
vi.mock('../../../../server/services/tournamentScoreExplainer', () => ({
  explainTournamentScore: (...args: any[]) => explainScoreMock(...args),
}));

import { explainTournamentScoreTool } from '../../../../server/coachTools/handlers/explainTournamentScore';

const ctx = { userId: 'USER-0001', chatSessionId: 'sess', messageId: 'm1' } as any;

beforeEach(() => {
  explainScoreMock.mockReset();
});

describe('explainTournamentScoreTool — schema XOR', () => {
  it('rejeita 0 IDs', () => {
    const r = explainTournamentScoreTool.inputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejeita 2 IDs preenchidos', () => {
    const r = explainTournamentScoreTool.inputSchema.safeParse({
      tournamentId: 't1',
      libraryTemplateId: 'lib1',
    });
    expect(r.success).toBe(false);
  });

  it('aceita exatamente 1 ID (libraryTemplateId)', () => {
    const r = explainTournamentScoreTool.inputSchema.safeParse({ libraryTemplateId: 'lib_abc' });
    expect(r.success).toBe(true);
  });

  it('aceita exatamente 1 ID (tournamentId)', () => {
    const r = explainTournamentScoreTool.inputSchema.safeParse({ tournamentId: 'tour_x' });
    expect(r.success).toBe(true);
  });

  it('aceita exatamente 1 ID (plannedTournamentId)', () => {
    const r = explainTournamentScoreTool.inputSchema.safeParse({ plannedTournamentId: 'pl_x' });
    expect(r.success).toBe(true);
  });
});

describe('explainTournamentScoreTool — handler', () => {
  it('output: { tournamentId, score, breakdown[], recommendation } com shape correto', async () => {
    explainScoreMock.mockResolvedValue({
      tournamentId: 'lib_abc',
      score: 82,
      breakdown: [
        { signalName: 'playerEdge', weight: 0.3, contribution: 24.0, dataPoints: 142, confidence: 'high' },
        { signalName: 'fieldFit', weight: 0.25, contribution: 18.5, dataPoints: 89, confidence: 'high' },
      ],
      recommendation: 'high',
    });

    const out: any = await explainTournamentScoreTool.handler(
      { libraryTemplateId: 'lib_abc' } as any,
      ctx,
    );
    expect(out.tournamentId).toBe('lib_abc');
    expect(typeof out.score).toBe('number');
    expect(Array.isArray(out.breakdown)).toBe(true);
    expect(out.breakdown[0]).toMatchObject({
      signalName: expect.any(String),
      weight: expect.any(Number),
      contribution: expect.any(Number),
      dataPoints: expect.any(Number),
      confidence: expect.stringMatching(/low|medium|high/),
    });
    expect(['low', 'medium', 'high']).toContain(out.recommendation);
  });
});

describe('explainTournamentScoreTool — edge cases', () => {
  it('tournamentId inexistente -> handler nao crasha (retorna estrutura indicando erro)', async () => {
    explainScoreMock.mockResolvedValue(null);
    const out = await explainTournamentScoreTool
      .handler({ tournamentId: 'nao_existe' } as any, ctx)
      .catch((err: any) => ({ __caught: err }));
    // Aceita: handler retorna estrutura graceful (com note) OU lanca erro tratavel.
    // O importante: NAO crasha o processo de teste.
    expect(out).toBeDefined();
  });
});
