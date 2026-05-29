/**
 * Sprint Studies-Reform — RF-09 (D7): QuickSearchPalette (Cmd+K)
 *
 * Palette com search local sobre temas + acoes rapidas. Cmd/Ctrl+K abre,
 * Esc fecha, Enter executa. Recent search persiste em localStorage.
 *
 * Lessons:
 *   #1 hooks first (listener em useEffect)
 *   #2 data-testid: quick-search-palette, quick-search-input,
 *      quick-search-result-{id}, quick-search-group-{name}
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

interface ThemeRow {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
}

interface QuickSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QuickAction {
  id: string;
  label: string;
  group: 'acoes';
  run: () => void;
}

const RECENT_KEY = 'grindfy:studies:cmdk_recent';

function pushRecent(item: { type: string; id: string; label: string }) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const next = [item, ...list.filter((x) => x?.id !== item.id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function QuickSearchPalette({ open, onOpenChange }: QuickSearchPaletteProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState<number>(0);

  // Hooks first (lesson #1)
  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      const res = await fetch('/api/study-themes', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    },
    enabled: open,
    staleTime: 60 * 1000,
  });

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Acoes rapidas
  const actions: QuickAction[] = useMemo(
    () => [
      {
        id: 'criar-tema',
        label: 'Criar tema',
        group: 'acoes',
        run: () => {
          // BUG-1 fix: abre o dialog de criacao (antes caia na lista sem form).
          navigate('/estudos/temas/novo');
          onOpenChange(false);
        },
      },
      {
        id: 'ir-stats',
        label: 'Ir para Stats',
        group: 'acoes',
        run: () => {
          navigate('/estudos/stats');
          onOpenChange(false);
        },
      },
      {
        id: 'spots-pendentes',
        label: 'Ver spots pendentes',
        group: 'acoes',
        run: () => {
          navigate('/estudos/spots');
          onOpenChange(false);
        },
      },
      {
        id: 'ver-sessoes',
        label: 'Ver sessões de estudo',
        group: 'acoes',
        run: () => {
          navigate('/estudos/sessoes');
          onOpenChange(false);
        },
      },
      {
        id: 'revisao-espacada',
        label: 'Revisão espaçada (cards)',
        group: 'acoes',
        run: () => {
          navigate('/estudos/reentry');
          onOpenChange(false);
        },
      },
      {
        id: 'recomendacoes',
        label: 'Ver recomendações',
        group: 'acoes',
        run: () => {
          navigate('/estudos/recomendacoes');
          onOpenChange(false);
        },
      },
      {
        id: 'voltar-dashboard',
        label: 'Voltar para Dashboard',
        group: 'acoes',
        run: () => {
          navigate('/estudos/dashboard');
          onOpenChange(false);
        },
      },
    ],
    [navigate, onOpenChange],
  );

  const lcSearch = search.trim().toLowerCase();

  const filteredThemes = useMemo(() => {
    if (!themes || themes.length === 0) return [];
    if (!lcSearch) return themes.slice(0, 5);
    return themes.filter((t) => (t.name || '').toLowerCase().includes(lcSearch));
  }, [themes, lcSearch]);

  const filteredActions = useMemo(() => {
    if (!lcSearch) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(lcSearch));
  }, [actions, lcSearch]);

  const flatItems = useMemo(() => {
    const items: Array<{
      key: string;
      group: 'temas' | 'acoes';
      run: () => void;
      label: string;
      id: string;
    }> = [];
    for (const t of filteredThemes) {
      items.push({
        key: `theme-${t.id}`,
        group: 'temas',
        label: t.name,
        id: t.id,
        run: () => {
          pushRecent({ type: 'theme', id: t.id, label: t.name });
          navigate(`/estudos/temas/${t.id}`);
          onOpenChange(false);
        },
      });
    }
    for (const a of filteredActions) {
      items.push({
        key: `action-${a.id}`,
        group: 'acoes',
        label: a.label,
        id: a.id,
        run: a.run,
      });
    }
    return items;
  }, [filteredThemes, filteredActions, navigate, onOpenChange]);

  // Reset highlight quando muda search
  useEffect(() => {
    setHighlight(0);
  }, [lcSearch]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatItems[highlight] ?? flatItems[0];
      if (target) target.run();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(flatItems.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    }
  }

  if (!open) return null;

  return (
    <div
      data-testid="quick-search-palette"
      role="dialog"
      aria-label="Busca rapida em Estudos"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[90vw] max-w-2xl">
        <div className="p-3 border-b border-gray-800">
          <input
            data-testid="quick-search-input"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar temas e ações... (Esc para fechar)"
            className="w-full bg-transparent text-white placeholder:text-gray-500 outline-none text-sm"
          />
        </div>
        <div className="max-h-96 overflow-auto p-2">
          {flatItems.length === 0 ? (
            <div data-testid="quick-search-empty" className="p-6 text-center text-gray-500 text-sm">
              Nenhum resultado.
            </div>
          ) : (
            <>
              {filteredThemes.length > 0 && (
                <div data-testid="quick-search-group-temas" className="mb-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 px-2 py-1">
                    Temas
                  </div>
                  {filteredThemes.map((t, idx) => {
                    const flatIdx = flatItems.findIndex((i) => i.key === `theme-${t.id}`);
                    const active = flatIdx === highlight;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        data-testid={`quick-search-result-${t.id}`}
                        onClick={() => {
                          pushRecent({ type: 'theme', id: t.id, label: t.name });
                          navigate(`/estudos/temas/${t.id}`);
                          onOpenChange(false);
                        }}
                        onMouseEnter={() => setHighlight(flatIdx)}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${
                          active ? 'bg-gray-800 text-white' : 'text-gray-300'
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredActions.length > 0 && (
                <div data-testid="quick-search-group-acoes">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 px-2 py-1">
                    Acoes
                  </div>
                  {filteredActions.map((a) => {
                    const flatIdx = flatItems.findIndex((i) => i.key === `action-${a.id}`);
                    const active = flatIdx === highlight;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        data-testid={`quick-search-action-${a.id}`}
                        onClick={a.run}
                        onMouseEnter={() => setHighlight(flatIdx)}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${
                          active ? 'bg-gray-800 text-white' : 'text-gray-300'
                        }`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickSearchPalette;
