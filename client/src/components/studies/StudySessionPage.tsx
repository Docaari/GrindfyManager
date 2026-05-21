/**
 * Sprint Estudos-Sessao-1 — RF-06 / RF-07 / RF-08 / RF-10
 *
 * Pagina dedicada de sessao de estudo: header (tema + voltar), SessionTimer,
 * NotesBlock, btn Finalizar.
 *
 * Carrega via GET /api/study-sessions/:id (RF-06 single-session).
 *
 * Lessons aplicadas:
 *   #1  hooks first — todos useQuery/useState/useEffect ANTES de qualquer return.
 *   #2  data-testid estaveis: study-session-page, study-session-loading,
 *       study-session-not-found, session-timer, notes-block, note-input,
 *       note-add-btn, note-row-{id}, finalize-session-btn.
 *   #9  try/catch loga antes de fallback.
 *   #12 useState efemero para timer; em refresh recalcula via session.date.
 *   #13 apiRequest retorna JSON parseado direto.
 */

import React, { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/lib/telemetry';
import type { StudySessionLegacyStatus } from '@shared/schema';
import { SessionTimer } from './SessionTimer';
import { NotesBlock } from './NotesBlock';

interface ThemeRow {
  id: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
  progress?: number | null;
  linkedStats?: string[];
}

interface StudySessionRow {
  id: string;
  userId: string;
  themeId: string | null;
  status: StudySessionLegacyStatus;
  date: string;
  duration: number;
  activities: string[];
  studyCardId: string | null;
  createdAt: string;
}

interface Props {
  sessionId: string;
}

export function StudySessionPage({ sessionId }: Props): JSX.Element {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  // useRef pra guard de 1 emit/mount sem re-render extra.
  const trackedStartRef = useRef(false);

  const sessionQuery = useQuery<StudySessionRow | null>({
    queryKey: ['/api/study-sessions', sessionId],
    queryFn: async () => {
      try {
        const data = await apiRequest('GET', `/api/study-sessions/${sessionId}`);
        return data as StudySessionRow;
      } catch (err: any) {
        if (err?.status === 404 || /404/.test(String(err?.message ?? ''))) {
          return null;
        }
        // Lesson #9: log antes de rethrow.
        console.error('StudySessionPage.sessionQuery.error', err);
        throw err;
      }
    },
    retry: false,
  });

  const themesQuery = useQuery<ThemeRow[]>({
    queryKey: ['/api/study-themes'],
    queryFn: () => apiRequest('GET', '/api/study-themes'),
    staleTime: 30_000,
    enabled: !!sessionQuery.data,
  });

  // Pre-carrega notes count para telemetria study_session_finished.
  const notesQuery = useQuery<any[]>({
    queryKey: ['/api/study-sessions', sessionId, 'notes'],
    queryFn: () => apiRequest('GET', `/api/study-sessions/${sessionId}/notes`),
    enabled: !!sessionQuery.data,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (durationMin: number) => {
      return await apiRequest('PATCH', `/api/study-sessions/${sessionId}`, {
        status: 'finished',
        duration: durationMin,
      });
    },
    onSuccess: (_data, durationMin) => {
      const themeId = sessionQuery.data?.themeId ?? null;
      const noteCount = Array.isArray(notesQuery.data) ? notesQuery.data.length : 0;
      track('study_session_finished', {
        sessionId,
        durationMin,
        noteCount,
      });
      qc.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      qc.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      toast({ title: `Sessao finalizada (${durationMin}min)` });
      if (themeId) {
        navigate(`/estudos/temas/${themeId}`);
      } else {
        navigate('/estudos/temas');
      }
    },
    onError: (err: any) => {
      console.error('StudySessionPage.finalize.error', err);
      toast({
        title: 'Erro ao finalizar sessao',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!sessionQuery.data || trackedStartRef.current) return;
    track('study_session_started', {
      sessionId,
      themeId: sessionQuery.data.themeId,
    });
    trackedStartRef.current = true;
  }, [sessionQuery.data, sessionId]);

  // Loading
  if (sessionQuery.isLoading) {
    return (
      <div data-testid="study-session-loading" className="p-6">
        <div className="h-6 w-48 bg-muted/40 animate-pulse rounded mb-4" />
        <div className="h-24 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  // 404 / not-found
  if (!sessionQuery.data) {
    return (
      <div data-testid="study-session-not-found" className="p-6">
        <button
          type="button"
          onClick={() => navigate('/estudos/temas')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para temas
        </button>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="text-base font-semibold mb-2">Sessao nao encontrada</h2>
          <p className="text-sm text-muted-foreground">
            A sessao solicitada nao existe ou foi removida.
          </p>
        </div>
      </div>
    );
  }

  const session = sessionQuery.data;
  const isReadOnly = session.status === 'finished' || session.status === 'abandoned';
  const themes = themesQuery.data ?? [];
  const theme = themes.find((t) => t.id === session.themeId) ?? null;

  return (
    <div data-testid="study-session-page" className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() =>
            navigate(
              session.themeId
                ? `/estudos/temas/${session.themeId}`
                : '/estudos/temas',
            )
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao tema
        </button>
        {theme ? (
          <h1 className="text-base font-semibold text-foreground">
            Tema: {theme.name}
          </h1>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4 mb-4">
        <SessionTimer
          startedAt={session.date}
          status={session.status}
          finalDuration={session.duration}
          onFinish={(durationMin) => finalizeMutation.mutate(durationMin)}
          disabled={finalizeMutation.isPending}
          showFinishButton={!isReadOnly}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <NotesBlock sessionId={sessionId} readOnly={isReadOnly} />
      </div>
    </div>
  );
}

export default StudySessionPage;
