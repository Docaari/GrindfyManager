import { UseFormReturn } from "react-hook-form";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Clock, Edit, Trash2, Save, AlertTriangle, Star, ArrowRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPlannerSiteColor, getPlannerTypeColor, getPlannerSpeedColor } from "@/lib/poker-colors";
import { weekDays, sites, types, speeds, type TournamentForm, type DayStats } from './types';

const getSiteColor = getPlannerSiteColor;
const getTypeColor = getPlannerTypeColor;
const getSpeedColor = getPlannerSpeedColor;

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

interface PlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDay: number | null;
  selectedProfile: 'A' | 'B' | null;
  form: UseFormReturn<TournamentForm>;
  onSubmit: (data: TournamentForm) => void;
  getDayStats: (dayId: number) => DayStats;
  getTournamentsForModalProfile: (dayId: number, profile: 'A' | 'B') => any[];
  generateTournamentName: (data: any) => string;
  suggestions: any[];
  onSelectSuggestion: (suggestion: any) => void;
  onEditTournament: (tournament: any) => void;
  onDeleteTournament: (tournament: any) => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onProfileChange?: (profile: 'A' | 'B') => void;
  isPending?: boolean;
  favorites?: any[];
}

export function PlanningDialog({
  open,
  onOpenChange,
  selectedDay,
  selectedProfile,
  form,
  onSubmit,
  getDayStats,
  getTournamentsForModalProfile,
  generateTournamentName,
  suggestions,
  onSelectSuggestion,
  onEditTournament,
  onDeleteTournament,
  saveStatus,
  onProfileChange,
  isPending,
  favorites = [],
}: PlanningDialogProps) {
  const dayStats = selectedDay !== null ? getDayStats(selectedDay) : null;
  const tournaments = selectedDay !== null && selectedProfile !== null
    ? getTournamentsForModalProfile(selectedDay, selectedProfile)
    : [];

  // RF-08: Conflict detection
  const detectConflicts = (tournamentList: any[]): Map<string, string[]> => {
    const conflicts = new Map<string, string[]>();
    const tournamentsWithTime = tournamentList.filter((t: any) => t.time && t.time.trim() !== '');
    for (let i = 0; i < tournamentsWithTime.length; i++) {
      for (let j = i + 1; j < tournamentsWithTime.length; j++) {
        const [hA, mA] = tournamentsWithTime[i].time.split(':').map(Number);
        const [hB, mB] = tournamentsWithTime[j].time.split(':').map(Number);
        const minutesA = hA * 60 + mA;
        const minutesB = hB * 60 + mB;
        if (Math.abs(minutesA - minutesB) < 30) {
          const idA = tournamentsWithTime[i].id;
          const idB = tournamentsWithTime[j].id;
          const nameA = tournamentsWithTime[i].name || generateTournamentName(tournamentsWithTime[i]);
          const nameB = tournamentsWithTime[j].name || generateTournamentName(tournamentsWithTime[j]);
          if (!conflicts.has(idA)) conflicts.set(idA, []);
          if (!conflicts.has(idB)) conflicts.set(idB, []);
          conflicts.get(idA)!.push(nameB);
          conflicts.get(idB)!.push(nameA);
        }
      }
    }
    return conflicts;
  };

  const conflictMap = detectConflicts(tournaments);

  // Calculate breaks
  const breaks = tournaments.reduce((acc, tournament) => {
    if (tournament.time) {
      const [hour, minute] = tournament.time.split(':').map(Number);
      const breakHour = minute >= 55 ? hour + 1 : hour;
      const breakKey = `${breakHour}:55`;
      acc.add(breakKey);
    }
    return acc;
  }, new Set<string>());

  // Calculate time range
  const times = tournaments.map((t: any) => t.time).filter(Boolean).sort();
  const timeRange = times.length > 0 ? `${times[0]} - ${times[times.length - 1]}` : '\u2013';

  // Calculate total time
  const totalTime = (() => {
    if (times.length === 0) return '\u2013';
    const startTime = times[0];
    const endTime = times[times.length - 1];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute) + 180;
    return `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 > 0 ? `${totalMinutes % 60}m` : ''}`;
  })();

  // Sites analysis
  const siteStats = tournaments.reduce((acc: Record<string, number>, tournament: any) => {
    const site = tournament.site || 'Unknown';
    const buyIn = parseFloat(tournament.buyIn || '0');
    acc[site] = (acc[site] || 0) + buyIn;
    return acc;
  }, {});

  // Type analysis for pie chart
  const typeStats = tournaments.reduce((acc: Record<string, number>, tournament: any) => {
    const type = tournament.type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const typeChartData = Object.entries(typeStats).map(([type, count]) => ({
    name: type,
    value: count,
    color: type === 'Mystery' ? '#ec4899' : type === 'PKO' ? '#f97316' : '#3b82f6'
  }));

  // Speed analysis for pie chart
  const speedStats = tournaments.reduce((acc: Record<string, number>, tournament: any) => {
    const speed = tournament.speed || 'Unknown';
    acc[speed] = (acc[speed] || 0) + 1;
    return acc;
  }, {});

  const speedChartData = Object.entries(speedStats).map(([speed, count]) => ({
    name: speed,
    value: count,
    color: speed === 'Normal' ? '#10b981' : speed === 'Turbo' ? '#f59e0b' : '#ef4444'
  }));

  // Field size analysis
  const fieldSizes = tournaments.reduce((acc: { small: number; medium: number; large: number; huge: number }, tournament: any) => {
    const guaranteed = parseFloat(tournament.guaranteed || '0');
    const buyIn = parseFloat(tournament.buyIn || '1');
    if (guaranteed <= 0 || buyIn <= 0) return acc;
    const fieldMedio = Math.round(guaranteed / buyIn);
    if (fieldMedio < 100) acc.small++;
    else if (fieldMedio <= 400) acc.medium++;
    else if (fieldMedio <= 1000) acc.large++;
    else acc.huge++;
    return acc;
  }, { small: 0, medium: 0, large: 0, huge: 0 });

  // Group tournaments by breaks
  const tournamentsByBreak = tournaments.reduce((acc: Record<string, any[]>, tournament: any) => {
    if (tournament.time) {
      const [hour, minute] = tournament.time.split(':').map(Number);
      const breakHour = minute >= 55 ? hour + 1 : hour;
      const breakKey = `${breakHour}:55`;
      if (!acc[breakKey]) acc[breakKey] = [];
      acc[breakKey].push(tournament);
    }
    return acc;
  }, {});

  const sortedBreaks = Object.entries(tournamentsByBreak)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([breakTime, breakTournaments]) => ({
      breakTime,
      tournaments: (breakTournaments as any[]).sort((a: any, b: any) => a.time.localeCompare(b.time))
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-5xl max-h-[90vh] p-0 flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-2xl text-emerald-400 mb-4">
              {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
            </DialogTitle>
          </DialogHeader>

          {/* RF-05: Profile switch tabs */}
          {onProfileChange && (
            <div className="flex gap-2 mb-4">
              {(['A', 'B'] as const).map((profile) => (
                <button
                  key={profile}
                  onClick={() => onProfileChange(profile)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedProfile === profile
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Perfil {profile}
                </button>
              ))}
            </div>
          )}

          {/* Metrics - 6 columns */}
          <div className="grid grid-cols-6 gap-4 mb-6">
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">{dayStats?.count || 0}</div>
              <div className="text-sm text-slate-400">Torneios</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">${dayStats?.totalBuyIn?.toFixed(0) || '0'}</div>
              <div className="text-sm text-slate-400">Buy-in Total</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">${dayStats?.avgBuyIn?.toFixed(0) || '0'}</div>
              <div className="text-sm text-slate-400">ABI</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">{timeRange}</div>
              <div className="text-sm text-slate-400">Hor&#225;rio</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">{totalTime}</div>
              <div className="text-sm text-slate-400">Tempo Total</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">{breaks.size}</div>
              <div className="text-sm text-slate-400">Breaks</div>
            </div>
          </div>

          {/* Detailed Analysis - 4 columns */}
          <div className="grid grid-cols-4 gap-6">
            {/* Sites */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Sites</h4>
              <div className="space-y-2">
                {Object.entries(siteStats).map(([site, investment]) => (
                  <div key={site} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getSiteColor(site)}`}></div>
                      <span className="text-xs text-slate-300">{site}</span>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">${(investment as number).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Types - Pie Chart */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Tipos</h4>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeChartData} cx="50%" cy="50%" outerRadius={30} dataKey="value">
                      {typeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Speeds - Pie Chart */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Velocidades</h4>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={speedChartData} cx="50%" cy="50%" outerRadius={30} dataKey="value">
                      {speedChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Field Size */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Field Size</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">&lt; 100:</span>
                  <span className="text-emerald-400">{fieldSizes.small}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">100-400:</span>
                  <span className="text-emerald-400">{fieldSizes.medium}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">400-1000:</span>
                  <span className="text-emerald-400">{fieldSizes.large}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">&gt; 1000:</span>
                  <span className="text-emerald-400">{fieldSizes.huge}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Layout - 2 Columns (60% / 40%) */}
        <div className="overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 p-6 min-h-[300px]">

            {/* LEFT COLUMN - Planned Tournaments (60%) */}
            <div className="flex flex-col bg-slate-900 border border-slate-600 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Torneios Planejados</h3>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {sortedBreaks.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum torneio planejado para este dia</p>
                  </div>
                ) : (
                  sortedBreaks.map(({ breakTime, tournaments: breakTournaments }) => (
                    <div key={breakTime} className="mb-6">
                      {/* Break Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px bg-slate-600 flex-1"></div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>Break {breakTime}</span>
                          <span className="bg-slate-600 px-2 py-1 rounded-full">
                            {breakTournaments.length}
                          </span>
                        </div>
                        <div className="h-px bg-slate-600 flex-1"></div>
                      </div>

                      {/* Tournament Cards */}
                      <div className="space-y-2">
                        {breakTournaments.map((tournament: any) => (
                          <div key={tournament.id} className={`bg-slate-600 rounded-md p-2 ${conflictMap.has(tournament.id) ? 'border border-amber-500/50' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-white">{tournament.time}</span>
                                {conflictMap.has(tournament.id) && (
                                  <span className="flex items-center gap-1 text-amber-400" title={`Conflito com: ${conflictMap.get(tournament.id)!.join(', ')}`}>
                                    <AlertTriangle className="w-3 h-3" />
                                  </span>
                                )}
                                <div className={`w-2 h-2 rounded-full ${getSiteColor(tournament.site)}`}></div>
                                <span className="text-xs text-slate-300">{tournament.site}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-slate-500"
                                  onClick={() => onEditTournament(tournament)}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-red-600"
                                  onClick={() => onDeleteTournament(tournament)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>

                            <div className="text-xs text-white mb-1 truncate">
                              {tournament.name || generateTournamentName(tournament)}
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Badge className={`text-xs px-1 py-0.5 text-white ${getTypeColor(tournament.type)}`}>
                                  {tournament.type}
                                </Badge>
                                <Badge className={`text-xs px-1 py-0.5 text-white ${getSpeedColor(tournament.speed)}`}>
                                  {tournament.speed}
                                </Badge>
                              </div>
                              <div className="text-right text-xs">
                                <div className="text-sm font-bold text-emerald-400">
                                  Buy-in: ${tournament.buyIn}
                                </div>
                                {tournament.guaranteed && (
                                  <div className="text-slate-300">
                                    Garantido: ${tournament.guaranteed}
                                  </div>
                                )}
                                {tournament.guaranteed && tournament.buyIn && (
                                  <div className="text-slate-400">
                                    Field M&#233;dio: +/- {Math.round(parseFloat(tournament.guaranteed) / parseFloat(tournament.buyIn))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - New Tournament + Suggestions (40%) */}
            <div className="flex flex-col space-y-4">

              {/* New Tournament Form */}
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Novo Torneio</h3>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Site</label>
                      <select
                        {...form.register("site")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Selecione um site</option>
                        {sites.map(site => (
                          <option key={site} value={site}>{site}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Hor&#225;rio</label>
                      <input
                        type="time"
                        {...form.register("time")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Tipo</label>
                      <select
                        {...form.register("type")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Tipo</option>
                        {types.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Velocidade</label>
                      <select
                        {...form.register("speed")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Velocidade</option>
                        {speeds.map(speed => (
                          <option key={speed} value={speed}>{speed}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Nome</label>
                    <input
                      type="text"
                      {...form.register("name")}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      placeholder="Nome do torneio"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Buy-in</label>
                      <input
                        type="number"
                        step="0.01"
                        {...form.register("buyIn")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Garantido</label>
                      <input
                        type="number"
                        {...form.register("guaranteed")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Prioridade</label>
                    <select
                      {...form.register("prioridade")}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                    >
                      <option value={2}>M&#233;dia (padr&#227;o)</option>
                      <option value={1}>Alta</option>
                      <option value={3}>Baixa</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.reset()}
                      className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      Limpar Todos
                    </Button>
                    <Button
                      type="submit"
                      disabled={!form.formState.isValid || isPending}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Salvando...
                        </div>
                      ) : (
                        'Adicionar'
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* RF-11: Favorites */}
              {favorites.length > 0 && (
                <div className="bg-slate-900 border border-slate-600 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400" />
                    Favoritos
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {favorites.map((fav: any, index: number) => (
                      <div
                        key={`fav-${index}`}
                        className="bg-slate-600 rounded-md p-2 cursor-pointer hover:bg-gray-600/50 hover:border-emerald-500/50 border border-transparent transition-all group"
                        onClick={() => onSelectSuggestion(fav)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Star className="w-3 h-3 text-amber-400" />
                            <div className={`w-2 h-2 rounded-full ${getSiteColor(fav.site)}`}></div>
                            <span className="text-xs text-slate-300">{fav.site}</span>
                            <span className="text-xs text-white truncate max-w-[120px]">{fav.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-400 font-medium">${fav.buyIn}</span>
                            <span className="text-xs text-slate-400">{fav.frequency}x</span>
                            <ArrowRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 flex-1">
                <h3 className="text-lg font-semibold text-white mb-4">Sugest&#245;es</h3>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {suggestions.length === 0 ? (
                    <div className="text-center text-slate-400 py-4">
                      <p className="text-sm">Nenhuma sugest&#227;o dispon&#237;vel</p>
                    </div>
                  ) : (
                    suggestions.map((suggestion: any) => (
                      <div
                        key={suggestion.id}
                        className="bg-slate-600 rounded-md p-2 cursor-pointer hover:bg-gray-600/50 hover:border-emerald-500/50 border border-transparent transition-all group"
                        onClick={() => onSelectSuggestion(suggestion)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">{suggestion.time}</span>
                            <div className={`w-2 h-2 rounded-full ${getSiteColor(suggestion.site)}`}></div>
                            <span className="text-xs text-slate-300">{suggestion.site}</span>
                            <span className="text-xs text-slate-400">{suggestion.name}</span>
                            {suggestion.isVariation && (
                              <Badge className="text-xs px-1 py-0 bg-slate-500 text-slate-200">Variacao</Badge>
                            )}
                          </div>
                          <ArrowRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Badge className={`text-xs px-1 py-0.5 text-white ${getTypeColor(suggestion.type)}`}>
                              {suggestion.type}
                            </Badge>
                            <Badge className={`text-xs px-1 py-0.5 text-white ${getSpeedColor(suggestion.speed)}`}>
                              {suggestion.speed}
                            </Badge>
                          </div>
                          <div className="text-right text-xs">
                            <div className="text-sm font-bold text-emerald-400">
                              Buy-in: ${suggestion.buyIn}
                            </div>
                            {suggestion.guaranteed && (
                              <div className="text-slate-300">
                                Garantido: ${suggestion.guaranteed}
                              </div>
                            )}
                            {suggestion.guaranteed && suggestion.buyIn && (
                              <div className="text-slate-400">
                                Field M&#233;dio: +/- {Math.round(parseFloat(suggestion.guaranteed) / parseFloat(suggestion.buyIn))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="border-t border-slate-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Save className="w-4 h-4" />
            {saveStatus === 'saving' ? (
              <span>Salvando...</span>
            ) : saveStatus === 'saved' ? (
              <span className="text-emerald-400">Altera&#231;&#245;es salvas automaticamente</span>
            ) : saveStatus === 'error' ? (
              <span className="text-red-400">Erro ao salvar</span>
            ) : (
              <span>Altera&#231;&#245;es salvas automaticamente</span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
          >
            Fechar
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
