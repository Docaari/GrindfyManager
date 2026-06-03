/**
 * Sprint EST-3 (ADR-222 / RF-08) — form de registro UNIFICADO.
 * Sprint Estudos-WS-Fix — campos mudam por tipo de estudo + seletor de tema.
 *
 * Campos:
 *   - SEMPRE: tipo, TEMA (vincula a sessao a um tema), duracao, notas + bloco
 *     enriquecido (maos / filtros, labels adaptados ao tipo).
 *   - drill_gto: plataforma de solver + precisao (%).
 *   - tournament_review / hand_review: editor de "spots dificeis" (cap 5).
 *   - lesson: insights da aula (lessonInsights).
 *   - stat_analysis: bloco de "jogadas" (cap 10) + stat pre-preenchida.
 *
 * Props: initialMode / statId / themeId / lessonId pre-preenchem o form (CTA
 * "Analisar esta stat" navega com query params). themeId tambem pre-seleciona
 * o tema no dropdown.
 *
 * Lessons: #2 data-testid estaveis; #7 campos opcionais; #13 apiRequest direto.
 * O dropdown de temas usa `fetch` cru (nao apiRequest) — assim os testes que
 * mockam apiRequest continuam vendo o POST como a 1a chamada.
 */

import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getStatById } from '@shared/hud-stat-catalog';
import type { StudySessionMode } from '@shared/schema';

const STAT_ENTRIES_CAP = 10;
const DIFFICULT_SPOTS_CAP = 5;
const NOTES_MAX = 2000;

// Modos selecionaveis a mao (funcionam standalone). lesson / hand_review /
// stat_analysis exigem dados que o form nao coleta (lessonId / starredHandIds /
// statId) — so entram via CTA (initialMode + query params). Esconde-los do
// select evita o 400 garantido (MISSING_LESSON / MISSING_HAND_IDS / MISSING_STAT).
const STANDALONE_MODES: Array<{ value: StudySessionMode; label: string }> = [
  { value: 'drill_gto', label: 'Drill GTO' },
  { value: 'tournament_review', label: 'Revisao de torneio' },
  { value: 'other', label: 'Outro' },
];
const CTA_ONLY_LABELS: Record<string, string> = {
  lesson: 'Aula',
  hand_review: 'Revisao de maos',
  stat_analysis: 'Analise de stat',
};

// Classes dark consistentes com ThemesView (o tema escuro do app). bg-background
// / bg-card do shadcn renderizam mal aqui; usamos cinzas explicitos.
const INPUT_CLS =
  'w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-poker-accent';
const BLOCK_CLS = 'rounded-lg border border-gray-700 bg-gray-800/40 p-4';

interface PlayEntryDraft {
  filters: string;
  errorText: string;
  learnedText: string;
}

interface DifficultSpotDraft {
  context: string;
  note: string;
}

interface ThemeOption {
  id: string;
  name: string;
  emoji?: string | null;
}

interface Props {
  initialMode?: StudySessionMode;
  statId?: string;
  themeId?: string;
  lessonId?: string;
}

