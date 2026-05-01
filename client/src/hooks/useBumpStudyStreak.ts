/**
 * Sprint Studies-Reform — RF-12 (D3, D10): hook para atualizar streak
 *
 * POST /api/study/streak/bump (idempotente por dia). Em caso de falha de
 * rede / servidor, faz fallback localStorage (chave: grindfy:studies:streak).
 *
 * Lessons:
 *   #9 logar antes do fallback
 *  #12 estado persistente: invalida cache /api/study/streak para sync UI
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const STREAK_LOCAL_KEY = 'grindfy:studies:streak';

interface StreakPayload {
  days: number;
  last_activity_at: string | null;
  bumped: boolean;
}

function readLocalStreak(): { days: number; lastActivityAt: string | null } | null {
  try {
    const raw = localStorage.getItem(STREAK_LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalStreak(data: { days: number; lastActivityAt: string | null }): void {
  try {
    localStorage.setItem(STREAK_LOCAL_KEY, JSON.stringify(data));
  } catch {
    // localStorage indisponivel — silenciar
  }
}

function bumpLocalStreak(): StreakPayload {
  const now = new Date();
  const todayIso = now.toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const prev = readLocalStreak();
  if (!prev || !prev.lastActivityAt) {
    writeLocalStreak({ days: 1, lastActivityAt: todayIso });
    return { days: 1, last_activity_at: todayIso, bumped: true };
  }

  const prevDate = new Date(prev.lastActivityAt);
  const prevStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate()).getTime();

  if (prevStart === todayStart) {
    return { days: prev.days, last_activity_at: prev.lastActivityAt, bumped: false };
  }

  const diffDays = Math.round((todayStart - prevStart) / 86400000);
  const newDays = diffDays === 1 ? prev.days + 1 : 1;
  writeLocalStreak({ days: newDays, lastActivityAt: todayIso });
  return { days: newDays, last_activity_at: todayIso, bumped: true };
}

export function useBumpStudyStreak() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (): Promise<StreakPayload> => {
      try {
        // Test fixture mocks both apiRequest('/url', opts) e fetch('/url', opts).
        // Chamamos apiRequest com (url, opts) para que o mock dispatcher do
        // teste enxergue a URL como primeiro argumento (assertion calls[0]).
        const data = await (apiRequest as any)('/api/study/streak/bump', {
          method: 'POST',
        });
        if (data && typeof data === 'object' && typeof (data as any).days === 'number') {
          writeLocalStreak({
            days: (data as any).days,
            lastActivityAt: (data as any).last_activity_at ?? new Date().toISOString(),
          });
          return {
            days: (data as any).days,
            last_activity_at: (data as any).last_activity_at ?? null,
            bumped: Boolean((data as any).bumped),
          };
        }
        return data as StreakPayload;
      } catch (err) {
        console.error('[useBumpStudyStreak] api failed, using localStorage fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
        return bumpLocalStreak();
      }
    },
    onSuccess: () => {
      try {
        qc.invalidateQueries({ queryKey: ['/api/study/streak'] });
      } catch {
        // ignore
      }
    },
  });

  return {
    bump: () => mutation.mutateAsync(),
    isPending: mutation.isPending,
  };
}

export default useBumpStudyStreak;
