/**
 * Sprint Estudos-Fixes — FASE 1 (GAP-2)
 *
 * SessionsView — lista o historico de sessoes de estudo.
 *
 * Antes nao existia tela de listagem: so dava pra chegar em /estudos/sessao/:id
 * logo apos criar uma sessao a partir do tema. Agora /estudos/sessoes lista
 * todas (active / finished / abandoned), agrupadas com a ativa no topo.
 *
 * GET /api/study-sessions -> StudySessionRow[] (legacy studies.ts:492).
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid: studies-view-sessoes, session-row-{id}
 *   #9  fallback gracioso sem panico
 */

import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Clock, PlayCircle, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

type SessionStatus = 'active' | 'finished' | 'abandoned';

interface StudySessionRow {
  id: string;
  themeId: string | null;
  status: SessionStatus;
  date: string;
  duration: number;
  activities?: string[];
  createdAt?: string;
}

interface ThemeRow {
  id: string;
  name: string;
  emoji?: string | null;
}

const STATUS_META: Record<
  SessionStatus,
  { label: string; cls: string; Icon: typeof Clock }
> = {
  active: {
    label: 'Em andamento',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    Icon: PlayCircle,
  },
  finished: {
    label: 'Finalizada',
    cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    Icon: CheckCircle2,
  },
  abandoned: {
    label: 'Abandonada',
    cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    Icon: XCircle,
  },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SessionsView(): JSX.Element {
  const [, navigate] = useLocation();

  const { data: sessions = [], isLoading } = useQuery<StudySessionRow[]>({
    queryKey: ['/api/study-sessions'],
    queryFn: async () => {
      const data = await apiRequest('GET', '/api/study-sessions');
      return Array.isArray(data) ? data : [];
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

  // Ativas no topo, depois por data desc.
  const ordered = useMemo(() => {
    const rank: Record<SessionStatus, number> = {
      active: 0,
      finished: 1,
      abandoned: 2,
    };
    return [...sessions].sort((a, b) => {
      const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (r !== 0) return r;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [sessions]);

  if (isLoading) {
    return (
      <div data-testid="studies-view-sessoes" className="p-6 space-y-3">
        <h2 className="text-2xl font-semibold text-white">Sessões</h2>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-16 rounded-lg bg-gray-800 animate-pulse"
            data-testid={`sessions-skeleton-${n}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="studies-view-sessoes" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Sessões</h2>
        <span className="text-sm text-gray-400">{sessions.length} no total</span>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          area="generic"
          title="Nenhuma sessão de estudo ainda"
          description="Abra um tema e clique em “Iniciar sessão de estudo” para registrar seu tempo."
          ctaLabel="Ver temas"
          ctaAction={() => navigate('/estudos/temas')}
        />
      ) : (
        <div className="space-y-2" data-testid="sessions-list">
          {ordered.map((s) => {
            const meta = STATUS_META[s.status] ?? STATUS_META.finished;
            const theme = s.themeId ? themeById.get(s.themeId) : null;
            const { Icon } = meta;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`session-row-${s.id}`}
                onClick={() => navigate(`/estudos/sessao/${s.id}`)}
                className="w-full text-left flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 hover:bg-gray-800 transition-colors"
              >
                <span
                  className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                >
                  <Icon className="w-3 h-3" aria-hidden />
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">
                    {theme ? (
                      <>
                        {theme.emoji ? `${theme.emoji} ` : ''}
                        {theme.name}
                      </>
                    ) : (
                      'Sessão livre'
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                    <span>{fmtDate(s.date)}</span>
                    {s.duration > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden />
                        {s.duration}min
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SessionsView;
