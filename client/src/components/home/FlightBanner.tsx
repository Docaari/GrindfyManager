/**
 * RF-13 — FlightBanner banner condicional (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-13, §5.5 S5, §3 D9, §3 D16
 *
 * Renderiza so se banner.active=true. Cor verde sutil (informacao critica).
 * Sem dismiss (D9). role=alert para a11y. CTA "Abrir Flight" → /flight.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';

interface FlightBannerData {
  active: boolean;
  seriesTitle: string;
  nextDayStartTime: string;
  currentStackBb: number;
  day: number;
}

interface Props {
  banner: FlightBannerData | null;
}

function timeUntilFromNow(targetIso: string, nowMs: number): string {
  if (!targetIso) return '';
  try {
    const t = new Date(targetIso).getTime();
    if (isNaN(t)) return '';
    const secs = Math.floor((t - nowMs) / 1000);
    if (secs <= 0) return 'em andamento';
    const totalMin = Math.floor(secs / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `em ${h}h ${m}min`;
    return `em ${m}min`;
  } catch {
    return '';
  }
}

export default function FlightBanner({ banner }: Props): JSX.Element | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!banner || !banner.active) return;
    const id = setInterval(() => {
      setNow((prev) => {
        const next = Date.now();
        // Re-render apenas quando display string muda (~1/min em vez de 60/min).
        if (
          timeUntilFromNow(banner.nextDayStartTime, prev) ===
          timeUntilFromNow(banner.nextDayStartTime, next)
        ) {
          return prev;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [banner]);

  if (!banner || !banner.active) return null;

  const countdown = timeUntilFromNow(banner.nextDayStartTime, now);

  return (
    <div
      data-testid="flight-banner"
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3"
    >
      <div className="flex-1 text-sm text-green-200">
        <span className="font-semibold">Day {banner.day}</span> do{' '}
        <span className="font-semibold">"{banner.seriesTitle}"</span>
        {countdown ? ` comeca ${countdown}` : ''} · Stack:{' '}
        <span className="font-semibold">{banner.currentStackBb} BB</span>
      </div>
      <Link href="/flight">
        <a
          data-testid="flight-banner-cta"
          href="/flight"
          className="inline-flex items-center px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:opacity-90"
        >
          Abrir Flight
        </a>
      </Link>
    </div>
  );
}
