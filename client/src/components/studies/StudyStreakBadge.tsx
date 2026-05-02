/**
 * Sprint Studies-Reform — RF-12 (D3, D10): StudyStreakBadge
 *
 * Renderiza streak counter com 5 estados visuais:
 *   - inactive (0)        : cinza
 *   - starting (1-2)      : azul
 *   - building (3-6)      : amarelo
 *   - fire (7-29)         : laranja
 *   - freeze (30+)        : roxo
 *
 * Lessons aplicadas:
 *   #1 hooks first (useQuery antes de qualquer return)
 *   #2 data-testid: study-streak-badge
 *   #3 mock shape REAL (days, last_activity_at, heatmap_last_7_days)
 *  #12 estado persistente: TanStack Query cache survive re-mount
 *
 * Implementation note: separa em ConnectedBadge (com useQuery) vs FallbackBadge
 * (sem useQuery) para tolerar uso fora de QueryClientProvider — usado pela
 * sidebar em testes que nao instalam provider.
 */

import React from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Flame } from 'lucide-react';

const STREAK_LOCAL_KEY = 'grindfy:studies:streak';

interface StreakResponse {
  days: number;
  last_activity_at: string | null;
  heatmap_last_7_days?: Array<{ date: string; active: boolean }>;
}

type StreakState = 'inactive' | 'starting' | 'building' | 'fire' | 'freeze';

function pickState(days: number): StreakState {
  if (days <= 0) return 'inactive';
  if (days <= 2) return 'starting';
  if (days <= 6) return 'building';
  if (days < 30) return 'fire';
  return 'freeze';
}

function readLocalFallback(): StreakResponse | null {
  try {
    const raw = localStorage.getItem(STREAK_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      days: Number(parsed.days ?? 0),
      last_activity_at: parsed.lastActivityAt ?? null,
      heatmap_last_7_days: [],
    };
  } catch {
    return null;
  }
}

const STATE_LABEL: Record<StreakState, string> = {
  inactive: 'Inicie sua streak hoje',
  starting: 'comecando',
  building: 'construindo',
  fire: 'em chamas',
  freeze: 'freeze disponivel',
};

const STATE_CLASS: Record<StreakState, string> = {
  inactive: 'bg-gray-700 text-gray-300',
  starting: 'bg-blue-600/30 text-blue-300 border border-blue-500/40',
  building: 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/40',
  fire: 'bg-orange-600/30 text-orange-300 border border-orange-500/40',
  freeze: 'bg-purple-600/30 text-purple-300 border border-purple-500/40',
};

function BadgeView({
  days,
  onActivate,
}: {
  days: number;
  onActivate?: () => void;
}) {
  const state = pickState(days);
  const label = STATE_LABEL[state];
  const cls = STATE_CLASS[state];
  const content = (
    <>
      <Flame className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{state === 'inactive' ? label : `${days} dias - ${label}`}</span>
    </>
  );
  if (state === 'inactive' && onActivate) {
    return (
      <button
        type="button"
        data-testid="study-streak-badge"
        data-state={state}
        data-days={days}
        onClick={onActivate}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium hover:opacity-90 ${cls}`}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      data-testid="study-streak-badge"
      data-state={state}
      data-days={days}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${cls}`}
    >
      {content}
    </div>
  );
}

function ConnectedStreakBadge() {
  const [, navigate] = useLocation();
  const { data } = useQuery<StreakResponse>({
    queryKey: ['/api/study/streak'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/study/streak', { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        return await res.json();
      } catch (err) {
        console.error('[StudyStreakBadge] api failed, using localStorage', {
          error: err instanceof Error ? err.message : String(err),
        });
        const local = readLocalFallback();
        return local ?? { days: 0, last_activity_at: null, heatmap_last_7_days: [] };
      }
    },
    staleTime: 60 * 1000,
  });

  const days = Number(data?.days ?? 0);
  return <BadgeView days={days} onActivate={() => navigate('/grind')} />;
}

function FallbackStreakBadge() {
  // Sem QueryClient (test direto sem provider): renderiza com localStorage ou 0
  const local = readLocalFallback();
  const days = Number(local?.days ?? 0);
  return <BadgeView days={days} />;
}

export function StudyStreakBadge() {
  // Detecta se ha QueryClientProvider no contexto. Em ambientes sem provider
  // (testes diretos da sidebar), cai no FallbackStreakBadge (no useQuery).
  const client = React.useContext(QueryClientContext);
  if (!client) {
    return <FallbackStreakBadge />;
  }
  return <ConnectedStreakBadge />;
}

export default StudyStreakBadge;
