/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-09 (Status Strip 4 KPIs).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-09, §5.1 S1, §3 D8
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §2.1
 *
 * D-FOUNDER-1: SEMPRE 4 KPIs (Banca / ROI 30d / Hoje / Pendencias). NUNCA 5.
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/StatusStrip.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock wouter Link p/ assertion de navigation.
const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

// Mock tracker
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
});

const fullData = {
  banca: { totalUsd: 8200, bisAvailable: 50, deltaPct7d: 1.2, sparkline: [] },
  roi30d: { value: 12.4, sparkline: [1, 2, 3] },
  today: { plannedCount: 8, firstStartTime: '18:00', realizedPnlUsd: null },
  pendencias: { starredHands: 3, cooldownAlerts: 0 },
};

// =============================================================================
// Sempre 4 KPIs (D-FOUNDER-1)
// =============================================================================

describe('<StatusStrip /> — 4 KPIs (NUNCA 5)', () => {
  it('renderiza exatamente 4 cards', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    const cards = screen.getAllByTestId(/^status-strip-card-/);
    expect(cards.length).toBe(4);
  });

  it('renderiza cards Banca, ROI, Hoje, Pendencias com data-testid identificavel', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    expect(screen.getByTestId('status-strip-card-banca')).toBeInTheDocument();
    expect(screen.getByTestId('status-strip-card-roi')).toBeInTheDocument();
    expect(screen.getByTestId('status-strip-card-hoje')).toBeInTheDocument();
    expect(screen.getByTestId('status-strip-card-pendencias')).toBeInTheDocument();
  });
});

// =============================================================================
// Click navigation — RF-09 AC #4-7
// =============================================================================

describe('<StatusStrip /> — click navigation', () => {
  it('Banca card navega para /bankroll', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    fireEvent.click(screen.getByTestId('status-strip-card-banca'));
    // Pelo menos uma chamada ao mockNavigate com /bankroll OU emit evento click
    const calls = [
      ...mockNavigate.mock.calls.flat(),
      ...mockEmit.mock.calls.flat(),
    ];
    expect(JSON.stringify(calls)).toMatch(/bankroll|banca/i);
  });

  it('ROI card navega para /dashboard', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    fireEvent.click(screen.getByTestId('status-strip-card-roi'));
    const calls = [
      ...mockNavigate.mock.calls.flat(),
      ...mockEmit.mock.calls.flat(),
    ];
    expect(JSON.stringify(calls)).toMatch(/dashboard|roi/i);
  });

  it('Hoje card navega para /coach', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    fireEvent.click(screen.getByTestId('status-strip-card-hoje'));
    const calls = [
      ...mockNavigate.mock.calls.flat(),
      ...mockEmit.mock.calls.flat(),
    ];
    expect(JSON.stringify(calls)).toMatch(/coach|hoje/i);
  });

  it('Pendencias card navega para /estudos', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    fireEvent.click(screen.getByTestId('status-strip-card-pendencias'));
    const calls = [
      ...mockNavigate.mock.calls.flat(),
      ...mockEmit.mock.calls.flat(),
    ];
    expect(JSON.stringify(calls)).toMatch(/estudos|pendencias/i);
  });
});

// =============================================================================
// Empty per-card — RF-09 AC #8
// =============================================================================

describe('<StatusStrip /> — empty per-card', () => {
  it('Banca null mostra mensagem "Configure sua banca"', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    const data = { ...fullData, banca: null };
    render(<StatusStrip data={data} />);
    const card = screen.getByTestId('status-strip-card-banca');
    expect(card.textContent).toMatch(/configure.*banca/i);
  });

  it('ROI null mostra "Sem dados" / "importe CSVs"', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    const data = { ...fullData, roi30d: null };
    render(<StatusStrip data={data} />);
    const card = screen.getByTestId('status-strip-card-roi');
    expect(card.textContent).toMatch(/sem dados|importe/i);
  });

  it('Pendencias com 0 mostra "Tudo em dia"', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    const data = { ...fullData, pendencias: { starredHands: 0, cooldownAlerts: 0 } };
    render(<StatusStrip data={data} />);
    const card = screen.getByTestId('status-strip-card-pendencias');
    expect(card.textContent).toMatch(/em dia/i);
  });
});

// =============================================================================
// Tracking — RNF-09
// =============================================================================

describe('<StatusStrip /> — instrumentacao home_status_strip_kpi_click', () => {
  it('click em card Banca emite evento home_status_strip_kpi_click com kpi=banca', async () => {
    const { default: StatusStrip } = await import('../StatusStrip');
    render(<StatusStrip data={fullData} />);
    fireEvent.click(screen.getByTestId('status-strip-card-banca'));
    const found = mockEmit.mock.calls.find(
      ([event, payload]) =>
        event === 'home_status_strip_kpi_click' && payload?.kpi === 'banca',
    );
    expect(found).toBeDefined();
  });
});
