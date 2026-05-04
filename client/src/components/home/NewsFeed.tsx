/**
 * NewsFeed — Sprint home-reform-3 (Onda 3) Bloco B.
 *
 * Spec : Docs/specs/home-reform-3.md §RF-B1, §RF-B3, §RF-B5, §RF-B6, §RF-B8, §RF-B9, §RF-B10
 * ADR  : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.1, §2.3
 *
 * Substitui NewsSlot legado em Home zona 4. 1 endpoint (`/api/news/feed`) +
 * filter chips client-side + hero #1 + compact #2..#10 + read-state localStorage.
 *
 * Lessons aplicadas:
 *   #1  hooks first (early return so depois de hooks)
 *   #11 spec eh fonte de verdade (testids exatos do test-writer)
 *   #13 apiRequest retorna JSON parseado direto
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Check, Settings } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { emit } from '@/lib/tracker';
import {
  CATEGORY_LABELS,
  NEWS_CATEGORY_PRIORITY,
} from '@shared/types/news';
import type { NewsCategory, NewsItem } from '@shared/types/news';
import { useNewsReadState } from '@/hooks/useNewsReadState';
import { NewsPreferencesDialog } from './NewsPreferencesDialog';

interface FeedResponse {
  enabled: boolean;
  items: NewsItem[];
  cachedAt: string;
  nextRefreshAt: string;
}

type FilterCategory = NewsCategory | 'all';

const CHIP_ORDER: FilterCategory[] = ['all', ...NEWS_CATEGORY_PRIORITY];

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

interface ItemViewProps {
  item: NewsItem;
  isRead: boolean;
  onClick: () => void;
}

function HeroCard({ item, isRead, onClick }: ItemViewProps): JSX.Element {
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
            className="w-full h-full object-cover"
            loading="lazy"
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

interface CompactItemProps extends ItemViewProps {
  rank: number;
}

function CompactItem({ item, rank, isRead, onClick }: CompactItemProps): JSX.Element {
  const opacityCls = isRead ? 'opacity-60' : '';
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-testid={`news-feed-compact-item-${rank}`}
      className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-accent transition-colors ${opacityCls}`}
    >
      <span className="font-mono text-xs text-muted-foreground shrink-0 w-8">
        #{rank}
      </span>
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-12 h-12 rounded object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 bg-muted rounded shrink-0" aria-hidden="true" />
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
          <p className="text-xs text-muted-foreground line-clamp-1">{item.summary}</p>
        ) : null}
      </div>
    </a>
  );
}

interface PlatformChipsProps {
  platforms: string[];
}

interface PlatformChipsClickableProps {
  platforms: string[];
  selected: string | null;
  onSelect: (p: string | null) => void;
}

function PlatformChipsCollapsible({
  platforms,
  selected,
  onSelect,
}: PlatformChipsClickableProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (platforms.length === 0) return null;
  const visible = expanded ? platforms : platforms.slice(0, 6);
  const hidden = platforms.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visible.map((p) => {
        const isActive = selected === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(isActive ? null : p)}
            data-testid={`news-feed-platform-chip-${p}`}
            className={`text-[10px] uppercase rounded-md px-2 py-0.5 border transition-colors ${
              isActive
                ? "bg-poker-accent text-black border-poker-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        );
      })}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] uppercase rounded-md px-2 py-0.5 border border-border text-muted-foreground hover:text-foreground"
        >
          +{hidden}
        </button>
      ) : null}
      {expanded && platforms.length > 6 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] uppercase rounded-md px-2 py-0.5 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Recolher plataformas"
        >
          -
        </button>
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

interface CategoryEmptyProps {
  category: NewsCategory;
  onResetFilter: () => void;
}

function CategoryEmptyState({ category, onResetFilter }: CategoryEmptyProps): JSX.Element {
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">
        Sem itens em <strong>{label}</strong> agora.
      </p>
      <button
        type="button"
        onClick={onResetFilter}
        className="text-sm rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
      >
        Ver todas
      </button>
    </div>
  );
}

interface FilterChipsProps {
  active: FilterCategory;
  onSelect: (cat: FilterCategory) => void;
}

function FilterChips({ active, onSelect }: FilterChipsProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {CHIP_ORDER.map((cat) => {
        const isAll = cat === 'all';
        const label = isAll ? 'Todas' : CATEGORY_LABELS[cat as NewsCategory] ?? cat;
        const isActive = active === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            data-testid={`news-feed-chip-${cat}`}
            className={`text-[10px] uppercase rounded-md px-2 py-0.5 border ${
              isActive
                ? 'bg-poker-accent text-black border-poker-accent'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
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

  const [filter, setFilter] = useState<FilterCategory>('all');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isRead, markRead } = useNewsReadState();

  const items = useMemo<NewsItem[]>(() => data?.items ?? [], [data?.items]);
  const enabled = data?.enabled ?? false;

  // Filter por categoria primeiro; reset platform filter quando categoria muda.
  const itemsByCategory = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.source === filter);
  }, [items, filter]);

  // Aplica filtro de plataforma sobre items ja filtrados por categoria.
  const filtered = useMemo(() => {
    if (!platformFilter) return itemsByCategory;
    return itemsByCategory.filter((it) => it.platform === platformFilter);
  }, [itemsByCategory, platformFilter]);

  // Plataformas disponiveis derivam dos items DA categoria atual (ou todos).
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const it of itemsByCategory) set.add(it.platform);
    return Array.from(set);
  }, [itemsByCategory]);

  const refreshBadge = data
    ? fmtRefreshBadge(data.cachedAt, data.nextRefreshAt)
    : 'Atualizado seg 12:00 BRT';

  const handleItemClick = (id: string, position: number, source: NewsCategory) => {
    const wasRead = isRead(id);
    markRead(id);
    emit('home_news_feed_item_click', {
      id,
      source,
      position,
      isRead: wasRead,
    });
  };

  const handleSelectFilter = (cat: FilterCategory) => {
    setFilter(cat);
    setPlatformFilter(null); // Reset platform ao mudar categoria.
    if (cat !== 'all') {
      emit('home_news_feed_filter_applied', {
        filter: cat,
        itemsAfterFilter: items.filter((i) => i.source === cat).length,
      });
    }
  };

  const showFeedEmpty = !isLoading && (!enabled || items.length === 0);

  return (
    <div data-testid="home-news-feed" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">Sinal Externo</h2>
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
          <FilterChips active={filter} onSelect={handleSelectFilter} />
          {platforms.length > 0 ? (
            <PlatformChipsCollapsible
              platforms={platforms}
              selected={platformFilter}
              onSelect={setPlatformFilter}
            />
          ) : null}

          {filtered.length === 0 && filter !== 'all' ? (
            <CategoryEmptyState
              category={filter as NewsCategory}
              onResetFilter={() => setFilter('all')}
            />
          ) : (
            <>
              {filtered[0] ? (
                <HeroCard
                  item={filtered[0]}
                  isRead={isRead(filtered[0].id)}
                  onClick={() => handleItemClick(filtered[0].id, 1, filtered[0].source)}
                />
              ) : null}
              {filtered.length > 1 ? (
                <div className="rounded-lg border bg-card overflow-hidden">
                  {filtered.slice(1, 20).map((it, idx) => {
                    const rank = idx + 2;
                    return (
                      <CompactItem
                        key={it.id}
                        item={it}
                        rank={rank}
                        isRead={isRead(it.id)}
                        onClick={() => handleItemClick(it.id, rank, it.source)}
                      />
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
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
