/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-30 (B8 Variance Check PrimeDope).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B8, §5 RF-30
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/VarianceCard.tsx`.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 *   #2   data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockEmit.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures (shape RF-30 / spec §3 B8)
// ---------------------------------------------------------------------------
const baseVariance = {
  sessionsCount: 25,
  actualUsd: 800,
  expectedUsd: 200,
  expectedSource: 'primedope-cache' as const,
  deviationUsd: 600,
  sigmaUsd: 350,
  sigmaMultiple: 1.71,
  status: 'lucky' as const,
  period: '90d' as const,
};

describe('<VarianceCard /> — gating por minimo de sessoes', () => {
  it('com data=null bloco oculto (componente NAO renderiza nada)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    const { container } = render(<VarianceCard data={null} />);
    // Componente nao deve produzir o testid principal
    expect(screen.queryByTestId('home-variance-card')).toBeNull();
    // E nao deve ocupar espaco com placeholder
    expect(container.querySelector('[data-testid="home-variance-card"]')).toBeNull();
  });

  it('com sessionsCount < 20 trata como null (bloco oculto)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    const insufficient = { ...baseVariance, sessionsCount: 19 };
    render(<VarianceCard data={insufficient as any} />);
    expect(screen.queryByTestId('home-variance-card')).toBeNull();
  });
});

describe('<VarianceCard /> — render quando variance presente', () => {
  it('renderiza container com data-testid="home-variance-card"', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={baseVariance} />);
    expect(screen.getByTestId('home-variance-card')).toBeInTheDocument();
  });

  it('mostra status "lucky" + actualUsd + expectedUsd + sigmaMultiple', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={baseVariance} />);
    const card = screen.getByTestId('home-variance-card');
    // status visivel (texto ou data-status)
    expect(card.getAttribute('data-status') ?? card.textContent ?? '').toMatch(/lucky|sortudo|positiv/i);
    // valores presentes
    expect(card.textContent).toMatch(/800/);
    expect(card.textContent).toMatch(/200/);
    expect(card.textContent).toMatch(/1\.7/);
  });

  it('status "normal" mostra cor neutra (sem badge lucky/unlucky)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    const normalData = { ...baseVariance, status: 'normal' as const };
    render(<VarianceCard data={normalData} />);
    const card = screen.getByTestId('home-variance-card');
    const status = card.getAttribute('data-status') ?? '';
    expect(status === 'normal' || /normal/i.test(card.textContent ?? '')).toBe(true);
  });

  it('status "unlucky" sinaliza caution (cor ambar/rose)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    const unluckyData = { ...baseVariance, status: 'unlucky' as const, sigmaMultiple: -2.1 };
    render(<VarianceCard data={unluckyData} />);
    const card = screen.getByTestId('home-variance-card');
    const status = card.getAttribute('data-status') ?? '';
    expect(status === 'unlucky' || /unlucky|azar|caution/i.test(card.textContent ?? '')).toBe(true);
  });
});

describe('<VarianceCard /> — tracker', () => {
  it('emit("home_variance_view", { status }) apenas quando renderizado', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={baseVariance} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_variance_view');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ status: 'lucky' });
  });

  it('NAO emit view quando data=null (bloco oculto)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={null} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_variance_view');
    expect(found).toBeUndefined();
  });
});

// =============================================================================
// Sprint Variance-1 — RF-04: empty-state quando expectedSource='fallback-zero'
//
// Spec : Docs/specs/sprint-variance-1.md §RF-04
// ADR  : 162 §2.4 (empty-state esconde numeros sem baseline real)
//
// Quando user tem >=20 sessoes mas nunca rodou simulacao PrimeDope, o storage
// devolve `expectedSource: 'fallback-zero'`. Nesse caso VarianceCard renderiza
// um mini-card com CTA para o simulador (NAO renderiza numeros).
//
// Telemetria nova: `home_variance_fallback_view` (1x por mount).
// =============================================================================

const fallbackVariance = {
  sessionsCount: 30,
  actualUsd: 250,
  expectedUsd: 0,
  expectedSource: 'fallback-zero' as const,
  deviationUsd: 250,
  sigmaUsd: 180,
  sigmaMultiple: 1.4,
  status: 'lucky' as const,
  period: '90d' as const,
};

describe('<VarianceCard /> — RF-04 empty-state (fallback-zero)', () => {
  it('expectedSource="fallback-zero" + sessionsCount=30 -> mini-card empty-state', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={fallbackVariance as any} />);
    // Empty-state tem data-testid proprio.
    expect(screen.getByTestId('home-variance-empty-card')).toBeInTheDocument();
    // Titulo descritivo.
    expect(screen.getByTestId('home-variance-empty-card').textContent ?? '').toMatch(
      /simule|simule sua grade|sem simulac/i,
    );
  });

  it('CTA "Abrir simulador" aponta para /coach-ai?tab=variance', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={fallbackVariance as any} />);
    const card = screen.getByTestId('home-variance-empty-card');
    // CTA pode ser <a> ou <Link>. Procuramos pelo href.
    const anchor = card.querySelector('a[href]') as HTMLAnchorElement | null;
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href') ?? '').toMatch(/\/coach-ai\?tab=variance/);
  });

  it('NAO renderiza numeros actualUsd/expectedUsd/sigmaMultiple no empty-state', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={fallbackVariance as any} />);
    const card = screen.getByTestId('home-variance-empty-card');
    const text = card.textContent ?? '';
    // expected = 0 nao tem ruido visivel. Mas actualUsd=250 nao deve aparecer.
    expect(text).not.toMatch(/\$\s*250\b/);
    expect(text).not.toMatch(/1\.4σ/);
  });

  it('emit("home_variance_fallback_view") na primeira renderizacao do empty-state', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={fallbackVariance as any} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_variance_fallback_view');
    expect(found).toBeDefined();
  });

  it('expectedSource="primedope-cache" -> card "real" + emit home_variance_view (regressao)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    render(<VarianceCard data={baseVariance as any} />);
    // Card real (NAO empty-state).
    expect(screen.getByTestId('home-variance-card')).toBeInTheDocument();
    expect(screen.queryByTestId('home-variance-empty-card')).toBeNull();
    // Tracker correto.
    const view = mockEmit.mock.calls.find((c) => c[0] === 'home_variance_view');
    expect(view).toBeDefined();
    const fallback = mockEmit.mock.calls.find((c) => c[0] === 'home_variance_fallback_view');
    expect(fallback).toBeUndefined();
  });

  it('data=null -> NAO renderiza nem card real nem empty-state (regressao gate <20)', async () => {
    const { default: VarianceCard } = await import('../VarianceCard');
    const { container } = render(<VarianceCard data={null} />);
    expect(screen.queryByTestId('home-variance-card')).toBeNull();
    expect(screen.queryByTestId('home-variance-empty-card')).toBeNull();
    // Nem placeholder nem texto.
    expect(container.textContent ?? '').toBe('');
  });
});
