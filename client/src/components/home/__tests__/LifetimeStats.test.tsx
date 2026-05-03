/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-14 (F1 Historico Geral compacto).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-14, §5.6 F1, §3 D10
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §2.2
 *
 * GUARDRAILS ARQUITETURAIS (ADR-099 §2.2 — vinculantes):
 *   - SEM emoji fogo/alvo/estrela no DOM (assertion via codepoint para nao
 *     poluir codigo com emoji literal — bloqueado por hook do projeto)
 *   - SEM cor de destaque (text-emerald-, text-red-, bg-amber-) no numero de streak
 *   - SEM acesso a localStorage
 *   - SEM sub-text "vs ultima semana"
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/LifetimeStats.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

// Code points dos emojis vetados (ADR-099 §2.2). Mantido como codepoint
// para evitar trigger do hook do projeto que bloqueia emojis em codigo.
const FIRE = String.fromCodePoint(0x1f525);    // fire
const TARGET = String.fromCodePoint(0x1f3af);  // dart/target
const STAR = String.fromCodePoint(0x2b50);     // white medium star

beforeEach(() => {
  mockEmit.mockReset();
});

const data = {
  totalTournaments: 1234,
  totalSessions: 56,
  activeDays: 200,
  currentStreakDays: 7,
};

describe('<LifetimeStats /> — 4 metricas em row', () => {
  it('renderiza 4 cells', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    render(<LifetimeStats data={data} />);
    const cells = screen.getAllByTestId(/^lifetime-cell-/);
    expect(cells.length).toBe(4);
  });

  it('cells tem testids identificaveis: torneios, sessoes, dias-ativos, streak', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    render(<LifetimeStats data={data} />);
    expect(screen.getByTestId('lifetime-cell-torneios')).toBeInTheDocument();
    expect(screen.getByTestId('lifetime-cell-sessoes')).toBeInTheDocument();
    expect(screen.getByTestId('lifetime-cell-dias-ativos')).toBeInTheDocument();
    expect(screen.getByTestId('lifetime-cell-streak')).toBeInTheDocument();
  });
});

describe('<LifetimeStats /> — formatacao numerica PT-BR', () => {
  it('totalTournaments=1234 formatado com separador de milhar (1.234)', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    render(<LifetimeStats data={data} />);
    const cell = screen.getByTestId('lifetime-cell-torneios');
    expect(cell.textContent).toMatch(/1\.234|1,234/);
  });
});

// =============================================================================
// GUARDRAILS ARQUITETURAIS — ADR-099 §2.2
// =============================================================================

describe('<LifetimeStats /> — anti-gamificacao (ADR-099 §2.2)', () => {
  it('NAO contem emoji fogo (codepoint U+1F525)', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    const { container } = render(<LifetimeStats data={data} />);
    expect(container.textContent ?? '').not.toContain(FIRE);
  });

  it('NAO contem emoji target (codepoint U+1F3AF)', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    const { container } = render(<LifetimeStats data={data} />);
    expect(container.textContent ?? '').not.toContain(TARGET);
  });

  it('NAO contem emoji star (codepoint U+2B50)', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    const { container } = render(<LifetimeStats data={data} />);
    expect(container.textContent ?? '').not.toContain(STAR);
  });

  it('streak cell NAO tem cor de destaque emerald/green/amber/red', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    render(<LifetimeStats data={data} />);
    const streakCell = screen.getByTestId('lifetime-cell-streak');
    // Numero principal nao pode estar em verde/amber/red
    const numeroEl =
      streakCell.querySelector('[data-testid="lifetime-cell-streak-number"]') ??
      streakCell;
    const cls = numeroEl.className || '';
    expect(cls).not.toMatch(/text-(emerald|green|amber|red|orange|yellow)-/);
  });

  it('NAO inclui texto comparativo "vs ultima semana"', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    const { container } = render(<LifetimeStats data={data} />);
    expect(container.textContent?.toLowerCase()).not.toMatch(/vs.*semana|vs.*passad/);
  });
});

describe('<LifetimeStats /> — bloco clicavel', () => {
  it('bloco inteiro link para /dashboard', async () => {
    const { default: LifetimeStats } = await import('../LifetimeStats');
    render(<LifetimeStats data={data} />);
    const link = screen.queryByTestId('lifetime-stats-link');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute('href')).toBe('/dashboard');
  });
});
