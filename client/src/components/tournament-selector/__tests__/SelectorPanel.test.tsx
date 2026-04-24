import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectorPanel } from '../SelectorPanel';

vi.mock('../../../lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../../../lib/queryClient';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SelectorPanel - estados', () => {
  it('vazio: mostra mensagem "Nenhum torneio disponivel"', async () => {
    (apiRequest as any).mockResolvedValue({
      date: '2026-04-23',
      playerProfile: { totalTournaments: 200, lookbackDays: 90, coldStart: false },
      tournaments: [],
      totalAvailable: 0,
      totalReturned: 0,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      bankrollConfigured: false,
      warnings: [],
    });
    render(withClient(<SelectorPanel initialDate="2026-04-23" />));
    await waitFor(() => {
      expect(screen.getByTestId('selector-panel-empty')).toBeTruthy();
    });
  });

  it('cold start "pure": banner laranja', async () => {
    (apiRequest as any).mockResolvedValue({
      date: '2026-04-23',
      playerProfile: { totalTournaments: 5, lookbackDays: 90, coldStart: 'pure' },
      tournaments: [],
      totalAvailable: 0,
      totalReturned: 0,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      bankrollConfigured: false,
      warnings: [],
    });
    render(withClient(<SelectorPanel initialDate="2026-04-23" />));
    await waitFor(() => {
      expect(screen.getByTestId('selector-cold-start-pure')).toBeTruthy();
    });
  });

  it('cold start "partial": banner amarelo', async () => {
    (apiRequest as any).mockResolvedValue({
      date: '2026-04-23',
      playerProfile: { totalTournaments: 30, lookbackDays: 90, coldStart: 'partial' },
      tournaments: [],
      totalAvailable: 0,
      totalReturned: 0,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      bankrollConfigured: false,
      warnings: [],
    });
    render(withClient(<SelectorPanel initialDate="2026-04-23" />));
    await waitFor(() => {
      expect(screen.getByTestId('selector-cold-start-partial')).toBeTruthy();
    });
  });

  it('Suprema offline: banner suprema_unavailable', async () => {
    (apiRequest as any).mockResolvedValue({
      date: '2026-04-23',
      playerProfile: { totalTournaments: 200, lookbackDays: 90, coldStart: false },
      tournaments: [],
      totalAvailable: 0,
      totalReturned: 0,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      bankrollConfigured: false,
      warnings: ['suprema_unavailable'],
    });
    render(withClient(<SelectorPanel initialDate="2026-04-23" />));
    await waitFor(() => {
      expect(screen.getByTestId('selector-suprema-unavailable')).toBeTruthy();
    });
  });

  it('renderiza lista quando ha torneios', async () => {
    (apiRequest as any).mockResolvedValue({
      date: '2026-04-23',
      playerProfile: { totalTournaments: 200, lookbackDays: 90, coldStart: false },
      tournaments: [
        {
          id: 't1',
          source: 'suprema',
          name: 'Test Tournament',
          site: 'Suprema',
          buyIn: 22,
          time: '22:00',
          dayOfWeek: 4,
          category: 'PKO',
          speed: 'Turbo',
          fieldSizeEstimate: 280,
          score: 75,
          grade: 'A',
          confidence: 'high',
          rationale: 'Bom torneio',
          signals: {
            siteRoi: { value: 14, sample: 120, weight: 0.20, score: 78 },
            buyInRoi: { value: 16.8, sample: 134, weight: 0.20, score: 80 },
            categoryRoi: { value: 18, sample: 87, weight: 0.20, score: 84 },
            speedRoi: { value: 9, sample: 90, weight: 0.10, score: 65 },
            dayOfWeekRoi: { value: 22, sample: 78, weight: 0.10, score: 88 },
            timeOfDayRoi: { value: 21, sample: 102, weight: 0.15, score: 86 },
            fieldRoi: { value: 11, sample: 188, weight: 0.05, score: 70 },
          },
          warnings: [],
          bankrollOk: true,
          alreadyInGrid: false,
        },
      ],
      totalAvailable: 1,
      totalReturned: 1,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      bankrollConfigured: false,
      warnings: [],
    });
    render(withClient(<SelectorPanel initialDate="2026-04-23" />));
    await waitFor(() => {
      expect(screen.getByTestId('selector-panel-list')).toBeTruthy();
    });
  });
});
