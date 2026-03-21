import { weekDays, type DayStats } from './types';

interface WeeklySummaryBarProps {
  getTournamentsForDay: (dayId: number) => any[];
  getDayStats: (dayId: number) => DayStats;
  isDayActiveWithTournaments: (dayOfWeek: number) => boolean;
}

export function WeeklySummaryBar({
  getTournamentsForDay,
  getDayStats,
  isDayActiveWithTournaments,
}: WeeklySummaryBarProps) {
  const activeDayTournaments = weekDays
    .filter((day) => isDayActiveWithTournaments(day.id))
    .flatMap((day) => getTournamentsForDay(day.id));

  const totalCount = activeDayTournaments.length;
  const totalBuyIn = activeDayTournaments.reduce(
    (sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0),
    0,
  );
  const abi = totalCount > 0 ? totalBuyIn / totalCount : 0;

  const activeDaysCount = weekDays.filter((day) => isDayActiveWithTournaments(day.id)).length;

  const totalHours = weekDays
    .filter((day) => isDayActiveWithTournaments(day.id))
    .reduce((sum, day) => {
      const stats = getDayStats(day.id);
      return sum + (stats.durationHours || 0);
    }, 0);

  return (
    <div className="sticky top-0 z-10 bg-gray-900 border border-gray-700 rounded-lg px-6 py-3 mb-4">
      <div className="flex items-center justify-between gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Total Buy-in:</span>
          <span className="text-emerald-400 font-bold">${totalBuyIn.toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Torneios:</span>
          <span className="text-white font-bold">{totalCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">ABI:</span>
          <span className="text-white font-bold">${abi.toFixed(2)}</span>
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
