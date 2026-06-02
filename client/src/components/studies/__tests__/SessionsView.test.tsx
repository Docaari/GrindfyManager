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

// Shape v2 (study_sessions_v2): mode + registeredAt + durationMinutes.
const sessionsFixture = {
  items: [
    { id: 'ses_old', mode: 'lesson', themeId: 'thm_1', durationMinutes: 45, registeredAt: '2026-05-20T10:00:00Z' },
    { id: 'ses_new', mode: 'stat_analysis', themeId: 'thm_1', durationMinutes: 30, registeredAt: '2026-05-29T18:00:00Z', statId: 'vpip' },
    { id: 'ses_free', mode: 'drill_gto', themeId: null, durationMinutes: 20, registeredAt: '2026-05-18T09:00:00Z' },
  ],
};

const themesFixture = [{ id: 'thm_1', name: 'IP vs BB', emoji: '' }];

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  locationStateMock.path = '/estudos/sessoes';
  apiRequestMock.mockImplementation(async (_method: string, url: string) => {
    if (String(url).includes('/api/study-sessions/registered/list')) return sessionsFixture;
    if (String(url).includes('/api/study-themes')) return themesFixture;
    return null;
  });
});

describe('SessionsView — sessoes registradas (v2)', () => {
  it('renderiza lista com todas as sessoes', async () => {
    render(withClient(<SessionsView />));
    await waitFor(() => {
      expect(screen.getByTestId('sessions-list')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_old')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_new')).toBeInTheDocument();
      expect(screen.getByTestId('session-row-ses_free')).toBeInTheDocument();
    });
  });

  it('mais recente aparece primeiro (registeredAt desc)', async () => {
    render(withClient(<SessionsView />));
    await screen.findByTestId('sessions-list');
    const rows = screen.getAllByTestId(/^session-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('session-row-ses_new');
  });

  it('mostra nome do tema quando vinculado e "Sessao livre" quando null', async () => {
    render(withClient(<SessionsView />));
    const free = await screen.findByTestId('session-row-ses_free');
    expect(free.textContent).toMatch(/sessao livre/i);
    const old = screen.getByTestId('session-row-ses_old');
    expect(old.textContent).toMatch(/IP vs BB/);
  });

  it('mostra badge do modo do estudo', async () => {
    render(withClient(<SessionsView />));
    const statRow = await screen.findByTestId('session-row-ses_new');
    expect(statRow.textContent).toMatch(/Analise de stat/i);
  });

  it('click em sessao navega para o detalhe v2', async () => {
    render(withClient(<SessionsView />));
    const row = await screen.findByTestId('session-row-ses_old');
    await userEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith('/estudos/analise/ses_old');
  });

  it('empty state quando nao ha sessoes', async () => {
    apiRequestMock.mockImplementation(async (_m: string, url: string) =>
      String(url).includes('/api/study-themes') ? themesFixture : { items: [] },
    );
    render(withClient(<SessionsView />));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});
