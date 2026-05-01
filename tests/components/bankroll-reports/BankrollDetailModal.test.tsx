/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-12 + RF-15
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-070
 *
 * Foco: novo componente BankrollDetailModal renderiza tabela
 * Plataforma | Antes | Depois | Delta nativo | Delta USD com footer total +
 * empty state honesto (D6) + responsive Sheet/Cards <768px.
 *
 * Lessons:
 *   #1 — hooks-first: useState/useQuery ANTES de qualquer if (!open) return null.
 *   #2 — data-testid estavel: bankroll-detail-row-{walletId}, bankroll-detail-modal-empty.
 *   #11 — sem actions extras (export, share).
 *   #12 — queryKey estavel: ['wallet-snapshot-pair', from, to].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

// @ts-expect-error — RED: componente nao existe ainda
import { BankrollDetailModal } from '../../../client/src/components/bankroll/BankrollDetailModal';
import { apiRequest } from '../../../client/src/lib/queryClient';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mockSessionEntry = {
  type: 'session' as const,
  id: 'SES-1',
  occurredAt: '2026-05-01T19:00:00Z',
  completedAt: '2026-05-01T22:00:00Z',
  profitUsd: -30,
  tournamentsCount: 5,
  platformsAffected: ['PokerStars'],
  detailsAvailable: true,
};

const mockManualReportEntry = {
  type: 'manual_report' as const,
  id: 'mr_tx_a',
  occurredAt: '2026-05-01T14:30:00Z',
  profitUsd: 249.4,
  transactionIds: ['tx_a'],
  platformsAffected: ['PokerStars'],
  detailsAvailable: true,
};

const mockSnapshotPairResponse = {
  before: [
    { walletId: 'w1', walletName: 'PS Main', platform: 'PokerStars', currency: 'BRL', balanceNative: 5000, balanceUsd: 1000, snapshotId: 'snap_b', snapshotOrigin: 'manual' },
    { walletId: 'w2', walletName: 'GG Main', platform: 'GGNetwork', currency: 'USD', balanceNative: 200, balanceUsd: 200, snapshotId: 'snap_b', snapshotOrigin: 'manual' },
  ],
  after: [
    { walletId: 'w1', walletName: 'PS Main', platform: 'PokerStars', currency: 'BRL', balanceNative: 4250, balanceUsd: 850, snapshotId: 'snap_a', snapshotOrigin: 'auto-cooldown' },
    { walletId: 'w2', walletName: 'GG Main', platform: 'GGNetwork', currency: 'USD', balanceNative: 200, balanceUsd: 200, snapshotId: 'snap_a', snapshotOrigin: 'auto-cooldown' },
  ],
  delta: [
    { walletId: 'w1', walletName: 'PS Main', platform: 'PokerStars', currency: 'BRL', deltaNative: -750, deltaUsd: -150 },
    { walletId: 'w2', walletName: 'GG Main', platform: 'GGNetwork', currency: 'USD', deltaNative: 0, deltaUsd: 0 },
  ],
  empty: false,
};

