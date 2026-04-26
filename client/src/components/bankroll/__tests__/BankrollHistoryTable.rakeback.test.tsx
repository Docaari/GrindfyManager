import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Bankroll-3 — BankrollHistoryTable mostra rakeback distinto (RF-06).
//
// Spec: Docs/specs/rakeback-reporting.md (RF-06).
//
// Asserts:
// - row com reason='rakeback' tem data-reason="rakeback"
// - badge data-testid="reason-badge-rakeback"
// - texto exibido pelo helper reasonLabel('rakeback') = 'Rakeback'
// - outros reasons continuam sendo exibidos via reasonLabel
// =============================================================================

import { BankrollHistoryTable } from '../BankrollHistoryTable';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSnapshot = {
  occurredAt: '2026-04-26T18:30:00Z',
  delta: 50,
  previousAmount: 1000,
  newAmount: 1050,
  note: null,
  source: 'manual',
};

// =============================================================================
// 1. Linha com reason='rakeback' tem data-reason e badge
// =============================================================================

describe('<BankrollHistoryTable> — exibicao de rakeback (RF-06)', () => {
  it('snapshot rakeback: <tr> com data-reason="rakeback"', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        {
          id: 'snap_rb',
          ...baseSnapshot,
          reason: 'rakeback',
          note: 'Rakeback semanal',
        },
      ],
    });

    const { container } = render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const row = container.querySelector('tr[data-reason="rakeback"]');
      expect(row).toBeTruthy();
    });
  });

  it('snapshot rakeback: badge data-testid="reason-badge-rakeback" presente', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: 'snap_rb', ...baseSnapshot, reason: 'rakeback' }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const badge = screen.getByTestId('reason-badge-rakeback');
      expect(badge).toBeTruthy();
    });
  });

  it('badge contem texto PT-BR "Rakeback" via reasonLabel', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: 'snap_rb', ...baseSnapshot, reason: 'rakeback' }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const badge = screen.getByTestId('reason-badge-rakeback');
      expect(badge.textContent).toBe('Rakeback');
    });
  });
});

// =============================================================================
// 2. Outros reasons continuam funcionais (RF-08)
// =============================================================================

describe('<BankrollHistoryTable> — outros reasons sem regressao (RF-08)', () => {
  it('renderiza linhas com data-reason para deposit/withdrawal/session_result/manual_adjustment', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        { id: 's1', ...baseSnapshot, reason: 'deposit' },
        { id: 's2', ...baseSnapshot, reason: 'withdrawal', delta: -50 },
        { id: 's3', ...baseSnapshot, reason: 'session_result' },
        { id: 's4', ...baseSnapshot, reason: 'manual_adjustment' },
      ],
    });

    const { container } = render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      expect(container.querySelector('tr[data-reason="deposit"]')).toBeTruthy();
      expect(container.querySelector('tr[data-reason="withdrawal"]')).toBeTruthy();
      expect(container.querySelector('tr[data-reason="session_result"]')).toBeTruthy();
      expect(container.querySelector('tr[data-reason="manual_adjustment"]')).toBeTruthy();
    });
  });

  it('outros reasons NAO devem ter o badge especifico de rakeback', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: 's1', ...baseSnapshot, reason: 'deposit' }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      expect(screen.queryByTestId('reason-badge-rakeback')).toBeFalsy();
    });
  });

  it('renderiza linha rakeback junto com outras linhas (mesma timeline)', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        { id: 's1', ...baseSnapshot, reason: 'deposit' },
        { id: 's2', ...baseSnapshot, reason: 'rakeback' },
        { id: 's3', ...baseSnapshot, reason: 'session_result' },
      ],
    });

    const { container } = render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const allRows = container.querySelectorAll('tr[data-reason]');
      expect(allRows.length).toBe(3);
      expect(container.querySelector('tr[data-reason="rakeback"]')).toBeTruthy();
    });
  });
});
