import { useState, useMemo } from 'react';
import { weekDays, type DayStats } from './types';
import { groupBuyInsByCurrency, formatGroupedBuyIns, getCurrencyForSite } from '@shared/platform-currency';

interface WeeklySummaryBarProps {
  getTournamentsForDay: (dayId: number) => any[];
  getDayStats: (dayId: number) => DayStats;
  isDayActiveWithTournaments: (dayOfWeek: number) => boolean;
}

type ProfileFilter = 'Todos' | 'A' | 'B' | 'C';

const PROFILE_BUTTON_STYLES: Record<ProfileFilter, { active: string; inactive: string }> = {
  Todos: {
    active: 'bg-gray-600 text-white ring-1 ring-gray-400',
    inactive: 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700',
  },
  A: {
    active: 'bg-emerald-600 text-white ring-1 ring-emerald-400',
    inactive: 'bg-gray-800 text-gray-400 hover:text-emerald-400 hover:bg-gray-700',
  },
  B: {
    active: 'bg-blue-600 text-white ring-1 ring-blue-400',
    inactive: 'bg-gray-800 text-gray-400 hover:text-blue-400 hover:bg-gray-700',
  },
  C: {
    active: 'bg-orange-600 text-white ring-1 ring-orange-400',
    inactive: 'bg-gray-800 text-gray-400 hover:text-orange-400 hover:bg-gray-700',
  },
};

export function WeeklySummaryBar({
  getTournamentsForDay,
  getDayStats,
  isDayActiveWithTournaments,
}: WeeklySummaryBarProps) {
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>('Todos');

  const activeDayTournaments = useMemo(() => {
    let tournaments = weekDays
      .filter((day) => isDayActiveWithTournaments(day.id))
      .flatMap((day) => getTournamentsForDay(day.id));

    if (profileFilter !== 'Todos') {
      tournaments = tournaments.filter((t: any) => t.profile === profileFilter);
    }

    return tournaments;
  }, [getTournamentsForDay, isDayActiveWithTournaments, profileFilter]);

  const totalCount = activeDayTournaments.length;
  const groupedBuyIns = groupBuyInsByCurrency(activeDayTournaments);
  const totalBuyInDisplay = formatGroupedBuyIns(groupedBuyIns);

  // ABI per currency
  const abiDisplay = useMemo(() => {
    if (totalCount === 0) return '$0';
    const abiGrouped: Record<string, number> = {};
    for (const [code, total] of Object.entries(groupedBuyIns)) {
      const currencyCount = activeDayTournaments.filter(
        (t: any) => getCurrencyForSite(t.site).code === code,
      ).length;
      if (currencyCount > 0) {
        abiGrouped[code] = total / currencyCount;
      }
    }
    return formatGroupedBuyIns(abiGrouped);
  }, [activeDayTournaments, groupedBuyIns, totalCount]);

  const activeDaysCount = weekDays.filter((day) => isDayActiveWithTournaments(day.id)).length;

  const totalHours = weekDays
    .filter((day) => isDayActiveWithTournaments(day.id))
    .reduce((sum, day) => {
      const stats = getDayStats(day.id);
      return sum + (stats.durationHours || 0);
    }, 0);

  // PKO and Turbo percentages
  const pkoCount = activeDayTournaments.filter((t: any) => t.type === 'PKO').length;
  const turboCount = activeDayTournaments.filter(
    (t: any) => t.speed === 'Turbo' || t.speed === 'Hyper',
  ).length;
  const pkoPct = totalCount > 0 ? Math.round((pkoCount / totalCount) * 100) : 0;
  const turboPct = totalCount > 0 ? Math.round((turboCount / totalCount) * 100) : 0;

  return (
    <div className="sticky top-0 z-10 bg-gray-900 border border-gray-700 rounded-lg px-6 py-3 mb-4">
      <div className="flex items-center justify-between gap-4 text-sm flex-wrap">
        {/* Profile selector */}
        <div className="flex items-center gap-1">
          {(['Todos', 'A', 'B', 'C'] as ProfileFilter[]).map((p) => {
            const isActive = profileFilter === p;
            const styles = PROFILE_BUTTON_STYLES[p];
            return (
              <button
                key={p}
                onClick={() => setProfileFilter(p)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                  isActive ? styles.active : styles.inactive
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Total Buy-in:</span>
          <span className="text-emerald-400 font-bold">{totalBuyInDisplay}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Torneios:</span>
          <span className="text-white font-bold">{totalCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">ABI:</span>
          <span className="text-white font-bold">{abiDisplay}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">PKO:</span>
          <span className="text-white font-bold">{pkoPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Turbo:</span>
          <span className="text-white font-bold">{turboPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Dias Ativos:</span>
          <span className="text-white font-bold">{activeDaysCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Horas Est.:</span>
          <span className="text-white font-bold">{totalHours > 0 ? `${totalHours.toFixed(1)}h` : "0h"}</span>
        </div>
      </div>
    </div>
  );
}
