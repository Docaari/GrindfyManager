/**
 * Sprint EST-3 (ADR-222 / RF-08) — form de registro UNIFICADO.
 *
 * Campos condicionais por mode:
 *   - mode=stat_analysis: bloco de "jogadas" (cap 10) + stat pre-preenchida.
 *   - qualquer mode: bloco de campos enriquecidos (Parte B) — hands solved,
 *     filters analyzed; lessonInsights so quando lessonId presente.
 *
 * Props: initialMode / statId / themeId / lessonId pre-preenchem o form (CTA
 * "Analisar esta stat" navega com query params).
 *
 * Lessons: #2 data-testid estaveis; #7 campos opcionais; #13 apiRequest direto.
 */

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getStatById } from '@shared/hud-stat-catalog';
import type { StudySessionMode } from '@shared/schema';

const STAT_ENTRIES_CAP = 10;

interface PlayEntryDraft {
  filters: string;
  errorText: string;
  learnedText: string;
}

interface Props {
  initialMode?: StudySessionMode;
  statId?: string;
  themeId?: string;
  lessonId?: string;
}

export default function StudySessionForm({
  initialMode = 'other',
  statId,
  themeId,
  lessonId,
}: Props): JSX.Element {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<StudySessionMode>(initialMode);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [entries, setEntries] = useState<PlayEntryDraft[]>([]);
  const [handsSolved, setHandsSolved] = useState<string>('');
  const [filtersAnalyzed, setFiltersAnalyzed] = useState<string>('');
  const [lessonInsights, setLessonInsights] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const statLabel = statId ? getStatById(statId)?.label ?? statId : '';

  function addPlay() {
    setEntries((prev) => {
      if (prev.length >= STAT_ENTRIES_CAP) return prev;
      return [...prev, { filters: '', errorText: '', learnedText: '' }];
    });
  }

  function updateEntry(index: number, patch: Partial<PlayEntryDraft>) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        mode,
        source: 'manual_post_hoc',
        durationMinutes,
      };
      if (themeId) payload.themeId = themeId;
      if (lessonId) payload.lessonId = lessonId;
      if (mode === 'stat_analysis') {
        if (statId) payload.statId = statId;
        payload.statAnalysisEntries = entries;
      }
      if (handsSolved !== '') payload.handsSolvedCount = Number(handsSolved);
      if (filtersAnalyzed !== '') payload.filtersAnalyzedCount = Number(filtersAnalyzed);
      if (lessonId && lessonInsights !== '') payload.lessonInsights = lessonInsights;

      const created = await apiRequest('POST', '/api/study-sessions', payload);
      const sessionId = created?.id;
      if (sessionId) {
        // Rota v2 dedicada (SessaoDetailPage) — NAO /estudos/sessao/:id, que eh
        // a pagina legada (timer/notes) servida pelo GET /:id de studies.ts.
        navigate(`/estudos/analise/${sessionId}`);
      } else {
        toast({ title: 'Sessao registrada' });
      }
    } catch {
      toast({ title: 'Erro ao registrar sessao', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      data-testid="study-session-form"
      onSubmit={handleSubmit}
      className="space-y-6 p-4 max-w-2xl mx-auto"
    >
      <div>
        <label className="block text-sm font-medium mb-1">Tipo de estudo</label>
        <select
          data-testid="study-session-mode-select"
          value={mode}
          onChange={(e) => setMode(e.target.value as StudySessionMode)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="drill_gto">Drill GTO</option>
          <option value="tournament_review">Revisao de torneio</option>
          <option value="hand_review">Revisao de maos</option>
          <option value="lesson">Aula</option>
          <option value="stat_analysis">Analise de stat</option>
          <option value="other">Outro</option>
        </select>
      </div>

      {mode === 'stat_analysis' && (
        <div
          data-testid="stat-analysis-block"
          className="rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Stat analisada</p>
              <p data-testid="stat-analysis-stat-id" className="text-sm font-semibold">
                {statLabel}
              </p>
            </div>
            <button
              type="button"
              data-testid="stat-analysis-add-play"
              onClick={addPlay}
              disabled={entries.length >= STAT_ENTRIES_CAP}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              Adicionar jogada
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry, i) => (
              <div
                key={i}
                data-testid={`play-entry-row-${i}`}
                className="rounded border border-border p-3 space-y-2"
              >
                <input
                  type="text"
                  placeholder="Filtros (ex: BTN vs BB, 3bet pot)"
                  value={entry.filters}
                  onChange={(e) => updateEntry(i, { filters: e.target.value })}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <textarea
                  data-testid={`play-entry-error-${i}`}
                  placeholder="O que errei"
                  value={entry.errorText}
                  onChange={(e) => updateEntry(i, { errorText: e.target.value })}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <textarea
                  data-testid={`play-entry-learned-${i}`}
                  placeholder="O que aprendi"
                  value={entry.learnedText}
                  onChange={(e) => updateEntry(i, { learnedText: e.target.value })}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        data-testid="enriched-fields-block"
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div>
          <label className="block text-sm font-medium mb-1">Maos solucionadas</label>
          <input
            type="number"
            min={0}
            data-testid="field-hands-solved"
            value={handsSolved}
            onChange={(e) => setHandsSolved(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Filtros analisados</label>
          <input
            type="number"
            min={0}
            data-testid="field-filters-analyzed"
            value={filtersAnalyzed}
            onChange={(e) => setFiltersAnalyzed(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        {lessonId && (
          <div>
            <label className="block text-sm font-medium mb-1">Insights da aula</label>
            <textarea
              data-testid="field-lesson-insights"
              value={lessonInsights}
              onChange={(e) => setLessonInsights(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
      >
        Registrar sessao
      </button>
    </form>
  );
}
