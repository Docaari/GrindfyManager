import { useMemo } from 'react';
import { weekDays, type DayStats } from './types';
import { groupBuyInsByCurrency, formatGroupedBuyIns, getCurrencyForSite } from '@shared/platform-currency';

interface WeeklySummaryBarProps {
  getTournamentsForDay: (dayId: number) => any[];
  getDayStats: (dayId: number) => DayStats;
  isDayActiveWithTournaments: (dayOfWeek: number) => boolean;
  getActiveProfile: (dayOfWeek: number) => 'A' | 'B' | 'C' | 'OFF' | null;
}

export function WeeklySummaryBar({
  getTournamentsForDay,
  getDayStats,
  isDayActiveWithTournaments,
  getActiveProfile,
}: WeeklySummaryBarProps) {
  // Aggregate tournaments from all active days (each day uses its own selected profile)
  const activeDayTournaments = useMemo(() => {
    return weekDays
      .filter((day) => isDayActiveWithTournaments(day.id))
      .flatMap((day) => getTournamentsForDay(day.id));
  }, [getTournamentsForDay, isDayActiveWithTournaments]);

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

  // Active profiles summary label
  const activeProfiles = useMemo(() => {
    const profiles = new Set<string>();
    weekDays.forEach((day) => {
      const p = getActiveProfile(day.id);
      if (p && p !== 'OFF') profiles.add(p);
    });
    return Array.from(profiles).sort();
  }, [getActiveProfile]);

  const profilesLabel = activeProfiles.length > 0
    ? activeProfiles.join(' + ')
    : 'Nenhum';

  return (
    <div className="sticky top-0 z-10 bg-gray-900 border border-gray-700 rounded-lg px-6 py-3 mb-4">
      {/* Active profiles indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">Perfis ativos:</span>
        <div className="flex items-center gap-1">
          {activeProfiles.length > 0 ? activeProfiles.map((p) => (
            <span
              key={p}
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                p === 'A' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' :
                p === 'B' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' :
                'bg-orange-600/20 text-orange-400 border border-orange-600/50'
              }`}
            >
              {p}
            </span>
          )) : (
            <span className="text-xs text-gray-500">Nenhum dia ativo</span>
          )}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          Reflete os perfis selecionados em cada dia
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Total Buy-in</div>
          <div className="text-xl font-bold text-emerald-400">{totalBuyInDisplay}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Torneios</div>
          <div className="text-xl font-bold text-white">{totalCount}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">ABI</div>
          <div className="text-lg font-bold text-white">{abiDisplay}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">PKO</div>
          <div className="text-lg font-bold text-white">{pkoPct}%</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Turbo</div>
          <div className="text-lg font-bold text-white">{turboPct}%</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Dias Ativos</div>
          <div className="text-lg font-bold text-white">{activeDaysCount}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Horas Est.</div>
          <div className="text-lg font-bold text-white">{totalHours > 0 ? `${totalHours.toFixed(1)}h` : "0h"}</div>
        </div>
      </div>
    </div>
  );
}
