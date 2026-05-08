/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-4 enrichSpotsToReviewWithReentry (server-side)
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-4.1
 * ADR : 140 (Coach session insights extension shape, no breaking change)
 *
 * Cobertura RED — `server/services/spotReentry/enrichSpotsToReview`:
 *   - Para cada spot em insights.spotsToReview[]:
 *     * reentryAlreadyActive: TRUE se ja tem spot_reentry_cards ativo.
 *     * reentryCandidate: TRUE se decision_correct=false OU confidence<=2 OU
 *       (insight nao-null AND nao tem reentry ativa).
 *     * reentryReason: string user-facing.
 *   - N+1 mitigation: 2 batch queries (getStarredHandsByIds + getActiveReentryCardsBySpotIds).
 *   - Backwards compat: shape original (sem reentry fields) renderiza igual.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *   #5 vi.fn ok
 *
 * Status RED: arquivo server/services/spotReentry/enrichSpotsToReview.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getStarredHandsByIdsMock, getActiveReentryCardsBySpotIdsMock } = vi.hoisted(() => ({
  getStarredHandsByIdsMock: vi.fn(),
  getActiveReentryCardsBySpotIdsMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getStarredHandsByIds: getStarredHandsByIdsMock,
    getActiveReentryCardsBySpotIds: getActiveReentryCardsBySpotIdsMock,
  },
}));

async function loadEnricher() {
  const mod: any = await import('../../server/services/spotReentry/enrichSpotsToReview');
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('enrichSpotsToReviewWithReentry — basic', () => {
  it('exporta funcao enrichSpotsToReviewWithReentry', async () => {
    const mod = await loadEnricher();
    expect(typeof mod.enrichSpotsToReviewWithReentry).toBe('function');
  });

  it('retorna [] quando spotsToReview eh []', async () => {
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry([], 'USER-0001');
    expect(r).toEqual([]);
    // N+1 mitigation: empty input nao chama storage
    expect(getStarredHandsByIdsMock).not.toHaveBeenCalled();
    expect(getActiveReentryCardsBySpotIdsMock).not.toHaveBeenCalled();
  });

  it('faz APENAS 2 batch queries (N+1 mitigation)', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },
      { id: 'spot-2', decisionCorrect: null, confidenceLevel: 2, insight: null },
      { id: 'spot-3', decisionCorrect: null, confidenceLevel: 5, insight: 'algo' },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    await mod.enrichSpotsToReviewWithReentry(
      [
        { spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' },
        { spotId: 'spot-2', label: 'B', suggestedAction: 'link_theme' },
        { spotId: 'spot-3', label: 'C', suggestedAction: 'review_later' },
      ],
      'USER-0001',
    );
    expect(getStarredHandsByIdsMock).toHaveBeenCalledTimes(1);
    expect(getActiveReentryCardsBySpotIdsMock).toHaveBeenCalledTimes(1);
  });
});

describe('enrichSpotsToReviewWithReentry — candidato decision_correct=false', () => {
  it('reentryCandidate=true + reason "Decisao errada" quando decision_correct=false', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(true);
    expect(r[0].reentryReason).toMatch(/errada|errado|incorreta/i);
  });
});

describe('enrichSpotsToReviewWithReentry — candidato confidence<=2', () => {
  it('reentryCandidate=true + reason mencionando confianca quando confidence<=2', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: null, confidenceLevel: 2, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(true);
    expect(r[0].reentryReason).toMatch(/confianca|confidence/i);
  });
});

describe('enrichSpotsToReviewWithReentry — candidato has_insight sem reentry', () => {
  it('reentryCandidate=true + reason "Tem insight, falta reentry" quando insight!=null e nao tem reentry', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: true, confidenceLevel: 5, insight: 'tinha certeza' },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(true);
    expect(r[0].reentryReason).toMatch(/insight|reentry/i);
  });
});

describe('enrichSpotsToReviewWithReentry — already active', () => {
  it('reentryAlreadyActive=true quando spot_reentry_cards ativo encontrado', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([
      { spotId: 'spot-1', userId: 'USER-0001', archivedAt: null },
    ]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryAlreadyActive).toBe(true);
  });

  it('reentryAlreadyActive=false quando NAO tem card ativo', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryAlreadyActive).toBe(false);
  });
});

describe('enrichSpotsToReviewWithReentry — non-candidato', () => {
  it('decision_correct=true + confidence>=3 + sem insight → reentryCandidate=false', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: true, confidenceLevel: 4, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'review_later' }],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(false);
  });

  it('todos null/sem-info → reentryCandidate=false', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: null, confidenceLevel: null, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(false);
  });
});

describe('enrichSpotsToReviewWithReentry — backward compat', () => {
  it('preserva campos originais (spotId, label, suggestedAction)', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-1', label: 'BB defense vs UTG 3bet', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].spotId).toBe('spot-1');
    expect(r[0].label).toBe('BB defense vs UTG 3bet');
    expect(r[0].suggestedAction).toBe('add_insight');
  });

  it('spotId nao encontrado em starred_hands -> retorna item original sem campos novos', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [{ spotId: 'spot-orphan', label: 'X', suggestedAction: 'add_insight' }],
      'USER-0001',
    );
    expect(r[0].spotId).toBe('spot-orphan');
    // Implementer pode optar por nao adicionar campos (mantem original) OU
    // adicionar campos com defaults false. Aceita ambos.
    if (r[0].reentryCandidate !== undefined) {
      expect(r[0].reentryCandidate).toBe(false);
    }
  });
});

describe('enrichSpotsToReviewWithReentry — multiplos spots mistos', () => {
  it('processa array com mix de candidatos + nao-candidatos + ja-ativos', async () => {
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', decisionCorrect: false, confidenceLevel: null, insight: null },        // candidato
      { id: 'spot-2', decisionCorrect: null, confidenceLevel: 2, insight: null },             // candidato
      { id: 'spot-3', decisionCorrect: true, confidenceLevel: 5, insight: null },             // nao
      { id: 'spot-4', decisionCorrect: false, confidenceLevel: null, insight: null },         // candidato + ja ativo
    ]);
    getActiveReentryCardsBySpotIdsMock.mockResolvedValue([
      { spotId: 'spot-4', userId: 'USER-0001', archivedAt: null },
    ]);
    const mod = await loadEnricher();
    const r = await mod.enrichSpotsToReviewWithReentry(
      [
        { spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' },
        { spotId: 'spot-2', label: 'B', suggestedAction: 'add_insight' },
        { spotId: 'spot-3', label: 'C', suggestedAction: 'review_later' },
        { spotId: 'spot-4', label: 'D', suggestedAction: 'review_later' },
      ],
      'USER-0001',
    );
    expect(r[0].reentryCandidate).toBe(true);
    expect(r[1].reentryCandidate).toBe(true);
    expect(r[2].reentryCandidate).toBe(false);
    expect(r[3].reentryCandidate).toBe(true);
    expect(r[3].reentryAlreadyActive).toBe(true);
    expect(r[0].reentryAlreadyActive).toBe(false);
  });
});
