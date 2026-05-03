/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-B4 (read-state localStorage).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-B4
 *
 * Click em item NewsFeed -> localStorage.setItem('news.read.{id}', '1').
 * Item lido aplica opacity-60 + checkmark.
 * Estado preserva entre re-renders.
 *
 * Status RED: NewsFeed.tsx + useNewsReadState hook nao existem.
 *
 * Lessons aplicadas:
 *   #15 polyfill localStorage no setup.ts (jsdom default ja tem)
 *   #14 await import(...) ESM compat
 *   #2  data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/tracker', () => ({ emit: vi.fn() }));

vi.mock('@/components/home/NewsPreferencesDialog', () => ({
  NewsPreferencesDialog: () => null,
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

function mkItem(id: string, source: any = 'tools') {
  return {
    id,
    source,
    platform: 'hand2note',
    title: `Title ${id}`,
    summary: 'summary',
    url: `https://example.com/${id}`,
    publishedAt: '2026-05-03T10:00:00Z',
    fetchedAt: '2026-05-03T11:00:00Z',
    thumbnailUrl: null,
    engagement: { likes: 1, views: 5, comments: 0 },
  };
}

function renderFeed(payload: any) {
  mockApiRequest.mockResolvedValue(payload);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return import('@/components/home/NewsFeed').then((mod) => {
    const NewsFeed = (mod as any).default ?? (mod as any).NewsFeed;
    return render(
      <QueryClientProvider client={qc}>
        <NewsFeed />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  mockApiRequest.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});

// =============================================================================
// RF-B4 — Read-state setItem
// =============================================================================

describe('NewsFeed — RF-B4 read-state localStorage', () => {
  it('click em item adiciona news.read.{id} no localStorage', async () => {
    const items = [mkItem('hero1', 'tools'), mkItem('it-2', 'sites')];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    // Click no anchor/link do hero — qualquer click handler valido.
    const link = (hero.querySelector('a') ?? hero) as HTMLElement;
    fireEvent.click(link);
    const stored = localStorage.getItem('news.read.hero1');
    expect(stored).not.toBeNull();
  });

  it('apos click, item renderiza com opacity-60 + checkmark', async () => {
    const items = [mkItem('hero1', 'tools')];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    const link = (hero.querySelector('a') ?? hero) as HTMLElement;
    fireEvent.click(link);
    // Re-find — pode usar mesmo node ou re-render via state.
    const heroAfter = screen.getByTestId('news-feed-hero');
    const html = heroAfter.outerHTML.toLowerCase();
    expect(html).toMatch(/opacity-60/);
    expect(heroAfter.querySelector('[data-testid="news-item-read-check"]')).not.toBeNull();
  });

  it('refresh do componente preserva read-state via localStorage', async () => {
    localStorage.setItem('news.read.it-A', '1');
    const items = [mkItem('it-A', 'tools'), mkItem('it-B', 'sites')];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    const html = hero.outerHTML.toLowerCase();
    expect(html).toMatch(/opacity-60/);
  });

  it('items NAO clicados NAO recebem opacity-60', async () => {
    const items = [mkItem('it-A', 'tools'), mkItem('it-B', 'sites')];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    expect(hero.outerHTML.toLowerCase()).not.toMatch(/opacity-60/);
  });
});
