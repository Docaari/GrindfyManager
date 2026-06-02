/**
 * SessionsView — lista das sessoes de estudo REGISTRADAS.
 *
 * Sprint Estudos-Fixes FASE 1 (GAP-2) criou a tela lendo a tabela legacy
 * (study_sessions / timer). Sprint Estudos-UX (founder) repontou pra
 * `study_sessions_v2` (form unificado StudySessionForm) — onde caem TODOS os
 * modos (drill_gto / aula / revisao / analise de stat). A legacy so listava o
 * fluxo timer (hoje sem entrada na UI), entao sessoes registradas pelo form
 * ficavam invisiveis ("registrei e nao encontro").
 *
 * GET /api/study-sessions/registered/list -> { items: StudySessionV2Row[] }
 * (sub-path 2-seg dedicado; a GET /api/study-sessions crua eh shadowada pela
 * legacy). Click -> /estudos/analise/:id (SessaoDetailPage v2).
 *
 * Lessons: #1 hooks first; #2 data-testid estaveis (studies-view-sessoes,
 * sessions-list, session-row-{id}); #9 fallback gracioso; #13 apiRequest direto.
 */

import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Clock,
  Target,
  GraduationCap,
  Trophy,
  Layers,
  BarChart3,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import { EmptyState } from './EmptyState';

interface StudySessionV2Row {
  id: string;
  mode: string;
  themeId?: string | null;
  durationMinutes?: number | null;
  registeredAt?: string | null;
  statId?: string | null;
}

interface ThemeRow {
  id: string;
  name: string;
  emoji?: string | null;
}

const MODE_META: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
  drill_gto: {
    label: 'Drill GTO',
    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    Icon: Target,
  },
  tournament_review: {
    label: 'Revisao de torneio',
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
    Icon: Trophy,
  },
  hand_review: {
    label: 'Revisao de maos',
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30',
    Icon: Layers,
  },
  lesson: {
    label: 'Aula',
    cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30',
    Icon: GraduationCap,
  },
  stat_analysis: {
    label: 'Analise de stat',
    cls: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30',
    Icon: BarChart3,
  },
  other: {
    label: 'Estudo',
    cls: 'bg-muted text-muted-foreground border-border',
    Icon: BookOpen,
  },
};

function modeMeta(mode: string) {
  return MODE_META[mode] ?? MODE_META.other;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionsView(): JSX.Element {
  const [, navigate] = useLocation();

  const { data: sessions = [], isLoading } = useQuery<StudySessionV2Row[]>({
    queryKey: ['/api/study-sessions/registered/list'],
    queryFn: async () => {
      const data: any = await apiRequest('GET', '/api/study-sessions/registered/list');
      // Tolera { items: [] } (shape do handler) OU array cru (mocks legados).
      if (Array.isArray(data)) return data;
      return Array.isArray(data?.items) ? data.items : [];
    },
  });

  const { data: themes = [] } = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: () => apiRequest('GET', '/api/study-themes'),
    staleTime: 30_000,
  });

  const themeById = useMemo(() => {
    const m = new Map<string, ThemeRow>();
    for (const t of themes) m.set(t.id, t);
    return m;
  }, [themes]);

  // Mais recentes primeiro (registeredAt desc).
  const ordered = useMemo(() => {
    return [...sessions].sort(
      (a, b) =>
        new Date(b.registeredAt ?? 0).getTime() - new Date(a.registeredAt ?? 0).getTime(),
    );
  }, [sessions]);

  if (isLoading) {
    return (
      <div data-testid="studies-view-sessoes" className="p-6 space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Sessoes</h2>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-16 rounded-lg bg-muted/40 animate-pulse"
            data-testid={`sessions-skeleton-${n}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="studies-view-sessoes" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-foreground">Sessoes</h2>
        <span className="text-sm text-muted-foreground">{sessions.length} no total</span>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          area="generic"
          title="Nenhum estudo registrado ainda"
          description="Abra um tema e clique em “Registrar estudo” para guardar suas anotacoes, jogadas e prints."
          ctaLabel="Ver temas"
          ctaAction={() => navigate('/estudos/temas')}
        />
      ) : (
        <div className="space-y-2" data-testid="sessions-list">
          {ordered.map((s) => {
            const meta = modeMeta(s.mode);
            const theme = s.themeId ? themeById.get(s.themeId) : null;
            const { Icon } = meta;
            const dur =
              typeof s.durationMinutes === 'number' && s.durationMinutes > 0
                ? s.durationMinutes
                : 0;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`session-row-${s.id}`}
                onClick={() => navigate(`/estudos/analise/${s.id}`)}
                className="w-full text-left flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
              >
                <span
                  className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                >
                  <Icon className="w-3 h-3" aria-hidden />
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {theme ? (
                      <>
                        {theme.emoji ? `${theme.emoji} ` : ''}
                        {theme.name}
                      </>
                    ) : (
                      'Sessao livre'
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {fmtDate(s.registeredAt) ? <span>{fmtDate(s.registeredAt)}</span> : null}
                    {dur > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden />
                        {dur}min
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SessionsView;
