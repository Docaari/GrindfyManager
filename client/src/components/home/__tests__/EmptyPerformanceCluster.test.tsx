/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Variance-1 — RF-08 (CTA secundaria "Simular variancia" em EmptyPerformanceCluster)
 *
 * Spec : Docs/specs/sprint-variance-1.md §RF-08
 *
 * Hoje EmptyPerformanceCluster.tsx mostra apenas texto. RF-08 adiciona CTA
 * condicional para o simulador quando sessionsCount >= 5 (nao polui onboarding
 * zerado).
 *
 * Cenarios:
 *   1. sessionsCount=10 -> renderiza CTA "Simular variancia" com
 *      href="/coach-ai?tab=variance".
 *   2. sessionsCount=3 -> NAO renderiza CTA (preserva onboarding).
 *
 * Status RED: o componente NAO tem o link CTA ainda.
 *
 * Lessons:
 *   #14 await import()
 *   #2  data-testid estavel (empty-cluster-variance-cta).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('<EmptyPerformanceCluster /> — RF-08 CTA simular variancia', () => {
  it('sessionsCount=10 (>=5) -> renderiza CTA com href "/coach-ai?tab=variance"', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={10} />);
    const cta = screen.getByTestId('empty-cluster-variance-cta');
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute('href') ?? '').toMatch(/\/coach-ai\?tab=variance/);
    expect(cta.textContent ?? '').toMatch(/simul/i);
  });

  it('sessionsCount=8 -> renderiza CTA (boundary >=5)', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={8} />);
    expect(screen.getByTestId('empty-cluster-variance-cta')).toBeInTheDocument();
  });

  it('sessionsCount=5 (boundary inclusivo) -> renderiza CTA', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={5} />);
    expect(screen.getByTestId('empty-cluster-variance-cta')).toBeInTheDocument();
  });

  it('sessionsCount=3 (<5) -> NAO renderiza CTA (preserva onboarding)', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={3} />);
    expect(screen.queryByTestId('empty-cluster-variance-cta')).toBeNull();
  });

  it('sessionsCount=0 -> NAO renderiza CTA', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={0} />);
    expect(screen.queryByTestId('empty-cluster-variance-cta')).toBeNull();
  });

  it('container empty-performance-cluster sempre presente (regressao)', async () => {
    const { default: EmptyPerformanceCluster } = await import('../EmptyPerformanceCluster');
    render(<EmptyPerformanceCluster sessionsCount={10} />);
    expect(screen.getByTestId('empty-performance-cluster')).toBeInTheDocument();
  });
});
