/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-06 (HeaderLogo swappable component).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-06, §3 D18, §3 D-FOUNDER-4
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §2.4
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel — `header-logo`
 *   #14 await import (nao require) para evitar bloqueio com ESM deps
 *
 * Status RED: componente NAO existe ainda em
 * `client/src/components/branding/HeaderLogo.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Asset mocks — Vite alias `@assets` nao configurado em vitest. Stub virtual.
vi.mock('@assets/grindfy-logo-mark.png', () => ({ default: 'grindfy-logo-mark.png' }), {
  virtual: true,
} as any);
vi.mock('@assets/grindfy-logo-full.png', () => ({ default: 'grindfy-logo-full.png' }), {
  virtual: true,
} as any);

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Default — variant='mark' (D18)
// =============================================================================

describe('<HeaderLogo /> — default variant=mark', () => {
  it('renderiza img com src do mark logo quando sem props', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img.src).toMatch(/grindfy-logo-mark\.png/);
  });

  it('aplica className passado via prop', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo className="custom-test-class" />);
    const img = screen.getByTestId('header-logo');
    expect(img.className).toContain('custom-test-class');
  });
});

// =============================================================================
// Variant=full
// =============================================================================

describe('<HeaderLogo variant="full" />', () => {
  it('resolve src para grindfy-logo-full.png', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo variant="full" />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;
    expect(img.src).toMatch(/grindfy-logo-full\.png/);
  });
});

// =============================================================================
// Variant=mark explicito
// =============================================================================

describe('<HeaderLogo variant="mark" />', () => {
  it('resolve src para grindfy-logo-mark.png', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo variant="mark" />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;
    expect(img.src).toMatch(/grindfy-logo-mark\.png/);
  });
});

// =============================================================================
// Prop asset sobrepoe variant — RF-06 AC #4
// =============================================================================

describe('<HeaderLogo asset="..." />', () => {
  it('prop asset sobrepoe variant=full', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo variant="full" asset="/custom-asset.png" />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;
    expect(img.src).toMatch(/custom-asset\.png/);
    expect(img.src).not.toMatch(/grindfy-logo-full/);
  });
});

// =============================================================================
// Fallback onError — RF-06 AC #5
// =============================================================================

describe('<HeaderLogo /> — onError fallback', () => {
  it('quando img falha, renderiza texto "Grindfy" como fallback', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;

    fireEvent.error(img);

    // Apos erro, esperamos fallback texto. Pode ser via state local
    // que troca para um <span>Grindfy</span> ou <h1>Grindfy</h1>.
    expect(screen.getByText('Grindfy')).toBeInTheDocument();
  });
});

// =============================================================================
// Prop alt — acessibilidade
// =============================================================================

describe('<HeaderLogo alt="..." />', () => {
  it('seta atributo alt no img', async () => {
    const { default: HeaderLogo } = await import('../HeaderLogo');
    render(<HeaderLogo alt="Logo Grindfy" />);
    const img = screen.getByTestId('header-logo') as HTMLImageElement;
    expect(img.alt).toBe('Logo Grindfy');
  });
});
