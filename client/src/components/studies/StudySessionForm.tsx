/**
 * Sprint EST-3 (ADR-222 / RF-08) — form de registro UNIFICADO.
 * Sprint Estudos-WS-Fix — campos mudam por tipo de estudo (gap do founder).
 *
 * Campos condicionais por mode:
 *   - SEMPRE: tipo, duracao, notas + bloco enriquecido (maos solucionadas /
 *     filtros analisados, com labels adaptados ao tipo).
 *   - drill_gto: plataforma de solver + precisao (%).
 *   - tournament_review / hand_review: editor de "spots dificeis" (cap 5).
 *   - lesson: insights da aula (lessonInsights).
 *   - stat_analysis: bloco de "jogadas" (cap 10) + stat pre-preenchida.
 *
 * Props: initialMode / statId / themeId / lessonId pre-preenchem o form (CTA
 * "Analisar esta stat" navega com query params).
 *
 * Lessons: #2 data-testid estaveis; #7 campos opcionais; #13 apiRequest direto.
 */

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getStatById, HUD_STAT_CATALOG } from '@shared/hud-stat-catalog';
import type { StudySessionMode } from '@shared/schema';
import { PageHeader } from '@/components/ui/PageHeader';

const STAT_ENTRIES_CAP = 10;
const DIFFICULT_SPOTS_CAP = 5;

// PT-BR labels dos modos (subtitle do header — espelha o <select>).
const MODE_LABELS: Record<string, string> = {
  drill_gto: 'Drill GTO',
  tournament_review: 'Revisao de torneio',
  hand_review: 'Revisao de maos',
  lesson: 'Aula',
  stat_analysis: 'Analise de stat',
  other: 'Outro',
};

interface PlayEntryDraft {
  filters: string;
  errorText: string;
  learnedText: string;
}

interface DifficultSpotDraft {
  context: string;
  note: string;
}

interface Props {
  initialMode?: StudySessionMode;
  statId?: string;
  themeId?: string;
  lessonId?: string;
}

// Plataformas de solver/treino comuns (drill_gto). value -> backend drillPlatform.
const DRILL_PLATFORMS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Selecione...' },
  { value: 'gtowizard', label: 'GTO Wizard' },
  { value: 'gtoplus', label: 'GTO+' },
  { value: 'piosolver', label: 'PioSolver' },
  { value: 'deepsolver', label: 'DeepSolver' },
  { value: 'simple_gto', label: 'Simple GTO Trainer' },
  { value: 'other', label: 'Outra' },
];

