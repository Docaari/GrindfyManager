/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-14
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * D10 — defaults "Tudo" + persiste em localStorage['grind-history-filter']
 *
 * Foco: 3 chips de filtro client-side, default "Tudo", persistencia
 * localStorage com fallback graceful (#12).
 *
 * Lessons:
 *   #2 — data-testid: grind-history-filter-toggle, grind-history-filter-{all|sessions|reports}.
 *   #12 — localStorage SSR-safe via useEffect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// @ts-expect-error — RED: componente nao existe
import { SessionHistoryUnified } from '../../../client/src/components/grind-session/SessionHistoryUnified';

const mockSessionEntry = {
  type: 'session' as const,
  id: 'SES-1',
  occurredAt: '2026-05-01T22:00:00Z',
  completedAt: '2026-05-01T22:30:00Z',
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

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch {}
});

afterEach(() => {
  try { localStorage.clear(); } catch {}
});

describe('SessionHistoryUnified — filter toggle (RF-14)', () => {
  it('renderiza toggle data-testid grind-history-filter-toggle', () => {
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    expect(screen.getByTestId('grind-history-filter-toggle')).toBeTruthy();
  });

  it('3 chips presentes: Tudo, Apenas sessoes, Apenas reports', () => {
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    expect(screen.getByTestId('grind-history-filter-all')).toBeTruthy();
    expect(screen.getByTestId('grind-history-filter-sessions')).toBeTruthy();
    expect(screen.getByTestId('grind-history-filter-reports')).toBeTruthy();
  });

  it('default "Tudo" mostra ambos types (D10)', () => {
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    expect(screen.getByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeTruthy();
    expect(screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeTruthy();
  });

  it('click "Apenas sessoes" oculta manual_reports', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);

    await user.click(screen.getByTestId('grind-history-filter-sessions'));

    await waitFor(() => {
      expect(screen.getByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeNull();
    });
  });

  it('click "Apenas reports" oculta sessions', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);

    await user.click(screen.getByTestId('grind-history-filter-reports'));

    await waitFor(() => {
      expect(screen.queryByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeNull();
      expect(screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeTruthy();
    });
  });

  it('localStorage["grind-history-filter"] persiste selecao', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);

    await user.click(screen.getByTestId('grind-history-filter-reports'));

    await waitFor(() => {
      const stored = localStorage.getItem('grind-history-filter');
      expect(stored).toBe('reports');
    });
  });

  it('reload (re-mount) recupera filtro persistido', async () => {
    localStorage.setItem('grind-history-filter', 'sessions');

    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeNull();
    });
  });

  it('localStorage ausente fallback graceful: default "Tudo" (#12)', () => {
    // Ja cleared no beforeEach
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    // Ambos visiveis (Tudo)
    expect(screen.getByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeTruthy();
    expect(screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeTruthy();
  });

  it('chip ativo recebe destaque visual (aria-pressed=true ou class active)', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryUnified entries={[mockSessionEntry, mockManualReportEntry]} onViewBankrollDetail={() => {}} />);

    await user.click(screen.getByTestId('grind-history-filter-sessions'));

    const chip = screen.getByTestId('grind-history-filter-sessions');
    const ariaPressed = chip.getAttribute('aria-pressed');
    const className = chip.className ?? '';
    const isActive = ariaPressed === 'true' || className.includes('bg-primary') || className.includes('active');
    expect(isActive).toBe(true);
  });
});
