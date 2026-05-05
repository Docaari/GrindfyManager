/**
 * Test-Writer (Modo TDD).
 *
 * Sprint home-reform-5 item 10 — NewsFeed refactor.
 * Spec: Docs/specs/home-reform-5.md item 10.
 *
 * Cobre:
 *   - Rename header "Sinal Externo" -> "Noticias, Estudos e Atualizacoes"
 *   - 5 chips fixed: Series | Atualizacoes | Estudos | Resultados | Fofocas
 *   - Default tab eh primeira aba com items
 *   - Carousel com setas left/right + dots paginadores (max 5 items)
 *   - Click setas/dots muda slide ativo
 *   - Click chip muda tab e reseta carousel
 *
 * Lessons aplicadas:
 *   #14 await import(...) ESM compat
 *   #2  data-testid estavel
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
    tags: overrides.tags ?? [],
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
// Header rename
// =============================================================================

describe('<NewsFeed /> — header rename', () => {
  it('renderiza wrapper com data-testid="home-news-feed"', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    expect(await screen.findByTestId('home-news-feed')).toBeInTheDocument();
  });

  it('h2 mostra "Noticias, Estudos e Atualizacoes" (rename de "Sinal Externo")', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const wrapper = await screen.findByTestId('home-news-feed');
    const h2 = wrapper.querySelector('h2');
    expect(h2?.textContent ?? '').toMatch(/Noticias, Estudos e Atualizacoes/i);
  });
});

// =============================================================================
// 5 chips fixed
// =============================================================================

describe('<NewsFeed /> — 5 abas fixas', () => {
  it('renderiza chips Series | Atualizacoes | Estudos | Resultados | Fofocas', async () => {
    await renderFeed({
      enabled: true,
      items: [
        mkItem('a', 'tools'),
        mkItem('b', 'sites'),
        mkItem('c', 'studies'),
        mkItem('d', 'tournament-results', { title: 'Joao crava torneio' }),
        mkItem('e', 'gossip'),
        mkItem('f', 'sites', { title: 'SCOOP 2026 schedule' }),
      ],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    expect(screen.getByTestId('news-tab-series')).toBeInTheDocument();
    expect(screen.getByTestId('news-tab-updates')).toBeInTheDocument();
    expect(screen.getByTestId('news-tab-studies')).toBeInTheDocument();
    expect(screen.getByTestId('news-tab-results')).toBeInTheDocument();
    expect(screen.getByTestId('news-tab-gossip')).toBeInTheDocument();
  });

  it('chips aparecem na ordem fixa', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const expected = ['news-tab-series', 'news-tab-updates', 'news-tab-studies', 'news-tab-results', 'news-tab-gossip'];
    const nodes = expected.map((tid) => screen.getByTestId(tid));
    for (let i = 0; i < nodes.length - 1; i++) {
      const cmp = nodes[i].compareDocumentPosition(nodes[i + 1]);
      expect(cmp & 4).toBeTruthy();
    }
  });

  it('NAO renderiza chip "Todas" do layout antigo', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    expect(screen.queryByTestId('news-feed-chip-all')).not.toBeInTheDocument();
  });

  it('default tab eh primeira aba com items (Updates quando tools/sites tem dados e series vazia)', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools', { title: 'Hand2Note 4.5 release' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const updatesTab = screen.getByTestId('news-tab-updates');
    expect(updatesTab.getAttribute('aria-pressed')).toBe('true');
  });

  it('click em chip troca aba ativa', async () => {
    await renderFeed({
      enabled: true,
      items: [
        mkItem('a', 'tools'),
        mkItem('b', 'gossip', { title: 'Polemica entre players' }),
      ],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    fireEvent.click(screen.getByTestId('news-tab-gossip'));
    expect(screen.getByTestId('news-tab-gossip').getAttribute('aria-pressed')).toBe('true');
  });

  it('click em chip nao dispara refetch', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'gossip', { title: 'Polemica' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const callsBefore = mockApiRequest.mock.calls.length;
    fireEvent.click(screen.getByTestId('news-tab-gossip'));
    expect(mockApiRequest.mock.calls.length).toBe(callsBefore);
  });
});

// =============================================================================
// Carousel
// =============================================================================

describe('<NewsFeed /> — carousel slide + setas + dots', () => {
  it('renderiza container do carousel com testid', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    expect(await screen.findByTestId('news-feed-carousel')).toBeInTheDocument();
  });

  it('slide ativo aparece como news-feed-hero (compat com read-state)', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('hero1', 'tools', { title: 'Hand2Note 4.5 released' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const slide = await screen.findByTestId('news-feed-hero');
    expect(slide.textContent ?? '').toMatch(/Hand2Note 4.5 released/);
  });

  it('renderiza max 5 dots (ate 5 noticias por aba)', async () => {
    const items = Array.from({ length: 8 }).map((_, i) =>
      mkItem(`it-${i}`, 'tools', { title: `Update #${i}` }),
    );
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const dots = screen.queryAllByTestId(/^news-feed-carousel-dot-\d+$/);
    expect(dots.length).toBe(5);
  });

  it('renderiza dots conforme quantidade de items quando ha menos de 5', async () => {
    const items = [mkItem('a', 'tools'), mkItem('b', 'tools'), mkItem('c', 'tools')];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const dots = screen.queryAllByTestId(/^news-feed-carousel-dot-\d+$/);
    expect(dots.length).toBe(3);
  });

  it('botoes setas left + right tem testid', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    expect(screen.getByTestId('news-feed-carousel-prev')).toBeInTheDocument();
    expect(screen.getByTestId('news-feed-carousel-next')).toBeInTheDocument();
  });

  it('click seta direita avanca slide ativo', async () => {
    await renderFeed({
      enabled: true,
      items: [
        mkItem('a', 'tools', { title: 'First Update' }),
        mkItem('b', 'tools', { title: 'Second Update' }),
      ],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    const slide = await screen.findByTestId('news-feed-hero');
    expect(slide.textContent ?? '').toMatch(/First Update/);
    fireEvent.click(screen.getByTestId('news-feed-carousel-next'));
    const slideAfter = screen.getByTestId('news-feed-hero');
    expect(slideAfter.textContent ?? '').toMatch(/Second Update/);
  });

  it('click dot index posiciona slide ativo direto', async () => {
    const items = [
      mkItem('a', 'tools', { title: 'Slide A' }),
      mkItem('b', 'tools', { title: 'Slide B' }),
      mkItem('c', 'tools', { title: 'Slide C' }),
    ];
    await renderFeed({
      enabled: true,
      items,
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    fireEvent.click(screen.getByTestId('news-feed-carousel-dot-2'));
    const slide = screen.getByTestId('news-feed-hero');
    expect(slide.textContent ?? '').toMatch(/Slide C/);
  });

  it('seta prev fica desabilitada no primeiro slide', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const prev = screen.getByTestId('news-feed-carousel-prev') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('seta next fica desabilitada no ultimo slide', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools'), mkItem('b', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const next = screen.getByTestId('news-feed-carousel-next') as HTMLButtonElement;
    fireEvent.click(next);
    expect(next.disabled).toBe(true);
  });

  it('mudar de aba reseta slide ativo para 0 e atualiza dots', async () => {
    await renderFeed({
      enabled: true,
      items: [
        mkItem('a', 'tools', { title: 'Tools 1' }),
        mkItem('b', 'tools', { title: 'Tools 2' }),
        mkItem('c', 'gossip', { title: 'Polemica X' }),
      ],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    fireEvent.click(screen.getByTestId('news-feed-carousel-next'));
    const slide1 = screen.getByTestId('news-feed-hero');
    expect(slide1.textContent ?? '').toMatch(/Tools 2/);
    fireEvent.click(screen.getByTestId('news-tab-gossip'));
    const slide2 = screen.getByTestId('news-feed-hero');
    expect(slide2.textContent ?? '').toMatch(/Polemica X/);
    const dots = screen.queryAllByTestId(/^news-feed-carousel-dot-\d+$/);
    expect(dots.length).toBe(1);
  });
});

// =============================================================================
// Empty states preservados
// =============================================================================

describe('<NewsFeed /> — empty states', () => {
  it('quando enabled=false renderiza CTA "Ativar categorias"', async () => {
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

  it('aba ativa sem items mostra empty state da aba', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools', { title: 'Update' })],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    fireEvent.click(screen.getByTestId('news-tab-gossip'));
    expect(screen.getByTestId('news-feed-tab-empty')).toBeInTheDocument();
  });
});

// =============================================================================
// Refresh badge preservado
// =============================================================================

describe('<NewsFeed /> — refresh badge', () => {
  it('renderiza apenas 1 badge', async () => {
    await renderFeed({
      enabled: true,
      items: [mkItem('a', 'tools')],
      cachedAt: '2026-05-03T12:00:00Z',
      nextRefreshAt: '2026-05-04T12:00:00Z',
    });
    await screen.findByTestId('home-news-feed');
    const badges = screen.queryAllByTestId('news-feed-refresh-badge');
    expect(badges.length).toBe(1);
  });
});
