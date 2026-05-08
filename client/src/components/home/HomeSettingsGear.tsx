/**
 * HomeSettingsGear — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11 (engrenagem) + item 8 (flag).
 *
 * Botao engrenagem no header da Home. Click abre Popover com 9 toggles
 * de visibilidade + flag performanceFromGrind. Toggle dispara PATCH
 * /api/home/settings com diff (apenas chave alterada). Atualizacao otimista
 * via cache TanStack + invalidacao de caches dependentes para re-render.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DEFAULT_HOME_LAYOUT_SETTINGS,
  HOME_VISIBILITY_KEYS,
  HOME_SECTION_LABELS,
  FOCUS_STATS_PLACEMENTS,
  type HomeLayoutSettings,
  type HomeSectionKey,
  type FocusStatsVisibility,
} from '@shared/types/homeSettings';

// Sprint Estudos-Habito-1 RF-4.2 — labels PT-BR per placement.
const FOCUS_PLACEMENT_LABELS: Record<keyof FocusStatsVisibility, string> = {
  home: 'Home',
  grindLive: 'Grind Live',
  coach: 'Coach',
  estudos: 'Estudos',
  statsAnalyzer: 'Stats Analyzer',
};

const QUERY_KEY = ['/api/home/settings'];

export default function HomeSettingsGear(): JSX.Element {
  const queryClient = useQueryClient();

  const { data } = useQuery<HomeLayoutSettings>({
    queryKey: QUERY_KEY,
    queryFn: () => apiRequest('GET', '/api/home/settings'),
    staleTime: 60_000,
  });

  const settings: HomeLayoutSettings = {
    visibility: { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility, ...(data?.visibility ?? {}) },
    performanceFromGrind:
      typeof data?.performanceFromGrind === 'boolean'
        ? data.performanceFromGrind
        : DEFAULT_HOME_LAYOUT_SETTINGS.performanceFromGrind,
    focusStatsVisibility: {
      ...DEFAULT_HOME_LAYOUT_SETTINGS.focusStatsVisibility,
      ...((data as any)?.focusStatsVisibility ?? {}),
    },
  };

  const mutation = useMutation<HomeLayoutSettings, Error, Partial<HomeLayoutSettings>>({
    mutationFn: (patch) => apiRequest('PATCH', '/api/home/settings', patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<HomeLayoutSettings>(QUERY_KEY);
      const optimistic: HomeLayoutSettings = {
        visibility: { ...settings.visibility, ...(patch.visibility ?? {}) },
        performanceFromGrind:
          typeof patch.performanceFromGrind === 'boolean'
            ? patch.performanceFromGrind
            : settings.performanceFromGrind,
        focusStatsVisibility: {
          ...settings.focusStatsVisibility,
          ...((patch as any).focusStatsVisibility ?? {}),
        },
      };
      queryClient.setQueryData(QUERY_KEY, optimistic);
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      const c = ctx as { prev?: HomeLayoutSettings } | undefined;
      if (c?.prev) queryClient.setQueryData(QUERY_KEY, c.prev);
    },
    onSettled: (next) => {
      if (next) queryClient.setQueryData(QUERY_KEY, next);
      queryClient.invalidateQueries({ queryKey: ['/api/home/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/home/coach-recommendation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/home/grade-today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/home/evolution'] });
      queryClient.invalidateQueries({ queryKey: ['/api/news'] });
    },
  });

  const handleToggleSection = (key: HomeSectionKey) => {
    const nextValue = !settings.visibility[key];
    mutation.mutate({ visibility: { [key]: nextValue } as any });
  };

  const handleTogglePerfFromGrind = () => {
    mutation.mutate({ performanceFromGrind: !settings.performanceFromGrind });
  };

  // Sprint Estudos-Habito-1 RF-4.2: toggle granular per-placement.
  const handleToggleFocusPlacement = (key: keyof FocusStatsVisibility) => {
    const nextValue = !settings.focusStatsVisibility[key];
    mutation.mutate({
      focusStatsVisibility: { [key]: nextValue } as any,
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="home-settings-gear"
          aria-label="Configurar Home"
          title="Configurar Home"
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-testid="home-settings-panel"
        role="dialog"
        aria-label="Configuracoes da Home"
        className="w-80"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Customizar Home</h3>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Toggles ocultam/mostram sessoes da Home. Mudancas salvam automaticamente.
        </p>

        <div className="space-y-2">
          {HOME_VISIBILITY_KEYS.map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="truncate">{HOME_SECTION_LABELS[key]}</span>
              <Switch
                data-testid={`home-settings-toggle-${key}`}
                checked={settings.visibility[key]}
                onCheckedChange={() => handleToggleSection(key)}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t opacity-60">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">
              <span className="block">Sessoes Registradas usa /grind</span>
              <span className="block text-xs text-muted-foreground">
                Off = usa historico (tournaments) — em breve
              </span>
            </span>
            <Switch
              data-testid="home-settings-flag-performanceFromGrind"
              checked={settings.performanceFromGrind}
              onCheckedChange={handleTogglePerfFromGrind}
              disabled
              aria-label="Em desenvolvimento"
            />
          </label>
        </div>

        {/* Sprint Estudos-Habito-1 RF-4.2: visibility per-placement do FocusStatsBar. */}
        <div className="mt-4 pt-3 border-t">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Stats Foco — onde mostrar
          </h4>
          <div className="space-y-2">
            {FOCUS_STATS_PLACEMENTS.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{FOCUS_PLACEMENT_LABELS[key]}</span>
                <Switch
                  data-testid={`home-settings-focus-toggle-${key}`}
                  checked={settings.focusStatsVisibility[key]}
                  onCheckedChange={() => handleToggleFocusPlacement(key)}
                />
              </label>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
