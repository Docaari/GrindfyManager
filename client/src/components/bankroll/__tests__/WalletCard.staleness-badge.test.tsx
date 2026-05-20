/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-06
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Badge inline em cada wallet row indicando ha quantos dias o saldo foi
 * atualizado pela ultima vez.
 *
 * Fonte: wallet.lastTransactionAt (MAX(wallet_transactions.occurred_at)) com
 * fallback para wallet.updatedAt e depois wallet.createdAt.
 *
 * Thresholds:
 *   < 3d   -> sem badge
 *   3-7d   -> badge cinza "atualizado ha {n}d" (tone info)
 *   8-30d  -> badge amarelo "atualizado ha {n}d" (tone warn)
 *   > 30d  -> badge amarelo "sem movimento ha {n}d" (tone warn)
 *
 * Componente: implementer cria `<WalletStalenessBadge>` em
 * `client/src/components/bankroll/WalletStalenessBadge.tsx` e usa dentro de
 * `WalletList.tsx` (ou WalletCard, se extrair).
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel.
 *   #6  comparacoes de moeda em USD nao aplicam aqui — staleness eh tempo, nao $.
 *   #14 import estatico (await import).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Fixed "now" para testes determinist. Usar 2026-05-20 12:00 UTC.
const NOW = new Date('2026-05-20T12:00:00.000Z').getTime();

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

// Path como variavel — Vite NAO resolve estatico em RED phase.
const BADGE_PATH = '@/components/bankroll/WalletStalenessBadge';

async function loadBadge() {
  // @ts-expect-error — RED: componente ainda nao existe
  const mod: any = await import(/* @vite-ignore */ BADGE_PATH);
  return (mod.default ?? mod.WalletStalenessBadge) as React.ComponentType<any>;
}

// ===========================================================================
// Render condicional por threshold
// ===========================================================================

describe('RF-06 WalletStalenessBadge — sem badge (< 3 dias)', () => {
  it('NAO renderiza badge quando lastTransactionAt = ha 1 dia', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(1)} />);
    expect(screen.queryByTestId('wallet-staleness-badge')).toBeNull();
  });

  it('NAO renderiza badge quando lastTransactionAt = ha 2 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(2)} />);
    expect(screen.queryByTestId('wallet-staleness-badge')).toBeNull();
  });

  it('NAO renderiza badge quando lastTransactionAt = exatamente hoje', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(0)} />);
    expect(screen.queryByTestId('wallet-staleness-badge')).toBeNull();
  });
});

describe('RF-06 WalletStalenessBadge — tom info (3-7 dias)', () => {
  it('renderiza badge "atualizado ha 3d" com tone=info', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(3)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/atualizado ha 3 ?d/i);
    expect(badge.getAttribute('data-tone')).toBe('info');
  });

  it('renderiza badge "atualizado ha 5d" para 5 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(5)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/atualizado ha 5 ?d/i);
    expect(badge.getAttribute('data-tone')).toBe('info');
  });

  it('renderiza badge tone=info para exatamente 7 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(7)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.getAttribute('data-tone')).toBe('info');
  });
});

describe('RF-06 WalletStalenessBadge — tom warn (8-30 dias)', () => {
  it('renderiza badge tone=warn para 10 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(10)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/atualizado ha 10 ?d/i);
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });

  it('renderiza badge tone=warn para 8 dias (boundary)', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(8)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });

  it('renderiza badge tone=warn para 25 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(25)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });
});

describe('RF-06 WalletStalenessBadge — sem movimento (> 30 dias)', () => {
  it('renderiza "sem movimento ha 35d" para 35 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(35)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/sem movimento ha 35 ?d/i);
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });

  it('renderiza "sem movimento" para 90 dias', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(90)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/sem movimento/i);
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });
});

// ===========================================================================
// Fallbacks: updatedAt -> createdAt
// ===========================================================================

describe('RF-06 WalletStalenessBadge — fallbacks de timestamp', () => {
  it('usa updatedAt quando lastTransactionAt eh null', async () => {
    const Badge = await loadBadge();
    render(
      <Badge
        lastTransactionAt={null}
        updatedAt={isoDaysAgo(10)}
        createdAt={isoDaysAgo(60)}
      />,
    );
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/10 ?d/);
  });

  it('usa createdAt quando lastTransactionAt e updatedAt sao null', async () => {
    const Badge = await loadBadge();
    render(
      <Badge
        lastTransactionAt={null}
        updatedAt={null}
        createdAt={isoDaysAgo(45)}
      />,
    );
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/45 ?d/);
  });

  it('wallet recem criada (createdAt < 3d, sem outros timestamps) NAO mostra badge', async () => {
    const Badge = await loadBadge();
    render(
      <Badge
        lastTransactionAt={null}
        updatedAt={null}
        createdAt={isoDaysAgo(1)}
      />,
    );
    expect(screen.queryByTestId('wallet-staleness-badge')).toBeNull();
  });

  it('todos timestamps null/undefined -> NAO mostra badge (sem dado p/ calcular)', async () => {
    const Badge = await loadBadge();
    render(<Badge />);
    expect(screen.queryByTestId('wallet-staleness-badge')).toBeNull();
  });
});

// ===========================================================================
// Tooltip + acessibilidade
// ===========================================================================

describe('RF-06 WalletStalenessBadge — tooltip + a11y', () => {
  it('badge tem title (tooltip nativo) explicativo', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(10)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    // Aceita title (tooltip nativo) ou aria-describedby (Radix Tooltip wrapper).
    const tooltipText =
      badge.getAttribute('title') ?? badge.getAttribute('aria-label') ?? '';
    expect(tooltipText.toLowerCase()).toMatch(/atualizado|saldo|movimento/);
  });

  it('badge eh inline-readable (tem textContent visivel)', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(5)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent!.length).toBeGreaterThan(0);
  });
});
