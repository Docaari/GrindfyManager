/**
 * NewsFeed — Sprint home-reform-5 item 10.
 *
 * Spec : Docs/specs/home-reform-5.md item 10
 * Predecessores: home-reform-3 RF-B (NewsFeed antigo) + ADR-110 (ranking).
 *
 * Mudancas item 10:
 *   - Header renomeado de "Sinal Externo" para "Noticias, Estudos e Atualizacoes".
 *   - 5 chips fixos: Series | Atualizacoes | Estudos | Resultados | Fofocas
 *     (substitui chip "Todas" + 5 sources antigos).
 *   - Layout = carousel ate 5 noticias por aba com setas + dots paginadores.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #11 spec eh fonte de verdade (testids exatos do test-writer)
 *   #13 apiRequest retorna JSON parseado direto
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Check, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { emit } from '@/lib/tracker';
import { CATEGORY_LABELS } from '@shared/types/news';
import type { NewsCategory, NewsItem } from '@shared/types/news';
import { useNewsReadState } from '@/hooks/useNewsReadState';
import { NewsPreferencesDialog } from './NewsPreferencesDialog';
import { getNewsTab, NEWS_TABS, NEWS_TAB_LABELS, type NewsTab } from '@/lib/newsTabs';

interface FeedResponse {
  enabled: boolean;
  items: NewsItem[];
  cachedAt: string;
  nextRefreshAt: string;
}

const MAX_SLIDES = 5;

function fmtRefreshBadge(cachedAt: string, nextRefreshAt: string): string {
  const next = new Date(nextRefreshAt).getTime();
  const now = Date.now();
  if (Number.isNaN(next) || next <= now) {
    return 'Atualizado seg 12:00 BRT - Atualizando em breve';
  }
  const diffMs = next - now;
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
  return `Atualizado seg 12:00 BRT - Proxima em ${days}d ${hours}h`;
}

function ExternalLinkIcon(): JSX.Element {
  return (
    <ExternalLink
      data-testid="external-link-icon"
      className="w-3 h-3 inline ml-1 opacity-50"
      aria-hidden="true"
    />
  );
}

function ReadCheck(): JSX.Element {
  return (
    <span
      data-testid="news-item-read-check"
      className="inline-flex items-center"
      aria-label="Lido"
    >
      <Check className="w-3 h-3" />
    </span>
  );
}

interface SlideProps {
  item: NewsItem;
  isRead: boolean;
  onClick: () => void;
}

function Slide({ item, isRead, onClick }: SlideProps): JSX.Element {
  const opacityCls = isRead ? 'opacity-60' : '';
  const categoryLabel = CATEGORY_LABELS[item.source] ?? item.source;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-testid="news-feed-hero"
      className={`block rounded-lg border bg-card overflow-hidden hover:bg-accent transition-colors ${opacityCls}`}
    >
      {item.thumbnailUrl ? (
        <div className="aspect-video w-full bg-muted overflow-hidden">
          <img
            src={item.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-muted to-muted/40" />
      )}
      <div className="p-4 space-y-1">
        <div className="flex items-start gap-2 justify-between">
          <h3 className="text-base font-semibold line-clamp-2 flex-1">
            {item.title}
            <ExternalLinkIcon />
          </h3>
          <span className="text-[10px] uppercase border border-border text-muted-foreground rounded-md px-1.5 py-0.5 shrink-0">
            {categoryLabel}
          </span>
        </div>
        {item.summary ? (
          <p className="text-sm text-muted-foreground line-clamp-2">{item.summary}</p>
        ) : null}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="uppercase">{item.platform}</span>
          {item.engagement?.likes != null ? <span>· {item.engagement.likes} curtidas</span> : null}
          {item.engagement?.views != null ? <span>· {item.engagement.views} views</span> : null}
          {isRead ? <ReadCheck /> : null}
        </div>
      </div>
    </a>
  );
}

interface TabsBarProps {
  active: NewsTab;
  counts: Record<NewsTab, number>;
  onSelect: (tab: NewsTab) => void;
}

function TabsBar({ active, counts, onSelect }: TabsBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Categorias de noticias">
      {NEWS_TABS.map((tab) => {
        const isActive = active === tab;
        const label = NEWS_TAB_LABELS[tab];
        const count = counts[tab] ?? 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-pressed={isActive}
            onClick={() => onSelect(tab)}
            data-testid={`news-tab-${tab}`}
            className={`text-[10px] uppercase rounded-md px-2 py-0.5 border ${
              isActive
                ? 'bg-poker-accent text-black border-poker-accent'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {count > 0 ? <span className="ml-1 opacity-60">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

interface CompactItemProps {
  item: NewsItem;
  rank: number;
  isRead: boolean;
  onClick: () => void;
}

function CompactItem({ item, rank, isRead, onClick }: CompactItemProps): JSX.Element {
  const opacityCls = isRead ? 'opacity-60' : '';
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      onClick={onClick}
      data-testid={`news-feed-compact-item-${rank}`}
      className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-accent transition-colors ${opacityCls}`}
    >
      <span className="font-mono text-xs text-muted-foreground shrink-0 w-6">
        #{rank}
      </span>
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          className="w-12 h-12 rounded object-cover shrink-0 bg-muted"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-muted shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <h4 className="text-sm font-medium line-clamp-1 flex-1">
            {item.title}
            <ExternalLinkIcon />
          </h4>
          {isRead ? <ReadCheck /> : null}
        </div>
        {item.summary ? (
          <p className="text-[11px] text-muted-foreground line-clamp-1">{item.summary}</p>
        ) : null}
      </div>
    </a>
  );
}

interface CompactListProps {
  items: NewsItem[];
  isRead: (id: string) => boolean;
  onItemClick: (item: NewsItem, position: number) => void;
}

function CompactList({ items, isRead, onItemClick }: CompactListProps): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div data-testid="news-feed-compact-list" className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
          Mais nessa categoria
        </span>
      </div>
      {items.map((item, idx) => (
        <CompactItem
          key={item.id}
          item={item}
          rank={idx + 1}
          isRead={isRead(item.id)}
          onClick={() => onItemClick(item, idx + 1)}
        />
      ))}
    </div>
  );
}

interface CarouselProps {
  items: NewsItem[];
  isRead: (id: string) => boolean;
  onItemClick: (item: NewsItem, position: number) => void;
}

function Carousel({ items, isRead, onItemClick }: CarouselProps): JSX.Element {
  const [active, setActive] = useState(0);

  // Reseta indice apenas quando ids da lista mudam (tab change ou refetch),
  // evitando re-set por slice() que cria nova ref a cada render.
  const idsKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    setActive(0);
  }, [idsKey]);

  const total = items.length;
  const safeActive = Math.min(active, Math.max(total - 1, 0));
  const current = items[safeActive];

  if (!current) {
    return (
      <div data-testid="news-feed-carousel" className="space-y-2">
        <div
          data-testid="news-feed-tab-empty"
          className="rounded-lg border border-dashed border-border bg-card p-6 text-center"
        >
          <p className="text-sm text-muted-foreground">Sem itens nessa categoria por enquanto.</p>
        </div>
      </div>
    );
  }

  const isFirst = safeActive === 0;
  const isLast = safeActive === total - 1;

  return (
    <div data-testid="news-feed-carousel" className="space-y-2">
      <div className="relative">
        <Slide
          key={current.id}
          item={current}
          isRead={isRead(current.id)}
          onClick={() => onItemClick(current, safeActive + 1)}
        />
        {total > 1 ? (
          <>
            <button
              type="button"
              data-testid="news-feed-carousel-prev"
              onClick={() => setActive((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              aria-label="Anterior"
              className="absolute top-1/2 -translate-y-1/2 left-2 rounded-full bg-background/80 border border-border p-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="news-feed-carousel-next"
              onClick={() => setActive((i) => Math.min(total - 1, i + 1))}
              disabled={isLast}
              aria-label="Proximo"
              className="absolute top-1/2 -translate-y-1/2 right-2 rounded-full bg-background/80 border border-border p-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : null}
      </div>
      {total > 0 ? (
        <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Paginacao do carousel">
          {items.map((_, idx) => {
            const isActiveDot = idx === safeActive;
            return (
              <button
                key={idx}
                type="button"
                data-testid={`news-feed-carousel-dot-${idx}`}
                onClick={() => setActive(idx)}
                aria-label={`Ir para ${idx + 1} de ${total}`}
                aria-pressed={isActiveDot}
                className={`h-1.5 rounded-full transition-all ${
                  isActiveDot ? 'w-4 bg-poker-accent' : 'w-1.5 bg-border hover:bg-muted-foreground'
                }`}
              />
            );
          })}
        </div>
      ) : null}
      {total > 1 ? (
        <p className="text-[10px] text-muted-foreground text-center">
          {safeActive + 1} de {total}
        </p>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  enabled: boolean;
  onConfigure: () => void;
}

function FeedEmptyState({ enabled, onConfigure }: EmptyStateProps): JSX.Element {
  return (
    <div
      data-testid="home-news-feed-empty"
      className="rounded-lg border border-dashed border-border bg-card p-6 text-center space-y-3"
    >
      <p className="text-sm text-muted-foreground">
        {enabled
          ? 'Sem novidades por enquanto.'
          : 'Voce ainda nao habilitou nenhuma fonte de noticias.'}
      </p>
      <button
        type="button"
        onClick={onConfigure}
        data-testid="news-feed-empty-cta"
        className="text-sm rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
      >
        Ativar categorias
      </button>
    </div>
  );
}

export default function NewsFeed(): JSX.Element {
  // Hooks first (lesson #1).
  const { data, isLoading } = useQuery<FeedResponse>({
    queryKey: ['/api/news/feed'],
    queryFn: () => apiRequest('GET', '/api/news/feed'),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [userTab, setUserTab] = useState<NewsTab | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isRead, markRead } = useNewsReadState();

  const items = useMemo<NewsItem[]>(() => data?.items ?? [], [data?.items]);
  const enabled = data?.enabled ?? false;

  // Bucketiza por aba (cada item em UMA aba via getNewsTab).
  const buckets = useMemo<Record<NewsTab, NewsItem[]>>(() => {
    const acc: Record<NewsTab, NewsItem[]> = {
      series: [],
      updates: [],
      studies: [],
      results: [],
      gossip: [],
    };
    for (const it of items) {
      acc[getNewsTab(it)].push(it);
    }
    return acc;
  }, [items]);

  const counts = useMemo<Record<NewsTab, number>>(() => {
    return {
      series: buckets.series.length,
      updates: buckets.updates.length,
      studies: buckets.studies.length,
      results: buckets.results.length,
      gossip: buckets.gossip.length,
    };
  }, [buckets]);

  // Default tab = primeira com items (sincrono via useMemo). User pick override.
  const defaultTab = useMemo<NewsTab>(
    () => NEWS_TABS.find((t) => buckets[t].length > 0) ?? 'series',
    [buckets],
  );
  const tab = userTab ?? defaultTab;
  const tabItems = buckets[tab].slice(0, MAX_SLIDES);

  const refreshBadge = data
    ? fmtRefreshBadge(data.cachedAt, data.nextRefreshAt)
    : 'Atualizado seg 12:00 BRT';

  const handleItemClick = (item: NewsItem, position: number) => {
    const wasRead = isRead(item.id);
    markRead(item.id);
    emit('home_news_feed_item_click', {
      id: item.id,
      source: item.source as NewsCategory,
      tab,
      position,
      isRead: wasRead,
    });
  };

  const handleSelectTab = (next: NewsTab) => {
    setUserTab(next);
    emit('home_news_feed_tab_changed', {
      tab: next,
      itemsAfter: buckets[next].length,
    });
  };

  const showFeedEmpty = !isLoading && (!enabled || items.length === 0);

  return (
    <div data-testid="home-news-feed" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">Noticias, Estudos e Atualizacoes</h2>
        <span
          data-testid="news-feed-refresh-badge"
          aria-label="Cron semanal segunda 12:00 BRT (ADR-106)"
          title="Cron semanal segunda 12:00 BRT (ADR-106)"
          className="text-[10px] uppercase border border-border text-muted-foreground rounded-md px-1.5 py-0.5"
        >
          {refreshBadge}
        </span>
        <button
          type="button"
          aria-label="Configurar noticias"
          onClick={() => setDialogOpen(true)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {showFeedEmpty ? (
        <FeedEmptyState enabled={enabled} onConfigure={() => setDialogOpen(true)} />
      ) : (
        <>
          <TabsBar active={tab} counts={counts} onSelect={handleSelectTab} />
          <Carousel
            items={tabItems}
            isRead={isRead}
            onItemClick={handleItemClick}
          />
          <CompactList
            items={buckets[tab]}
            isRead={isRead}
            onItemClick={handleItemClick}
          />
        </>
      )}

      <NewsPreferencesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultCategory="sites"
      />
    </div>
  );
}

export { NewsFeed };
