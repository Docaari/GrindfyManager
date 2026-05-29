/**
 * Sprint Estudos-Fixes — FASE 1 (GAP-2): SessionsView.
 *
 * Lessons: #1 hooks first, #2 data-testid estaveis, #13 apiRequest JSON direto.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
const locationStateMock = vi.hoisted(() => ({ path: '/estudos/sessoes' }));

vi.mock('wouter', () => ({
  useLocation: () => [locationStateMock.path, navigateMock],
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
}));

import { SessionsView } from '../SessionsView';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const sessionsFixture = [
  { id: 'ses_fin', themeId: 'thm_1', status: 'finished', date: '2026-05-20T10:00:00Z', duration: 45 },
  { id: 'ses_act', themeId: 'thm_1', status: 'active', date: '2026-05-29T18:00:00Z', duration: 0 },
  { id: 'ses_free', themeId: null, status: 'finished', date: '2026-05-18T09:00:00Z', duration: 20 },
];

const themesFixture = [{ id: 'thm_1', name: 'IP vs BB', emoji: '' }];

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  locationStateMock.path = '/estudos/sessoes';
  apiRequestMock.mockImplementation(async (_method: string, url: string) => {
    if (String(url).includes('/api/study-sessions')) return sessionsFixture;
    if (String(url).includes('/api/study-themes')) return themesFixture;
    return null;
  });
});

describe('GAP-2 SessionsView', () => {
  it('renderiza lista com todas as sessoes', async () => {
    render(withClient(<SessionsView />));
    await waitFor(() => {
      expect(screen.getByTestId('sessions-list')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_fin')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_act')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_free')).toBeInTheDocument();
    });
  });

  it('sessao ativa aparece antes das finalizadas (ordenacao)', async () => {
    render(withClient(<SessionsView />));
    await screen.findByTestId('sessions-list');
    const rows = screen.getAllByTestId(/^session-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('session-row-ses_act');
  });

  it('mostra nome do tema quando vinculado e "Sessão livre" quando null', async () => {
    render(withClient(<SessionsView />));
    const free = await screen.findByTestId('session-row-ses_free');
    expect(free.textContent).toMatch(/sessão livre/i);
    const fin = screen.getByTestId('session-row-ses_fin');
    expect(fin.textContent).toMatch(/IP vs BB/);
  });

  it('click em sessao navega para o detalhe', async () => {
    render(withClient(<SessionsView />));
    const row = await screen.findByTestId('session-row-ses_fin');
    await userEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith('/estudos/sessao/ses_fin');
  });

  it('empty state quando nao ha sessoes', async () => {
    apiRequestMock.mockImplementation(async (_m: string, url: string) =>
      String(url).includes('/api/study-themes') ? themesFixture : [],
    );
    render(withClient(<SessionsView />));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});