const DRILL_PLATFORMS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Selecione...' },
  { value: 'gtowizard', label: 'GTO Wizard' },
  { value: 'gtoplus', label: 'GTO+' },
  { value: 'piosolver', label: 'PioSolver' },
  { value: 'deepsolver', label: 'DeepSolver' },
  { value: 'simple_gto', label: 'Simple GTO Trainer' },
  { value: 'other', label: 'Outra' },
];

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
  const [selectedThemeId, setSelectedThemeId] = useState<string>(themeId ?? '');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [notes, setNotes] = useState<string>('');
  const [entries, setEntries] = useState<PlayEntryDraft[]>([]);
  const [handsSolved, setHandsSolved] = useState<string>('');
  const [filtersAnalyzed, setFiltersAnalyzed] = useState<string>('');
  const [lessonInsights, setLessonInsights] = useState<string>('');
  const [drillPlatform, setDrillPlatform] = useState<string>('');
  const [drillAccuracy, setDrillAccuracy] = useState<string>('');
  const [difficultSpots, setDifficultSpots] = useState<DifficultSpotDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');

  // Dropdown de temas — fetch cru (NAO apiRequest), com try/catch -> [] (jsdom
  // sem fetch nao quebra; mock de apiRequest dos testes nao registra esta call).
  const { data: themesData } = useQuery<ThemeOption[]>({
    queryKey: ['/api/study-themes'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/study-themes', { credentials: 'include' });
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
  });
  const themes: ThemeOption[] = Array.isArray(themesData) ? themesData : [];

  const statLabel = statId ? getStatById(statId)?.label ?? statId : '';
  const labels = enrichedLabels(mode);
  const showDifficultSpots = mode === 'tournament_review' || mode === 'hand_review';
  const showLessonInsights = !!lessonId || mode === 'lesson';
  const effectiveThemeId = useMemo(
    () => (selectedThemeId || themeId || '').trim(),
    [selectedThemeId, themeId],
  );

  // Opcoes do select: standalone + (se o form foi aberto via CTA num modo
  // CTA-only) a opcao desse modo, pra refletir o estado e permitir submit.
  const modeOptions = useMemo(() => {
    const opts = [...STANDALONE_MODES];
    if (initialMode in CTA_ONLY_LABELS) {
      opts.unshift({ value: initialMode, label: CTA_ONLY_LABELS[initialMode] });
    }
    return opts;
  }, [initialMode]);

  // Guard client-side (L1): bloqueia o submit com mensagem clara ANTES do POST
  // quando falta um campo que o backend exige pro modo (C1) — feedback instantaneo
  // em vez de esperar o 400.
  function clientGuard(): string | null {
    if (mode === 'drill_gto' && !effectiveThemeId) {
      return 'Drill GTO precisa de um tema. Selecione um tema acima.';
    }
    if (mode === 'stat_analysis') {
      if (!effectiveThemeId) return 'Analise de stat precisa de um tema.';
      if (!statId) {
        return 'Analise de stat precisa de uma stat — use "Analisar esta stat" na pagina do tema.';
      }
    }
    if (mode === 'lesson' && !lessonId) {
      return 'Registro de aula precisa vir da pagina da aula.';
    }
    if (mode === 'hand_review') {
      return 'Revisao de maos precisa de spots marcados — registre a partir de um spot.';
    }
    return null;
  }

  function addPlay() {
    setEntries((prev) => (prev.length >= STAT_ENTRIES_CAP ? prev : [...prev, { filters: '', errorText: '', learnedText: '' }]));
  }

  function updateEntry(index: number, patch: Partial<PlayEntryDraft>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addSpot() {
    setDifficultSpots((prev) => (prev.length >= DIFFICULT_SPOTS_CAP ? prev : [...prev, { context: '', note: '' }]));
  }

  function updateSpot(index: number, patch: Partial<DifficultSpotDraft>) {
    setDifficultSpots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSpot(index: number) {
    setDifficultSpots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const guard = clientGuard();
    if (guard) {
      setFormError(guard);
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        mode,
        source: 'manual_post_hoc',
        durationMinutes: Math.max(1, Number(durationMinutes) || 1),
      };
      if (effectiveThemeId) payload.themeId = effectiveThemeId;
      if (lessonId) payload.lessonId = lessonId;
      if (notes.trim() !== '') payload.notes = notes.trim().slice(0, NOTES_MAX);
      if (mode === 'stat_analysis') {
        if (statId) payload.statId = statId;
        // M3: descarta jogadas totalmente vazias (addPlay cria linha em branco).
        payload.statAnalysisEntries = entries.filter(
          (en) => en.filters.trim() !== '' || en.errorText.trim() !== '' || en.learnedText.trim() !== '',
        );
      }
      if (mode === 'drill_gto') {
        if (drillPlatform !== '') payload.drillPlatform = drillPlatform;
        if (drillAccuracy !== '') {
          payload.drillAccuracy = Math.max(0, Math.min(100, Number(drillAccuracy)));
        }
      }
      if (showDifficultSpots) {
        const cleaned = difficultSpots
          .map((s) => ({ context: s.context.trim(), note: s.note.trim() }))
          .filter((s) => s.context !== '' || s.note !== '');
        if (cleaned.length > 0) payload.difficultSpots = cleaned;
      }
      if (handsSolved !== '') payload.handsSolvedCount = Number(handsSolved);
      if (filtersAnalyzed !== '') payload.filtersAnalyzedCount = Number(filtersAnalyzed);
      if (showLessonInsights && lessonInsights !== '') payload.lessonInsights = lessonInsights;

      const created = await apiRequest('POST', '/api/study-sessions', payload);
      queryClient.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/study-sessions/stat-analysis/by-theme'] });
      queryClient.invalidateQueries({ queryKey: ['/api/home/focus-stats'] });
      const sessionId = created?.id;
      if (sessionId) {
        toast({ title: 'Sessao registrada' });
        navigate(`/estudos/analise/${sessionId}`);
      } else {
        toast({ title: 'Sessao registrada' });
        navigate('/estudos/sessoes');
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar sessao',
        description: err?.message ? String(err.message) : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      data-testid="study-session-form"
      onSubmit={handleSubmit}
      className="space-y-6 p-4 max-w-2xl mx-auto text-white"
    >
      <h2 className="text-xl font-semibold">Registrar estudo</h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-200">Tipo de estudo</label>
        <select
          data-testid="study-session-mode-select"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as StudySessionMode);
            setFormError('');
          }}
          className={INPUT_CLS}
        >
          {modeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Tema — vincula a sessao a um tema de estudo (opcional). */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-200">Tema (opcional)</label>
        <select
          data-testid="study-session-theme-select"
          value={effectiveThemeId}
          onChange={(e) => setSelectedThemeId(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Sem tema</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji ? `${t.emoji} ` : ''}{t.name}
            </option>
          ))}
        </select>
        {themes.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Nenhum tema ainda. Crie um em Estudos &gt; Temas para vincular.
          </p>
        )}
      </div>

      {/* Duracao — comum a qualquer tipo. */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-200">Duracao (minutos)</label>
        <input
          type="number"
          min={1}
          max={1440}
          data-testid="field-duration"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className={INPUT_CLS}
        />
      </div>

      {mode === 'stat_analysis' && (
        <div data-testid="stat-analysis-block" className={`${BLOCK_CLS} space-y-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Stat analisada</p>
              <p data-testid="stat-analysis-stat-id" className="text-sm font-semibold">
                {statLabel}
              </p>
            </div>
            <button
              type="button"
              data-testid="stat-analysis-add-play"
              onClick={addPlay}
              disabled={entries.length >= STAT_ENTRIES_CAP}
              className="px-3 py-1.5 text-sm rounded-md bg-poker-accent text-black font-semibold disabled:opacity-50"
            >
              Adicionar jogada
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry, i) => (
              <div key={i} data-testid={`play-entry-row-${i}`} className="rounded border border-gray-700 p-3 space-y-2">
                <input
                  type="text"
                  placeholder="Filtros (ex: BTN vs BB, 3bet pot)"
                  value={entry.filters}
                  onChange={(e) => updateEntry(i, { filters: e.target.value })}
                  className={INPUT_CLS}
                />
                <textarea
                  data-testid={`play-entry-error-${i}`}
                  placeholder="O que errei"
                  rows={3}
                  value={entry.errorText}
                  onChange={(e) => updateEntry(i, { errorText: e.target.value })}
                  className={INPUT_CLS}
                />
                <textarea
                  data-testid={`play-entry-learned-${i}`}
                  placeholder="O que aprendi"
                  rows={3}
                  value={entry.learnedText}
                  onChange={(e) => updateEntry(i, { learnedText: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'drill_gto' && (
        <div data-testid="drill-fields-block" className={`${BLOCK_CLS} space-y-3`}>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-200">Plataforma / solver</label>
            <select
              data-testid="field-drill-platform"
              value={drillPlatform}
              onChange={(e) => setDrillPlatform(e.target.value)}
              className={INPUT_CLS}
            >
              {DRILL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-200">Precisao (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              data-testid="field-drill-accuracy"
              value={drillAccuracy}
              onChange={(e) => setDrillAccuracy(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}

      {showDifficultSpots && (
        <div data-testid="difficult-spots-block" className={`${BLOCK_CLS} space-y-3`}>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-200">Spots dificeis</label>
            <button
              type="button"
              data-testid="difficult-spots-add"
              onClick={addSpot}
              disabled={difficultSpots.length >= DIFFICULT_SPOTS_CAP}
              className="px-3 py-1.5 text-sm rounded-md bg-poker-accent text-black font-semibold disabled:opacity-50"
            >
              Adicionar spot
            </button>
          </div>
          {difficultSpots.length === 0 ? (
            <p className="text-xs text-gray-500">
              Registre spots que te deram duvida (ex: "AKo BTN vs 3bet" + nota).
            </p>
          ) : (
            <div className="space-y-3">
              {difficultSpots.map((spot, i) => (
                <div key={i} data-testid={`difficult-spot-row-${i}`} className="rounded border border-gray-700 p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Contexto (ex: BTN vs BB, SRP)"
                    value={spot.context}
                    onChange={(e) => updateSpot(i, { context: e.target.value })}
                    className={INPUT_CLS}
                  />
                  <textarea
                    placeholder="Nota / duvida"
                    rows={3}
                    value={spot.note}
                    onChange={(e) => updateSpot(i, { note: e.target.value })}
                    className={INPUT_CLS}
                  />
                  <button type="button" onClick={() => removeSpot(i)} className="text-xs text-red-400 hover:underline">
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div data-testid="enriched-fields-block" className={`${BLOCK_CLS} space-y-3`}>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-200">{labels.hands}</label>
          <input
            type="number"
            min={0}
            data-testid="field-hands-solved"
            value={handsSolved}
            onChange={(e) => setHandsSolved(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-200">{labels.filters}</label>
          <input
            type="number"
            min={0}
            data-testid="field-filters-analyzed"
            value={filtersAnalyzed}
            onChange={(e) => setFiltersAnalyzed(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        {showLessonInsights && (
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-200">Insights da aula</label>
            <textarea
              data-testid="field-lesson-insights"
              rows={5}
              value={lessonInsights}
              onChange={(e) => setLessonInsights(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        )}
      </div>

      {/* Notas — comum a qualquer tipo. */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-200">Notas (opcional)</label>
          <span className="text-xs text-gray-500">{notes.length}/{NOTES_MAX}</span>
        </div>
        <textarea
          data-testid="field-notes"
          value={notes}
          rows={6}
          maxLength={NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observacoes livres sobre o estudo..."
          className={INPUT_CLS}
        />
      </div>

      {formError ? (
        <p
          data-testid="study-session-form-error"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="study-session-submit"
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-md bg-poker-accent text-black font-semibold hover:bg-poker-accent/90 disabled:opacity-50"
      >
        {submitting ? 'Registrando...' : 'Registrar sessao'}
      </button>
    </form>
  );
}
