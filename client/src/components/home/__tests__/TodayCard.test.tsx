/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-10 (TodayCard — sessao do dia, perfil A/B/C/OFF).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-10, §5.2 S2
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/TodayCard.tsx`.
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

const baseToday = {
  profile: 'A' as const,
  plannedCount: 8,
  firstStartTime: '18:00',
  stopLoss: { amount: 500, currency: 'USD' },
  stopTime: '23:00',
  hasWarmupToday: false,
};

describe('<TodayCard /> — perfil badge', () => {
  it('renderiza badge "A" quando profile=A', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={baseToday} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renderiza badge "B" quando profile=B', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={{ ...baseToday, profile: 'B' }} />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renderiza badge "C" quando profile=C', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={{ ...baseToday, profile: 'C' }} />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renderiza badge "OFF" quando profile=OFF', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={{ ...baseToday, profile: 'OFF' }} />);
    expect(screen.getByText(/OFF/i)).toBeInTheDocument();
  });
});

describe('<TodayCard /> — CTA warm-up condicional', () => {
  it('renderiza CTA "Iniciar warm-up" quando hasWarmupToday=false', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={{ ...baseToday, hasWarmupToday: false }} />);
    expect(screen.getByTestId('today-cta-warmup')).toBeInTheDocument();
  });

  it('OCULTA CTA "Iniciar warm-up" quando hasWarmupToday=true', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={{ ...baseToday, hasWarmupToday: true }} />);
    expect(screen.queryByTestId('today-cta-warmup')).not.toBeInTheDocument();
  });
});

describe('<TodayCard /> — CTA grade sempre visivel', () => {
  it('renderiza CTA "Ver grade" sempre', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={baseToday} />);
    expect(screen.getByTestId('today-cta-grade')).toBeInTheDocument();
  });
});

describe('<TodayCard /> — empty state', () => {
  it('quando data=null mostra "Nenhuma sessao planejada para hoje"', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={null} />);
    expect(screen.getByText(/nenhuma sessao planejada/i)).toBeInTheDocument();
  });

  it('com data=null, renderiza CTA "Configurar grade"', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={null} />);
    expect(screen.getByTestId('today-cta-configure-grade')).toBeInTheDocument();
  });
});

describe('<TodayCard /> — info torneios', () => {
  it('mostra "{N} torneios · primeiro {HH:MM}"', async () => {
    const { default: TodayCard } = await import('../TodayCard');
    render(<TodayCard data={baseToday} />);
    expect(screen.getByText(/8.*torneio/i)).toBeInTheDocument();
    expect(screen.getByText(/18:00/)).toBeInTheDocument();
  });
});
