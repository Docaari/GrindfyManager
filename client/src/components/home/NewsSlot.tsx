/**
 * NewsSlot — ADR-100 (estrutura) + ADR-106 (Grok integration + opt-in granular).
 *
 * Composto por 3 secoes (Mercado / Fofocas / Resultados). Cada secao com:
 *   - Header (titulo + badge cadencia + gear icon)
 *   - Lista top 5 (ou empty state com CTA "Configurar")
 *
 * Gear abre NewsPreferencesDialog. Cadencia "atualizado segunda 12:00 BRT".
 *
 * Compat ADR-100: aceita props enabled/items legacy (renderiza secao market unica
 * pra back-compat dos testes Onda 1). Default Onda 3: fetcha proprias secoes.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { tokens } from "@/lib/ui-tokens";
import type {
  NewsItem,
  NewsResponse,
  NewsSource,
  UserNewsPreferencesResponse,
} from "@shared/types/news";
import { CATEGORY_LABELS } from "@shared/types/news";
import { NewsPreferencesDialog } from "./NewsPreferencesDialog";

const ONBOARDED_KEY = "grindfy.news.onboarded.v1";

interface LegacyProps {
  enabled: boolean;
  items: NewsItem[];
}

// RF-B7: SECTION_LABELS legado (Onda 1) substituido por CATEGORY_LABELS unico
// em shared/types/news.ts. Local helper redireciona pra fonte unica.
const SECTION_LABELS: Record<NewsSource, string> = CATEGORY_LABELS;

const REFRESH_BADGE = "Atualizado segunda 12:00 BRT · Top 5";

function NewsPlaceholder({
  category,
  onConfigure,
}: {
  category: NewsSource;
  onConfigure: () => void;
}) {
  return (
    <div
      data-testid={`home-news-section-${category}-empty`}
      className={`rounded-lg border border-dashed ${tokens.color.neutral.border} bg-card p-4`}
    >
      <SectionHeader category={category} onConfigure={onConfigure} />
      <p className="text-xs text-muted-foreground mt-2">
        Ative essa secao em <button onClick={onConfigure} className="underline">preferencias</button>
        {" "}pra acompanhar.
      </p>
    </div>
  );
}

function SectionHeader({
  category,
  onConfigure,
}: {
  category: NewsSource;
  onConfigure: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <h3 className="text-sm font-semibold">{SECTION_LABELS[category]}</h3>
      <span
        className={`text-[10px] uppercase border ${tokens.color.neutral.border} text-muted-foreground rounded-md px-1.5 py-0.5`}
      >
        {REFRESH_BADGE}
      </span>
      <button
        type="button"
        aria-label={`Configurar ${SECTION_LABELS[category]}`}
        onClick={onConfigure}
        className="ml-auto text-muted-foreground hover:text-foreground"
        data-testid={`home-news-gear-${category}`}
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}

function NewsList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="text-sm border-b border-border last:border-0 pb-2 last:pb-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline font-medium"
          >
            {item.title}
          </a>
          {item.summary && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.summary}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span className="uppercase">{item.platform}</span>
            {item.engagement?.likes != null && <span>· {item.engagement.likes} curtidas</span>}
            {item.engagement?.views != null && <span>· {item.engagement.views} views</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PlatformChips({
  items,
  active,
  onSelect,
  onClear,
}: {
  items: NewsItem[];
  active: string | null;
  onSelect: (platform: string) => void;
  onClear: () => void;
}) {
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.platform);
    return Array.from(set);
  }, [items]);
  if (platforms.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <button
        type="button"
        onClick={onClear}
        className={`text-[10px] uppercase rounded-md px-2 py-0.5 border ${
          active === null
            ? "bg-poker-accent text-black border-poker-accent"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        data-testid="news-chip-all"
      >
        Todas
      </button>
      {platforms.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={`text-[10px] uppercase rounded-md px-2 py-0.5 border ${
            active === p
              ? "bg-poker-accent text-black border-poker-accent"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`news-chip-${p}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function NewsSection({ category }: { category: NewsSource }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const { data } = useQuery<NewsResponse>({
    queryKey: [`/api/news`, { type: category }],
    queryFn: async () => {
      const r = await fetch(`/api/news?type=${category}&limit=5`, {
        credentials: "include",
      });
      if (!r.ok) return { enabled: false, items: [] };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const enabled = data?.enabled ?? false;
  const items = data?.items ?? [];
  const filteredItems = filter ? items.filter((i) => i.platform === filter) : items;

  if (!enabled || items.length === 0) {
    return (
      <>
        <NewsPlaceholder category={category} onConfigure={() => setDialogOpen(true)} />
        <NewsPreferencesDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultCategory={category}
        />
      </>
    );
  }

  return (
    <>
      <div
        data-testid={`home-news-section-${category}`}
        className="rounded-lg border bg-card p-4"
      >
        <SectionHeader category={category} onConfigure={() => setDialogOpen(true)} />
        <PlatformChips
          items={items}
          active={filter}
          onSelect={(p) => setFilter(p)}
          onClear={() => setFilter(null)}
        />
        <NewsList items={filteredItems.slice(0, 5)} />
      </div>
      <NewsPreferencesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultCategory={category}
      />
    </>
  );
}

/**
 * Onboarding wrapper — primeira vez que user visita Home com news ativa,
 * abre dialog automaticamente pra ele escolher plataformas.
 *
 * Heuristica: localStorage flag `grindfy.news.onboarded.v1`. Quando ausente
 * AND user nao tem nenhuma preferencia salva, abre dialog. Marca flag ao
 * fechar.
 */
