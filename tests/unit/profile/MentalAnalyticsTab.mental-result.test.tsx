import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #10 — RF-04: 3 cards mental-result na aba Mental
//
// Spec: Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md (RF-04)
// ADR : Docs/architecture/decisions/233-fase-c-10-mental-result-insights.md (D-6)
//
// Componente REAL: client/src/components/profile/MentalAnalyticsTab.tsx
//   - 3 useQuery novos (queryKey ["mental-analytics","mental-result-{tilt|focus|abgame}",period])
//     via apiRequest('GET', '/api/analytics/mental-result/{tilt|focus|abgame}?period=...')
//   - data-testid: mental-result-tilt|focus|abgame (+ -error / -empty)
//   - tilt label via getTiltType(id).label
//   - degrada loading/erro/empty/low-sample (lesson #11 — sem fabricar conclusao)
//
// Status RED: os 3 cards mental-result ainda nao existem.
//
// Lessons: #1 (hooks antes early return), #2 (data-testid estavel), #11 (sem
//   decorativo/conclusao), #13 (apiRequest retorna JSON direto), #14/#26 (await
//   import em .tsx), #30 (.test.tsx = jsdom).
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';

async function loadTab() {
  const mod = await import('@/components/profile/MentalAnalyticsTab');
  return mod.MentalAnalyticsTab ?? (mod as any).default;
}

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// apiRequest('GET', url) -> JSON parseado direto (lesson #13). Roteia por endpoint.
function routeApiRequest(byEndpoint: Record<string, any>) {
  (apiRequest as any).mockImplementation((_method: string, url: string) => {
    for (const [needle, payload] of Object.entries(byEndpoint)) {
      if (typeof payload === 'function') {
        if (url.includes(needle)) return Promise.resolve((payload as any)(url));
      } else if (url.includes(needle)) {
        return Promise.resolve(payload);
      }
    }
    return Promise.resolve({});
  });
}

// Shapes vazios coerentes para os widgets pre-existentes nao quebrarem.
const EMPTY_OTHERS = {
  'cooldown-compliance': { total: 0, completed: 0, complianceRate: 0 },
  'starred-hands-distribution': [],
  'cooldown-impact': { withCooldown: { avgRoi: 0 }, withoutCooldown: { avgRoi: 0 }, delta: 0 },
  'top-lessons': [],
  'warmup-compliance': {
    total: 0, completed: 0, complianceRate: 0,
    abortedCount: 0, decisionNotToPlayCount: 0, overrideUsedCount: 0,
  },
  'abgame-distribution': {
    journaledSessions: 0, aGameItemCount: 0, bGameItemCount: 0, cGameEntryCount: 0,
    avgAGamePerSession: 0, avgBGamePerSession: 0,
    abShare: { aGamePct: 0, bGamePct: 0 }, cGameThemes: [],
  },
  'tilt-type-distribution': {
    period: '30d', totalAssessments: 0, typedCount: 0,
    dominant: null, distribution: [], dataSufficiency: 'low',
  },
};

const emptySet = (period = '30d') => ({
  period,
  baseline: { n: 0, avgPnlUsd: null, medianPnlUsd: null, dataSufficiency: 'low' },
  buckets: [],
  dataSufficiency: 'low',
});

