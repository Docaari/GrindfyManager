/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-05 + RF-19 (NewsSlot — null em Onda 1).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-05, §RF-19, §3 D17, §5.13 S15
 * ADR  : Docs/architecture/decisions/100-news-feed-deferred-integration.md §2 (D)
 *
 * Status RED: componente NAO existe ainda em
 * `client/src/components/home/NewsSlot.tsx`.
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
// enabled=false — sempre null (D17, RF-05 AC #2)
// =============================================================================

describe('<NewsSlot enabled={false} /> — Onda 1 invisivel', () => {
  it('com enabled=false, renderiza null (DOM nao tem testid)', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    const { container } = render(<NewsSlot enabled={false} items={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('home-news-slot')).not.toBeInTheDocument();
  });

  it('com enabled=false e items nao-vazio, ainda renderiza null', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    const { container } = render(<NewsSlot enabled={false} items={[stubItem]} />);
    expect(container.firstChild).toBeNull();
  });
});

// =============================================================================
// enabled=true && items=[] — null (RF-05 AC #3)
// =============================================================================

describe('<NewsSlot enabled={true} items={[]} /> — Onda 1 sem placeholder', () => {
  it('com enabled=true e items=[], renderiza null (sem "sem noticias")', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    const { container } = render(<NewsSlot enabled={true} items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// =============================================================================
// enabled=true && items.length > 0 — Onda 3 contract preservado
// =============================================================================

describe('<NewsSlot enabled={true} items={[item]} /> — Onda 3 contract', () => {
  it('com items > 0 renderiza container visivel (data-testid="home-news-slot")', async () => {
    const { default: NewsSlot } = await import('../NewsSlot');
    render(<NewsSlot enabled={true} items={[stubItem]} />);
    const slot = screen.queryByTestId('home-news-slot');
    expect(slot).toBeInTheDocument();
  });
});
