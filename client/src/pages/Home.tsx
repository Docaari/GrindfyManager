/**
 * RF-08 — Home page (Sprint home-reform-1 + Onda 3 zoning).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-08, §3 D3, §3 D9
 *       Docs/specs/home-reform-3.md §RF-A1, §RF-A2, §RF-A3, §RF-A5, §RF-B1
 * ADR-099 (Operations Cockpit), ADR-100 (News), ADR-101 (Sidebar IA),
 * ADR-102 (cache strategy), ADR-110 (zoning + ranking).
 *
 * Single TanStack Query → /api/home/overview. Cache staleTime 30s.
 * userState=empty renderiza <EmptyHomeOnboarding>; userState=power renderiza
 * cockpit em 5 zonas semanticas: Inicio | Acao Imediata | Sessoes Registradas | Estudos | Noticias.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto
 *   #17 nao reusar nome `profile` (ja em uso). Aqui usamos `data.profile`.
 *
 * Notas conhecidas (HIGH-2 reviewer):
 *   Wouter v3.3.5: o padrao `<Link href><a>...</a></Link>` esta CORRETO.
 *   Em v3 o Link com child element transfere props/href para o child anchor
 *   sem renderizar uma anchor extra (sem nested anchors). Verificado em
 *   wouter/index.d.ts e usage docs. Mantemos o `<a>` filho explicito para
 *   herdar `href` em SSR/copy-link.
 *
 *   LOW-17 reviewer (deferred OK pre-existente): StatusStrip sticky pode
 *   sobrepor banners (Cooldown/Flight) em viewports estreitos quando o
 *   usuario rola. Conhecido e fora do escopo deste sprint — fix deve
 *   considerar reordering banners-ABOVE-strip OU dynamic offset top.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { WelcomeNameModal } from '@/components/WelcomeNameModal';
import { emit } from '@/lib/tracker';

import StatusStrip from '@/components/home/StatusStrip';
import HeaderStrip from '@/components/home/HeaderStrip';
import TodayCard from '@/components/home/TodayCard';
import CooldownBanner from '@/components/home/CooldownBanner';
import NextTournamentCountdown from '@/components/home/NextTournamentCountdown';
import RecentSessionsList from '@/components/home/RecentSessionsList';
import PerformanceMini from '@/components/home/PerformanceMini';
import SessionsRegisteredCard from '@/components/home/SessionsRegisteredCard';
import PendingHandsList from '@/components/home/PendingHandsList';
import ImmediateAction, { type ImmediateActionData } from '@/components/home/ImmediateAction';
import HomeFooter from '@/components/home/HomeFooter';
import EmptyHomeOnboarding from '@/components/home/EmptyHomeOnboarding';
import DailyInsight from '@/components/home/DailyInsight';
import CoachRecommendationCard from '@/components/home/CoachRecommendationCard';
import StatsTopDeltas from '@/components/home/StatsTopDeltas';
import VarianceCard from '@/components/home/VarianceCard';
import HeuristicsCard from '@/components/home/HeuristicsCard';
import GradeTodayCard from '@/components/home/GradeTodayCard';
import HomeHeader from '@/components/home/HomeHeader';
import EmptyPerformanceCluster from '@/components/home/EmptyPerformanceCluster';
import NewsFeed from '@/components/home/NewsFeed';
import DashboardAllTimeCard from '@/components/home/DashboardAllTimeCard';
import AllTimeEvolutionChart from '@/components/home/AllTimeEvolutionChart';
import FocusStatsCard from '@/components/home/FocusStatsCard';

import type { NewsItem } from '@shared/types/news';
// Sprint home-reform-5 item 11 — visibility toggles.
import {
  DEFAULT_HOME_LAYOUT_SETTINGS,
  type HomeLayoutSettings,
} from '@shared/types/homeSettings';

// =============================================================================
// Schema da resposta — espelha RF-01 + ADR-099 §2.1
// =============================================================================

interface HomeOverviewResponse {
  userState: 'empty' | 'power';
  statusStrip: {
    banca: { totalUsd: number; bisAvailable: number | null; deltaPct7d: number | null; sparkline: number[] } | null;
    roi30d: { value: number; sparkline: number[] } | null;
    today: { plannedCount: number; firstStartTime: string | null; realizedPnlUsd: number | null } | null;
    pendencias: { starredHands: number; cooldownAlerts: number } | null;
  };
  today: {
    profile: 'A' | 'B' | 'C' | 'OFF' | null;
    plannedCount: number;
    firstStartTime: string | null;
    stopLoss: { amount: number; currency: string } | null;
    stopTime: string | null;
    hasWarmupToday: boolean;
  } | null;
  banners: {
    cooldown: { active: boolean; until: string; type: 'stop-loss' | 'time-stop' | 'manual' } | null;
    flight: {
      active: boolean;
      seriesTitle: string;
      nextDayStartTime: string;
      currentStackBb: number;
      day: number;
    } | null;
  };
  nextTournament: {
    startTime: string;
    name: string;
    buyin: number;
    currency: string;
    platform: string;
  } | null;
  lifetime: {
    totalTournaments: number;
    totalSessions: number;
    activeDays: number;
    currentStreakDays: number;
  };
  recentSessions: Array<{
    id: string;
    date: string;
    pnlUsd: number;
    tournamentCount: number;
    primaryPlatform: string;
    status: 'live' | 'ended' | 'finalized';
    // Sprint home-reform-5 item 6.
    investedUsd?: number;
    roi?: number | null;
    itm?: number;
    finalTables?: number;
    wins?: number;
  }> | null;
  // Sprint home-reform-5 item 6 — card "Sessoes Registradas" (renome Performance).
  sessionsRegistered?: {
    tournaments: number;
    profit: number;
    invested: number;
    roi: number | null;
    itm: number;
    finalTables: number;
    wins: number;
  } | null;
  performance: {
    roi: number;
    itm: number;
    cash: number;
    sparkline: number[];
    period: '7d' | '30d' | '90d' | 'ytd';
  } | null;
  pendingHands: Array<{
    id: string;
    hero: string;
    context: string;
    tag: string;
    ageRelative: string;
  }>;
  news: { enabled: boolean; items: NewsItem[] };
  // Sprint home-reform-1-5 RF-25.1: profile + profileMeta.
  profile?: 'upload-only' | 'session-only' | 'hybrid' | 'new';
  profileMeta?: {
    totalUploads: number;
    totalSessions: number;
    sessionTournamentCount: number;
    detectedAt: string;
  };
  // Sprint home-reform-2 Onda 2.
  topDeltas?: Array<{
    stat: string;
    statLabel: string;
    baseline: number;
    current: number;
    delta: number;
    deltaAbs: number;
    severity: 'high' | 'medium' | 'low';
    direction: 'positive' | 'negative' | 'neutral';
    period: '30d';
  }>;
  variance?: {
    sessionsCount: number;
    actualUsd: number;
    expectedUsd: number;
    expectedSource: 'primedope-cache' | 'fallback-zero';
    deviationUsd: number;
    sigmaUsd: number;
    sigmaMultiple: number;
    status: 'lucky' | 'normal' | 'unlucky';
    period: '90d';
  } | null;
  heuristics?: Array<{
    id: string;
    message: string;
    severity: 'info' | 'caution' | 'positive';
    ctaHref: string | null;
  }>;
  // Sprint home-reform-5 item 2 — Header Strip.
  headerStrip?: {
    banca: { totalUsd: number; currency: 'USD' } | null;
    today: { profile: 'A' | 'B' | 'C' | null; plannedCount: number; isOff: boolean };
    roi30d: { value: number | null; hasData: boolean };
    pendency: {
      kind:
        | 'bankroll_check'
        | 'coach_report'
        | 'upload_tournaments'
        | 'spot_review'
        | 'focus_stat';
      label: string;
      ctaHref: string;
      daysSince: number | null;
    } | null;
  };
  // Sprint home-reform-5 item 3 — Coach Context (multi-profile + DAY OFF).
  coachContext?: {
    activeProfiles: ('A' | 'B' | 'C')[];
    todayTournamentsTotal: number;
    isDayOff: boolean;
  };
  // Sprint home-reform-5 item 4 — Acao Imediata (pending_hand|focus_stat|start_session).
  immediateAction?: ImmediateActionData | null;
  // Sprint home-reform-4 item 1.
  // Sprint home-reform-5 item 7.
  dashboardAllTime?: {
    tournaments: number;
    profit: number;
    invested: number;
    roi: number | null;
    itm: number;
    finalTables: number;
    wins: number;
  } | null;
  meta: { generatedAt: string; cacheHit: boolean; subqueryTimingsMs: Record<string, number>; userTimezone?: string };
}

function readSkipOnboarding(): boolean {
  try {
    return localStorage.getItem('home:skipOnboarding') === 'true';
  } catch {
    return false;
  }
}

// Heading sutil reutilizado entre zonas.
function ZoneHeading({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </h2>
  );
}

const Home: React.FC = () => {
  // Hooks first (lesson #1).
  const { user } = useAuth();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [skipOnboarding, setSkipOnboarding] = useState<boolean>(() => readSkipOnboarding());
  const homeViewEmittedRef = useRef(false);
  const profileDetectedEmittedRef = useRef(false);

  const { data, isLoading } = useQuery<HomeOverviewResponse>({
    queryKey: ['/api/home/overview'],
    queryFn: () => apiRequest('GET', '/api/home/overview'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Sprint home-reform-5 item 11 — settings de visibilidade. Carrega em
  // paralelo a /api/home/overview; defaults aplicados quando ainda nao
  // resolveu (todos toggles ON).
  const { data: settings } = useQuery<HomeLayoutSettings>({
    queryKey: ['/api/home/settings'],
    queryFn: () => apiRequest('GET', '/api/home/settings'),
    staleTime: 60_000,
  });
  const visibility =
    settings && settings.visibility
      ? { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility, ...settings.visibility }
      : DEFAULT_HOME_LAYOUT_SETTINGS.visibility;

  // Listener para 'home:skipOnboarding' — reflete click do user no botao
  // "Pular onboarding" mesmo quando o write vem da mesma aba.
  useEffect(() => {
    const sync = () => setSkipOnboarding(readSkipOnboarding());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  // WelcomeNameModal trigger no primeiro login (preservado de Home antiga).
  useEffect(() => {
    if (user && (!user.name || (typeof user.name === 'string' && user.name.trim() === ''))) {
      try {
        const hasSetName = localStorage.getItem(`hasSetName_${user.userPlatformId}`);
        if (!hasSetName) {
          setShowWelcomeModal(true);
        }
      } catch {
        // ignore
      }
    }
  }, [user]);

  // Tracking home_view (RNF-09): 1x por sessao do browser via sessionStorage.
  // Evita inflar metric com mounts subsequentes (cache hits, navegacao back).
  useEffect(() => {
    if (!data || homeViewEmittedRef.current) return;
    homeViewEmittedRef.current = true;
    try {
      const sentKey = 'home:viewEmitted';
      if (sessionStorage.getItem(sentKey) === '1') return;
      sessionStorage.setItem(sentKey, '1');
    } catch {
      // sessionStorage indisponivel (privacy mode) — emite mesmo assim.
    }
    emit('home_view', {
      userState: data.userState,
      cacheHit: data.meta?.cacheHit ?? false,
    });
  }, [data]);

  // Sprint home-reform-1-5 RF-25.5: home_profile_detected 1x por mount.
  useEffect(() => {
    if (!data || profileDetectedEmittedRef.current) return;
    if (!data.profile) return;
    profileDetectedEmittedRef.current = true;
    emit('home_profile_detected', {
      profile: data.profile,
      totalUploads: data.profileMeta?.totalUploads ?? 0,
      totalSessions: data.profileMeta?.totalSessions ?? 0,
      sessionTournamentCount: data.profileMeta?.sessionTournamentCount ?? 0,
    });
  }, [data]);

  const handleWelcomeComplete = () => {
    setShowWelcomeModal(false);
    if (user) {
      try {
        localStorage.setItem(`hasSetName_${user.userPlatformId}`, 'true');
      } catch {
        // ignore
      }
    }
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-3">
          <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-32 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-48 rounded-lg bg-muted/40 animate-pulse" />
        </div>
      </div>
    );
  }

  const isEmpty = data.userState === 'empty' && !skipOnboarding;

  // Onda 3 RF-A5: aggregate empty for Performance zone Onda 2 cards.
  // Sprint home-reform-4 item 5: TournamentRecommendations substituido por
  // GradeTodayCard (zona Acao Imediata) — fora do perfCluster.
  const perfClusterEmpty =
    (data.topDeltas ?? []).length === 0 &&
    data.variance == null &&
    (data.heuristics ?? []).length === 0;

  const userTimezone = data.meta?.userTimezone || 'America/Sao_Paulo';
  const firstName =
    user?.firstName ||
    (typeof user?.name === 'string' ? user.name.trim().split(/\s+/)[0] : null) ||
    null;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-3">
        <HomeHeader
          firstName={firstName}
          timezone={userTimezone}
          streakDays={data.lifetime?.currentStreakDays ?? 0}
        />

        {isEmpty ? (
          <EmptyHomeOnboarding
            data={{
              totalTournaments: data.lifetime.totalTournaments,
              totalSessions: data.lifetime.totalSessions,
              walletsConfigured: !!data.statusStrip.banca,
              gradeDays: data.today?.plannedCount ?? 0,
            }}
            profile={data.profile}
          />
        ) : (
          <>
            {/* Sprint home-reform-5 item 1: FlightBanner removido. */}
            <CooldownBanner banner={data.banners.cooldown} />

            {/* Sprint home-reform-5 item 2: HeaderStrip substitui StatusStrip nesta posicao. */}
            {/* Sprint home-reform-5 item 11: respeita visibility.headerStrip. */}
            {visibility.headerStrip ? (
              <div
                data-testid="sticky-status-strip"
                className="sticky top-0 z-30 backdrop-blur-sm bg-background/85 -mx-4 px-4 md:-mx-6 md:px-6 py-2"
              >
                {data.headerStrip ? (
                  <HeaderStrip data={data.headerStrip} />
                ) : (
                  <StatusStrip data={data.statusStrip} />
                )}
              </div>
            ) : null}

            {/* Zona 1 — Hoje (toggle visibility.coach) */}
            {visibility.coach ? (
              <section data-testid="home-zone-today" className="space-y-3">
                <ZoneHeading>Inicio</ZoneHeading>
                <DailyInsight data={data} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <TodayCard data={data.today} coachContext={data.coachContext} />
                  </div>
                  <div>
                    <NextTournamentCountdown
                      data={data.nextTournament}
                      coachContext={data.coachContext}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {/* Zona 2 — Acao Imediata + Grade do Dia */}
            {(visibility.immediateAction || visibility.gradeToday) ? (
              <section data-testid="home-zone-action" className="space-y-3">
                <ZoneHeading>Acao Imediata</ZoneHeading>
                {visibility.immediateAction ? (
                  <>
                    <ImmediateAction data={data.immediateAction ?? null} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <PendingHandsList data={data.pendingHands} />
                      <CoachRecommendationCard />
                    </div>
                  </>
                ) : null}
                {visibility.gradeToday ? (
                  (data.heuristics ?? []).length === 0 ? (
                    <GradeTodayCard
                      defaultProfile={
                        data.today?.profile === 'A' || data.today?.profile === 'B' || data.today?.profile === 'C'
                          ? data.today.profile
                          : 'A'
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <GradeTodayCard
                          defaultProfile={
                            data.today?.profile === 'A' || data.today?.profile === 'B' || data.today?.profile === 'C'
                              ? data.today.profile
                              : 'A'
                          }
                        />
                      </div>
                      <HeuristicsCard data={data.heuristics ?? null} />
                    </div>
                  )
                ) : null}
              </section>
            ) : null}

            {/* Zona 3 — Sessoes Registradas + Dashboard + Performance */}
            {(visibility.sessionsRegistered || visibility.dashboard || visibility.performance) ? (
              <section data-testid="home-zone-perf" className="space-y-3">
                <ZoneHeading>Sessoes Registradas</ZoneHeading>
                {visibility.sessionsRegistered ? (
                  <>
                    <SessionsRegisteredCard data={data.sessionsRegistered ?? null} />
                    <RecentSessionsList data={data.recentSessions ?? []} />
                  </>
                ) : null}
                {visibility.dashboard ? (
                  <>
                    <DashboardAllTimeCard data={data.dashboardAllTime ?? null} />
                    <AllTimeEvolutionChart />
                  </>
                ) : null}
                {visibility.performance ? (
                  <>
                    <PerformanceMini data={data.performance} />
                    {perfClusterEmpty ? (
                      <EmptyPerformanceCluster
                        sessionsCount={data.lifetime?.totalSessions ?? 0}
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <StatsTopDeltas data={data.topDeltas ?? null} />
                        <VarianceCard data={data.variance ?? null} />
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            ) : null}

            {/* Zona 4 — Estudos */}
            {visibility.studies ? (
              <section data-testid="home-zone-estudos" className="space-y-3">
                <ZoneHeading>Estudos</ZoneHeading>
                <FocusStatsCard />
              </section>
            ) : null}

            {/* Zona 5 — Noticias, Estudos e Atualizacoes (home-reform-5 item 10) */}
            {visibility.news ? (
              <section data-testid="home-zone-news" className="space-y-3">
                <NewsFeed />
              </section>
            ) : null}
          </>
        )}

        <HomeFooter />
      </div>

      <WelcomeNameModal open={showWelcomeModal} onComplete={handleWelcomeComplete} />
    </div>
  );
};

export default Home;
