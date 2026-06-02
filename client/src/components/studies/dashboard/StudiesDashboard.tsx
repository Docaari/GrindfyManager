/**
 * Sprint Studies-Reform — RF-02: StudiesDashboard
 *
 * 5 secoes em cards: continue / insights / spots / recomendacoes / streak.
 * Tolera falha por secao (lesson #9): isEnabled allSettled-like via try/catch
 * em queryFn — falha de uma query nao bloqueia outras.
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Plus } from 'lucide-react';
import { ContinueWhereLeftOff } from './ContinueWhereLeftOff';
import { WeekInsights } from './WeekInsights';
import { PendingSpotsPreview } from './PendingSpotsPreview';
import { RecommendationsPreview } from './RecommendationsPreview';
import { StudyStreakBadge } from '../StudyStreakBadge';
import { EmptyState } from '../EmptyState';
// Sprint Estudos-Habito-1 (RF-2.4 / RF-4 / RF-1.6): wiring na home /estudos.
import { StudyHeaderHabit, type StudyHeaderHabitData } from '@/components/study/StudyHeaderHabit';
import { FocusStatsBar } from '@/components/study/FocusStatsBar';
import { StudyLogDialog } from '@/components/study/StudyLogDialog';
import { useFocusStatsBar } from '@/hooks/useFocusStatsBar';
// Sprint Estudos-Coach-Biblio-2 RF-2.5 + RF-3.6: weekly plan + biblioteca
// recommendations no header /estudos.
import { StudyWeeklyPlanCard } from '@/components/study/StudyWeeklyPlanCard';
import { BibliotecaRecommendationsCard } from '@/components/biblioteca/BibliotecaRecommendationsCard';
// Sprint Spot-Anki-Reentry-3 RF-5: widget de stats SRS no dashboard.
import { SrsStatsCard } from '@/components/study/SrsStatsCard';

interface RecResponse {
  items: Array<{
    id: string;
    type: 'leak' | 'stale_spot' | 'dormant_theme';
    title: string;
    description?: string;
    priority_score: number;
    cta_action?: string;
    cta_url?: string;
    metadata?: Record<string, any>;
  }>;
  source_counts?: { leaks: number; stale_spots: number; dormant_themes: number };
  generated_at?: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export function StudiesDashboard() {
  const [, navigate] = useLocation();
  // Sprint Estudos-Habito-1 RF-1: dialog "Registrar Estudo" controlado.
  const [logOpen, setLogOpen] = useState(false);

  // RF-2: study habit (streak + meta + freezes).
  const habitQ = useQuery<StudyHeaderHabitData>({
    queryKey: ['/api/users/me/study-habit'],
    queryFn: () =>
      jsonFetch<StudyHeaderHabitData>('/api/users/me/study-habit').catch(() => ({
        streakDays: 0,
        todayMinutes: 0,
        goalMinutes: 0,
        todayMet: true,
        freezesUsedThisMonth: 0,
        freezesRemaining: 2,
      })),
    staleTime: 30 * 1000,
  });

  // RF-4: FocusStatsBar (placement="estudos").
  const focusBar = useFocusStatsBar('estudos');

  const themesQ = useQuery<any[]>({
    queryKey: ['/api/study-themes'],
    queryFn: () => jsonFetch<any[]>('/api/study-themes').catch(() => []),
    staleTime: 30 * 1000,
  });

  const spotsQ = useQuery<any[]>({
    queryKey: ['/api/starred-hands', 'dashboard'],
    queryFn: () =>
      jsonFetch<any[]>('/api/starred-hands?reviewLater=true').catch(() => []),
    staleTime: 30 * 1000,
  });

  const insightsQ = useQuery<{
    themesOpenedThisWeek: number;
    spotsReviewedThisWeek: number;
    hoursStudiedThisWeek: number;
  }>({
    queryKey: ['/api/dashboard/insights/week'],
    queryFn: () =>
      jsonFetch<any>('/api/dashboard/insights/week').catch(() => ({
        themesOpenedThisWeek: 0,
        spotsReviewedThisWeek: 0,
        hoursStudiedThisWeek: 0,
      })),
    staleTime: 5 * 60 * 1000,
  });

  const recsQ = useQuery<RecResponse>({
    queryKey: ['study', 'recommendations'],
    queryFn: () =>
      jsonFetch<RecResponse>('/api/study/recommendations').catch(() => ({
        items: [],
        source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 },
      })),
    staleTime: 5 * 60 * 1000,
  });

  const themes = themesQ.data ?? [];
  const spots = spotsQ.data ?? [];
  const insights = insightsQ.data ?? {
    themesOpenedThisWeek: 0,
    spotsReviewedThisWeek: 0,
    hoursStudiedThisWeek: 0,
  };
  const recs = recsQ.data ?? { items: [], source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 } };
  // P0 #7: streak agora vem de habitQ (single query) — antes tinhamos duplicate
  // GET /api/study/streak. StudyStreakBadge tambem ja le de habit endpoint.
  const streakDays = habitQ.data?.streakDays ?? 0;

  const isFirstFetch =
    themesQ.isLoading || spotsQ.isLoading || insightsQ.isLoading || habitQ.isLoading;

  const isEmpty = useMemo(
    () => themes.length === 0 && spots.length === 0,
    [themes, spots],
  );

  const greet = greeting();

  if (isFirstFetch) {
    return (
      <div data-testid="studies-dashboard" className="p-6 space-y-4">
        <div className="text-2xl font-semibold text-white">{greet}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              data-testid={`studies-dashboard-skeleton-${n}`}
              className="h-32 rounded-lg bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div data-testid="studies-dashboard" className="p-6">
        <div className="text-2xl font-semibold text-white mb-4">{greet}</div>
        <EmptyState
          area="dashboard"
          title="Comece sua jornada de estudos"
          description="Crie seu primeiro tema para comecar a organizar seu conhecimento."
          ctaLabel="Criar primeiro tema"
          ctaAction={() => navigate('/estudos/temas/novo')}
        />
        <button
          type="button"
          data-testid="studies-dashboard-empty-cta"
          onClick={() => navigate('/estudos/temas/novo')}
          className="hidden"
        >
          Criar primeiro tema
        </button>
      </div>
    );
  }

  return (
    <div data-testid="studies-dashboard" className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{greet}</h1>
        <p className="text-sm text-gray-400 mt-1">Continue de onde parou nos estudos.</p>
      </div>

      {/* Sprint Estudos-Habito-1 RF-2.4: header habito (streak + meta + freezes). */}
      {habitQ.data && <StudyHeaderHabit data={habitQ.data} />}

      {/* Sprint Estudos-Habito-1 RF-4: FocusStatsBar para /estudos. */}
      <FocusStatsBar
        placement="estudos"
        data={focusBar.data}
        loading={focusBar.loading}
        error={focusBar.error}
        visible={focusBar.visible}
      />

      {/* Sprint Estudos-UX-Fix FASE 2 (discoverability): entry points globais.
          Antes a unica forma de registrar um MDA era pelo botao DENTRO da pagina
          de tema, e "Registrar Estudo" abria so o quick-log (StudyLogDialog), nao
          o form unificado EST-3. Agora os 2 fluxos canonicos sao alcancaveis a 1
          clique do dashboard; o quick-log fica como acao secundaria. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="studies-dashboard-register-study"
          onClick={() => navigate('/estudos/registrar')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-poker-accent text-black rounded-lg font-semibold transition-all hover:bg-poker-accent/90 hover:shadow-lg hover:shadow-poker-accent/20"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Registrar Estudo
        </button>
        <button
          type="button"
          data-testid="studies-dashboard-register-mda"
          onClick={() => navigate('/estudos/mda/registrar')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold border border-gray-700 text-gray-200 transition-colors hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Registrar MDA
        </button>
        <button
          type="button"
          data-testid="studies-dashboard-quick-log"
          onClick={() => setLogOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-400 transition-colors hover:text-gray-200 hover:bg-gray-800/60"
        >
          Log rapido
        </button>
      </div>

      {/* Sprint Estudos-Coach-Biblio-2 RF-3.6: plano semanal Coach. */}
      <StudyWeeklyPlanCard />

      {/* Sprint Estudos-Coach-Biblio-2 RF-2.5: aulas recomendadas por leak. */}
      <BibliotecaRecommendationsCard placement="estudos" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section
          data-testid="studies-dashboard-card-continue"
          aria-label="Continue de onde parou"
          className="rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 space-y-2 transition-colors hover:border-gray-600"
        >
          <h2 className="text-sm font-semibold text-gray-300">Continue de onde parou</h2>
          <ContinueWhereLeftOff themes={themes as any} />
        </section>

        <section
          data-testid="studies-dashboard-card-insights"
          aria-label="Insights da semana"
          className="rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 space-y-2 transition-colors hover:border-gray-600"
        >
          <h2 className="text-sm font-semibold text-gray-300">Insights da semana</h2>
          <WeekInsights insights={insights} />
        </section>

        <section
          data-testid="studies-dashboard-card-spots"
          aria-label="Spots pendentes"
          className="rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 space-y-2 transition-colors hover:border-gray-600"
        >
          <h2 className="text-sm font-semibold text-gray-300">Spots pendentes</h2>
          <PendingSpotsPreview spots={spots as any} />
        </section>

        <section
          data-testid="studies-dashboard-card-recomendacoes"
          aria-label="Recomendacoes"
          className="rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 space-y-2 transition-colors hover:border-gray-600"
        >
          <h2 className="text-sm font-semibold text-gray-300">Recomendacoes</h2>
          <RecommendationsPreview items={recs.items as any} />
        </section>

        <section
          data-testid="studies-dashboard-card-streak"
          aria-label="Streak de estudos"
          data-streak-days={streakDays}
          className="rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 space-y-2 transition-colors hover:border-gray-600"
        >
          <h2 className="text-sm font-semibold text-gray-300">Streak</h2>
          <StudyStreakBadge />
        </section>

        {/* Sprint Spot-Anki-Reentry-3 RF-5: widget Cards SRS — wrap em try
            via ErrorBoundary local interno do componente (lesson #29). */}
        <section
          data-testid="studies-dashboard-card-srs-stats"
          aria-label="Cards de revisao espacada"
          className="lg:col-span-1"
        >
          <SrsStatsCard />
        </section>
      </div>

      {/* Sprint Estudos-Habito-1 RF-1: dialog de registro lazy mount. P0 #7
          decisao: /estudos usa botao "Registrar Estudo" + dialog inline; FAB
          fica reservado para /coach + /grind-live (evita dialog duplicado). */}
      {logOpen && (
        <StudyLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
      )}
    </div>
  );
}

export default StudiesDashboard;
