import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, X, Edit, Trash2, Plus } from "lucide-react";

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
  const getSiteColor = (site: string) => {
    const colors: {[key: string]: string} = {
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
    return colors[site] || "bg-gray-600";
  };

  const getTypeColor = (type: string) => {
    const colors: {[key: string]: string} = {
      "Vanilla": "bg-blue-600",
      "PKO": "bg-red-600",
      "Mystery": "bg-purple-600"
    };
    return colors[type] || "bg-gray-600";
  };

  const getSpeedColor = (speed: string) => {
    const colors: {[key: string]: string} = {
      "Normal": "bg-emerald-600",
      "Turbo": "bg-amber-600",
      "Hyper": "bg-red-600"
    };
    return colors[speed] || "bg-gray-600";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-[1400px] min-h-[80vh] p-6">
        {/* Header da Modal */}
        <DialogHeader className="h-16 px-4 border-b border-slate-700 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-xl text-emerald-400">
              {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
            </DialogTitle>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded hover:bg-slate-700 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        {/* Dashboard do Dia */}
        <div className="p-4 mb-6 bg-slate-900 border border-slate-700 rounded-lg">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
              <div className="text-lg font-bold text-emerald-400 mb-1">{dayStats?.count || 0}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Torneios</div>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
              <div className="text-lg font-bold text-emerald-400 mb-1">${dayStats?.totalBuyIn?.toFixed(0) || 0}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Buy-in Total</div>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
              <div className="text-lg font-bold text-emerald-400 mb-1">${dayStats?.avgBuyIn?.toFixed(0) || 0}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">ABI</div>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
              <div className="text-lg font-bold text-emerald-400 mb-1">
                {dayStats?.startTime && dayStats?.endTime ? `${dayStats.durationHours}h` : '–'}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Tempo Total</div>
            </div>
          </div>
        </div>

        {/* Layout Principal - 3 Colunas */}
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-5 h-[calc(80vh-200px)]">
          {/* COLUNA 1 - Lista de Torneios */}
          <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {/* Header da Coluna */}
            <div className="p-4 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-white">Torneios Planejados</h4>
                <div className="text-sm text-emerald-400 font-medium">
                  {tournaments.length} torneios
                </div>
              </div>
            </div>
            
            {/* Lista de Torneios */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {tournaments.map((tournament, index) => (
                <div
                  key={tournament.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-emerald-400 transition-all duration-200"
                >
                  {/* Header do Card */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 text-white text-xs px-2 py-1">
                        {tournament.time || '00:00'}
                      </Badge>
                      <Badge className={`text-xs px-2 py-1 text-white ${getSiteColor(tournament.site)}`}>
                        {tournament.site}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-slate-600"
                        onClick={() => onEditTournament(tournament)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-red-600"
                        onClick={() => onDeleteTournament(tournament)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Nome do Torneio */}
                  <h5 className="font-medium text-white text-sm mb-2 leading-tight">
                    {tournament.name || `${tournament.site} ${tournament.type}`}
                  </h5>

                  {/* Tags e Garantido */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs px-2 py-1 text-white ${getTypeColor(tournament.type)}`}>
                        {tournament.type}
                      </Badge>
                      <Badge className={`text-xs px-2 py-1 text-white ${getSpeedColor(tournament.speed)}`}>
                        {tournament.speed}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-semibold">${parseFloat(tournament.buyIn || 0).toFixed(2)}</div>
                      {tournament.guaranteed && (
                        <div className="text-xs text-slate-400">${parseFloat(tournament.guaranteed).toFixed(0)} GTD</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {tournaments.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum torneio planejado para este dia</p>
                  <p className="text-sm">Use o formulário para adicionar torneios</p>
                </div>
              )}
            </div>
          </div>

          {/* COLUNA 2 - Sugestões */}
          <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {/* Header da Coluna */}
            <div className="p-4 bg-slate-800 border-b border-slate-700">
              <h4 className="text-lg font-semibold text-white">Sugestões da Grade Semanal</h4>
            </div>
            
            {/* Lista de Sugestões */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-emerald-400 transition-all duration-200 cursor-pointer"
                  onClick={() => onSelectSuggestion(suggestion)}
                >
                  {/* Tags */}
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`text-xs px-2 py-1 text-white ${getTypeColor(suggestion.type)}`}>
                      {suggestion.type}
                    </Badge>
                    <Badge className={`text-xs px-2 py-1 text-white ${getSpeedColor(suggestion.speed)}`}>
                      {suggestion.speed}
                    </Badge>
                  </div>

                  {/* Nome */}
                  <h5 className="font-medium text-white text-sm mb-1">{suggestion.name}</h5>

                  {/* Informações */}
                  <div className="text-xs text-slate-400">
                    {suggestion.site} • ${suggestion.buyIn} • {suggestion.guaranteed ? `$${suggestion.guaranteed} GTD` : 'Sem GTD'}
                  </div>
                </div>
              ))}
              
              {suggestions.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Plus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma sugestão disponível</p>
                  <p className="text-sm">Adicione torneios em outros dias da semana</p>
                </div>
              )}
            </div>
          </div>

          {/* COLUNA 3 - Formulário */}
          <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {/* Header da Coluna */}
            <div className="p-4 bg-slate-800 border-b border-slate-700">
              <h4 className="text-lg font-semibold text-white">Novo Torneio</h4>
            </div>
            
            {/* Formulário */}
            <div className="flex-1 p-4 overflow-y-auto">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Site */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Site</label>
                  <select
                    {...form.register("site")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione um site</option>
                    {sites.map((site) => (
                      <option key={site} value={site}>{site}</option>
                    ))}
                  </select>
                </div>

                {/* Horário */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Horário de Registro</label>
                  <input
                    type="time"
                    {...form.register("time")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Tipo</label>
                  <select
                    {...form.register("type")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione um tipo</option>
                    {types.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Velocidade */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Velocidade</label>
                  <select
                    {...form.register("speed")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione a velocidade</option>
                    {speeds.map((speed) => (
                      <option key={speed} value={speed}>{speed}</option>
                    ))}
                  </select>
                </div>

                {/* Nome */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Nome (opcional)</label>
                  <input
                    type="text"
                    {...form.register("name")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    placeholder="Nome do torneio"
                  />
                </div>

                {/* Buy-in */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Buy-in</label>
                  <input
                    type="number"
                    step="0.01"
                    {...form.register("buyIn")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    placeholder="0.00"
                  />
                </div>

                {/* Garantido */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Garantido (opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    {...form.register("guaranteed")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    placeholder="0.00"
                  />
                </div>

                {/* Prioridade */}
                <div>
                  <label className="block mb-2 font-medium text-slate-200">Prioridade</label>
                  <select
                    {...form.register("prioridade")}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    {priorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botões */}
                <div className="sticky bottom-0 bg-slate-900 p-4 border-t border-slate-700 -mx-4 flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                    onClick={() => form.reset()}
                  >
                    Limpar Todos
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-slate-900 font-semibold"
                  >
                    Adicionar Torneio
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}