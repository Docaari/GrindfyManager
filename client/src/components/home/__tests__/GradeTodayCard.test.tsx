/**
 * Test — Sprint home-reform-4 item 5.
 *
 * Spec: Docs/specs/home-reform-4.md item 5 (Card "Grade do dia" com chips
 * A|B|C + count/totalInvestmentUsd/abi).
 *
 * Cobre <GradeTodayCard />:
 *   - Loading skeleton enquanto query em flight.
 *   - Render KPIs (count / investimento / abi) quando data ok.
 *   - Empty state ("Nenhum torneio planejado para perfil X").
 *   - Chips A|B|C single-select; click refaz query com novo profile.
 *   - CTA link /grade-planner.
 *
 * Lesson #13: apiRequest retorna JSON parseado direto; mock retorna objeto.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<GradeTodayCard />', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('exibe loading skeleton enquanto fetch nao completa', async () => {
    let resolve: (v: any) => void = () => undefined;
    apiRequestMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    expect(screen.getByTestId('grade-today-card-loading')).toBeTruthy();
    resolve({ date: '2026-05-03', profile: 'A', count: 0, totalInvestmentUsd: 0, abi: null });
  });

  it('renderiza KPIs (count, investimento, abi) quando data presente', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03',
      profile: 'A',
      count: 12,
      totalInvestmentUsd: 600,
      abi: 50,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-count')).toBeTruthy();
    });
    expect(screen.getByTestId('grade-today-card-count').textContent).toMatch(/12/);
    expect(screen.getByTestId('grade-today-card-investment').textContent).toMatch(/\$600/);
    expect(screen.getByTestId('grade-today-card-abi').textContent).toMatch(/\$50/);
  });

  it('empty state quando count=0', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03',
      profile: 'B',
      count: 0,
      totalInvestmentUsd: 0,
      abi: null,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="B" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('grade-today-card-empty').textContent).toMatch(/Nenhum torneio planejado para perfil B/);
  });

  it('chip ativo via data-active="true"; outros "false"', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03', profile: 'A', count: 1, totalInvestmentUsd: 10, abi: 10,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-chip-A').getAttribute('data-active')).toBe('true');
    });
    expect(screen.getByTestId('grade-today-card-chip-B').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('grade-today-card-chip-C').getAttribute('data-active')).toBe('false');
  });

  it('click chip C refaz query com profile=C', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03', profile: 'A', count: 5, totalInvestmentUsd: 100, abi: 20,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/home/grade-today?profile=A');
    });
    apiRequestMock.mockResolvedValueOnce({
      date: '2026-05-03', profile: 'C', count: 0, totalInvestmentUsd: 0, abi: null,
    });
    fireEvent.click(screen.getByTestId('grade-today-card-chip-C'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/home/grade-today?profile=C');
    });
  });

  it('CTA aponta para /grade-planner', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03', profile: 'A', count: 1, totalInvestmentUsd: 10, abi: 10,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    const { container } = renderWithClient(<GradeTodayCard defaultProfile="A" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-cta')).toBeTruthy();
    });
    const cta = container.querySelector('a[href="/grade-planner"]');
    expect(cta).toBeTruthy();
  });

  it('exibe data do dia em "dd/mm" no titulo', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03', profile: 'A', count: 1, totalInvestmentUsd: 10, abi: 10,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    // Aguarda data hidratar (KPI count visivel) antes de checar titulo.
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-count')).toBeTruthy();
    });
    const card = screen.getByTestId('grade-today-card');
    expect(card.textContent).toMatch(/Grade do dia\s*—\s*03\/05/);
  });

  // ===========================================================================
  // Sprint home-reform-5 item 5 — firstEntry / lastEntry
  // ===========================================================================
  it('renderiza firstEntry + lastEntry quando payload traz boundaries', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03',
      profile: 'A',
      count: 6,
      totalInvestmentUsd: 200,
      abi: 33.33,
      firstEntry: { time: '14:00', name: 'Mystery Mini' },
      lastEntry: { time: '20:30', name: 'Sunday Storm' },
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="A" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-first')).toBeTruthy();
    });
    const first = screen.getByTestId('grade-today-card-first');
    expect(first.textContent).toMatch(/14:00/);
    expect(first.textContent).toMatch(/Mystery Mini/);
    const last = screen.getByTestId('grade-today-card-last');
    expect(last.textContent).toMatch(/20:30/);
    expect(last.textContent).toMatch(/Sunday Storm/);
  });

  it('nao renderiza boundaries quando firstEntry/lastEntry sao null', async () => {
    apiRequestMock.mockResolvedValue({
      date: '2026-05-03',
      profile: 'B',
      count: 0,
      totalInvestmentUsd: 0,
      abi: null,
      firstEntry: null,
      lastEntry: null,
    });
    const { default: GradeTodayCard } = await import('../GradeTodayCard');
    renderWithClient(<GradeTodayCard defaultProfile="B" />);
    await waitFor(() => {
      expect(screen.getByTestId('grade-today-card-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('grade-today-card-first')).toBeNull();
    expect(screen.queryByTestId('grade-today-card-last')).toBeNull();
  });
});
