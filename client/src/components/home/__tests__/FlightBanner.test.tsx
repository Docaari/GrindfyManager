/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-13 (S5 banner flight ativo).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-13, §5.5 S5, §3 D9, §3 D16
 *
 * D9: quando S3 + S5 ambos ativos, S5 acima de S3 — testado em Home.test.tsx.
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/FlightBanner.tsx`.
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

beforeEach(() => {
  mockEmit.mockReset();
});

const activeFlight = {
  active: true,
  seriesTitle: 'KO Cup $50K',
  nextDayStartTime: '2026-05-04T18:00:00Z',
  currentStackBb: 47,
  day: 2,
};

describe('<FlightBanner /> — render condicional', () => {
  it('banner=null => nada renderizado', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    const { container } = render(<FlightBanner banner={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('active=false => nada renderizado', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    const { container } = render(
      <FlightBanner banner={{ ...activeFlight, active: false }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('active=true => banner visivel', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    expect(screen.getByTestId('flight-banner')).toBeInTheDocument();
  });
});

describe('<FlightBanner /> — texto', () => {
  it('mostra "Day 2" e seriesTitle', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    const banner = screen.getByTestId('flight-banner');
    expect(banner.textContent).toMatch(/Day 2/i);
    expect(banner.textContent).toContain('KO Cup');
  });

  it('mostra stack atual em BBs', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    const banner = screen.getByTestId('flight-banner');
    expect(banner.textContent).toMatch(/47.*BB/);
  });
});

describe('<FlightBanner /> — CTA', () => {
  it('CTA "Abrir Flight" navega para /flight', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    const cta = screen.getByTestId('flight-banner-cta');
    expect(cta.getAttribute('href')).toBe('/flight');
  });
});

describe('<FlightBanner /> — sem dismiss (informacao critica)', () => {
  it('NAO expoe botao dismiss', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    expect(screen.queryByTestId('flight-banner-dismiss')).not.toBeInTheDocument();
  });
});

describe('<FlightBanner /> — a11y', () => {
  it('tem role="alert"', async () => {
    const { default: FlightBanner } = await import('../FlightBanner');
    render(<FlightBanner banner={activeFlight} />);
    const banner = screen.getByTestId('flight-banner');
    expect(banner.getAttribute('role')).toBe('alert');
  });
});
