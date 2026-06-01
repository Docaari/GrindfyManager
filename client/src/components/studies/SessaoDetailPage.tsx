/**
 * Sprint EST-3 (ADR-222 / RF-08 surface 3) — pagina de detalhe de sessao
 * (/estudos/sessao/:id). Exibe as jogadas (entries) de uma sessao stat_analysis
 * + os campos enriquecidos (Parte B: hands solved / filters analyzed).
 *
 * Consome GET /api/study-sessions/:id/detail (shape v2 — imagens vem como URLs
 * servíveis). Sub-path dedicado: GET /:id "cru" pertence ao legado studies.ts.
 *
 * Lessons: #2 data-testid estaveis; #13 apiRequest direto.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { getStatById } from '@shared/hud-stat-catalog';

interface SessionEntry {
  id: string;
  filters: string;
  errorText: string;
  learnedText: string;
  playImageUrl: string | null;
  solutionImageUrl: string | null;
}
interface SessionDetail {
  id: string;
  mode: string;
  statId?: string | null;
  handsSolvedCount?: number | null;
  filtersAnalyzedCount?: number | null;
  lessonInsights?: string | null;
  statAnalysisEntries?: SessionEntry[] | null;
}

interface Props {
  sessionId: string;
}

export default function SessaoDetailPage({ sessionId }: Props): JSX.Element {
  const { data: session, isLoading } = useQuery<SessionDetail>({
    queryKey: ['/api/study-sessions', sessionId, 'detail'],
    queryFn: () => apiRequest('GET', `/api/study-sessions/${sessionId}/detail`),
    enabled: !!sessionId,
  });

  // Root renderiza apos a query settle — garante que entries/counts estejam
  // presentes quando o consumidor espera pelo testid do root.
  if (isLoading || !session) {
    return (
      <div className="h-32 rounded-lg bg-muted/30 animate-pulse m-4" aria-hidden />
    );
  }

  const entries = Array.isArray(session.statAnalysisEntries)
    ? session.statAnalysisEntries
    : [];
  const statLabel = session.statId ? getStatById(session.statId)?.label ?? session.statId : '';

  return (
    <div data-testid="session-detail-page" className="space-y-6 p-4 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Maos solucionadas</p>
          <p data-testid="session-detail-hands-solved" className="text-lg font-semibold">
            {session.handsSolvedCount ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Filtros analisados</p>
          <p data-testid="session-detail-filters-analyzed" className="text-lg font-semibold">
            {session.filtersAnalyzedCount ?? '—'}
          </p>
        </div>
      </div>

      {session.mode === 'stat_analysis' && (
        <div className="space-y-4">
          {statLabel ? (
            <h3 className="text-sm font-semibold">Stat: {statLabel}</h3>
          ) : null}
          {entries.map((entry) => (
            <div
              key={entry.id}
              data-testid={`session-detail-entry-${entry.id}`}
              className="rounded-lg border border-border bg-card p-3 space-y-2 text-sm"
            >
              <p className="text-xs text-muted-foreground">{entry.filters}</p>
              {entry.errorText ? <p>Erro: {entry.errorText}</p> : null}
              {entry.learnedText ? <p>Aprendizado: {entry.learnedText}</p> : null}
              <div className="flex gap-2">
                {entry.playImageUrl ? (
                  <img src={entry.playImageUrl} alt="Jogada" className="h-20 rounded" />
                ) : null}
                {entry.solutionImageUrl ? (
                  <img src={entry.solutionImageUrl} alt="Solucao" className="h-20 rounded" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {session.lessonInsights ? (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="text-xs text-muted-foreground mb-1">Insights da aula</p>
          <p>{session.lessonInsights}</p>
        </div>
      ) : null}
    </div>
  );
}
