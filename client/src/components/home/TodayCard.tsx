/**
 * RF-10 — TodayCard sessao do dia (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-10, §5.2 S2
 *
 * Mostra perfil A/B/C/OFF + qtd torneios + stops + 2 CTAs (warm-up condicional, grade sempre).
 * Empty state quando data=null com CTA "Configurar grade".
 */

import React from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

interface TodayData {
  profile: 'A' | 'B' | 'C' | 'OFF' | null;
  plannedCount: number;
  firstStartTime: string | null;
  stopLoss: { amount: number; currency: string } | null;
  stopTime: string | null;
  hasWarmupToday: boolean;
}

interface TodayCardProps {
  data: TodayData | null;
}

export default function TodayCard({ data }: TodayCardProps): JSX.Element {
  if (!data) {
    return (
      <div
        data-testid="home-today-card"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="text-sm text-muted-foreground">
          Nenhuma sessao planejada para hoje
        </div>
        <Link href="/coach">
          <a
            data-testid="today-cta-configure-grade"
            href="/coach"
            className="mt-3 inline-block text-sm text-primary hover:underline"
            onClick={() =>
              emit('home_block_click', { blockId: 'S2', action: 'configure-grade' })
            }
          >
            Configurar grade →
          </a>
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="home-today-card"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-3">
        {data.profile && (
          <span
            data-testid="today-profile-badge"
            className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-md bg-primary/15 text-primary font-semibold text-sm"
          >
            {data.profile}
          </span>
        )}
        <div className="flex-1">
          <div className="text-base font-semibold">
            {data.plannedCount} torneios
            {data.firstStartTime ? ` · primeiro ${data.firstStartTime}` : ''}
          </div>
          {data.stopLoss && (
            <div className="text-xs text-muted-foreground">
              Stop loss: {data.stopLoss.currency} {data.stopLoss.amount}
              {data.stopTime ? ` · Stop time: ${data.stopTime}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!data.hasWarmupToday && (
          <Link href="/mental">
            <a
              data-testid="today-cta-warmup"
              href="/mental"
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
              onClick={() => {
                emit('home_today_warmup_start', { source: 'home' });
                emit('home_block_click', { blockId: 'S2', action: 'warmup' });
              }}
            >
              Iniciar warm-up
            </a>
          </Link>
        )}
        <Link href="/coach">
          <a
            data-testid="today-cta-grade"
            href="/coach"
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
            onClick={() =>
              emit('home_block_click', { blockId: 'S2', action: 'grade' })
            }
          >
            Ver grade completa →
          </a>
        </Link>
      </div>
    </div>
  );
}
