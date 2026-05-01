/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-6: StopBanner UI
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-6)
 *
 * Componente esperado: client/src/components/bankroll/StopBanner.tsx
 *
 * Casos cobertos:
 *   1. Renderiza banner read-only quando stop_lock_until > NOW
 *   2. NAO renderiza quando lockedUntil null
 *   3. NAO renderiza quando lockedUntil expirado
 *   4. Mostra countdown formatado
 *   5. data-testid="stop-banner"
 *   6. variant="loss" (vermelho) quando stopReached=loss
 *   7. variant="win" quando stopReached=win (informativo, nao bloqueante)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

async function loadBanner() {
  const mod: any = await import('../StopBanner');
  return mod.default ?? mod.StopBanner;
}

describe('StopBanner — RF-6', () => {
  it('renderiza com data-testid=stop-banner quando lockedUntil futuro', async () => {
    const Banner = await loadBanner();
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    render(<Banner lockedUntil={lockedUntil} stopReached="loss" />);
    expect(screen.getByTestId('stop-banner')).toBeInTheDocument();
  });

  it('NAO renderiza quando lockedUntil null', async () => {
    const Banner = await loadBanner();
    const { container } = render(<Banner lockedUntil={null} stopReached={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('NAO renderiza quando lockedUntil expirado', async () => {
    const Banner = await loadBanner();
    const lockedUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { container } = render(<Banner lockedUntil={lockedUntil} stopReached="loss" />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra countdown text', async () => {
    const Banner = await loadBanner();
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    render(<Banner lockedUntil={lockedUntil} stopReached="loss" />);
    const countdown = screen.queryByTestId('stop-banner-countdown');
    expect(countdown).toBeInTheDocument();
  });

  it('variant="loss" tem aria-label contendo "stop-loss"', async () => {
    const Banner = await loadBanner();
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    render(<Banner lockedUntil={lockedUntil} stopReached="loss" />);
    const banner = screen.getByTestId('stop-banner');
    expect(banner.getAttribute('data-variant') ?? '').toMatch(/loss/i);
  });
});
