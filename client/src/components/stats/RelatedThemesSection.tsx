/**
 * Sprint stats-themes-linking-1 — RF-06 RelatedThemesSection.
 *
 * Section "Temas relacionados" no drawer Stats Analyzer.
 * Spec: Docs/specs/stats-themes-linking-1.md §RF-06.
 *
 * Props:
 *   - statId: string
 *
 * Comportamento:
 *   - useQuery em GET /api/stats/:statId/linked-themes
 *   - Loading: skeleton
 *   - Erro: texto inline
 *   - Empty: "Nenhum tema linka esta stat ainda."
 *   - Lista chips clicaveis -> /estudos/:slug
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface ThemeChip {
  id?: string;
  themeId?: string;
  name: string;
  slug: string;
  category: string | null;
}

interface RelatedThemesSectionProps {
  statId: string;
}

export function RelatedThemesSection({ statId }: RelatedThemesSectionProps) {
  const [, setLocation] = useLocation();
  // CRITICAL-2 reviewer: queryKey precisa ser single-element URL para o
  // default getQueryFn (queryClient.ts:149) usar como path. A versao anterior
  // ["/api/stats", statId, "linked-themes"] fazia fetch para "/api/stats" (404).
  const { data, isLoading, error } = useQuery<ThemeChip[]>({
    queryKey: [`/api/stats/${statId}/linked-themes`],
    enabled: !!statId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div data-testid="related-themes-loading" className="space-y-2">
        <h4 className="text-sm font-medium">Temas relacionados</h4>
        <div className="flex gap-2">
          <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-7 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="related-themes-error" className="space-y-2">
        <h4 className="text-sm font-medium">Temas relacionados</h4>
        <p className="text-sm text-muted-foreground">
          Erro ao carregar temas relacionados.
        </p>
      </div>
    );
  }

  const items = Array.isArray(data) ? data : [];

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Temas relacionados</h4>
        <p
          data-testid="related-themes-empty"
          className="text-sm text-muted-foreground"
        >
          Nenhum tema linka esta stat ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Temas relacionados</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => {
          const id = t.id ?? t.themeId ?? t.slug;
          return (
            <a
              key={id}
              href={`/estudos/${t.slug}`}
              data-testid={`related-theme-chip-${id}`}
              onClick={(e) => {
                e.preventDefault();
                setLocation(`/estudos/${t.slug}`);
              }}
              className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted"
            >
              <span>{t.name}</span>
              {t.category && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {t.category}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default RelatedThemesSection;
