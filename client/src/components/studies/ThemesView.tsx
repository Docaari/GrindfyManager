/**
 * Sprint Studies-Reform — RF-03: Themes view + filtro fromStats
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: themes-grid, theme-card-{id}, theme-filter-fromStats
 *  #11 sem actions decorativas
 */

import React, { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { parseSearch } from '@/lib/url';
import { cn } from '@/lib/utils';
import { tokens } from '@/lib/ui-tokens';
import { EmptyState } from './EmptyState';
import { ThemeFormDialog, type ThemeFormValues } from './ThemeFormDialog';

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
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const params = useMemo(() => parseSearch(location), [location]);
  const fromStats = params.get('fromStats') === 'leaks';
  // BUG-1 fix: /estudos/temas/novo abre o dialog de criacao (antes caia de
  // volta na lista sem form — CTA morto).
  const createOpen = location.split('?')[0].replace(/\/+$/, '') === '/estudos/temas/novo';

  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      const res = await fetch('/api/study-themes', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    },
  });

  // HIGH-1 fix (reviewer): o ThemeFormDialog chama onOpenChange(false) DEPOIS
  // do onSubmit resolver. Como mutateAsync resolve apos o onSuccess, sem o guard
  // o closeCreate -> navigate('/estudos/temas') venceria o navigate pro tema
  // criado. Esse ref sinaliza "ja naveguei pro detalhe, nao volte pra lista".
  const navigatedToDetailRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: (values: ThemeFormValues) =>
      apiRequest('POST', '/api/study-themes', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      toast({ title: 'Tema criado' });
    },
  });

  async function handleCreate(values: ThemeFormValues) {
    // Navega APOS o resolve (vence o auto-close do dialog).
    const created: any = await createMutation.mutateAsync(values);
    navigatedToDetailRef.current = true;
    navigate(created?.id ? `/estudos/temas/${created.id}` : '/estudos/temas');
  }

  function openCreate() {
    navigate('/estudos/temas/novo');
  }

  function closeCreate() {
    // Se o create acabou de redirecionar pro detalhe, nao sobrescreve com a lista.
    if (navigatedToDetailRef.current) {
      navigatedToDetailRef.current = false;
      return;
    }
    navigate('/estudos/temas');
  }

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
        <h2 className="text-2xl font-semibold text-foreground">Temas</h2>
        <Button
          data-testid="themes-create-button"
          onClick={openCreate}
          className="bg-primary text-black font-semibold hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo tema
        </Button>
      </div>

      {fromStats && (
        <div
          data-testid="themes-filter-badge"
          className={cn(
            'mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm',
            tokens.color.warn.bg,
            tokens.color.warn.text,
            tokens.color.warn.border,
          )}
        >
          <span>Filtrando por leaks ativos</span>
          <button
            type="button"
            data-testid="themes-filter-clear"
            onClick={clearFilter}
            className="ml-auto text-xs underline hover:text-foreground"
          >
            <X className="inline-block w-3 h-3 mr-1" /> Limpar filtro
          </button>
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="themes-search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome..."
          className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
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
            ctaAction={openCreate}
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
            const accent = t.color || '#16a34a';
            const progress = Math.max(0, Math.min(100, t.progress ?? 0));
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`theme-card-${t.id}`}
                onClick={() => navigate(`/estudos/temas/${t.id}`)}
                style={{ ['--accent' as any]: accent }}
                className="group relative text-left rounded-xl border border-border bg-card p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-accent hover:shadow-lg hover:shadow-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
              >
                {/* Faixa de cor do tema */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: accent }}
                />
                <div className="flex items-start justify-between gap-2 mb-3 pl-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex-shrink-0 grid place-items-center h-9 w-9 rounded-lg text-lg"
                      style={{ backgroundColor: `${accent}22` }}
                      aria-hidden
                    >
                      {t.emoji || (
                        <span style={{ color: accent }} className="text-sm font-bold">
                          {(t.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">
                      {t.name}
                    </span>
                  </div>
                  {suggested && (
                    <Badge
                      variant="outline"
                      className="flex-shrink-0 text-[10px] text-blue-300 border-blue-500/40 bg-blue-500/10"
                    >
                      Sugerido
                    </Badge>
                  )}
                </div>

                {/* Progresso */}
                <div className="pl-1 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progresso</span>
                    <span className="font-mono text-foreground">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, backgroundColor: accent }}
                    />
                  </div>
                </div>

                {t.attacksLeakType && (
                  <div className="mt-3 pl-1 inline-flex items-center gap-1 text-[11px] text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
                    Ataca leak: {t.attacksLeakType}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ThemeFormDialog
        open={createOpen}
        onOpenChange={(o) => (o ? openCreate() : closeCreate())}
        mode="create"
        onSubmit={handleCreate}
      />
    </div>
  );
}

export default ThemesView;
