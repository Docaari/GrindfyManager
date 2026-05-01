/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-11
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069 + ADR-070
 *
 * Foco: SessionHistoryList.tsx renderiza entries unificados (sessions +
 * manual_reports) com discriminator visual + botao "Ver detalhes da banca"
 * gated por entry.detailsAvailable (#11).
 *
 * Lessons:
 *   #2 — data-testid estavel: history-entry-{type}-{id}, history-bankroll-detail-btn-{id}.
 *   #11 — botao desabilitado se detailsAvailable=false.
 *   #6 — profit USD usa valor pre-computado server-side.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Componente novo SessionHistoryUnified — ainda nao existe (RED).
// @ts-expect-error — RED: componente unificado ainda nao existe
import { SessionHistoryUnified } from '../../../client/src/components/grind-session/SessionHistoryUnified';

beforeEach(() => {
  vi.clearAllMocks();
});

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
  platformsAffected: ['PokerStars', 'GGNetwork'],
  detailsAvailable: true,
};

const mockLegacySessionEntry = {
  type: 'session' as const,
  id: 'SES-LEGACY',
  occurredAt: '2025-08-01T22:00:00Z',
  completedAt: '2025-08-01T22:30:00Z',
  profitUsd: 100,
  tournamentsCount: 3,
  platformsAffected: ['PokerStars'],
  detailsAvailable: false,
};

describe('SessionHistoryUnified — render manual_report entry (RF-11)', () => {
  it('renderiza entry type=manual_report com data-testid history-entry-manual_report-{id}', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    expect(screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`)).toBeTruthy();
  });

  it('renderiza entry type=session com data-testid history-entry-session-{id}', () => {
    render(<SessionHistoryUnified entries={[mockSessionEntry]} onViewBankrollDetail={() => {}} />);
    expect(screen.getByTestId(`history-entry-session-${mockSessionEntry.id}`)).toBeTruthy();
  });

  it('manual_report renderiza badge "Report manual" PT-BR', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    const entry = screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`);
    expect(entry.textContent?.toLowerCase()).toMatch(/report manual/);
  });

  it('manual_report renderiza chips das plataformas afetadas', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    const entry = screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}`);
    expect(entry.textContent).toContain('PokerStars');
    expect(entry.textContent).toContain('GGNetwork');
  });

  it('manual_report SEM secao expandivel de torneios (D11 escopo)', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    const tournamentSection = screen.queryByTestId(`history-entry-manual_report-${mockManualReportEntry.id}-tournaments`);
    expect(tournamentSection).toBeNull();
  });

  it('manual_report profit USD verde se positivo', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    const profit = screen.getByTestId(`history-entry-manual_report-${mockManualReportEntry.id}-profit`);
    const className = profit.className ?? '';
    const dataSign = profit.getAttribute('data-sign') ?? '';
    const positiveSignal = className.includes('green') || className.includes('positive') || dataSign === 'positive';
    expect(positiveSignal).toBe(true);
  });

  it('manual_report profit USD vermelho se negativo', () => {
    const negEntry = { ...mockManualReportEntry, profitUsd: -50, id: 'mr_neg' };
    render(<SessionHistoryUnified entries={[negEntry]} onViewBankrollDetail={() => {}} />);
    const profit = screen.getByTestId(`history-entry-manual_report-${negEntry.id}-profit`);
    const className = profit.className ?? '';
    const dataSign = profit.getAttribute('data-sign') ?? '';
    const negativeSignal = className.includes('red') || className.includes('destructive') || className.includes('negative') || dataSign === 'negative';
    expect(negativeSignal).toBe(true);
  });

  it('botao "Ver detalhes da banca" presente em entry session com detailsAvailable=true', () => {
    render(<SessionHistoryUnified entries={[mockSessionEntry]} onViewBankrollDetail={() => {}} />);
    const btn = screen.getByTestId(`history-bankroll-detail-btn-${mockSessionEntry.id}`);
    expect(btn).toBeTruthy();
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('botao "Ver detalhes da banca" presente em manual_report sempre', () => {
    render(<SessionHistoryUnified entries={[mockManualReportEntry]} onViewBankrollDetail={() => {}} />);
    const btn = screen.getByTestId(`history-bankroll-detail-btn-${mockManualReportEntry.id}`);
    expect(btn).toBeTruthy();
  });

  it('botao DESABILITADO em entry session com detailsAvailable=false (#11)', () => {
    render(<SessionHistoryUnified entries={[mockLegacySessionEntry]} onViewBankrollDetail={() => {}} />);
    const btn = screen.getByTestId(`history-bankroll-detail-btn-${mockLegacySessionEntry.id}`);
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('lista vazia: render sem crash, mostra empty state ou container', () => {
    render(<SessionHistoryUnified entries={[]} onViewBankrollDetail={() => {}} />);
    expect(screen.queryByTestId('session-history-empty') || screen.queryByTestId('session-history-list')).toBeTruthy();
  });

  it('order DESC visual (mais recente primeiro)', () => {
    render(<SessionHistoryUnified
      entries={[mockManualReportEntry, mockSessionEntry]}
      onViewBankrollDetail={() => {}}
    />);
    const allEntries = screen.getAllByTestId(/^history-entry-/);
    expect(allEntries.length).toBe(2);
    const first = allEntries[0].getAttribute('data-testid');
    // session occurredAt 22:00 > manual_report 14:30 -> session aparece primeiro
    expect(first).toContain('SES-1');
  });

  it('cluster D5: 1 entry com 3 platforms renderiza 3 chips', () => {
    const cluster = {
      ...mockManualReportEntry,
      id: 'mr_cluster',
      transactionIds: ['tx_a', 'tx_b', 'tx_c'],
      platformsAffected: ['PokerStars', 'GGNetwork', 'ACR'],
    };
    render(<SessionHistoryUnified entries={[cluster]} onViewBankrollDetail={() => {}} />);
    const entry = screen.getByTestId(`history-entry-manual_report-${cluster.id}`);
    expect(entry.textContent).toContain('PokerStars');
    expect(entry.textContent).toContain('GGNetwork');
    expect(entry.textContent).toContain('ACR');
  });
});
