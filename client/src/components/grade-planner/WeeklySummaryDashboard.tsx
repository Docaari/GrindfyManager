import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { weekDays, type DayStats } from './types';
import { TYPE_COLORS, type TournamentPrimaryType } from "@shared/tournamentTypes";
import { computeMedianFieldSizeForDisplay } from "@/lib/median";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded p-2 text-white text-sm">
        <p>{`${payload[0].name}: ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

interface WeeklySummaryDashboardProps {
  isDayActiveWithTournaments: (dayOfWeek: number) => boolean;
  getTournamentsForDay: (dayId: number) => any[];
  getDayStats: (dayId: number) => DayStats;
}

export function WeeklySummaryDashboard({
  isDayActiveWithTournaments,
  getTournamentsForDay,
  getDayStats,
}: WeeklySummaryDashboardProps) {
  // Compute active day tournaments once for reuse
  const activeDayTournaments = weekDays
    .filter(day => isDayActiveWithTournaments(day.id))
    .flatMap(day => getTournamentsForDay(day.id));

  const totalCount = activeDayTournaments.length;
  const totalInvestment = activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0);
  const abi = totalCount > 0 ? (totalInvestment / totalCount) : 0;

  // RF-05: Mediana de participantes (resistente a outliers como Sunday Million).
  const medianParticipants = computeMedianFieldSizeForDisplay(activeDayTournaments);

  // Total hours
  const totalHours = weekDays
    .filter(day => isDayActiveWithTournaments(day.id))
    .reduce((sum, day) => {
      const stats = getDayStats(day.id);
      return sum + (stats.durationHours || 0);
    }, 0);

  // Type stats
  const typeStats = activeDayTournaments.reduce((acc: Record<string, number>, t: any) => {
    const type = t.type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const typeChartData = Object.entries(typeStats).map(([type, count]) => {
    const fromSsot = TYPE_COLORS[type as TournamentPrimaryType]?.hex;
    return {
      name: type,
      value: count,
      color: fromSsot ?? '#6b7280',
    };
  });

  // Speed stats
  const speedStats = activeDayTournaments.reduce((acc: Record<string, number>, t: any) => {
    const speed = t.speed || 'Unknown';
    acc[speed] = (acc[speed] || 0) + 1;
    return acc;
  }, {});

  const speedChartData = Object.entries(speedStats).map(([speed, count]) => ({
    name: speed,
    value: count,
    color: speed === 'Normal' ? '#10b981' : speed === 'Turbo' ? '#f59e0b' : '#ef4444'
  }));

  // Site stats
  const siteStats = activeDayTournaments.reduce((acc: Record<string, { count: number; investment: number }>, t: any) => {
    const site = t.site || 'Unknown';
    const buyIn = parseFloat(t.buyIn) || 0;
    acc[site] = {
      count: (acc[site]?.count || 0) + 1,
      investment: (acc[site]?.investment || 0) + buyIn
    };
    return acc;
  }, {});

  const sortedSites = Object.entries(siteStats)
    .sort(([, a], [, b]) => b.count - a.count);

  const getSiteColorLocal = (site: string) => {
    const colorMap: { [key: string]: string } = {
      'PokerStars': 'bg-red-500',
      'GGPoker': 'bg-orange-500',
      'WPN': 'bg-blue-500',
      'CoinPoker': 'bg-green-500',
      'Chico': 'bg-purple-500',
      'PartyPoker': 'bg-pink-500',
      'Bodog': 'bg-yellow-500',
      'Unknown': 'bg-gray-500'
    };
    return colorMap[site] || 'bg-gray-500';
  };

  return (
    <div className="dashboard-compact expanded">
      <div className="weekly-dashboard-header">
        <h3 className="weekly-dashboard-title">📈 Resumo da Semana</h3>
        <div className="weekly-dashboard-subtitle">Vis&#227;o geral dos torneios planejados</div>
      </div>

      <div className="dashboard-summary grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">🎯</div>
          <div className="weekly-card-value">{totalCount}</div>
          <div className="weekly-card-label">Torneios</div>
          <div className="weekly-card-sublabel">Planejados</div>
        </div>
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">💰</div>
          <div className="weekly-card-value">${totalInvestment.toFixed(0)}</div>
          <div className="weekly-card-label">Investimento</div>
          <div className="weekly-card-sublabel">Total</div>
        </div>
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">📊</div>
          <div className="weekly-card-value">${abi.toFixed(2)}</div>
          <div className="weekly-card-label">ABI</div>
          <div className="weekly-card-sublabel">M&#233;dio</div>
        </div>
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">👥</div>
          <div className="weekly-card-value">{medianParticipants}</div>
          <div className="weekly-card-label">Mediana Participantes</div>
          <div className="weekly-card-sublabel">Estimativa (mediana)</div>
        </div>
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">⏱️</div>
          <div className="weekly-card-value">{totalHours > 0 ? `${totalHours.toFixed(1)}h` : '0h'}</div>
          <div className="weekly-card-label">Tempo Total</div>
          <div className="weekly-card-sublabel">Sess&#245;es</div>
        </div>
      </div>

      {/* Pie Charts and Active Sites */}
      <div className="pie-chart-section grid gap-4 mb-6 w-full">
        {/* Types Chart */}
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">🎲</div>
          <h3 className="weekly-card-label mb-3">Tipos</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeChartData} cx="50%" cy="50%" outerRadius={40} dataKey="value">
                  {typeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-xs">
            {Object.entries(typeStats).map(([type, count]) => {
              const percentage = totalCount > 0 ? Math.round((count as number) / totalCount * 100) : 0;
              return (
                <div key={type} className="flex justify-between">
                  <span className="text-slate-300">{type}</span>
                  <span className="text-slate-300">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Speed Chart */}
        <div className="weekly-summary-card">
          <div className="weekly-card-icon">⚡</div>
          <h3 className="weekly-card-label mb-3">Velocidades</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={speedChartData} cx="50%" cy="50%" outerRadius={40} dataKey="value">
                  {speedChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-xs">
            {Object.entries(speedStats).map(([speed, count]) => {
              const percentage = totalCount > 0 ? Math.round((count as number) / totalCount * 100) : 0;
              return (
                <div key={speed} className="flex justify-between">
                  <span className="text-slate-300">{speed}</span>
                  <span className="text-slate-300">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Sites */}
        <div className="lg:col-span-2 weekly-summary-card">
          <div className="weekly-card-icon">🎰</div>
          <h3 className="weekly-card-label mb-3">Sites Ativos</h3>
          <div className="grid grid-cols-2 gap-4">
            {sortedSites.map(([site, stats]) => (
              <div key={site} className="flex items-center justify-between p-2 bg-slate-600 rounded">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getSiteColorLocal(site)}`}></div>
                  <span className="text-sm text-white">{site}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-400">${stats.investment.toFixed(0)}</div>
                  <div className="text-xs text-slate-300">{stats.count} torneios</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}