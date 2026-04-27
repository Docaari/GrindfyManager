import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Coach-2A / RF-03 Tool 3 — get_tournament_suggestions
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/getTournamentSuggestions.ts
//
// Handler delega para servico do Tournament Selector (Sprint 1) que ja gera
// sugestoes ranqueadas por score. Repassa userId do ctx.
//
// Output: { suggestions: [...], total, note? }  com cada item tendo
//   { name, site, buyIn, type, score, signals, signalsExplanation }
// Spec RF-03 Tool 3.
// =============================================================================

const fetchSuggestionsMock = vi.fn();
vi.mock('../../../../server/services/tournamentSuggestionService', () => ({
  fetchTournamentSuggestions: (...args: any[]) => fetchSuggestionsMock(...args),
}));

import { getTournamentSuggestionsTool } from '../../../../server/coachTools/handlers/getTournamentSuggestions';

const ctx = { userId: 'USER-0001', chatSessionId: 'sess', messageId: 'm1' } as any;

beforeEach(() => {
  fetchSuggestionsMock.mockReset();
});

describe('getTournamentSuggestionsTool — schema', () => {
  it('aceita input vazio (defaults limit=10)', () => {
    const r = getTournamentSuggestionsTool.inputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).limit).toBe(10);
  });

  it('rejeita dayOfWeek fora de 0..6', () => {
    expect(
      getTournamentSuggestionsTool.inputSchema.safeParse({ dayOfWeek: 9 }).success,
    ).toBe(false);
  });

  it('rejeita maxBuyIn negativo', () => {
    expect(
      getTournamentSuggestionsTool.inputSchema.safeParse({ maxBuyIn: -10 }).success,
    ).toBe(false);
  });
});

describe('getTournamentSuggestionsTool — handler', () => {
  it('repassa userId + dayOfWeek para o servico', async () => {
    fetchSuggestionsMock.mockResolvedValue([
      {
        name: 'Big $22',
        site: 'PokerStars',
        buyIn: 22,
        type: 'Vanilla',
        score: 87,
        signals: { playerEdge: 18, fieldFit: 22, scheduleFit: 15, bankrollFit: 18, structureFit: 14 },
        signalsExplanation: 'ROI historico positivo em buy-in similar; field size dentro do alvo.',
      },
    ]);

    const out: any = await getTournamentSuggestionsTool.handler(
      { dayOfWeek: 3, profile: 'A', limit: 5 } as any,
      ctx,
    );
    expect(fetchSuggestionsMock).toHaveBeenCalled();
    const call = fetchSuggestionsMock.mock.calls[0][0];
    expect(call.userId).toBe('USER-0001');
    expect(call.dayOfWeek).toBe(3);
    expect(out.suggestions).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('cada suggestion tem signals + signalsExplanation', async () => {
    fetchSuggestionsMock.mockResolvedValue([
      {
        name: 'A', site: 'X', buyIn: 5, type: 'Vanilla', score: 50,
        signals: { playerEdge: 10 }, signalsExplanation: 'estavel.',
      },
    ]);
    const out: any = await getTournamentSuggestionsTool.handler({} as any, ctx);
    expect(out.suggestions[0].signals).toBeDefined();
    expect(typeof out.suggestions[0].signalsExplanation).toBe('string');
  });
});

describe('getTournamentSuggestionsTool — edge cases', () => {
  it('nao ha torneios para o dia -> {suggestions: [], total: 0, note}', async () => {
    fetchSuggestionsMock.mockResolvedValue([]);
    const out: any = await getTournamentSuggestionsTool.handler(
      { dayOfWeek: 1 } as any,
      ctx,
    );
    expect(out.suggestions).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.note).toBeDefined();
  });
});