// Label do bloco enriquecido (maos/filtros) adaptado ao tipo de estudo.
function enrichedLabels(mode: StudySessionMode): { hands: string; filters: string } {
  switch (mode) {
    case 'drill_gto':
      return { hands: 'Maos drilladas', filters: 'Spots/filtros treinados' };
    case 'tournament_review':
      return { hands: 'Torneios revisados', filters: 'Spots analisados' };
    case 'hand_review':
      return { hands: 'Maos revisadas', filters: 'Filtros analisados' };
    case 'lesson':
      return { hands: 'Exercicios feitos', filters: 'Conceitos revisados' };
    case 'stat_analysis':
      return { hands: 'Maos solucionadas', filters: 'Filtros analisados' };
    default:
      return { hands: 'Maos solucionadas', filters: 'Filtros analisados' };
  }
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
  const [notes, setNotes] = useState<string>('');
  const [entries, setEntries] = useState<PlayEntryDraft[]>([]);
  const [handsSolved, setHandsSolved] = useState<string>('');
  const [filtersAnalyzed, setFiltersAnalyzed] = useState<string>('');
  const [lessonInsights, setLessonInsights] = useState<string>('');
  // Campos por tipo (Estudos-WS-Fix).
  const [drillPlatform, setDrillPlatform] = useState<string>('');
  const [drillAccuracy, setDrillAccuracy] = useState<string>('');
  const [difficultSpots, setDifficultSpots] = useState<DifficultSpotDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Picker de tema/stat (antes so vinham via query param — modos que exigem
  // themeId/statId davam 400 silencioso quando o user trocava o tipo no select).
  const [selectedThemeId, setSelectedThemeId] = useState<string>(themeId ?? '');
  const [selectedStatId, setSelectedStatId] = useState<string>(statId ?? '');

  // Resync quando o prop muda pos-mount (ex: query param chega sem remount) —
  // paridade com MdaReadForm. So-seed: o dep e o prop, entao limpar o select
  // (setSelected* '') nao dispara o effect, preservando a edicao do usuario.
  useEffect(() => {
    if (themeId) setSelectedThemeId(themeId);
  }, [themeId]);
  useEffect(() => {
    if (statId) setSelectedStatId(statId);
  }, [statId]);

  const { data: themesData } = useQuery<Array<{ id: string; name: string; emoji?: string | null }>>({
    queryKey: ['/api/study-themes'],
    queryFn: () => apiRequest('GET', '/api/study-themes'),
    staleTime: 30_000,
  });
  const themes = Array.isArray(themesData) ? themesData : [];

  // selectedThemeId/selectedStatId ja sao seedados dos props (themeId/statId) no
  // useState — sao a unica fonte, e isso permite limpar o select pra "Nenhum".
  const effectiveThemeId = selectedThemeId;
  const effectiveStatId = selectedStatId;

  const statLabel = effectiveStatId
    ? getStatById(effectiveStatId)?.label ?? effectiveStatId
    : '';

  // Espelha validateModeRequirements do backend — hint inline ANTES do 400, sem
  // bloquear o submit (back-compat com testes que disparam o POST direto).
  const missingHint: string | null = (() => {
    if (
      (mode === 'drill_gto' || mode === 'other' || mode === 'stat_analysis') &&
      !effectiveThemeId
    ) {
      return 'Selecione um tema abaixo para este tipo de estudo.';
    }
    if (mode === 'stat_analysis' && !effectiveStatId) {
      return 'Selecione a stat analisada abaixo.';
    }
    if (mode === 'lesson' && !lessonId) {
      return 'Registre estudos do tipo "Aula" a partir da pagina da aula.';
    }
    if (mode === 'hand_review') {
      return 'Registre "Revisao de maos" a partir das maos marcadas.';
    }
    return null;
  })();
  const labels = enrichedLabels(mode);
  const showDifficultSpots = mode === 'tournament_review' || mode === 'hand_review';
  const showLessonInsights = !!lessonId || mode === 'lesson';

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

  function addSpot() {
    setDifficultSpots((prev) => {
      if (prev.length >= DIFFICULT_SPOTS_CAP) return prev;
      return [...prev, { context: '', note: '' }];
    });
  }

  function updateSpot(index: number, patch: Partial<DifficultSpotDraft>) {
    setDifficultSpots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function removeSpot(index: number) {
    setDifficultSpots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        mode,
        source: 'manual_post_hoc',
        durationMinutes: Math.max(1, Number(durationMinutes) || 1),
      };
      if (effectiveThemeId) payload.themeId = effectiveThemeId;
      if (lessonId) payload.lessonId = lessonId;
      if (notes.trim() !== '') payload.notes = notes.trim();
      if (mode === 'stat_analysis') {
        if (effectiveStatId) payload.statId = effectiveStatId;
        payload.statAnalysisEntries = entries;
      }
      // drill_gto: plataforma + precisao.
      if (mode === 'drill_gto') {
        if (drillPlatform !== '') payload.drillPlatform = drillPlatform;
        if (drillAccuracy !== '') {
          payload.drillAccuracy = Math.max(0, Math.min(100, Number(drillAccuracy)));
        }
      }
      // review modes: spots dificeis (descarta linhas vazias).
      if (showDifficultSpots) {
        const cleaned = difficultSpots
          .map((s) => ({ context: s.context.trim(), note: s.note.trim() }))
          .filter((s) => s.context !== '' || s.note !== '');
        if (cleaned.length > 0) payload.difficultSpots = cleaned;
      }
      if (handsSolved !== '') payload.handsSolvedCount = Number(handsSolved);
      if (filtersAnalyzed !== '') payload.filtersAnalyzedCount = Number(filtersAnalyzed);
      if (showLessonInsights && lessonInsights !== '') {
        payload.lessonInsights = lessonInsights;
      }

      const created = await apiRequest('POST', '/api/study-sessions', payload);
      // Sprint Estudos-UX-Fix BUG-A (lesson #21): invalida caches dependentes.
      queryClient.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/study-sessions/stat-analysis/by-theme'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      const sessionId = created?.id;
      if (sessionId) {
        // Rota v2 dedicada (SessaoDetailPage).
        navigate(`/estudos/analise/${sessionId}`);
      } else {
        toast({ title: 'Sessao registrada' });
      }
    } catch (err: any) {
      // apiRequest ja lanca Error cujo .message e a mensagem PT-BR do backend
      // (validateModeRequirements retorna message por codigo) — surface direto.
      toast({
        title: 'Erro ao registrar sessao',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <PageHeader title="Registrar estudo" subtitle={MODE_LABELS[mode] ?? 'Estudo'} />
      <form
        data-testid="study-session-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
      {/* Secao "Sobre o estudo" — tipo + duracao, comuns a qualquer modo. */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Sobre o estudo</h3>
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
        <div>
          <label className="block text-sm font-medium mb-1">Duracao (minutos)</label>
          <input
            type="number"
            min={1}
            max={1440}
            data-testid="field-duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tema (vinculo)</label>
          <select
            data-testid="field-theme-select"
            value={effectiveThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">Nenhum</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji ? `${t.emoji} ` : ''}
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {missingHint ? (
          <p
            data-testid="study-session-hint"
            className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            {missingHint}
          </p>
        ) : null}
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

          {/* Sem statId via query param -> picker (antes: 400 MISSING_STAT mudo). */}
          {!statId ? (
            <div>
              <label className="block text-sm font-medium mb-1">Stat analisada</label>
              <select
                data-testid="field-stat-select"
                value={effectiveStatId}
                onChange={(e) => setSelectedStatId(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">Selecione...</option>
                {HUD_STAT_CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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

      {/* drill_gto: plataforma de solver + precisao. */}
      {mode === 'drill_gto' && (
        <div
          data-testid="drill-fields-block"
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium mb-1">Plataforma / solver</label>
            <select
              data-testid="field-drill-platform"
              value={drillPlatform}
              onChange={(e) => setDrillPlatform(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            >
              {DRILL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Precisao (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              data-testid="field-drill-accuracy"
              value={drillAccuracy}
              onChange={(e) => setDrillAccuracy(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* review modes: spots dificeis (cap 5). */}
      {showDifficultSpots && (
        <div
          data-testid="difficult-spots-block"
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Spots dificeis</label>
            <button
              type="button"
              data-testid="difficult-spots-add"
              onClick={addSpot}
              disabled={difficultSpots.length >= DIFFICULT_SPOTS_CAP}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              Adicionar spot
            </button>
          </div>
          {difficultSpots.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Registre spots que te deram duvida (ex: "AKo BTN vs 3bet" + nota).
            </p>
          ) : (
            <div className="space-y-3">
              {difficultSpots.map((spot, i) => (
                <div
                  key={i}
                  data-testid={`difficult-spot-row-${i}`}
                  className="rounded border border-border p-3 space-y-2"
                >
                  <input
                    type="text"
                    placeholder="Contexto (ex: BTN vs BB, SRP)"
                    value={spot.context}
                    onChange={(e) => updateSpot(i, { context: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                  <textarea
                    placeholder="Nota / duvida"
                    value={spot.note}
                    onChange={(e) => updateSpot(i, { note: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpot(i)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        data-testid="enriched-fields-block"
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div>
          <label className="block text-sm font-medium mb-1">{labels.hands}</label>
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
          <label className="block text-sm font-medium mb-1">{labels.filters}</label>
          <input
            type="number"
            min={0}
            data-testid="field-filters-analyzed"
            value={filtersAnalyzed}
            onChange={(e) => setFiltersAnalyzed(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        {showLessonInsights && (
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

      {/* Notas — comum a qualquer tipo. */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <label className="block text-sm font-semibold text-foreground">Anotacoes</label>
        <textarea
          data-testid="field-notes"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observacoes livres sobre o estudo..."
          rows={4}
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          data-testid="study-session-submit"
          disabled={submitting}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Registrar sessao
        </button>
      </div>
      </form>
    </div>
  );
}
