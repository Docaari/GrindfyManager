/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-20 (Empty state onboarding 4 passos).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-20, §3 D7
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §2.3
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/EmptyHomeOnboarding.tsx`.
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
