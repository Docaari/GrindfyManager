// =============================================================================
// RateLimitBanner — Sprint Coach-1 Frontend UX / RF-09
// Banner fixo superior quando usuario atinge limite diario do coach.
// Mostra countdown ate reset e CTA para upgrade.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-09)
// =============================================================================

import * as React from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTimeUntilReset } from '@/lib/coachTimeUtils';

export interface RateLimitBannerProps {
  limit: number;
  remaining: number;
  resetAt: string;
  upgradeTo: string | null;
  currentPlan: string;
  onUpgrade?: () => void;
  /**
   * HIGH-4 fix: callback disparado quando o tempo de reset expira (Date.now()
   * >= resetAt). Permite ao parent limpar o estado de rateLimitError
   * automaticamente para o banner desaparecer sem reload manual.
   */
  onExpire?: () => void;
}

function formatPlanLabel(plan: string): string {
  const map: Record<string, string> = {
    pro: 'Pro',
    premium: 'Premium',
    free: 'Free',
  };
  return map[plan?.toLowerCase()] || plan;
}

// MEDIUM-11 fix: helper extraido para client/src/lib/coachTimeUtils.ts
// para reuso entre RateLimitBanner e CoachAI LimitCounter.

export function RateLimitBanner({
  limit,
  remaining,
  resetAt,
  upgradeTo,
  currentPlan,
  onUpgrade,
  onExpire,
}: RateLimitBannerProps): JSX.Element | null {
  const [, setLocation] = useLocation();
  const [, forceUpdate] = React.useState(0);

  // Re-render a cada 60s para atualizar countdown.
  // HIGH-4 fix: comparar Date.now() >= resetAt e disparar onExpire quando passa.
  React.useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((n) => n + 1);
      try {
        const target = new Date(resetAt).getTime();
        if (!Number.isNaN(target) && Date.now() >= target) {
          if (onExpire) onExpire();
        }
      } catch {
        /* ignore parse errors */
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [resetAt, onExpire]);

  if (remaining > 0) return null;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      setLocation('/subscriptions');
    }
  };

  const timeText = formatTimeUntilReset(resetAt);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-red-900/30 border border-red-700/50 text-red-100 px-4 py-3 flex items-center gap-3"
    >
      <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium">
          Voce atingiu o limite diario ({limit}/{limit} mensagens).
        </p>
        <p className="text-xs text-red-200/80 mt-0.5">
          Plano atual: {formatPlanLabel(currentPlan)}. Volta {timeText}.
        </p>
      </div>
      {upgradeTo && (
        <Button
          size="sm"
          onClick={handleUpgrade}
          className="bg-red-600 hover:bg-red-500 text-white"
        >
          Upgrade para {formatPlanLabel(upgradeTo)}
        </Button>
      )}
    </div>
  );
}

export default RateLimitBanner;
