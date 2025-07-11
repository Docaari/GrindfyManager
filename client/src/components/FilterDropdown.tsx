import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Filter, X, Calendar, RotateCcw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterState } from "@/components/FilterPopupSimple";
import { format } from "date-fns";

// Função debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface FilterDropdownProps {
  onApplyFilters: (filters: FilterState) => void;
  initialFilters: FilterState;
}

export default function FilterDropdown({ onApplyFilters, initialFilters }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  // Debounce para aplicação automática
  const debouncedApplyFilters = useCallback(
    debounce((newFilters: FilterState) => {
      setIsApplying(true);
      onApplyFilters(newFilters);
      setTimeout(() => setIsApplying(false), 300);
    }, 300),
    [onApplyFilters]
  );

  // Aplicar filtros automaticamente quando mudarem
  useEffect(() => {
    if (JSON.stringify(filters) !== JSON.stringify(initialFilters)) {
      debouncedApplyFilters(filters);
    }
  }, [filters, initialFilters, debouncedApplyFilters]);

  const countActiveFilters = () => {
    let count = 0;
    
    // Período personalizado
    if (filters.period === 'custom') count++;
    
    // Range filters (só conta se não estiver no valor padrão)
    if (filters.abiRange[0] !== 0 || filters.abiRange[1] !== 500) count++;
    if (filters.preparationRange[0] !== 0 || filters.preparationRange[1] !== 10) count++;
    if (filters.interferenceRange[0] !== 0 || filters.interferenceRange[1] !== 10) count++;
    if (filters.energyRange[0] !== 0 || filters.energyRange[1] !== 10) count++;
    if (filters.confidenceRange[0] !== 0 || filters.confidenceRange[1] !== 10) count++;
    if (filters.emotionalRange[0] !== 0 || filters.emotionalRange[1] !== 10) count++;
    if (filters.focusRange[0] !== 0 || filters.focusRange[1] !== 10) count++;
    
    // Multi-select filters
    if (filters.tournamentTypes.length > 0) count++;
    if (filters.tournamentSpeeds.length > 0) count++;
    
    return count;
  };

  const resetFilters = () => {
    const resetState: FilterState = {
      period: 'all',
      customStartDate: '',
      customEndDate: '',
      abiRange: [0, 500],
      preparationRange: [0, 10],
      interferenceRange: [0, 10],
      energyRange: [0, 10],
      confidenceRange: [0, 10],
      emotionalRange: [0, 10],
      focusRange: [0, 10],
      tournamentTypes: [],
      tournamentSpeeds: []
    };
    setFilters(resetState);
  };

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const toggleMultiSelectOption = (category: 'tournamentTypes' | 'tournamentSpeeds', option: string) => {
    setFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(option) 
        ? prev[category].filter(item => item !== option)
        : [...prev[category], option]
    }));
  };

  return (
    <div className="w-full mb-6">
      {/* Botão de filtros */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500"
        >
          <Filter className="w-4 h-4" />
          Filtros
          {countActiveFilters() > 0 && (
            <span className="ml-1 bg-emerald-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {countActiveFilters()}
            </span>
          )}
          {isApplying && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
        </Button>
        
        {isOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Painel de filtros expansível */}
      {isOpen && (
        <Card className="bg-gray-900 border-gray-700 mb-4">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Período */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">📅 Período</Label>
                <div className="space-y-2">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: '7d', label: '7 dias' },
                    { value: '30d', label: '30 dias' },
                    { value: '90d', label: '90 dias' },
                    { value: '1y', label: '1 ano' },
                    { value: 'custom', label: 'Personalizado' }
                  ].map(period => (
                    <label key={period.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="period"
                        value={period.value}
                        checked={filters.period === period.value}
                        onChange={(e) => updateFilter('period', e.target.value)}
                        className="text-red-600"
                      />
                      <span className="text-gray-300 text-sm">{period.label}</span>
                    </label>
                  ))}
                </div>
                
                {filters.period === 'custom' && (
                  <div className="space-y-2">
                    <Input
                      type="date"
                      placeholder="Data inicial"
                      value={filters.customStartDate}
                      onChange={(e) => updateFilter('customStartDate', e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                    <Input
                      type="date"
                      placeholder="Data final"
                      value={filters.customEndDate}
                      onChange={(e) => updateFilter('customEndDate', e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                )}
              </div>

              {/* Tipos de Torneio (Múltipla Seleção) */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">🎲 Tipos de Torneio</Label>
                <div className="space-y-2">
                  {['Vanilla', 'PKO', 'Mystery'].map(type => (
                    <label key={type} className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        checked={filters.tournamentTypes.includes(type)}
                        onCheckedChange={() => toggleMultiSelectOption('tournamentTypes', type)}
                        className="border-gray-600 data-[state=checked]:bg-emerald-600"
                      />
                      <span className="text-gray-300 text-sm">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Velocidades (Múltipla Seleção) */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">⚡ Velocidades</Label>
                <div className="space-y-2">
                  {['Normal', 'Turbo', 'Hyper'].map(speed => (
                    <label key={speed} className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        checked={filters.tournamentSpeeds.includes(speed)}
                        onCheckedChange={() => toggleMultiSelectOption('tournamentSpeeds', speed)}
                        className="border-gray-600 data-[state=checked]:bg-emerald-600"
                      />
                      <span className="text-gray-300 text-sm">{speed}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ABI Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">💰 ABI: ${filters.abiRange[0]} - ${filters.abiRange[1]}</Label>
                <Slider
                  value={filters.abiRange}
                  onValueChange={(value) => updateFilter('abiRange', value)}
                  max={500}
                  min={0}
                  step={5}
                  className="slider-emerald"
                />
              </div>

              {/* Preparação Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">🎯 Preparação: {filters.preparationRange[0]} - {filters.preparationRange[1]}</Label>
                <Slider
                  value={filters.preparationRange}
                  onValueChange={(value) => updateFilter('preparationRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>

              {/* Energia Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">⚡ Energia: {filters.energyRange[0]} - {filters.energyRange[1]}</Label>
                <Slider
                  value={filters.energyRange}
                  onValueChange={(value) => updateFilter('energyRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>

              {/* Foco Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">🧠 Foco: {filters.focusRange[0]} - {filters.focusRange[1]}</Label>
                <Slider
                  value={filters.focusRange}
                  onValueChange={(value) => updateFilter('focusRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>

              {/* Confiança Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">💪 Confiança: {filters.confidenceRange[0]} - {filters.confidenceRange[1]}</Label>
                <Slider
                  value={filters.confidenceRange}
                  onValueChange={(value) => updateFilter('confidenceRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>

              {/* Inteligência Emocional Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">🎭 Int. Emocional: {filters.emotionalRange[0]} - {filters.emotionalRange[1]}</Label>
                <Slider
                  value={filters.emotionalRange}
                  onValueChange={(value) => updateFilter('emotionalRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>

              {/* Interferências Range */}
              <div className="space-y-3">
                <Label className="text-gray-300 font-medium">📱 Interferências: {filters.interferenceRange[0]} - {filters.interferenceRange[1]}</Label>
                <Slider
                  value={filters.interferenceRange}
                  onValueChange={(value) => updateFilter('interferenceRange', value)}
                  max={10}
                  min={0}
                  step={1}
                  className="slider-emerald"
                />
              </div>
            </div>

            {/* Footer com contador e botão limpar */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-2 text-gray-400">
                <Filter className="w-4 h-4" />
                <span className="text-sm">
                  {countActiveFilters()} filtro{countActiveFilters() !== 1 ? 's' : ''} ativo{countActiveFilters() !== 1 ? 's' : ''}
                </span>
                {isApplying && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Aplicando...
                  </span>
                )}
              </div>
              
              {countActiveFilters() > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Limpar Tudo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}