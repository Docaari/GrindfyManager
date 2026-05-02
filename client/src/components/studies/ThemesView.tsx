/**
 * Sprint Studies-Reform — RF-03: Themes view + filtro fromStats
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: themes-grid, theme-card-{id}, theme-filter-fromStats
 *  #11 sem actions decorativas
 */

import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { parseSearch } from '@/lib/url';
import { EmptyState } from './EmptyState';

interface ThemeRow {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  progress?: number;
  attacksLeakType?: string | null;
  attacksLeakSeverity?: number | null;
  lastVisitedAt?: string | null;
  createdAt?: string | null;
}

interface LeakDelta {
  [themeId: string]: number;
}

const SUGGESTED_THRESHOLD = -5;

export function ThemesView() {
  const [location, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');

  const params = useMemo(() => parseSearch(location), [location]);
  const fromStats = params.get('fromStats') === 'leaks';

  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      const res = await fetch('/api/study-themes', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    },
  });

  const { data: leakDelta = {} } = useQuery<LeakDelta>({
    queryKey: ['/api/dashboard/leaks/delta'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/dashboard/leaks/delta', { credentials: 'include' });
        if (!res.ok) return {};
        return await res.json();
      } catch {
        return {};
      }
    },
  });

  const filtered = useMemo(() => {
    let arr = themes;
    if (fromStats) {
      arr = arr
        .filter((t) => Boolean(t.attacksLeakType))
        .sort((a, b) => (b.attacksLeakSeverity ?? 0) - (a.attacksLeakSeverity ?? 0));
    }
    const lc = searchTerm.trim().toLowerCase();
    if (lc) {
      arr = arr.filter((t) => (t.name || '').toLowerCase().includes(lc));
    }
    return arr;
  }, [themes, fromStats, searchTerm]);

  function clearFilter() {
    navigate('/estudos/temas');
  }

  return (
    <div data-testid="studies-view-temas" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Temas</h2>
      </div>

      {fromStats && (
        <div
          data-testid="themes-filter-badge"
          className="mb-4 flex items-center gap-2 rounded border border-yellow-600/40 bg-yellow-900/30 px-3 py-2 text-sm text-yellow-200"
        >
          <span>Filtrando por leaks ativos</span>
          <button
            type="button"
            data-testid="themes-filter-clear"
            onClick={clearFilter}
            className="ml-auto text-xs underline hover:text-yellow-100"
          >
            <X className="inline-block w-3 h-3 mr-1" /> Limpar filtro
          </button>
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          data-testid="themes-search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome..."
          className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
        />
      </div>

      {filtered.length === 0 ? (
        <>
          <EmptyState
            area="themes"
            title={fromStats ? 'Nenhum tema vinculado a leaks' : 'Voce ainda nao tem temas'}
            description={
              fromStats
                ? 'Crie um tema baseado em leak para comecar.'
                : 'Comece criando "IP vs BB" — o tema mais comum entre profissionais.'
            }
            ctaLabel="Criar primeiro tema"
            ctaAction={() => navigate('/estudos/temas/novo')}
          />
          <div data-testid="themes-empty" className="hidden" aria-hidden />
        </>
      ) : (
        <div
          data-testid="themes-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filtered.map((t) => {
            const delta = leakDelta[t.id] ?? 0;
            const suggested = delta < SUGGESTED_THRESHOLD;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`theme-card-${t.id}`}
                onClick={() => navigate(`/estudos/temas/${t.id}`)}
                className="text-left rounded-lg border border-gray-700 bg-gray-800/80 p-4 hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-white">
                    {t.emoji ? `${t.emoji} ` : ''}
                    {t.name}
                  </div>
                  {suggested && (
                    <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-600/40">
                      Sugerido
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Progresso: {t.progress ?? 0}%
                </div>
                {t.attacksLeakType && (
                  <div className="text-[11px] text-yellow-400 mt-1">
                    Leak: {t.attacksLeakType}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ThemesView;