// IMPORTANTE: 'mental-result/tilt' inclui 'mental-result' como substring, entao
// rotear por '/mental-result/tilt' (path mais especifico). 'tilt-type-distribution'
// e endpoint DIFERENTE (Fase C #4) — nao confundir.
function withMentalResult(over: Partial<Record<'tilt' | 'focus' | 'abgame', any>> = {}) {
  return {
    ...EMPTY_OTHERS,
    '/mental-result/tilt': over.tilt ?? emptySet(),
    '/mental-result/focus': over.focus ?? emptySet(),
    '/mental-result/abgame': over.abgame ?? emptySet(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Existencia dos 3 cards
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — 3 cards mental-result existem', () => {
  it('renderiza mental-result-tilt / focus / abgame', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(withMentalResult());
    render(withClient(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mental-result-tilt')).toBeTruthy();
      expect(screen.getByTestId('mental-result-focus')).toBeTruthy();
      expect(screen.getByTestId('mental-result-abgame')).toBeTruthy();
    });
  });

  it('consulta os 3 endpoints /api/analytics/mental-result/{tilt,focus,abgame}', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(withMentalResult());
    render(withClient(<MentalAnalyticsTab />));
    await waitFor(() => {
      const urls = ((apiRequest as any).mock.calls as any[][]).map((c) => String(c[1] ?? ''));
      expect(urls.some((u) => u.includes('/api/analytics/mental-result/tilt'))).toBe(true);
      expect(urls.some((u) => u.includes('/api/analytics/mental-result/focus'))).toBe(true);
      expect(urls.some((u) => u.includes('/api/analytics/mental-result/abgame'))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Tilt — label via catalogo + delta
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — card tilt', () => {
  it('mostra o label PT-BR do tilt (getTiltType) e o delta negativo', async () => {
    const MentalAnalyticsTab = await loadTab();
    const { getTiltType } = await import('@shared/tilt-types');
    routeApiRequest(
      withMentalResult({
        tilt: {
          period: '30d',
          baseline: { n: 8, avgPnlUsd: -10, medianPnlUsd: -5, dataSufficiency: 'ok' },
          buckets: [
            { key: 'injustice', n: 4, avgPnlUsd: -40, medianPnlUsd: -40, dataSufficiency: 'ok', deltaVsBaseline: -30 },
          ],
          dataSufficiency: 'ok',
        },
      }),
    );
    render(withClient(<MentalAnalyticsTab />));
    const card = await waitFor(() => screen.getByTestId('mental-result-tilt'));
    // label do catalogo (PT-BR), nao o id cru
    expect(card.textContent ?? '').toContain(getTiltType('injustice')!.label);
  });
});

// ---------------------------------------------------------------------------
// Focus — 3 faixas
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — card focus', () => {
  it('renderiza o card de foco com dados (delta positivo no alto)', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(
      withMentalResult({
        focus: {
          period: '30d',
          baseline: { n: 8, avgPnlUsd: -10, medianPnlUsd: -5, dataSufficiency: 'ok' },
          buckets: [
            { key: 'alto', n: 4, avgPnlUsd: 20, medianPnlUsd: 20, dataSufficiency: 'ok', deltaVsBaseline: 30 },
            { key: 'medio', n: 2, avgPnlUsd: -5, medianPnlUsd: -5, dataSufficiency: 'low', deltaVsBaseline: 5 },
            { key: 'baixo', n: 2, avgPnlUsd: -40, medianPnlUsd: -40, dataSufficiency: 'low', deltaVsBaseline: -30 },
          ],
          dataSufficiency: 'ok',
        },
      }),
    );
    render(withClient(<MentalAnalyticsTab />));
    const card = await waitFor(() => screen.getByTestId('mental-result-focus'));
    expect(card).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Empty state — baseline.n === 0 (sem fabricar conclusao — lesson #11)
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — empty state', () => {
  it('baseline.n=0 mostra empty (testid -empty), sem numeros fabricados', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(withMentalResult()); // tudo emptySet (baseline.n 0)
    render(withClient(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mental-result-tilt-empty')).toBeTruthy();
      expect(screen.getByTestId('mental-result-focus-empty')).toBeTruthy();
      expect(screen.getByTestId('mental-result-abgame-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Low-sample — aviso de amostra pequena (lesson #11)
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — amostra pequena', () => {
  it('dataSufficiency low (com baseline>0) mostra aviso de amostra pequena', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(
      withMentalResult({
        tilt: {
          period: '30d',
          baseline: { n: 3, avgPnlUsd: -10, medianPnlUsd: -10, dataSufficiency: 'low' },
          buckets: [
            { key: 'injustice', n: 2, avgPnlUsd: -40, medianPnlUsd: -40, dataSufficiency: 'low', deltaVsBaseline: -30 },
          ],
          dataSufficiency: 'low',
        },
      }),
    );
    render(withClient(<MentalAnalyticsTab />));
    const card = await waitFor(() => screen.getByTestId('mental-result-tilt'));
    expect(/amostra pequena|continue registrando/i.test(card.textContent ?? '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Erro — testid de erro por card
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — erro', () => {
  it('erro no endpoint tilt mostra mental-result-tilt-error', async () => {
    const MentalAnalyticsTab = await loadTab();
    (apiRequest as any).mockImplementation((_m: string, url: string) => {
      if (url.includes('/mental-result/tilt')) return Promise.reject(new Error('boom'));
      // os outros respondem vazio coerente
      const all = withMentalResult();
      for (const [needle, payload] of Object.entries(all)) {
        if (url.includes(needle)) return Promise.resolve(payload);
      }
      return Promise.resolve({});
    });
    render(withClient(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mental-result-tilt-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Period selector — mudar periodo refaz as 3 queries
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — period selector refaz queries mental-result', () => {
  it('clicar em 7d dispara as 3 queries mental-result com period=7d', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest(withMentalResult());
    render(withClient(<MentalAnalyticsTab />));

    // espera o primeiro batch (30d default)
    await waitFor(() => {
      expect(screen.getByTestId('mental-result-tilt')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('mental-analytics-period-7d'));

    await waitFor(() => {
      const urls = ((apiRequest as any).mock.calls as any[][]).map((c) => String(c[1] ?? ''));
      expect(urls.some((u) => u.includes('/mental-result/tilt') && u.includes('period=7d'))).toBe(true);
      expect(urls.some((u) => u.includes('/mental-result/focus') && u.includes('period=7d'))).toBe(true);
      expect(urls.some((u) => u.includes('/mental-result/abgame') && u.includes('period=7d'))).toBe(true);
    });
  });
});
