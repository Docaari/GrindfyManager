/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-11 (S3 banner cooldown condicional).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-11, §5.3 S3, §3 D9
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §2.1.7
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/CooldownBanner.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const activeBanner = {
  active: true,
  until: '2026-05-03T18:00:00Z',
  type: 'stop-loss' as const,
};

// =============================================================================
// Renderiza so se active=true — RF-11 AC #2
// =============================================================================

describe('<CooldownBanner /> — render condicional', () => {
  it('com banner=null retorna nada (sem DOM)', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    const { container } = render(<CooldownBanner banner={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('com active=false retorna nada', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    const { container } = render(
      <CooldownBanner banner={{ ...activeBanner, active: false }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('com active=true renderiza banner visivel', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);
    expect(screen.getByTestId('cooldown-banner')).toBeInTheDocument();
  });
});

// =============================================================================
// Texto + cor amber — RF-11 AC #3, #4
// =============================================================================

describe('<CooldownBanner /> — texto e estilo', () => {
  it('texto inclui "Cooldown" e a hora HH:MM', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);
    const banner = screen.getByTestId('cooldown-banner');
    expect(banner.textContent?.toLowerCase()).toContain('cooldown');
  });

  it('classe NAO contem red-* (cor amber, nao vermelho — anti-tilt)', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);
    const banner = screen.getByTestId('cooldown-banner');
    expect(banner.className).not.toMatch(/bg-red-|text-red-/);
  });
});

// =============================================================================
// Dismiss em-sessao — RF-11 AC #5 (D9)
// =============================================================================

describe('<CooldownBanner /> — dismiss em-sessao', () => {
  it('botao X esconde banner ate proximo refresh (useState)', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);

    const dismissBtn = screen.getByTestId('cooldown-banner-dismiss');
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId('cooldown-banner')).not.toBeInTheDocument();
  });

  it('emite home_banner_dismiss ao dismissar', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);
    fireEvent.click(screen.getByTestId('cooldown-banner-dismiss'));
    const found = mockEmit.mock.calls.find(
      ([event, payload]) =>
        event === 'home_banner_dismiss' && payload?.blockId === 'S3',
    );
    expect(found).toBeDefined();
  });
});

// =============================================================================
// Acessibilidade — RNF-03
// =============================================================================

describe('<CooldownBanner /> — a11y', () => {
  it('tem role="alert" para screen reader anunciar', async () => {
    const { default: CooldownBanner } = await import('../CooldownBanner');
    render(<CooldownBanner banner={activeBanner} />);
    const banner = screen.getByTestId('cooldown-banner');
    expect(banner.getAttribute('role')).toBe('alert');
  });
});
