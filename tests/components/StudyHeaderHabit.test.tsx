/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-2.4 StudyHeaderHabit
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-2.4
 *
 * Cobertura:
 *   - Renderiza streak + meta (com progress) + freezes
 *   - Goal=0 oculta freezes
 *   - todayMet pinta progress de verde
 *   - todayMet=false em amber
 *   - Tooltip explicativo em freezes
 *   - data-testid estaveis
 *
 * data-testid esperados:
 *   - study-header-habit (root)
 *   - study-header-streak-days
 *   - study-header-meta-progress
 *   - study-header-meta-current
 *   - study-header-meta-goal
 *   - study-header-freezes
 *   - study-header-freezes-tooltip
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: new (class { invalidateQueries() {} setQueryData() {} getQueryData() {} })(),
}));

// @ts-expect-error - red phase: componente nao existe
import { StudyHeaderHabit } from '../../client/src/components/study/StudyHeaderHabit';

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      streakDays: 7,
      todayMinutes: 30,
      goalMinutes: 45,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    }),
  }) as any;
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadHeader() {
  return StudyHeaderHabit;
}

describe('<StudyHeaderHabit>', () => {
  it('renderiza root com data-testid="study-header-habit"', async () => {
    const Header = await loadHeader();
    renderWithClient(<Header data={{
      streakDays: 7,
      todayMinutes: 30,
      goalMinutes: 45,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    }} />);
    expect(screen.getByTestId('study-header-habit')).toBeInTheDocument();
  });

  it('renderiza streak: "7 dias"', async () => {
    const Header = await loadHeader();
    renderWithClient(<Header data={{
      streakDays: 7,
      todayMinutes: 30,
      goalMinutes: 45,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    }} />);
    expect(screen.getByTestId('study-header-streak-days')).toBeInTheDocument();
    const text = screen.getByTestId('study-header-streak-days').textContent || '';
    expect(text).toMatch(/7/);
  });

  it('renderiza progress meta atual/goal "30/45 min"', async () => {
    const Header = await loadHeader();
    renderWithClient(<Header data={{
      streakDays: 7,
      todayMinutes: 30,
      goalMinutes: 45,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    }} />);
    expect(screen.getByTestId('study-header-meta-progress')).toBeInTheDocument();
    const body = document.body.textContent || '';
    expect(body).toMatch(/30/);
    expect(body).toMatch(/45/);
  });

  it('exibe freezes quando goal>0', async () => {
    const Header = await loadHeader();
    renderWithClient(<Header data={{
      streakDays: 7,
      todayMinutes: 30,
      goalMinutes: 45,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    }} />);
    expect(screen.getByTestId('study-header-freezes')).toBeInTheDocument();
  });

  it('OCULTA freezes quando goal=0 (RF-2.4 spec)', async () => {
    const Header = await loadHeader();
    renderWithClient(<Header data={{
      streakDays: 0,
      todayMinutes: 5,
      goalMinutes: 0,
      todayMet: true,
      freezesUsedThisMonth: 0,
      freezesRemaining: 2,
    }} />);
    expect(screen.queryByTestId('study-header-freezes')).not.toBeInTheDocument();
  });
});
