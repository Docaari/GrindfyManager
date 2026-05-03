/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-B1, RF-B3, RF-B5, RF-B6, RF-B8, RF-B9, RF-B10.
 *
 * Spec: Docs/specs/home-reform-3.md §RF-B*
 * ADR : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.1, §2.3
 *
 * Componente `<NewsFeed>` em `client/src/components/home/NewsFeed.tsx`. NAO existe
 * ainda. Substitui `<NewsSlot>` em Home zona 4.
 *
 * Status RED: NewsFeed.tsx nao existe.
 *
 * Lessons aplicadas:
 *   #14 await import(...) ESM compat
 *   #2  data-testid estavel
 *   #15 polyfill localStorage no setup.ts (jsdom default tem nativo)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@/lib/tracker', () => ({ emit: vi.fn() }));

vi.mock('@/components/home/NewsPreferencesDialog', () => ({
  NewsPreferencesDialog: ({ open }: any) =>
    open ? <div data-testid="news-preferences-dialog-open" /> : null,
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

// =============================================================================
// Helpers
// =============================================================================

function mkItem(id: string, source: any = 'tools', overrides: any = {}) {
  return {
    id,
    source,
    platform: overrides.platform ?? 'hand2note',
    title: overrides.title ?? `Title ${id}`,
    summary: overrides.summary ?? `Summary ${id}`,
    url: overrides.url ?? `https://example.com/${id}`,
    publishedAt: overrides.publishedAt ?? '2026-05-03T10:00:00Z',
    fetchedAt: '2026-05-03T11:00:00Z',
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    engagement: overrides.engagement ?? { likes: 10, views: 50, comments: 2 },
    ...overrides,
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
// RF-B1 — NewsFeed unificado + filter chips
// =============================================================================

describe('<NewsFeed /> — RF-B1 wrapper + filter chips', () => {
  it('renderiza wrapper com data-testid="home-news-feed"', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    expect(await screen.findByTestId('home-news-feed')).toBeInTheDocument();
  });

  it('renderiza filter chips para todas categorias na ordem RF-B6', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'sites'), mkItem('c', 'studies'), mkItem('d', 'tournament-results'), mkItem('e', 'gossip')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    expect(screen.getByTestId('news-feed-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-chip-tools')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-chip-sites')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-chip-studies')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-chip-tournament-results')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-chip-gossip')).toBeInTheDocument();
  });

  it('click em chip re-filtra sem refetch (apiRequest chamado 1x)', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'sites')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const callsBeforeClick = mockApiRequest.mock.calls.length;
    fireEvent.click(screen.getByTestId('news-feed-chip-tools'));
    // Sem refetch — apiRequest nao deve ser chamado novamente.
    expect(mockApiRequest.mock.calls.length).toBe(callsBeforeClick);
  });
});

// =============================================================================
// RF-B6 — Ordem das categorias
// =============================================================================

describe('<NewsFeed /> — RF-B6 ordem dos chips', () => {
  it('chips aparecem na ordem: all, tools, sites, studies, tournament-results, gossip', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const expected = [
      'news-feed-chip-all',
      'news-feed-chip-tools',
      'news-feed-chip-sites',
      'news-feed-chip-studies',
      'news-feed-chip-tournament-results',
      'news-feed-chip-gossip',
    ];
    const chipNodes = expected.map((tid) => screen.getByTestId(tid));
    // Confirma que aparecem no DOM order; comparando posicao via compareDocumentPosition.
    for (let i = 0; i < chipNodes.length - 1; i++) {
      const cmp = chipNodes[i].compareDocumentPosition(chipNodes[i + 1]);
      // 4 = DOCUMENT_POSITION_FOLLOWING
      expect(cmp & 4).toBeTruthy();
    }
  });
});

// =============================================================================
// RF-B3 — Hero + compact
// =============================================================================

