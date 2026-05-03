/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-20 (Empty state onboarding 4 passos).
 * Sprint home-reform-1-5 — RF-26 / RF-25.6 (profile-aware copy).
 *
 * Spec : Docs/specs/home-reform-1.md RF-20, D7
 *      + Docs/specs/home-reform-1-5.md RF-25.6, RF-26
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md
 *      + Docs/architecture/decisions/107-home-profile-detection-smart-auto-adapt.md
 *
 * Status RED:
 *   - testes Onda 1 base ja existem (passam)
 *   - testes Onda 1.5 (profile-aware copy) sao novos — vao falhar ate
 *     implementer adicionar prop `profile?: PlayerProfile` em EmptyHomeOnboarding.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

const data = {
  totalTournaments: 5,
  totalSessions: 0,
  walletsConfigured: false,
  gradeDays: 0,
};

// =============================================================================
// Onda 1 — comportamento base (4 steps)
// =============================================================================

describe('<EmptyHomeOnboarding /> — 4 passos', () => {
  it('renderiza 4 steps com testid identificavel', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} />);
    expect(screen.getByTestId('onboarding-step-import')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-step-banca')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-step-grade')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-step-sessao')).toBeInTheDocument();
  });
});

describe('<EmptyHomeOnboarding /> — completed flag por step', () => {
  it('totalTournaments > 0 marca step Import como completed', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={{ ...data, totalTournaments: 1 }} />);
    const step = screen.getByTestId('onboarding-step-import');
    expect(step.getAttribute('data-completed')).toBe('true');
  });

  it('walletsConfigured=true marca step Banca como completed', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={{ ...data, walletsConfigured: true }} />);
    const step = screen.getByTestId('onboarding-step-banca');
    expect(step.getAttribute('data-completed')).toBe('true');
  });

  it('gradeDays > 0 marca step Grade como completed', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={{ ...data, gradeDays: 3 }} />);
    const step = screen.getByTestId('onboarding-step-grade');
    expect(step.getAttribute('data-completed')).toBe('true');
  });

  it('totalSessions > 0 marca step Sessao como completed', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={{ ...data, totalSessions: 1 }} />);
    const step = screen.getByTestId('onboarding-step-sessao');
    expect(step.getAttribute('data-completed')).toBe('true');
  });
});

describe('<EmptyHomeOnboarding /> — Pular onboarding (D7)', () => {
  it('botao "Pular onboarding" seta localStorage:home:skipOnboarding=true', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} />);
    const btn = screen.getByTestId('onboarding-skip-button');
    fireEvent.click(btn);
    expect(localStorage.getItem('home:skipOnboarding')).toBe('true');
  });
});

// =============================================================================
// Onda 1.5 — profile-aware copy (RF-25.6 + RF-26)
// =============================================================================

describe('<EmptyHomeOnboarding /> — Onda 1.5 profile prop', () => {
  it('profile="upload-only" => container recebe data-profile-variant="upload-only"', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} profile="upload-only" />);
    const root = screen.getByTestId('home-empty-onboarding');
    expect(root.getAttribute('data-profile-variant')).toBe('upload-only');
  });

  it('profile="session-only" => container recebe data-profile-variant="session-only"', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} profile="session-only" />);
    const root = screen.getByTestId('home-empty-onboarding');
    expect(root.getAttribute('data-profile-variant')).toBe('session-only');
  });

  it('profile="hybrid" => copy generica atual mantida (Onda 1)', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} profile="hybrid" />);
    expect(screen.getByText(/Complete os 4 passos abaixo/i)).toBeInTheDocument();
  });

  it('profile undefined => copy generica atual mantida (zero regressao)', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} />);
    expect(screen.getByText(/Complete os 4 passos abaixo/i)).toBeInTheDocument();
  });

  it('profile="new" => container recebe data-profile-variant="new"', async () => {
    const { default: EmptyHomeOnboarding } = await import('../EmptyHomeOnboarding');
    render(<EmptyHomeOnboarding data={data} profile="new" />);
    const root = screen.getByTestId('home-empty-onboarding');
    expect(root.getAttribute('data-profile-variant')).toBe('new');
  });
});
