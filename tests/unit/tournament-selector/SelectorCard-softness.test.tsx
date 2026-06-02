/**
 * Test-Writer (Modo TDD — Red Phase) — Fase F #12 — softness na UI
 *
 * Spec: Docs/specs/sprint-fase-f-game-selection-2026-06-02.md (RF-04 + RF-05)
 * ADR:  Docs/architecture/decisions/237-fase-f-game-selection-softness.md (D-5)
 *
 * Componentes REAIS sob teste (existem; testids de softness NAO existem ainda -> red):
 *   client/src/components/tournament-selector/SelectorCard.tsx (RF-04)
 *   client/src/components/tournament-selector/SelectorDetailsModal.tsx (RF-05)
 *
 * data-testid estaveis (lesson #2):
 *   softness-badge / softness-breakdown / softness-estimated-note
 *
 * Decisao D-4 (ADR §D-5 + RF-04): badge OCULTO quando tier='duro' (reduz ruido);
 * modal sempre lista os 6 indicadores (batidos + nao-batidos).
 *
 * Lessons aplicadas:
 *   - #2  data-testid estavel (nao heuristica DOM).
 *   - #3  shape REAL de SelectorTournament (espelha makeTournament irmao) + softness.
 *   - #11 indicadores weak exibem "estimado por nome" (nao afirma certeza).
 *
 * .test.tsx => projeto client (jsdom). Import direto (componentes existem; o que
 * falta e o branch de softness dentro deles -> testid query falha -> red).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));
vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { SelectorCard } from '../../../client/src/components/tournament-selector/SelectorCard';
import { SelectorDetailsModal } from '../../../client/src/components/tournament-selector/SelectorDetailsModal';
import type { SelectorTournament } from '../../../shared/scoring';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// shape REAL de SelectorTournament (espelha tests/unit/.../SelectorCard.test.tsx)
function makeTournament(overrides: Partial<SelectorTournament> = {}): SelectorTournament {
  return {
    id: 'lib-1',
    source: 'library',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: 22,
    buyInUSD: 22,
    category: 'Vanilla',
    speed: 'Normal',
    dayOfWeek: 0,
    time: '20:00',
    fieldSizeEstimate: 5000,
    score: 75,
    grade: 'A',
    confidence: 'high',
    rationale: 'Forte ROI em PokerStars + Vanilla',
    signals: {
      siteRoi: { value: 25, sample: 200, score: 75, weight: 0.2 },
      buyInRoi: { value: 20, sample: 150, score: 70, weight: 0.18 },
      categoryRoi: { value: 22, sample: 180, score: 73, weight: 0.18 },
      speedRoi: { value: 15, sample: 100, score: 65, weight: 0.14 },
      dayOfWeekRoi: { value: 18, sample: 50, score: 68, weight: 0.1 },
      timeOfDayRoi: { value: 20, sample: 60, score: 70, weight: 0.1 },
      fieldRoi: { value: 17, sample: 80, score: 67, weight: 0.1 },
    },
    warnings: [],
    bankrollOk: true,
    alreadyInGrid: false,
    ...overrides,
  } as any;
}

// blocos softness de exemplo (shape REAL do SoftnessResult, ADR §D-4)
const SOFTNESS_MOLE_STRONG = {
  score: 70,
  tier: 'mole',
  matchedCount: 3,
  overallConfidence: 'strong',
  indicators: [
    { key: 'overlay', label: 'Garantido alto vs buy-in', confidence: 'strong', weight: 30, evidence: 'gtd/buy-in = 200x' },
    { key: 'primetime', label: 'Horario nobre', confidence: 'strong', weight: 25 },
    { key: 'sportsbook', label: 'Rede com sportsbook', confidence: 'weak', weight: 15, evidence: 'site GGNetwork' },
  ],
};

const SOFTNESS_MEDIO_WEAK = {
  score: 30,
  tier: 'medio',
  matchedCount: 2,
  overallConfidence: 'weak',
  indicators: [
    { key: 'satellite', label: 'Satelite', confidence: 'weak', weight: 15 },
    { key: 'multiday', label: 'Multi-day', confidence: 'weak', weight: 10 },
  ],
};

const SOFTNESS_DURO = {
  score: 0,
  tier: 'duro',
  matchedCount: 0,
  overallConfidence: 'weak',
  indicators: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// RF-04 — SelectorCard: badge + breakdown + nota de honestidade
// =============================================================================
describe('SelectorCard — softness badge (RF-04)', () => {
  it('renderiza softness-badge com label "Field mole" para tier mole', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: SOFTNESS_MOLE_STRONG } as any)} />));
    const badge = screen.getByTestId('softness-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('mole');
  });

  it('renderiza softness-badge com label "Field medio" para tier medio', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: SOFTNESS_MEDIO_WEAK } as any)} />));
    const badge = screen.getByTestId('softness-badge');
    expect(badge.textContent?.toLowerCase()).toContain('médio');
  });

  it('tier duro -> badge OCULTO (D-4, reduz ruido)', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: SOFTNESS_DURO } as any)} />));
    expect(screen.queryByTestId('softness-badge')).toBeNull();
  });

  it('softness=null -> nenhum elemento softness-* no DOM', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: null } as any)} />));
    expect(screen.queryByTestId('softness-badge')).toBeNull();
    expect(screen.queryByTestId('softness-breakdown')).toBeNull();
    expect(screen.queryByTestId('softness-estimated-note')).toBeNull();
  });

  it('softness ausente (undefined) -> nenhum elemento softness-* no DOM', async () => {
    render(withClient(<SelectorCard tournament={makeTournament()} />));
    expect(screen.queryByTestId('softness-badge')).toBeNull();
  });
});

describe('SelectorCard — softness breakdown (RF-04)', () => {
  it('breakdown lista SO os indicadores que bateram', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: SOFTNESS_MOLE_STRONG } as any)} />));
    const bd = screen.getByTestId('softness-breakdown');
    expect(bd.textContent).toContain('Garantido alto vs buy-in');
    expect(bd.textContent).toContain('Horario nobre');
    // indicadores que NAO bateram nao aparecem (ex: satelite/regional)
    expect(bd.textContent).not.toContain('Satelite');
    expect(bd.textContent).not.toContain('regional');
  });

  it('overallConfidence weak -> nota "estimado por nome" visivel (lesson #11)', async () => {
    render(withClient(<SelectorCard tournament={makeTournament({ softness: SOFTNESS_MEDIO_WEAK } as any)} />));
    const note = screen.getByTestId('softness-estimated-note');
    expect(note).toBeTruthy();
    expect(note.textContent?.toLowerCase()).toContain('estimado por nome');
  });
});

// =============================================================================
// RF-05 — SelectorDetailsModal: secao softness com os 6 indicadores + legenda
// =============================================================================
describe('SelectorDetailsModal — secao softness (RF-05)', () => {
  it('lista os 6 indicadores (batidos + nao-batidos)', async () => {
    render(
      withClient(
        <SelectorDetailsModal
          tournament={makeTournament({ softness: SOFTNESS_MOLE_STRONG } as any)}
          open={true}
          onOpenChange={() => {}}
        />,
      ),
    );
    const section = screen.getByTestId('softness-modal-section');
    expect(section).toBeTruthy();
    // presenca INDIVIDUAL dos 6 indicadores (lesson #8) via testid por key
    for (const key of ['satellite', 'overlay', 'sportsbook', 'multiday', 'primetime', 'regional']) {
      expect(screen.getByTestId(`softness-modal-indicator-${key}`)).toBeTruthy();
    }
  });

  it('legenda fixa de honestidade presente (* estimados pelo nome)', async () => {
    render(
      withClient(
        <SelectorDetailsModal
          tournament={makeTournament({ softness: SOFTNESS_MOLE_STRONG } as any)}
          open={true}
          onOpenChange={() => {}}
        />,
      ),
    );
    const legend = screen.getByTestId('softness-modal-legend');
    expect(legend.textContent?.toLowerCase()).toContain('estimad');
  });

  it('softness=null -> secao mostra "Nao calculado" (ou oculta), sem quebrar o modal', async () => {
    render(
      withClient(
        <SelectorDetailsModal
          tournament={makeTournament({ softness: null } as any)}
          open={true}
          onOpenChange={() => {}}
        />,
      ),
    );
    // o modal continua renderizando (nao quebra). A secao de softness OU some OU
    // exibe "Nao calculado". Validamos que NAO ha lista de indicadores batidos.
    expect(screen.queryByTestId('softness-modal-indicator-overlay')).toBeNull();
  });
});
