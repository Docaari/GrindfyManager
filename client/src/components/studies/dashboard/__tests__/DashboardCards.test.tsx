/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-02: Dashboard subcards
 *  - ContinueWhereLeftOff
 *  - WeekInsights
 *  - PendingSpotsPreview
 *  - RecommendationsPreview
 *  - StreakBadge (no dashboard)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/dashboard', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({})),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

// @ts-expect-error - red phase
import { ContinueWhereLeftOff } from '../ContinueWhereLeftOff';
// @ts-expect-error - red phase
import { WeekInsights } from '../WeekInsights';
// @ts-expect-error - red phase
import { PendingSpotsPreview } from '../PendingSpotsPreview';
// @ts-expect-error - red phase
import { RecommendationsPreview } from '../RecommendationsPreview';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
});

describe('ContinueWhereLeftOff', () => {
  it('renders ate 3 cards de temas ordenados por lastVisitedAt desc', () => {
    const themes = [
      { id: 't1', name: 'A', lastVisitedAt: '2026-04-30T10:00:00Z', progress: 50, lastTab: { id: 'tb1', name: 'Flop' }, color: '#fff', emoji: '' },
      { id: 't2', name: 'B', lastVisitedAt: '2026-04-29T10:00:00Z', progress: 20, lastTab: { id: 'tb2', name: 'Turn' }, color: '#fff', emoji: '' },
      { id: 't3', name: 'C', lastVisitedAt: '2026-04-28T10:00:00Z', progress: 80, lastTab: null, color: '#fff', emoji: '' },
      { id: 't4', name: 'D', lastVisitedAt: '2026-04-27T10:00:00Z', progress: 10, lastTab: null, color: '#fff', emoji: '' },
    ];
    render(withClient(<ContinueWhereLeftOff themes={themes as any} />));
    const items = screen.getAllByTestId(/^studies-dashboard-card-continue-item-/);
    expect(items.length).toBe(3);
    expect(items[0].textContent).toMatch(/A/);
  });

  it('empty state quando themes=[]', () => {
    render(withClient(<ContinueWhereLeftOff themes={[]} />));
    expect(screen.getByTestId('continue-empty')).toBeInTheDocument();
  });

  it('click em card chama navigate com query tab', async () => {
    const themes = [{ id: 't1', name: 'A', lastVisitedAt: '2026-04-30', progress: 50, lastTab: { id: 'tb1', name: 'Flop' }, color: '#fff', emoji: '' }];
    render(withClient(<ContinueWhereLeftOff themes={themes as any} />));
    await userEvent.click(screen.getByTestId('studies-dashboard-card-continue-item-t1'));
    expect(navigateMock).toHaveBeenCalled();
    const path = String(navigateMock.mock.calls[0][0]);
    expect(path).toMatch(/^\/estudos\/temas\/t1/);
    expect(path).toMatch(/tab=tb1/);
  });
});

describe('WeekInsights', () => {
  it('renderiza 3 KPIs', () => {
    render(withClient(<WeekInsights insights={{ themesOpenedThisWeek: 2, spotsReviewedThisWeek: 5, hoursStudiedThisWeek: 1.5 }} />));
    expect(screen.getByTestId('insight-themesOpened').textContent).toMatch(/2/);
    expect(screen.getByTestId('insight-spotsReviewed').textContent).toMatch(/5/);
    expect(screen.getByTestId('insight-hoursStudied').textContent).toMatch(/1[.,]5/);
  });

  it('KPI clicavel navega', async () => {
    render(withClient(<WeekInsights insights={{ themesOpenedThisWeek: 2, spotsReviewedThisWeek: 5, hoursStudiedThisWeek: 1.5 }} />));
    await userEvent.click(screen.getByTestId('insight-spotsReviewed'));
    expect(navigateMock).toHaveBeenCalled();
  });
});

describe('PendingSpotsPreview', () => {
  it('lista ate 3 spots', () => {
    const spots = [
      { id: 's1', conclusion: 'fold', type: 'tilt', spot: 'ip_vs_bb', createdAt: '2026-04-30', imageUrl: null, reviewLater: true },
      { id: 's2', conclusion: 'call', type: 'leak', spot: 'bb_vs_ip', createdAt: '2026-04-29', imageUrl: null, reviewLater: true },
      { id: 's3', conclusion: 'raise', type: 'bluff', spot: '3bet_pot_ip', createdAt: '2026-04-28', imageUrl: null, reviewLater: true },
      { id: 's4', conclusion: 'extra', type: 'cbet', spot: 'sb_vs_bb_bw', createdAt: '2026-04-27', imageUrl: null, reviewLater: true },
    ];
    render(withClient(<PendingSpotsPreview spots={spots as any} />));
    const items = screen.getAllByTestId(/^dashboard-spot-/);
    expect(items.length).toBe(3);
  });

  it('empty state', () => {
    render(withClient(<PendingSpotsPreview spots={[]} />));
    expect(screen.getByTestId('pending-spots-preview-empty')).toBeInTheDocument();
  });
});

describe('RecommendationsPreview', () => {
  it('lista top 5 com prioridade', () => {
    const items = Array.from({ length: 8 }).map((_, i) => ({
      id: `r${i}`, type: i % 2 ? 'leak' : 'stale_spot', title: `Item ${i}`,
      description: '', priority_score: 10 - i, cta_action: 'open_theme', cta_url: '/x', metadata: {},
    }));
    render(withClient(<RecommendationsPreview items={items as any} />));
    const cards = screen.getAllByTestId(/^dashboard-rec-/);
    expect(cards.length).toBeLessThanOrEqual(5);
  });

  it('empty state', () => {
    render(withClient(<RecommendationsPreview items={[]} />));
    expect(screen.getByTestId('recommendations-preview-empty')).toBeInTheDocument();
  });
});
