import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, X, Edit, Trash2, Plus, Edit2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useMemo } from 'react';

interface NewTournamentPlanningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDay: number | null;
  weekDays: { id: number; name: string; short: string }[];
  tournaments: any[];
  dayStats: any;
  onEditTournament: (tournament: any) => void;
  onDeleteTournament: (tournament: any) => void;
  onAddTournament: () => void;
  suggestions: any[];
  onSelectSuggestion: (suggestion: any) => void;
  form: any;
  onSubmit: (data: any) => void;
  sites: string[];
  types: string[];
  speeds: string[];
  priorities: { value: number; label: string; color: string }[];
}

export function NewTournamentPlanningDialog({
  isOpen,
  onClose,
  selectedDay,
  weekDays,
  tournaments,
  dayStats,
  onEditTournament,
  onDeleteTournament,
  onAddTournament,
  suggestions,
  onSelectSuggestion,
  form,
  onSubmit,
  sites,
  types,
  speeds,
  priorities,
}: NewTournamentPlanningDialogProps) {
  // Site colors configuration
  const siteColors = {
    "PokerStars": "bg-red-600",
    "PartyPoker": "bg-orange-600", 
    "888poker": "bg-blue-600",
    "GGPoker": "bg-red-800",
    "WPN": "bg-green-800",
    "iPoker": "bg-orange-400",
    "CoinPoker": "bg-pink-600",
    "Chico": "bg-white",
    "Revolution": "bg-pink-800",
    "Bodog": "bg-red-400"
  };

  const getSiteColor = (site: string) => {
    return siteColors[site as keyof typeof siteColors] || "bg-gray-600";
  };

  // Badge colors for types and speeds
  const getBadgeColor = (type: string, value: string) => {
    if (type === 'type') {
      return value === 'Mystery' ? 'bg-purple-600' : 
             value === 'PKO' ? 'bg-orange-600' : 'bg-blue-600';
    }
    if (type === 'speed') {
      return value === 'Turbo' ? 'bg-yellow-600' : 
             value === 'Hyper' ? 'bg-red-600' : 'bg-green-600';
    }
    return 'bg-gray-600';
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-lg">
          <p className="text-white text-sm">
            {payload[0].name}: <span className="font-bold text-emerald-400">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate dashboard metrics
  const dashboardMetrics = useMemo(() => {
    const totalTournaments = tournaments.length;
    const totalBuyIn = tournaments.reduce((sum, t) => sum + (parseFloat(t.buyIn) || 0), 0);
    const avgBuyIn = totalTournaments > 0 ? totalBuyIn / totalTournaments : 0;
    
    // Calculate time range
    const times = tournaments.map(t => t.time).filter(Boolean).sort();
    const firstTime = times[0];
    const lastTime = times[times.length - 1];
    let totalTime = '–';
    if (firstTime && lastTime) {
      const [startHour, startMin] = firstTime.split(':').map(Number);
      const [endHour, endMin] = lastTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin + 180; // Add 3 hours for tournament duration
      const totalMinutes = endMinutes - startMinutes;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      totalTime = `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
    }
    
    // Calculate breaks
    const breaks = new Set();
    tournaments.forEach(tournament => {
      if (tournament.time) {
        const [hour, minute] = tournament.time.split(':').map(Number);
        const breakHour = minute >= 55 ? hour + 1 : hour;
        breaks.add(`${breakHour}:55`);
      }
    });

    return {
      totalTournaments,
      totalBuyIn,
      avgBuyIn,
      timeRange: `${firstTime || '–'} - ${lastTime || '–'}`,
      totalTime,
      totalBreaks: breaks.size
    };
  }, [tournaments]);

  // Calculate analysis data
  const analysisData = useMemo(() => {
    // Sites analysis
    const siteStats = tournaments.reduce((acc, t) => {
      acc[t.site] = (acc[t.site] || 0) + (parseFloat(t.buyIn) || 0);
      return acc;
    }, {} as Record<string, number>);

    // Type chart data
    const typeStats = tournaments.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeChartData = Object.entries(typeStats).map(([type, count]) => ({
      name: type,
      value: count,
      color: type === 'Mystery' ? '#9333ea' : type === 'PKO' ? '#ea580c' : '#2563eb'
    }));

    // Speed chart data
    const speedStats = tournaments.reduce((acc, t) => {
      acc[t.speed] = (acc[t.speed] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const speedChartData = Object.entries(speedStats).map(([speed, count]) => ({
      name: speed,
      value: count,
      color: speed === 'Turbo' ? '#ca8a04' : speed === 'Hyper' ? '#dc2626' : '#16a34a'
    }));

    // Field size analysis - Calculate Field Médio (guaranteed ÷ buyIn) for each tournament
    const calculateFieldMedio = (tournament: any) => {
      const guaranteed = parseFloat(tournament.guaranteed || '0');
      const buyIn = parseFloat(tournament.buyIn || '1');
      
      if (guaranteed <= 0 || buyIn <= 0) return 0;
      return Math.round(guaranteed / buyIn);
    };

    const fieldSizes = {
      small: tournaments.filter(t => {
        const fieldMedio = calculateFieldMedio(t);
        return fieldMedio > 0 && fieldMedio < 100;
      }).length,
      medium: tournaments.filter(t => {
        const fieldMedio = calculateFieldMedio(t);
        return fieldMedio >= 100 && fieldMedio < 400;
      }).length,
      large: tournaments.filter(t => {
        const fieldMedio = calculateFieldMedio(t);
        return fieldMedio >= 400 && fieldMedio < 1000;
      }).length,
      huge: tournaments.filter(t => {
        const fieldMedio = calculateFieldMedio(t);
        return fieldMedio >= 1000;
      }).length
    };

    return {
      siteStats,
      typeChartData,
      speedChartData,
      fieldSizes
    };
  }, [tournaments]);

  // Group tournaments by breaks
  const tournamentsByBreak = useMemo(() => {
    const groups: Record<string, any[]> = {};
    tournaments.forEach(tournament => {
      if (tournament.time) {
        const [hour, minute] = tournament.time.split(':').map(Number);
        const breakHour = minute >= 55 ? hour + 1 : hour;
        const breakKey = `${breakHour}:55`;
        if (!groups[breakKey]) {
          groups[breakKey] = [];
        }
        groups[breakKey].push(tournament);
      }
    });
    
    // Sort groups by break time
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [key, value]) => {
        acc[key] = value.sort((a, b) => a.time.localeCompare(b.time));
        return acc;
      }, {} as Record<string, any[]>);
  }, [tournaments]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-[1600px] min-h-[85vh] p-0">
        
        {/* Header Expandido */}
        <div className="p-6 border-b border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-2xl text-emerald-400 mb-6">
              {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
            </DialogTitle>
          </DialogHeader>

          {/* Métricas Principais - 6 Colunas */}
          <div className="grid grid-cols-6 gap-4 mb-6">
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {dashboardMetrics.totalTournaments}
              </div>
              <div className="text-sm text-slate-400">Torneios</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                ${dashboardMetrics.totalBuyIn.toFixed(0)}
              </div>
              <div className="text-sm text-slate-400">Buy-in Total</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                ${dashboardMetrics.avgBuyIn.toFixed(0)}
              </div>
              <div className="text-sm text-slate-400">ABI</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {dashboardMetrics.timeRange}
              </div>
              <div className="text-sm text-slate-400">Horário</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {dashboardMetrics.totalTime}
              </div>
              <div className="text-sm text-slate-400">Tempo Total</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {dashboardMetrics.totalBreaks}
              </div>
              <div className="text-sm text-slate-400">Breaks</div>
            </div>
          </div>

          {/* Análise Detalhada - 4 Colunas */}
          <div className="grid grid-cols-4 gap-6">
            {/* Sites */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Sites</h4>
              <div className="space-y-2">
                {Object.entries(analysisData.siteStats).map(([site, investment]) => (
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

            {/* Tipos - Gráfico Pizza */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Tipos</h4>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analysisData.typeChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={30}
                      dataKey="value"
                    >
                      {analysisData.typeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Velocidades - Gráfico Pizza */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Velocidades</h4>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analysisData.speedChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={30}
                      dataKey="value"
                    >
                      {analysisData.speedChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Field Size */}
            <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Field Size</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{'< 100:'}</span>
                  <span className="text-emerald-400">{analysisData.fieldSizes.small}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">100-400:</span>
                  <span className="text-emerald-400">{analysisData.fieldSizes.medium}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">400-1000:</span>
                  <span className="text-emerald-400">{analysisData.fieldSizes.large}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{'> 1000:'}</span>
                  <span className="text-emerald-400">{analysisData.fieldSizes.huge}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Layout Principal - 2 Colunas (60% / 40%) */}
        <div className="grid grid-cols-[3fr_2fr] gap-6 p-6 h-[calc(85vh-400px)]">
          
          {/* COLUNA ESQUERDA - Torneios Planejados (60%) */}
          <div className="flex flex-col bg-slate-900 border border-slate-600 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Torneios Planejados</h3>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {Object.keys(tournamentsByBreak).length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum torneio planejado para este dia</p>
                </div>
              ) : (
                Object.entries(tournamentsByBreak).map(([breakTime, breakTournaments]) => (
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
                      {breakTournaments.map((tournament) => (
                        <div key={tournament.id} className="bg-slate-600 rounded-md p-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{tournament.time}</span>
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
                                <Edit2 className="w-3 h-3" />
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
                            {tournament.name || 'Sem nome'}
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Badge 
                                className={`text-xs px-1 py-0.5 text-white ${getBadgeColor('type', tournament.type)}`}
                              >
                                {tournament.type}
                              </Badge>
                              <Badge 
                                className={`text-xs px-1 py-0.5 text-white ${getBadgeColor('speed', tournament.speed)}`}
                              >
                                {tournament.speed}
                              </Badge>
                            </div>
                            <span className="text-sm font-bold text-emerald-400">${tournament.buyIn}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COLUNA DIREITA - Novo Torneio + Sugestões (40%) */}
          <div className="flex flex-col space-y-4">
            
            {/* Novo Torneio - Parte Superior */}
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
                    <label className="block text-sm font-medium text-slate-300 mb-1">Horário</label>
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
                    {priorities.map(priority => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
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
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Adicionar
                  </Button>
                </div>
              </form>
            </div>

            {/* Sugestões - Parte Inferior */}
            <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 flex-1">
              <h3 className="text-lg font-semibold text-white mb-4">Sugestões</h3>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {suggestions.length === 0 ? (
                  <div className="text-center text-slate-400 py-4">
                    <p className="text-sm">Nenhuma sugestão disponível</p>
                  </div>
                ) : (
                  suggestions.map((suggestion) => (
                    <div 
                      key={suggestion.id}
                      className="bg-slate-600 rounded-md p-2 cursor-pointer hover:bg-slate-500 transition-colors"
                      onClick={() => onSelectSuggestion(suggestion)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{suggestion.time}</span>
                          <div className={`w-2 h-2 rounded-full ${getSiteColor(suggestion.site)}`}></div>
                          <span className="text-xs text-slate-300">{suggestion.site}</span>
                          <span className="text-xs text-slate-400">{suggestion.name}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Badge 
                            className={`text-xs px-1 py-0.5 text-white ${getBadgeColor('type', suggestion.type)}`}
                          >
                            {suggestion.type}
                          </Badge>
                          <Badge 
                            className={`text-xs px-1 py-0.5 text-white ${getBadgeColor('speed', suggestion.speed)}`}
                          >
                            {suggestion.speed}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-400">${suggestion.buyIn}</span>
                          <div className="text-xs text-slate-400">${suggestion.guaranteed} GTD</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