describe('<NewsFeed /> — RF-B3 hero + compact items', () => {
  it('renderiza hero (item #1) com testid news-feed-hero', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('hero1', 'tools'), mkItem('c1', 'sites'), mkItem('c2', 'studies')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    expect(await screen.findByTestId('news-feed-hero')).toBeInTheDocument();
  });

  it('hero contem h3 com titulo', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('hero1', 'tools', { title: 'Hand2Note 4.5 released' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    expect(hero.querySelector('h3')).not.toBeNull();
    expect(hero.querySelector('h3')?.textContent ?? '').toMatch(/Hand2Note 4.5 released/);
  });

  it('hero contem summary com line-clamp-2 ou similar (2 linhas)', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('hero1', 'tools', { summary: 'Resumo hero do item destaque' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    const html = hero.innerHTML;
    expect(html).toMatch(/line-clamp-2/);
  });

  it('renderiza compact items #2..#10 com testid news-feed-compact-item-{N}', async () => {
    const items = Array.from({ length: 10 }).map((_, i) => mkItem(`it-${i}`, i % 2 === 0 ? 'tools' : 'sites'));
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('news-feed-hero');
    // index 1..9 (rank 2..10)
    for (let i = 2; i <= 10; i++) {
      expect(screen.getByTestId(`news-feed-compact-item-${i}`)).toBeInTheDocument();
    }
  });

  it('compact items mostram ordinal #N em fonte mono', async () => {
    const items = Array.from({ length: 3 }).map((_, i) => mkItem(`it-${i}`, 'tools'));
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const item2 = await screen.findByTestId('news-feed-compact-item-2');
    expect(item2.textContent ?? '').toMatch(/#?2/);
    expect(item2.outerHTML).toMatch(/font-mono/);
  });
});

// =============================================================================
// RF-B5 — Refresh badge unico
// =============================================================================

describe('<NewsFeed /> — RF-B5 refresh badge unico', () => {
  it('renderiza apenas 1 badge de refresh', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'sites')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const badges = screen.queryAllByTestId('news-feed-refresh-badge');
    expect(badges.length).toBe(1);
  });

  it('badge contem "Atualizado seg 12:00 BRT"', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const badge = await screen.findByTestId('news-feed-refresh-badge');
    expect(badge.textContent ?? '').toMatch(/Atualizado.*12:00.*BRT/i);
  });

  it('NAO ha sub-badges em sub-secoes (nao ha sub-secoes)', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'sites'), mkItem('c', 'studies')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    // testids legados de subsecoes da Onda 2 (NewsSlotV2) NAO devem existir.
    expect(screen.queryByTestId('home-news-section-tools')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-news-section-sites')).not.toBeInTheDocument();
  });
});

// =============================================================================
// RF-B8 — ExternalLink icon
// =============================================================================

describe('<NewsFeed /> — RF-B8 ExternalLink icon', () => {
  it('hero renderiza icone ExternalLink com testid', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const hero = await screen.findByTestId('news-feed-hero');
    expect(hero.querySelector('[data-testid="external-link-icon"]')).not.toBeNull();
  });

  it('compact items tambem renderizam icone ExternalLink', async () => {
    const items = Array.from({ length: 3 }).map((_, i) => mkItem(`it-${i}`, 'tools'));
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const item2 = await screen.findByTestId('news-feed-compact-item-2');
    expect(item2.querySelector('[data-testid="external-link-icon"]')).not.toBeNull();
  });
});

// =============================================================================
// RF-B9 — Empty state
// =============================================================================

describe('<NewsFeed /> — RF-B9 empty state', () => {
  it('quando enabled=false renderiza placeholder com botao "Ativar categorias"', async () => {
    await renderFeed({
      enabled: false,
      items: [],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const cta = screen.getByText(/Ativar categorias/i);
    expect(cta).toBeInTheDocument();
  });

  it('click em "Ativar categorias" abre NewsPreferencesDialog', async () => {
    await renderFeed({
      enabled: false,
      items: [],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const cta = screen.getByText(/Ativar categorias/i);
    fireEvent.click(cta);
    expect(screen.getByTestId('news-preferences-dialog-open')).toBeInTheDocument();
  });

  it('quando enabled=true mas items=[] mostra mensagem de empty', async () => {
    await renderFeed({
      enabled: true,
      items: [],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const wrapper = await screen.findByTestId('home-news-feed');
    expect(wrapper.textContent ?? '').toMatch(/sem novidades|sem noticias|sem novas/i);
  });
});

// =============================================================================
// RF-B10 — PlatformChips collapse
// =============================================================================

describe('<NewsFeed /> — RF-B10 PlatformChips collapse', () => {
  it('quando platforms.length <= 3 renderiza todos sem +N', async () => {
    const items = [
      mkItem('a', 'tools', { platform: 'hand2note' }),
      mkItem('b', 'tools', { platform: 'pt4' }),
      mkItem('c', 'tools', { platform: 'hm3' }),
    ];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('quando platforms.length > 3 mostra 3 chips + botao +N', async () => {
    const items = [
      mkItem('a', 'tools', { platform: 'hand2note' }),
      mkItem('b', 'tools', { platform: 'pt4' }),
      mkItem('c', 'tools', { platform: 'hm3' }),
      mkItem('d', 'tools', { platform: 'sharkscope' }),
      mkItem('e', 'tools', { platform: 'gto-wizard' }),
    ];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    // espera +2 chips ocultos (5-3=2)
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });
});
