/**
 * RF-11 — CooldownBanner banner condicional (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-11, §5.3 S3, §3 D9
 * ADR-099 §2.1.7
 *
 * Renderiza so se banner.active=true. Cor amber (anti-tilt). Dismiss em-sessao
 * via useState (NAO persiste em localStorage). role=alert para a11y.
 */

import React, { useState } from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

interface CooldownBannerData {
  active: boolean;
  until: string;
  type: 'stop-loss' | 'time-stop' | 'manual';
}

interface CooldownBannerProps {
  banner: CooldownBannerData | null;
}

const TYPE_LABEL: Record<CooldownBannerData['type'], string> = {
  'stop-loss': 'Stop loss atingido',
  'time-stop': 'Stop de tempo',
  manual: 'Cooldown manual',
};

function formatHHMM(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

export default function CooldownBanner({
  banner,
}: CooldownBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  // Hooks first (lesson #1) — early return DEPOIS dos hooks.
  if (!banner || !banner.active || dismissed) return null;

  const hhmm = formatHHMM(banner.until);
  const motivo = TYPE_LABEL[banner.type] ?? 'Cooldown';

  return (
    <div
      data-testid="cooldown-banner"
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <div className="flex-1 text-sm text-amber-200">
        <span className="font-semibold">Cooldown</span>
        {hhmm ? ` ate ${hhmm}` : ''} — {motivo}
      </div>
      <Link href="/bankroll">
        <a className="text-sm text-amber-100 underline hover:opacity-80">
          ver detalhes
        </a>
      </Link>
      <button
        data-testid="cooldown-banner-dismiss"
        onClick={() => {
          setDismissed(true);
          emit('home_banner_dismiss', { blockId: 'S3' });
        }}
        aria-label="Dispensar banner"
        className="text-amber-200 hover:text-amber-100 transition-colors text-lg leading-none"
      >
        x
      </button>
    </div>
  );
}
