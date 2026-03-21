import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getCategoryColor, getSpeedColor } from './helpers';
import type { NewTournamentForm } from './types';

interface AddTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTournament: NewTournamentForm;
  setNewTournament: React.Dispatch<React.SetStateAction<NewTournamentForm>>;
  syncWithGrade: boolean;
  setSyncWithGrade: React.Dispatch<React.SetStateAction<boolean>>;
  weeklySuggestions: any[];
  onAddTournament: (data: any) => void;
  isPending: boolean;
  // Suggestion helpers
  getFilteredSuggestions: () => any[];
  resetFilters: () => void;
  hasActiveFilters: () => boolean;
  getSuggestionStats: () => { total: number; filtered: number; sites: number; types: number };
  applySuggestion: (suggestion: any) => void;
  applyQuickFilter: (filterType: string, value: string) => void;
  getSimilarityScore: (suggestion: any) => number;
}

export default function AddTournamentDialog({
  open,
  onOpenChange,
  newTournament,
  setNewTournament,
  syncWithGrade,
  setSyncWithGrade,
  weeklySuggestions,
  onAddTournament,
  isPending,
  getFilteredSuggestions,
  resetFilters,
  hasActiveFilters,
  getSuggestionStats,
  applySuggestion,
  applyQuickFilter,
  getSimilarityScore,
}: AddTournamentDialogProps) {
  // RF-12: Progressive disclosure state
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="add-tournament-btn">
          <span>+</span>
          Adicionar Torneio
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#0a0a0a] border-[#333333] text-white max-w-2xl max-h-[95vh] overflow-y-auto shadow-2xl">
        <DialogHeader className="border-b border-[#333333] pb-4">
          <DialogTitle className="text-2xl font-bold text-[#00ff88] flex items-center gap-2">
            Adicionar Novo Torneio
          </DialogTitle>
          <DialogDescription className="text-gray-400 mt-1">
            Preencha os dados essenciais ou selecione uma sugestao
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          {/* RF-12: Essential fields only */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[#00ff88] font-medium">Site</Label>
              <select
                value={newTournament.site}
                onChange={(e) => setNewTournament({...newTournament, site: e.target.value})}
                className="w-full p-2 bg-[#1a1a1a] border border-[#333333] rounded-md text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
              >
                <option value="">Selecione o site</option>
                <option value="PokerStars">PokerStars</option>
                <option value="GGPoker">GGPoker</option>
                <option value="PartyPoker">PartyPoker</option>
                <option value="888poker">888poker</option>
                <option value="WPN">WPN</option>
                <option value="Chico">Chico</option>
                <option value="iPoker">iPoker</option>
                <option value="CoinPoker">CoinPoker</option>
                <option value="Revolution">Revolution</option>
                <option value="Bodog">Bodog</option>
              </select>
            </div>
            <div>
              <Label className="text-[#00ff88] font-medium">Horario</Label>
              <Input
                type="time"
                value={newTournament.scheduledTime}
                onChange={(e) => setNewTournament({...newTournament, scheduledTime: e.target.value})}
                className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
              />
            </div>
            <div>
              <Label className="text-[#00ff88] font-medium">Buy-in ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={newTournament.buyIn}
                onChange={(e) => setNewTournament({...newTournament, buyIn: e.target.value})}
                className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-[#00ff88] font-medium">Nome (opcional)</Label>
              <Input
                value={newTournament.name}
                onChange={(e) => setNewTournament({...newTournament, name: e.target.value})}
                className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                placeholder="Deixe vazio para gerar automaticamente"
              />
            </div>
          </div>

          {/* RF-12: Advanced fields - collapsible */}
          <Collapsible open={showAdvancedFields} onOpenChange={setShowAdvancedFields}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#00ff88] transition-colors w-full py-2">
                {showAdvancedFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Mais opcoes
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#00ff88] font-medium">Tipo</Label>
                  <select
                    value={newTournament.type}
                    onChange={(e) => setNewTournament({...newTournament, type: e.target.value})}
                    className="w-full p-2 bg-[#1a1a1a] border border-[#333333] rounded-md text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                  >
                    <option value="Vanilla">Vanilla</option>
                    <option value="PKO">PKO</option>
                    <option value="Mystery">Mystery</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[#00ff88] font-medium">Velocidade</Label>
                  <select
                    value={newTournament.speed}
                    onChange={(e) => setNewTournament({...newTournament, speed: e.target.value})}
                    className="w-full p-2 bg-[#1a1a1a] border border-[#333333] rounded-md text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Turbo">Turbo</option>
                    <option value="Hyper">Hyper</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[#00ff88] font-medium">Guaranteed (opcional)</Label>
                  <Input
                    type="number"
                    value={newTournament.fieldSize}
                    onChange={(e) => setNewTournament({...newTournament, fieldSize: e.target.value})}
                    className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                    placeholder="0"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Sync with Grade checkbox */}
          <div className="p-3 bg-[#1a1a1a]/50 rounded-lg border border-[#333333]/50">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sync-with-grade"
                checked={syncWithGrade}
                onChange={(e) => setSyncWithGrade(e.target.checked)}
                className="w-4 h-4 text-[#00ff88] bg-[#1a1a1a] border-[#333333] rounded focus:ring-[#00ff88]/50 focus:border-[#00ff88]"
              />
              <Label htmlFor="sync-with-grade" className="text-gray-300 cursor-pointer">
                Adicionar na Grade do {new Date().toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase())}
              </Label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex space-x-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 border-[#333333] text-gray-300 hover:bg-[#1a1a1a] hover:border-[#00ff88] transition-all"
            >
              Fechar
            </Button>
            <Button
              onClick={() => {
                onAddTournament({
                  ...newTournament,
                  syncWithGrade
                });
                // RF-12: Keep modal open after adding (dialog stays open, form resets via parent)
              }}
              className="flex-1 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium transition-all"
              disabled={isPending || !newTournament.site || !newTournament.buyIn}
            >
              {isPending ? "Adicionando..." : "Adicionar Torneio"}
            </Button>
          </div>

          {/* RF-12: Suggestions collapsed by default */}
          <Collapsible open={showSuggestions} onOpenChange={setShowSuggestions}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors w-full py-2 border-t border-[#333333]/50 mt-4 pt-4">
                {showSuggestions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Ver sugestoes ({getSuggestionStats().total} disponiveis)
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-blue-300">Baseado no seu planejamento semanal</p>
                  <button
                    onClick={resetFilters}
                    className={`text-xs transition-colors px-3 py-1.5 rounded border ${
                      hasActiveFilters()
                        ? 'text-[#00ff88] border-[#00ff88]/70 bg-[#00ff88]/10 hover:bg-[#00ff88]/20'
                        : 'text-gray-400 border-[#333333]/50 hover:text-[#00ff88] hover:border-[#00ff88]/70'
                    }`}
                    disabled={!hasActiveFilters()}
                  >
                    {hasActiveFilters() ? 'Limpar Filtros' : 'Sem Filtros'}
                  </button>
                </div>

                {/* Quick filter tags */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {Array.from(new Set(weeklySuggestions.map(s => s.site))).slice(0, 3).map(site => (
                    <button
                      key={site}
                      onClick={() => applyQuickFilter('site', site)}
                      className="text-xs px-2 py-1 bg-blue-700/40 text-blue-200 rounded hover:bg-blue-600/50 transition-colors"
                    >
                      {site}
                    </button>
                  ))}
                  {Array.from(new Set(weeklySuggestions.map(s => s.type))).slice(0, 3).map(type => (
                    <button
                      key={type}
                      onClick={() => applyQuickFilter('type', type)}
                      className="text-xs px-2 py-1 bg-blue-700/40 text-blue-200 rounded hover:bg-blue-600/50 transition-colors"
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {(() => {
                    const filteredSuggestions = getFilteredSuggestions();
                    if (filteredSuggestions.length === 0) {
                      return (
                        <div className="p-4 bg-[#1a1a1a]/50 rounded-lg border border-[#333333]/50 text-center">
                          <p className="text-gray-400 text-sm">
                            {weeklySuggestions.length === 0
                              ? 'Nenhuma sugestao disponivel. Adicione torneios na sua Grade semanal.'
                              : 'Nenhuma sugestao encontrada para os filtros atuais.'}
                          </p>
                        </div>
                      );
                    }
                    return filteredSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-2 bg-[#1a1a1a]/50 rounded border border-[#333333]/40 hover:border-[#00ff88]/60 hover:bg-[#1a1a1a]/80 transition-all duration-200 cursor-pointer"
                        onClick={() => applySuggestion(suggestion)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="font-medium text-white text-sm min-w-[80px]">{suggestion.site}</span>
                            <div className="flex items-center gap-1">
                              <span className={`px-2 py-0.5 rounded text-xs text-white ${getCategoryColor(suggestion.type)}`}>{suggestion.type}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${getSpeedColor(suggestion.speed)}`}>{suggestion.speed}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-[#00ff88]">${suggestion.buyIn}</span>
                            {suggestion.guaranteed && <span className="text-gray-400">| ${suggestion.guaranteed}</span>}
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
