/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-24 (B3 NewsSlot visivel "em breve").
 *
 * Spec : Docs/specs/home-reform-1-5.md RF-24, D1.5-6, D-FOUNDER-5
 *
 * MUDANCA Onda 1.5: NewsSlot que retornava null em Onda 1 agora retorna
 * placeholder visivel quando enabled=false OU items.length=0.
 *
 * Status RED: comportamento atual de NewsSlot eh retornar null. Implementer
 * deve atualizar NewsSlot.tsx para render placeholder.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const stubItem = {
  id: 'n1',
  source: 'poker-software' as const,
  title: 'Stars 1.2.3',
  summary: 'New version released.',
  url: 'https://x.com',
  publishedAt: '2026-05-01T10:00:00Z',
  fetchedAt: '2026-05-01T11:00:00Z',
};

// =============================================================================
// enabled=false — placeholder visivel "Em breve" (D1.5-6 + D-FOUNDER-5)
// =============================================================================

describe('<NewsSlot enabled={false} /> — placeholder visivel (Onda 1.5)', () => {
  it('com enabled=false renderiza placeholder com data-testid="home-news-slot-placeholder"', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={false} items={[]} />);
    expect(screen.getByTestId('home-news-slot-placeholder')).toBeInTheDocument();
  });

  it('placeholder mostra header "Noticias do mercado"', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={false} items={[]} />);
    expect(screen.getByText(/Noticias do mercado/i)).toBeInTheDocument();
  });

  it('placeholder mostra badge "Em breve"', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={false} items={[]} />);
    expect(screen.getByText(/Em breve/i)).toBeInTheDocument();
  });

  it('placeholder mostra body texto descritivo (PT4 / HM3 / SharkScope)', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={false} items={[]} />);
    expect(screen.getByText(/PT4|HM3|SharkScope/i)).toBeInTheDocument();
  });
});

// =============================================================================
// enabled=true && items=[] — mesmo placeholder visivel (D1.5-6)
// =============================================================================

describe('<NewsSlot enabled={true} items={[]} /> — placeholder visivel', () => {
  it('com enabled=true e items=[] renderiza mesmo placeholder', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={true} items={[]} />);
    expect(screen.getByTestId('home-news-slot-placeholder')).toBeInTheDocument();
  });
});

// =============================================================================
// enabled=true && items.length > 0 — Onda 3 path preservado
// =============================================================================

describe('<NewsSlot enabled={true} items={[item]} /> — Onda 3 contract', () => {
  it('com items > 0 renderiza container real (data-testid="home-news-slot")', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={true} items={[stubItem]} />);
    expect(screen.getByTestId('home-news-slot')).toBeInTheDocument();
  });

  it('com items > 0 NAO mostra placeholder', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={true} items={[stubItem]} />);
    expect(screen.queryByTestId('home-news-slot-placeholder')).not.toBeInTheDocument();
  });
});
