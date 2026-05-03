/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-16 (F6 Performance mini sparkline).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-16, §5.8 F6, §3 D12
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/PerformanceMini.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

const apiRequestMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={freshClient()}>{ui}</QueryClientProvider>;
}

const data = {
  roi: 12.4,
  itm: 18,
  cash: 22,
  sparkline: Array(30).fill(0).map((_, i) => i * 1.0),
  period: '30d' as const,
};

beforeEach(() => {
  apiRequestMock.mockReset();
  // Limpa localStorage entre testes
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('<PerformanceMini /> — render basico', () => {
  it('renderiza sparkline + 3 metricas (ITM, Cash, ROI)', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={data} />));
    expect(screen.getByTestId('performance-mini-sparkline')).toBeInTheDocument();
    expect(screen.getByTestId('performance-mini-metric-itm')).toBeInTheDocument();
    expect(screen.getByTestId('performance-mini-metric-cash')).toBeInTheDocument();
    expect(screen.getByTestId('performance-mini-metric-roi')).toBeInTheDocument();
  });
});

describe('<PerformanceMini /> — toggle 7d/30d', () => {
  it('default 30d ativo (botao 30d com aria-pressed=true OU classe selected)', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={data} />));
    const btn30 = screen.getByTestId('performance-mini-toggle-30d');
    const isPressed =
      btn30.getAttribute('aria-pressed') === 'true' ||
      btn30.getAttribute('data-active') === 'true' ||
      /selected|active|primary/i.test(btn30.className);
    expect(isPressed).toBe(true);
  });

  it('clicando 7d dispara re-fetch via apiRequest com period=7d', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    apiRequestMock.mockResolvedValue({ ...data, period: '7d' });
    render(wrap(<PerformanceMini data={data} />));

    const btn7 = screen.getByTestId('performance-mini-toggle-7d');
    fireEvent.click(btn7);

    await waitFor(() => {
      const found = apiRequestMock.mock.calls.find(
        (c) =>
          /^GET$/i.test(String(c[0])) &&
          /\/api\/dashboard\/performance/.test(String(c[1])) &&
          /period=7d/.test(String(c[1])),
      );
      expect(found).toBeDefined();
    });
  });
});

describe('<PerformanceMini /> — localStorage persistence', () => {
  it('toggle 7d persiste em localStorage chave home:f6:range', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    apiRequestMock.mockResolvedValue({ ...data, period: '7d' });
    render(wrap(<PerformanceMini data={data} />));

    fireEvent.click(screen.getByTestId('performance-mini-toggle-7d'));

    await waitFor(() => {
      expect(localStorage.getItem('home:f6:range')).toBe('7d');
    });
  });

  it('le valor inicial de localStorage se houver', async () => {
    localStorage.setItem('home:f6:range', '7d');
    apiRequestMock.mockResolvedValue({ ...data, period: '7d' });
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={data} />));

    // Deveria ter botao 7d como ativo
    const btn7 = screen.getByTestId('performance-mini-toggle-7d');
    const isPressed =
      btn7.getAttribute('aria-pressed') === 'true' ||
      btn7.getAttribute('data-active') === 'true' ||
      /selected|active|primary/i.test(btn7.className);
    expect(isPressed).toBe(true);
  });
});

describe('<PerformanceMini /> — CTA dashboard', () => {
  it('CTA "Ver dashboard completo" link para /dashboard', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={data} />));
    const cta = screen.getByTestId('performance-mini-cta-dashboard');
    expect(cta.getAttribute('href')).toBe('/dashboard');
  });
});

describe('<PerformanceMini /> — empty state', () => {
  it('data=null mostra "Sem dados de performance"', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={null} />));
    expect(screen.getByText(/sem dados de performance/i)).toBeInTheDocument();
  });
});

describe('<PerformanceMini /> — a11y RNF-03', () => {
  it('sparkline tem aria-label descritivo', async () => {
    const { default: PerformanceMini } = await import('../PerformanceMini');
    render(wrap(<PerformanceMini data={data} />));
    const sparkline = screen.getByTestId('performance-mini-sparkline');
    const ariaLabel = sparkline.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.toLowerCase()).toMatch(/performance|roi|grafico/);
  });
});
