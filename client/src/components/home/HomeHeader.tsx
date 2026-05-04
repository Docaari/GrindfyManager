/**
 * HomeHeader — Sprint home-reform-3 (Onda 3) RF-A1.
 *
 * Spec: Docs/specs/home-reform-3.md §RF-A1
 *
 * Substitui bloco logo centralizado h-20/h-28 por linha esquerda-alinhada
 * com logo h-10/h-12 + saudacao contextual + meta (weekday + dd/mm + streak + tz).
 */

import React from 'react';
import HeaderLogo from '@/components/branding/HeaderLogo';
import HomeSettingsGear from './HomeSettingsGear';

interface Props {
  firstName: string | null | undefined;
  timezone?: string | null;
  streakDays: number;
}

const WEEKDAYS_PT_BR = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function localHourFor(timezone: string | null | undefined): { hour: number; weekdayIdx: number; day: number; month: number } {
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone || undefined,
    });
    const parts = fmt.formatToParts(now);
    let hour = now.getHours();
    let weekdayShort = '';
    let day = now.getDate();
    let month = now.getMonth() + 1;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'weekday') weekdayShort = p.value;
      if (p.type === 'day') day = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
    }
    const weekdayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const weekdayIdx = weekdayMap[weekdayShort] ?? now.getDay();
    return { hour, weekdayIdx, day, month };
  } catch {
    return {
      hour: now.getHours(),
      weekdayIdx: now.getDay(),
      day: now.getDate(),
      month: now.getMonth() + 1,
    };
  }
}

export default function HomeHeader({ firstName, timezone, streakDays }: Props): JSX.Element {
  const tz = timezone || 'America/Sao_Paulo';
  const { hour, weekdayIdx, day, month } = localHourFor(tz);
  const greeting = greetingForHour(hour);
  const safeName = firstName && firstName.trim() ? firstName.trim() : 'jogador';
  const weekday = WEEKDAYS_PT_BR[weekdayIdx] ?? 'dia';
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');

  const metaParts: string[] = [`${weekday}, ${dd}/${mm}`];
  if (streakDays > 0) {
    metaParts.push(`${streakDays}d streak`);
  }
  metaParts.push(tz);

  return (
    <div className="flex items-center gap-3 pt-2 pb-2">
      <HeaderLogo
        variant="full"
        alt="Grindfy"
        className="h-10 md:h-12 w-auto object-contain"
      />
      <div className="min-w-0 flex-1">
        <h1
          data-testid="home-header-greeting"
          className="text-xl md:text-2xl font-semibold leading-tight"
        >
          {greeting}, {safeName}
        </h1>
        <p
          data-testid="home-header-meta"
          className="text-xs text-muted-foreground"
        >
          {metaParts.join(' - ')}
        </p>
      </div>
      {/* Sprint home-reform-5 item 11 — engrenagem habilita/desabilita sessoes. */}
      <div className="ml-auto shrink-0">
        <HomeSettingsGear />
      </div>
    </div>
  );
}
