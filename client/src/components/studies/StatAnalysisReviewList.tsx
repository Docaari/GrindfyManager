/**
 * Sprint EST-3 (ADR-222 / RF-07 / RF-08 surface 2) — lista de revisao das
 * analises de stat agrupadas por stat dentro de um tema.
 *
 * Consome GET /api/study-sessions/stat-analysis/by-theme?themeId=&statId=. Cada grupo
 * exibe a stat + contagem de jogadas (entryCount) + jogadas com imagens (URLs
 * servíveis, nunca keys cruas).
 *
 * Lessons: #2 data-testid estaveis; #13 apiRequest direto.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { getStatById } from '@shared/hud-stat-catalog';

interface ReviewEntry {
  id: string;
  filters: string;
  errorText: string;
  learnedText: string;
  playImageUrl: string | null;
  solutionImageUrl: string | null;
}
interface ReviewSession {
  sessionId: string;
  registeredAt: string;
  durationMinutes: number;
  entries: ReviewEntry[];
}
interface ReviewGroup {
  statId: string;
  entryCount: number;
  sessions: ReviewSession[];
}

interface Props {
  themeId: string;
  statId?: string;
}

export default function StatAnalysisReviewList({ themeId, statId }: Props): JSX.Element {
  const url =
    `/api/study-sessions/stat-analysis/by-theme?themeId=${encodeURIComponent(themeId)}` +
    (statId ? `&statId=${encodeURIComponent(statId)}` : '');

  const { data: groups = [], isLoading } = useQuery<ReviewGroup[]>({
    queryKey: ['/api/study-sessions/stat-analysis/by-theme', themeId, statId ?? null],
    queryFn: () => apiRequest('GET', url),
    enabled: !!themeId,
  });

  const list = Array.isArray(groups) ? groups : [];

  // Root renderiza apos a query settle — garante que os grupos estejam
  // presentes quando o consumidor espera pelo testid do root (paridade com o
  // gate de loading de ThemeDetailView).
  if (isLoading) {
    return (
      <div className="h-16 rounded-lg bg-muted/30 animate-pulse" aria-hidden />
    );
  }

  return (
    <div data-testid="stat-analysis-review-list" className="space-y-4">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma analise de stat registrada para este tema ainda.
        </p>
      ) : (
        list.map((group) => {
          const label = getStatById(group.statId)?.label ?? group.statId;
          return (
            <div
              key={group.statId}
              data-testid={`stat-analysis-review-group-${group.statId}`}
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{label}</h4>
                <span
                  data-testid={`stat-analysis-entry-count-${group.statId}`}
                  className="text-xs text-muted-foreground"
                >
                  {group.entryCount} jogada(s)
                </span>
              </div>
              <div className="space-y-3">
                {(Array.isArray(group.sessions) ? group.sessions : []).flatMap((session) =>
                  (Array.isArray(session.entries) ? session.entries : []).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded border border-border/60 p-2 text-sm space-y-1"
                    >
                      <p className="text-xs text-muted-foreground">{entry.filters}</p>
                      {entry.errorText ? <p>Erro: {entry.errorText}</p> : null}
                      {entry.learnedText ? <p>Aprendizado: {entry.learnedText}</p> : null}
                      <div className="flex gap-2">
                        {entry.playImageUrl ? (
                          <img src={entry.playImageUrl} alt="Jogada" className="h-16 rounded" />
                        ) : null}
                        {entry.solutionImageUrl ? (
                          <img src={entry.solutionImageUrl} alt="Solucao" className="h-16 rounded" />
                        ) : null}
                      </div>
                    </div>
                  )),
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
