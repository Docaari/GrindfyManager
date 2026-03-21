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
      {/* Profile selector */}
      <div className="flex items-center gap-1 mb-3">
        {(['Todos', 'A', 'B', 'C'] as ProfileFilter[]).map((p) => {
          const isActive = profileFilter === p;
          const styles = PROFILE_BUTTON_STYLES[p];
          return (
            <button
              key={p}
              onClick={() => setProfileFilter(p)}
              className={`px-3 py-1 rounded text-sm font-bold transition-all ${
                isActive ? styles.active : styles.inactive
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-7 gap-3">
        <div className="text-center">
          <div className="text-xs text-gray-400">Total Buy-in</div>
          <div className="text-xl font-bold text-emerald-400">{totalBuyInDisplay}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Torneios</div>
          <div className="text-xl font-bold text-white">{totalCount}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">ABI</div>
          <div className="text-lg font-bold text-white">{abiDisplay}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">PKO</div>
          <div className="text-lg font-bold text-white">{pkoPct}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Turbo</div>
          <div className="text-lg font-bold text-white">{turboPct}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Dias Ativos</div>
          <div className="text-lg font-bold text-white">{activeDaysCount}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Horas Est.</div>
          <div className="text-lg font-bold text-white">{totalHours > 0 ? `${totalHours.toFixed(1)}h` : "0h"}</div>
        </div>
      </div>
    </div>
  );
}
