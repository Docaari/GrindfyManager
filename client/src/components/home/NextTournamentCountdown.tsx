/**
 * RF-12 — NextTournamentCountdown (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-12, §5.4 S4, §3 D15
 *
 * Card oculto se data=null. setInterval 1s recalcula countdown client-side.
 * <60s: "Comecando agora". <=0: "Em andamento" + CTA "→ Grind live".
 * Cleanup do timer no unmount (sem leak).
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';

interface NextTournamentData {
  startTime: string;
  name: string;
  buyin: number;
  currency: string;
  platform: string;
}

interface Props {
  data: NextTournamentData | null;
}

function diffSeconds(target: string, now: number): number {
  const t = new Date(target).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((t - now) / 1000);
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'Em andamento';
  if (secs < 60) return 'Comecando agora';
  const totalMin = Math.floor(secs / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) {
    return `Em ${h}h ${m}min`;
  }
  return `Em ${m}min`;
}

export default function NextTournamentCountdown({
  data,
}: Props): JSX.Element | null {
  // Hooks first.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      setNow((prev) => {
        const next = Date.now();
        const prevSecs = diffSeconds(data.startTime, prev);
        const nextSecs = diffSeconds(data.startTime, next);
        // Skip re-render quando display string nao muda (1 update / minuto em vez de 60).
        if (
          fmtCountdown(prevSecs) === fmtCountdown(nextSecs) &&
          (prevSecs <= 0) === (nextSecs <= 0)
        ) {
          return prev;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [data]);

  if (!data) return null;

  const secs = diffSeconds(data.startTime, now);
  const text = fmtCountdown(secs);
  const inProgress = secs <= 0;

  return (
    <div
      data-testid="next-tournament-countdown"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="text-xs uppercase text-muted-foreground tracking-wide">
        Proximo torneio
      </div>
      <div className="mt-1 text-base font-semibold">{data.name}</div>
      <div className="text-sm text-muted-foreground">{text}</div>
      {inProgress && (
        <Link href="/grind-live">
          <a
            data-testid="next-tournament-cta-grind"
            href="/grind-live"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            → Grind live
          </a>
        </Link>
      )}
    </div>
  );
}