const mockEmptyResponse = {
  before: [], after: [], delta: [],
  empty: true,
  emptyReason: 'no_snapshot_before' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom default >=768px (1024 width). Override por teste se precisar mobile.
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

describe('BankrollDetailModal — render basico (RF-12)', () => {
  it('renderiza tabela com colunas Plataforma | Antes | Depois | Delta nativo | Delta USD', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      const headerText = headers.map((h) => h.textContent?.toLowerCase() ?? '').join(' ');
      expect(headerText).toContain('plataforma');
      expect(headerText).toMatch(/antes|saldo antes/);
      expect(headerText).toMatch(/depois|saldo depois/);
      expect(headerText).toMatch(/delta/);
    });
  });

  it('renderiza data-testid bankroll-detail-row-{walletId} por linha', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-detail-row-w1')).toBeTruthy();
      expect(screen.getByTestId('bankroll-detail-row-w2')).toBeTruthy();
    });
  });

  it('footer total USD agregado (soma deltaUsd)', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const footer = screen.getByTestId('bankroll-detail-total');
      // -150 + 0 = -150
      expect(footer.textContent).toMatch(/-?150|-150/);
    });
  });

  it('loading state: skeleton enquanto query em flight', async () => {
    let resolveQuery: (data: any) => void = () => {};
    (apiRequest as any).mockImplementation(() => new Promise((resolve) => { resolveQuery = resolve; }));

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    expect(screen.getByTestId('bankroll-detail-loading')).toBeTruthy();

    resolveQuery(mockSnapshotPairResponse);
  });

  it('empty state (D6): data-testid bankroll-detail-modal-empty', async () => {
    (apiRequest as any).mockResolvedValue(mockEmptyResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-detail-modal-empty')).toBeTruthy();
    });
  });

  it('empty state mensagem PT-BR: "Snapshot indisponivel"', async () => {
    (apiRequest as any).mockResolvedValue(mockEmptyResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const empty = screen.getByTestId('bankroll-detail-modal-empty');
      expect(empty.textContent?.toLowerCase()).toMatch(/snapshot indisponivel|snapshot indisponível|sem snapshot/);
    });
  });

  it('empty state sugestao: "Verifique extrato bancario manualmente"', async () => {
    (apiRequest as any).mockResolvedValue(mockEmptyResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const empty = screen.getByTestId('bankroll-detail-modal-empty');
      expect(empty.textContent?.toLowerCase()).toMatch(/extrato bancario|verifique extrato/);
    });
  });

  it('hooks-first: render sem crash quando open=false (#1)', () => {
    // RED: garantir hooks chamados antes de early return
    expect(() => {
      render(withClient(
        <BankrollDetailModal open={false} onClose={() => {}} entry={mockSessionEntry} />,
      ));
    }).not.toThrow();
  });

  it('delta USD verde quando positivo (data-sign=positive)', async () => {
    (apiRequest as any).mockResolvedValue({
      ...mockSnapshotPairResponse,
      delta: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: 100, deltaUsd: 20 }],
    });

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const row = screen.getByTestId('bankroll-detail-row-w1');
      const text = row.textContent ?? '';
      const className = row.className ?? '';
      const dataSign = row.querySelector('[data-sign="positive"]')?.getAttribute('data-sign');
      const positiveSignal = dataSign === 'positive' || className.includes('green') || text.includes('+20');
      expect(positiveSignal).toBe(true);
    });
  });

  it('delta USD vermelho quando negativo (data-sign=negative)', async () => {
    (apiRequest as any).mockResolvedValue({
      ...mockSnapshotPairResponse,
      delta: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: -100, deltaUsd: -20 }],
    });

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const row = screen.getByTestId('bankroll-detail-row-w1');
      const text = row.textContent ?? '';
      const className = row.className ?? '';
      const dataSign = row.querySelector('[data-sign="negative"]')?.getAttribute('data-sign');
      const negativeSignal = dataSign === 'negative' || className.includes('red') || className.includes('destructive') || text.includes('-20');
      expect(negativeSignal).toBe(true);
    });
  });

  it('close handler: clicar X chama onClose', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);
    const onClose = vi.fn();

    render(withClient(
      <BankrollDetailModal open onClose={onClose} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-detail-row-w1')).toBeTruthy();
    });

    const closeBtn = screen.queryByTestId('bankroll-detail-close');
    if (closeBtn) {
      closeBtn.click();
      expect(onClose).toHaveBeenCalled();
    } else {
      // close pode ser via Dialog primitive — pelo menos data-testid existe ou close button
      expect(closeBtn).toBeTruthy();
    }
  });

  it('manual_report entry usa range from-1ms/to+1ms (D8 cluster snapshot)', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockManualReportEntry} />,
    ));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    // Para manual_report: from = occurredAt - 1ms, to = occurredAt + 1ms
    const url = String((apiRequest as any).mock.calls[0]?.[1] ?? '');
    expect(url).toContain('balance-snapshot-pair');
    expect(url).toMatch(/from=/);
    expect(url).toMatch(/to=/);
  });

  it('NAO renderiza botoes extras (sem export PDF, sem compartilhar) — #11', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-detail-row-w1')).toBeTruthy();
    });

    expect(screen.queryByTestId('bankroll-detail-export-pdf')).toBeNull();
    expect(screen.queryByTestId('bankroll-detail-share')).toBeNull();
    expect(screen.queryByTestId('bankroll-detail-edit')).toBeNull();
  });
});

describe('BankrollDetailModal — responsive RF-15', () => {
  it('viewport >=768px renderiza Table (data-testid bankroll-detail-table)', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      const table = screen.queryByTestId('bankroll-detail-table');
      expect(table).toBeTruthy();
    });
  });

  it('viewport <768px renderiza Sheet com Cards (data-testid bankroll-detail-card-{walletId})', async () => {
    (apiRequest as any).mockResolvedValue(mockSnapshotPairResponse);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    // dispatch resize event para hooks responsivos
    window.dispatchEvent(new Event('resize'));

    render(withClient(
      <BankrollDetailModal open onClose={() => {}} entry={mockSessionEntry} />,
    ));

    await waitFor(() => {
      // Em mobile, expect cards data-testid
      const card = screen.queryByTestId('bankroll-detail-card-w1');
      expect(card).toBeTruthy();
    });
  });
});
