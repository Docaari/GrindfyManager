/**
 * HomeSettingsGear — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11 (engrenagem) + item 8 (flag).
 *
 * Botao engrenagem no header da Home. Click abre painel inline com 9 toggles
 * de visibilidade + flag performanceFromGrind. Toggle dispara PATCH
 * /api/home/settings com diff (apenas chave alterada). Atualizacao otimista
 * via cache TanStack + invalidacao de /api/home/overview para re-render.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_HOME_LAYOUT_SETTINGS,
  HOME_VISIBILITY_KEYS,
  HOME_SECTION_LABELS,
  type HomeLayoutSettings,
  type HomeSectionKey,
} from '@shared/types/homeSettings';

const QUERY_KEY = ['/api/home/settings'];

export default function HomeSettingsGear(): JSX.Element {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { data } = useQuery<HomeLayoutSettings>({
    queryKey: QUERY_KEY,
    queryFn: () => apiRequest('GET', '/api/home/settings'),
    staleTime: 60_000,
  });

  const settings = data ?? DEFAULT_HOME_LAYOUT_SETTINGS;

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
    },
  });

  // Click-outside fecha o painel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleToggleSection = (key: HomeSectionKey) => {
    const nextValue = !settings.visibility[key];
    mutation.mutate({ visibility: { [key]: nextValue } as any });
  };

  const handleTogglePerfFromGrind = () => {
    mutation.mutate({ performanceFromGrind: !settings.performanceFromGrind });
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="home-settings-gear"
        aria-label="Configurar Home"
        title="Configurar Home"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          data-testid="home-settings-panel"
          role="dialog"
          aria-label="Configuracoes da Home"
          className="absolute right-0 mt-2 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-lg z-50"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Customizar Home</h3>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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

          <div className="mt-4 pt-3 border-t">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                <span className="block">Sessoes Registradas usa /grind</span>
                <span className="block text-xs text-muted-foreground">
                  Off = usa historico (tournaments)
                </span>
              </span>
              <Switch
                data-testid="home-settings-flag-performanceFromGrind"
                checked={settings.performanceFromGrind}
                onCheckedChange={handleTogglePerfFromGrind}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
