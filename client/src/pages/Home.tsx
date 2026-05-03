/**
 * RF-08 — Home page (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-08, §3 D3, §3 D9
 * ADR-099 (Operations Cockpit), ADR-100 (News), ADR-101 (Sidebar IA),
 * ADR-102 (cache strategy).
 *
 * Single TanStack Query → /api/home/overview. Cache staleTime 30s.
 * userState=empty renderiza <EmptyHomeOnboarding>; userState=power renderiza
 * cockpit completo. Banner priority D9: flight acima de cooldown.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { WelcomeNameModal } from '@/components/WelcomeNameModal';
import { emit } from '@/lib/tracker';
import HeaderLogo from '@/components/branding/HeaderLogo';

import StatusStrip from '@/components/home/StatusStrip';
import TodayCard from '@/components/home/TodayCard';
import CooldownBanner from '@/components/home/CooldownBanner';
import FlightBanner from '@/components/home/FlightBanner';
import NextTournamentCountdown from '@/components/home/NextTournamentCountdown';
import LifetimeStats from '@/components/home/LifetimeStats';
import RecentSessionsList from '@/components/home/RecentSessionsList';
import PerformanceMini from '@/components/home/PerformanceMini';
import PendingHandsList from '@/components/home/PendingHandsList';
import NewsSlot from '@/components/home/NewsSlot';
import HomeFooter from '@/components/home/HomeFooter';
import EmptyHomeOnboarding from '@/components/home/EmptyHomeOnboarding';
// Sprint home-reform-1-5 (RF-22 + RF-23): forward-looking blocks.
import DailyInsight from '@/components/home/DailyInsight';
import LibraryResume from '@/components/home/LibraryResume';
// Sprint home-reform-2 Onda 2 (RF-29 / RF-30 / RF-31 / RF-34).
import StatsTopDeltas from '@/components/home/StatsTopDeltas';
import VarianceCard from '@/components/home/VarianceCard';
import TournamentRecommendations from '@/components/home/TournamentRecommendations';
import HeuristicsCard from '@/components/home/HeuristicsCard';

import type { NewsItem } from '@shared/types/news';

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
  }> | null;
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
  tournamentRecommendations?: Array<{
    id: string;
    name: string;
    buyinUsd: number;
    buyinNative: number;
    currency: string;
    score: number;
    grade: 'S' | 'A' | 'B';
    startTime: string;
    platform: string;
    alreadyInGrid: boolean;
  }>;
  heuristics?: Array<{
    id: string;
    message: string;
    severity: 'info' | 'caution' | 'positive';
    ctaHref: string | null;
  }>;
  meta: { generatedAt: string; cacheHit: boolean; subqueryTimingsMs: Record<string, number>; userTimezone?: string };
}

function readSkipOnboarding(): boolean {
  try {
    return localStorage.getItem('home:skipOnboarding') === 'true';
  } catch {
    return false;
  }
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

  // Tracking home_view (RNF-09): 1x por mount, quando data chega.
  useEffect(() => {
    if (!data || homeViewEmittedRef.current) return;
    homeViewEmittedRef.current = true;
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

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex items-center justify-center pt-2 pb-4">
          <HeaderLogo
            variant="full"
            alt="Grindfy"
            className="h-20 md:h-28 w-auto object-contain"
          />
        </div>

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
            {/* Banner priority D9: Flight acima de Cooldown. */}
            <FlightBanner banner={data.banners.flight} />
            <CooldownBanner banner={data.banners.cooldown} />

            <StatusStrip data={data.statusStrip} />

            {/* Sprint home-reform-1-5 RF-22: Insight do Dia (forward-looking). */}
            <DailyInsight data={data} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <TodayCard data={data.today} />
              </div>
              <div>
                <NextTournamentCountdown data={data.nextTournament} />
              </div>
            </div>

            <LifetimeStats data={data.lifetime} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RecentSessionsList data={data.recentSessions ?? []} />
              <PendingHandsList data={data.pendingHands} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Sprint home-reform-1-5 RF-23: Continue Assistindo. */}
              <LibraryResume />
              <PerformanceMini data={data.performance} />
            </div>

            {/* Sprint home-reform-2 Onda 2: Stats top deltas + Variance check. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatsTopDeltas data={data.topDeltas ?? null} />
              <VarianceCard data={data.variance ?? null} />
            </div>

            {/* Sprint home-reform-2 Onda 2: Tournament recommendations + Heuristics. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <TournamentRecommendations
                  data={data.tournamentRecommendations ?? []}
                  plannedTodayCount={data.today?.plannedCount ?? 0}
                />
              </div>
              <HeuristicsCard data={data.heuristics ?? null} />
            </div>

            <NewsSlot enabled={data.news.enabled} items={data.news.items} />
          </>
        )}

        <HomeFooter />
      </div>

      <WelcomeNameModal open={showWelcomeModal} onComplete={handleWelcomeComplete} />
    </div>
  );
};

export default Home;
