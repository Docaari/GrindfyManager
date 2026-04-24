import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: POST /api/planned-tournaments — log RF-07 add_to_grid
//
// Decisoes Q9 + Q10:
//   - Logging IMPLICITO no proprio handler de POST /api/planned-tournaments
//   - Aciona quando metadata.fromSelector === true
//   - Snapshot completo dos signals + filtros aplicados em metadata
//   - Sem metadata.fromSelector -> nao loga
//   - Backward compat: requests existentes sem metadata continuam funcionando
// =============================================================================

import { handleCreatePlannedTournament } from '../../../server/routes/grade-planner';
import { storage } from '../../../server/storage';
import { playerBundleCache } from '../../../server/services/playerBundle';
import { selectorCache } from '../../../server/services/selectorCache';

vi.mock('../../../server/storage', () => ({
  storage: {
    createPlannedTournament: vi.fn(),
    insertSelectorLog: vi.fn(),
  },
}));

vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: {
    invalidate: vi.fn(),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: {
    invalidateAllForUser: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  (storage.createPlannedTournament as any).mockResolvedValue({
    id: 'pt-001',
    userId: 'USER-0001',
    dayOfWeek: 4,
    site: 'Suprema',
    time: '22:00',
    type: 'PKO',
    speed: 'Turbo',
    name: 'Mystery KO $22',
    buyIn: '22.00',
  });
});

const baseBody = {
  dayOfWeek: 4,
  profile: 'A',
  site: 'Suprema',
  time: '22:00',
  type: 'PKO',
  speed: 'Turbo',
  name: 'Mystery KO $22',
  buyIn: '22.00',
};

describe('POST /api/planned-tournaments - sem metadata.fromSelector (caso normal)', () => {
  it('cria planned_tournament e NAO loga em tournament_selector_logs', async () => {
    await handleCreatePlannedTournament({ userId: 'USER-0001', body: baseBody });
    expect(storage.createPlannedTournament).toHaveBeenCalled();
    expect(storage.insertSelectorLog).not.toHaveBeenCalled();
  });

  it('backward compat: request antigo (sem metadata) ainda funciona', async () => {
    const r = await handleCreatePlannedTournament({ userId: 'USER-0001', body: baseBody });
    expect(r.id).toBe('pt-001');
  });
});

describe('POST /api/planned-tournaments - com metadata.fromSelector=true (Q10)', () => {
  it('cria planned_tournament E loga add_to_grid', async () => {
    await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: {
        ...baseBody,
        metadata: {
          fromSelector: true,
          selectorScore: 87,
          selectorGrade: 'S',
          selectorConfidence: 'high',
          selectorSignals: { siteRoi: { value: 14, sample: 312, weight: 0.2, score: 76 } },
          filtersApplied: { sources: 'suprema,library', minScore: 0 },
        },
        externalId: 'suprema-12345',
      } as any,
    });

    expect(storage.insertSelectorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        eventType: 'add_to_grid',
        score: 87,
        grade: 'S',
        confidence: 'high',
        tournamentExternalId: 'suprema-12345',
      })
    );
  });

  it('metadata do log contem snapshot dos signals (Q9)', async () => {
    await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: {
        ...baseBody,
        metadata: {
          fromSelector: true,
          selectorScore: 87,
          selectorGrade: 'S',
          selectorSignals: { siteRoi: { value: 14, sample: 312, weight: 0.2, score: 76 } },
          filtersApplied: { sources: 'suprema,library' },
        },
      } as any,
    });

    const logArg = (storage.insertSelectorLog as any).mock.calls[0][0];
    expect(logArg.metadata).toHaveProperty('signals');
    expect(logArg.metadata.signals.siteRoi.score).toBe(76);
    expect(logArg.metadata).toHaveProperty('filtersApplied');
  });

  it('falha do log NAO impede criacao do planned_tournament', async () => {
    (storage.insertSelectorLog as any).mockRejectedValue(new Error('Log DB down'));
    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: {
        ...baseBody,
        metadata: { fromSelector: true, selectorScore: 80, selectorGrade: 'A' },
      } as any,
    });
    expect(r.id).toBeDefined();
  });

  it('apos add_to_grid, selectorCache invalida o usuario para refletir alreadyInGrid=true', async () => {
    await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: { ...baseBody, metadata: { fromSelector: true, selectorScore: 87 } } as any,
    });
    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledWith('USER-0001');
  });
});

describe('POST /api/planned-tournaments - metadata.fromSelector=false explicito', () => {
  it('NAO loga (apenas quando true)', async () => {
    await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: { ...baseBody, metadata: { fromSelector: false } } as any,
    });
    expect(storage.insertSelectorLog).not.toHaveBeenCalled();
  });
});
