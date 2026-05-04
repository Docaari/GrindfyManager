/**
 * Test — Sprint home-reform-5 item 2.
 *
 * Spec: Docs/specs/home-reform-5.md item 2.
 *
 * Cobre HeaderStrip:
 *   - Banca: 2 casas decimais USD; empty state.
 *   - Hoje: profile + count, DAY OFF.
 *   - ROI 30D: sinal + formatacao; empty.
 *   - Pendencia: amber + label + ctaHref; "Tudo em dia".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) =>
    React.cloneElement(React.Children.only(children) as any, { href }),
}));

vi.mock('@/lib/tracker', () => ({
  emit: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import HeaderStrip from '@/components/home/HeaderStrip';
import type { HeaderStripProps } from '@/components/home/HeaderStrip';

function defaults(over: Partial<HeaderStripProps['data']> = {}): HeaderStripProps['data'] {
  return {
    banca: { totalUsd: 1866.84, currency: 'USD' },
    today: { profile: 'B', plannedCount: 0, isOff: false },
    roi30d: { value: null, hasData: false },
    pendency: null,
    ...over,
  };
}

describe('HeaderStrip — Banca', () => {
  it('formata totalUsd com 2 casas decimais (1866.84 -> $1.866,84)', () => {
    render(<HeaderStrip data={defaults()} />);
    const el = screen.getByTestId('header-strip-banca-value');
    expect(el.textContent).toBe('$1.866,84');
  });

  it('null -> empty state "Configure sua banca"', () => {
    render(<HeaderStrip data={defaults({ banca: null })} />);
    expect(screen.queryByTestId('header-strip-banca-value')).not.toBeInTheDocument();
    expect(screen.getByText('Configure sua banca')).toBeInTheDocument();
  });

  it('linka para /bankroll', () => {
    render(<HeaderStrip data={defaults()} />);
    const card = screen.getByTestId('header-strip-banca') as HTMLAnchorElement;
    expect(card.getAttribute('href')).toBe('/bankroll');
  });
});

describe('HeaderStrip — Hoje', () => {
  it('mostra count + perfil', () => {
    render(
      <HeaderStrip
        data={defaults({ today: { profile: 'B', plannedCount: 5, isOff: false } })}
      />,
    );
    expect(screen.getByTestId('header-strip-hoje-count').textContent).toBe('5');
    expect(screen.getByText(/perfil B/)).toBeInTheDocument();
  });

  it('count 0 mas profile ativo -> mostra 0 (nao DAY OFF)', () => {
    render(
      <HeaderStrip
        data={defaults({ today: { profile: 'B', plannedCount: 0, isOff: false } })}
      />,
    );
    expect(screen.getByTestId('header-strip-hoje-count').textContent).toBe('0');
    expect(screen.queryByTestId('header-strip-hoje-off')).not.toBeInTheDocument();
  });

  it('isOff=true -> DAY OFF visivel', () => {
    render(
      <HeaderStrip
        data={defaults({ today: { profile: null, plannedCount: 0, isOff: true } })}
      />,
    );
    expect(screen.getByTestId('header-strip-hoje-off')).toBeInTheDocument();
    expect(screen.getByTestId('header-strip-hoje-off').textContent).toBe('DAY OFF');
  });

  it('singular: 1 torneio (nao 1 torneios)', () => {
    render(
      <HeaderStrip
        data={defaults({ today: { profile: 'A', plannedCount: 1, isOff: false } })}
      />,
    );
    expect(screen.getByText(/torneio · perfil A/)).toBeInTheDocument();
  });
});

describe('HeaderStrip — ROI 30D', () => {
  it('formata positivo com +', () => {
    render(<HeaderStrip data={defaults({ roi30d: { value: 12.5, hasData: true } })} />);
    expect(screen.getByTestId('header-strip-roi-value').textContent).toBe('+12.5%');
  });

  it('formata negativo sem +', () => {
    render(<HeaderStrip data={defaults({ roi30d: { value: -8.4, hasData: true } })} />);
    expect(screen.getByTestId('header-strip-roi-value').textContent).toBe('-8.4%');
  });

  it('hasData=false -> empty state', () => {
    render(<HeaderStrip data={defaults({ roi30d: { value: null, hasData: false } })} />);
    expect(screen.getByTestId('header-strip-roi-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('header-strip-roi-value')).not.toBeInTheDocument();
  });
});

describe('HeaderStrip — Pendencia', () => {
  it('renderiza label + amber + linka pra ctaHref', () => {
    render(
      <HeaderStrip
        data={defaults({
          pendency: {
            kind: 'upload_tournaments',
            label: 'Subir torneios para o dashboard',
            ctaHref: '/upload',
            daysSince: 9,
          },
        })}
      />,
    );
    const card = screen.getByTestId('header-strip-pendencia') as HTMLAnchorElement;
    expect(card.getAttribute('href')).toBe('/upload');
    expect(card.className).toMatch(/amber/);
    expect(screen.getByTestId('header-strip-pendencia-label').textContent).toBe(
      'Subir torneios para o dashboard',
    );
    expect(screen.getByText(/ha 9 dias/)).toBeInTheDocument();
  });

  it('daysSince=1 -> singular "dia"', () => {
    render(
      <HeaderStrip
        data={defaults({
          pendency: {
            kind: 'spot_review',
            label: 'Spot pendente para revisar',
            ctaHref: '/estudos',
            daysSince: 1,
          },
        })}
      />,
    );
    expect(screen.getByText(/ha 1 dia/)).toBeInTheDocument();
  });

  it('daysSince=null -> "Resolver agora"', () => {
    render(
      <HeaderStrip
        data={defaults({
          pendency: {
            kind: 'bankroll_check',
            label: 'Verificar valores das bancas',
            ctaHref: '/bankroll',
            daysSince: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/Resolver agora/)).toBeInTheDocument();
  });

  it('null -> "Tudo em dia" + sem amber', () => {
    render(<HeaderStrip data={defaults({ pendency: null })} />);
    const card = screen.getByTestId('header-strip-pendencia');
    expect(card.className).not.toMatch(/amber/);
    expect(screen.getByTestId('header-strip-pendencia-clear')).toBeInTheDocument();
  });
});