function useOnboardingDialog(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);
  const { data: prefs } = useQuery<UserNewsPreferencesResponse>({
    queryKey: ["/api/news/preferences"],
    queryFn: async () => {
      const r = await fetch("/api/news/preferences", { credentials: "include" });
      if (!r.ok) throw new Error("falha");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!prefs) return;
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(ONBOARDED_KEY) === "true";
    } catch {
      // ambiente sem localStorage — pula auto-open
      onboarded = true;
    }
    if (onboarded) return;
    const hasAnyPref = (prefs.preferences ?? []).some(
      (p) => p.enabled || Object.values(p.platformToggles ?? {}).some(Boolean),
    );
    if (!hasAnyPref) setOpen(true);
  }, [prefs]);

  function setOpenAndPersist(v: boolean) {
    setOpen(v);
    if (!v) {
      try {
        localStorage.setItem(ONBOARDED_KEY, "true");
      } catch {
        // ignore
      }
    }
  }

  return { open, setOpen: setOpenAndPersist };
}

/**
 * NewsSlot composto. ADR-100 props legacy preservadas: se `enabled` ou `items`
 * vier explicito (testes Onda 1), renderiza modo legado.
 */
export default function NewsSlot(props: Partial<LegacyProps> = {}): JSX.Element {
  // Modo legado (back-compat ADR-100 testes)
  if (typeof props.enabled === "boolean" && Array.isArray(props.items)) {
    if (!props.enabled || props.items.length === 0) {
      return (
        <div
          data-testid="home-news-slot-placeholder"
          className={`rounded-lg border border-dashed ${tokens.color.neutral.border} bg-card p-4 opacity-70`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">Noticias</h3>
            <span
              className={`text-[10px] uppercase border ${tokens.color.neutral.border} text-muted-foreground rounded-md px-1.5 py-0.5`}
            >
              Em breve
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Acompanharemos lancamentos de redes, atualizacoes de software e
            movimentacoes do circuito MTT.
          </p>
        </div>
      );
    }
    return (
      <div data-testid="home-news-slot" className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-2">Noticias</h3>
        <NewsList items={props.items} />
      </div>
    );
  }

  // Modo Onda 3: 3 secoes com gear individual + onboarding first-visit
  return <NewsSlotV2 />;
}

function NewsSlotV2() {
  const onboarding = useOnboardingDialog();
  return (
    <div data-testid="home-news-slot-v2" className="space-y-3">
      <NewsSection category="sites" />
      <NewsSection category="tools" />
      <NewsSection category="studies" />
      <NewsSection category="gossip" />
      <NewsSection category="tournament-results" />
      <NewsPreferencesDialog
        open={onboarding.open}
        onOpenChange={onboarding.setOpen}
        defaultCategory="sites"
      />
    </div>
  );
}

export { NewsSection, NewsPreferencesDialog };
