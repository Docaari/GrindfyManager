/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-3 — RF-03: callsite migration verification.
 *
 * Spec: Docs/specs/sprint-ux-qw-3.md (RF-03 callsites)
 * ADR:  Docs/architecture/decisions/175-calendar-days-since-dst-aware.md
 *
 * Apos migracao do callsite local `daysSince` (linhas 40-45) para o util shared
 * `calendarDaysSince`, o badge precisa continuar mostrando o mesmo numero em
 * cenarios "happy" (mesmo fuso, sem DST). Tambem cobrimos:
 *   - mesma saida via util shared (delegacao real, nao reimplementacao).
 *   - render correto quando timeZone do user eh passado como prop opcional.
 *
 * Lessons aplicadas:
 *   #14 await import
 *   #2  data-testid estavel
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const NOW = new Date('2026-05-20T12:00:00.000Z').getTime();

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

async function loadBadge() {
  const mod: any = await import('../WalletStalenessBadge');
  return (mod.default ?? mod.WalletStalenessBadge) as React.ComponentType<any>;
}

describe('RF-03 callsite — WalletStalenessBadge usa calendarDaysSince', () => {
  it('badge "ha 5d" para lastTransactionAt 5 dias atras (paridade pos-migracao)', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(5)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/5 ?d/);
    expect(badge.getAttribute('data-tone')).toBe('info');
  });

  it('badge "ha 10d" para 10 dias atras com tone=warn', async () => {
    const Badge = await loadBadge();
    render(<Badge lastTransactionAt={isoDaysAgo(10)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/10 ?d/);
    expect(badge.getAttribute('data-tone')).toBe('warn');
  });

  it('aceita prop timeZone opcional sem quebrar render', async () => {
    const Badge = await loadBadge();
    render(
      <Badge
        lastTransactionAt={isoDaysAgo(5)}
        timeZone="America/Sao_Paulo"
      />,
    );
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge).toBeInTheDocument();
  });

  it('importa do shared/calendarDaysSince (delega ao util shared)', async () => {
    // Validacao de "delegou ao util": se o util retornar valor fixo (5),
    // o badge deve usa-lo direto (mesmo se o ISO estivesse muito distante).
    // Mockamos o shared dynamic — implementer deve importar de @shared/calendarDaysSince.
    vi.doMock('@shared/calendarDaysSince', () => ({
      calendarDaysSince: () => 5,
    }));
    // Reimporta o badge pos-mock.
    vi.resetModules();
    const mod: any = await import('../WalletStalenessBadge');
    const Badge = (mod.default ?? mod.WalletStalenessBadge) as React.ComponentType<any>;

    // Passamos ISO muito antigo, mas o mock forca = 5 -> tone info.
    render(<Badge lastTransactionAt={isoDaysAgo(365)} />);
    const badge = screen.getByTestId('wallet-staleness-badge');
    expect(badge.textContent).toMatch(/5 ?d/);
    expect(badge.getAttribute('data-tone')).toBe('info');

    vi.doUnmock('@shared/calendarDaysSince');
  });
});
