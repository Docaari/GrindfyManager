import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  X,
  TrendingUp,
  TrendingDown,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TournamentLibraryFilters {
  period: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: {
    min: number | null;
    max: number | null;
  };
  roiFilter: string;
  profitFilter: string; // higher/lower
  volumeFilter: string; // higher/minimum
  minimumVolume: number | null;
}

interface TournamentLibraryFiltersProps {
  filters: TournamentLibraryFilters;
  onFiltersChange: (filters: TournamentLibraryFilters) => void;
  sites?: string[];
  categories?: string[];
  speeds?: string[];
}

const defaultFilters: TournamentLibraryFilters = {
  period: "all",
  sites: [],
  categories: [],
  speeds: [],
  buyinRange: {
    min: null,
    max: null,
  },
  roiFilter: "all",
  profitFilter: "all",
  volumeFilter: "all",
  minimumVolume: null,
};

export default function TournamentLibraryFilters({
  filters,
  onFiltersChange,
  sites = [],
  categories = [],
  speeds = []
}: TournamentLibraryFiltersProps) {
  const [localFilters, setLocalFilters] = useState<TournamentLibraryFilters>(filters);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const updateLocalFilters = (updates: Partial<TournamentLibraryFilters>) => {
    setLocalFilters(prev => ({ ...prev, ...updates }));
  };

  const applyFilters = () => {
    onFiltersChange(localFilters);
  };

  const resetFilters = () => {
    const resetFiltersState = { ...defaultFilters };
    setLocalFilters(resetFiltersState);
    onFiltersChange(resetFiltersState);
  };

  const hasActiveFilters = () => {
    return (
      filters.sites.length > 0 ||
      filters.categories.length > 0 ||
      filters.speeds.length > 0 ||
      filters.buyinRange.min !== null ||
      filters.buyinRange.max !== null ||
      filters.roiFilter !== 'all' ||
      filters.profitFilter !== 'all' ||
      filters.volumeFilter !== 'all' ||
      filters.minimumVolume !== null ||
      filters.period !== 'all'
    );
  };

  const hasLocalChanges = () => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.sites.length > 0) count++;
    if (filters.categories.length > 0) count++;
    if (filters.speeds.length > 0) count++;
    if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) count++;
    if (filters.roiFilter !== 'all') count++;
    if (filters.profitFilter !== 'all') count++;
    if (filters.volumeFilter !== 'all') count++;
    if (filters.period !== 'all') count++;
    return count;
  };

  const toggleArrayFilter = (array: string[], value: string, field: keyof Pick<TournamentLibraryFilters, 'sites' | 'categories' | 'speeds'>) => {
    const newArray = array.includes(value) 
      ? array.filter(item => item !== value)
      : [...array, value];
    updateLocalFilters({ [field]: newArray });
  };

  return (
    <div className="mb-6">
      {/* Filter Toggle Button */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white border-gray-600 hover:bg-gray-700"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filtros
          {hasActiveFilters() && (
            <Badge variant="secondary" className="ml-2 bg-poker-green text-white">
              {getActiveFiltersCount()}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 ml-2" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-2" />
          )}
        </Button>

        {hasActiveFilters() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4 mr-1" />
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      {isExpanded && (
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-white">Filtros Avançados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Period Filter */}
            <div>
              <Label className="text-white mb-2 block">Período</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "7d", label: "7 dias" },
                  { value: "30d", label: "30 dias" },
                  { value: "90d", label: "90 dias" },
                  { value: "1y", label: "1 ano" },
                  { value: "all", label: "Todos" }
                ].map(period => (
                  <Button
                    key={period.value}
                    variant={localFilters.period === period.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateLocalFilters({ period: period.value })}
                    className={cn(
                      "text-xs",
                      localFilters.period === period.value 
                        ? "bg-poker-green hover:bg-poker-green/90" 
                        : "border-gray-600 text-gray-300 hover:bg-gray-700"
                    )}
                  >
                    {period.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Site Filter */}
            <div>
              <Label className="text-white mb-2 block">Sites</Label>
              <div className="flex flex-wrap gap-2">
                {sites.map(site => (
                  <Button
                    key={site}
                    variant={localFilters.sites.includes(site) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleArrayFilter(localFilters.sites, site, 'sites')}
                    className={cn(
                      "text-xs",
                      localFilters.sites.includes(site)
                        ? "bg-poker-green hover:bg-poker-green/90"
                        : "border-gray-600 text-gray-300 hover:bg-gray-700"
                    )}
                  >
                    {site}
                  </Button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <Label className="text-white mb-2 block">Categorias</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                  <Button
                    key={category}
                    variant={localFilters.categories.includes(category) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleArrayFilter(localFilters.categories, category, 'categories')}
                    className={cn(
                      "text-xs",
                      localFilters.categories.includes(category)
                        ? "bg-poker-green hover:bg-poker-green/90"
                        : "border-gray-600 text-gray-300 hover:bg-gray-700"
                    )}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>

            {/* Speed Filter */}
            <div>
              <Label className="text-white mb-2 block">Velocidade</Label>
              <div className="flex flex-wrap gap-2">
                {speeds.map(speed => (
                  <Button
                    key={speed}
                    variant={localFilters.speeds.includes(speed) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleArrayFilter(localFilters.speeds, speed, 'speeds')}
                    className={cn(
                      "text-xs",
                      localFilters.speeds.includes(speed)
                        ? "bg-poker-green hover:bg-poker-green/90"
                        : "border-gray-600 text-gray-300 hover:bg-gray-700"
                    )}
                  >
                    {speed}
                  </Button>
                ))}
              </div>
            </div>

            {/* Buy-in Range */}
            <div>
              <Label className="text-white mb-2 block">Faixa de Buy-in (USD)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Mín"
                  value={localFilters.buyinRange.min || ""}
                  onChange={(e) => updateLocalFilters({
                    buyinRange: {
                      ...localFilters.buyinRange,
                      min: e.target.value ? parseFloat(e.target.value) : null
                    }
                  })}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                />
                <Input
                  type="number"
                  placeholder="Máx"
                  value={localFilters.buyinRange.max || ""}
                  onChange={(e) => updateLocalFilters({
                    buyinRange: {
                      ...localFilters.buyinRange,
                      max: e.target.value ? parseFloat(e.target.value) : null
                    }
                  })}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
            </div>

            {/* ROI Filter */}
            <div>
              <Label className="text-white mb-2 block">ROI</Label>
              <Select 
                value={localFilters.roiFilter} 
                onValueChange={(value) => updateLocalFilters({ roiFilter: value })}
              >
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="positive">Positivo (+ de 0%)</SelectItem>
                  <SelectItem value="negative">Negativo (- de 0%)</SelectItem>
                  <SelectItem value="high">Alto (+ de 20%)</SelectItem>
                  <SelectItem value="medium">Médio (0% - 20%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Profit Filter */}
            <div>
              <Label className="text-white mb-2 block flex items-center">
                <TrendingUp className="w-4 h-4 mr-1" />
                Lucro Médio
              </Label>
              <Select 
                value={localFilters.profitFilter} 
                onValueChange={(value) => updateLocalFilters({ profitFilter: value })}
              >
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="higher">Maior Lucro Médio</SelectItem>
                  <SelectItem value="lower">Menor Lucro Médio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Volume Filter */}
            <div>
              <Label className="text-white mb-2 block flex items-center">
                <BarChart3 className="w-4 h-4 mr-1" />
                Volume
              </Label>
              <div className="space-y-2">
                <Select 
                  value={localFilters.volumeFilter} 
                  onValueChange={(value) => updateLocalFilters({ volumeFilter: value })}
                >
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="higher">Maior Volume</SelectItem>
                    <SelectItem value="minimum">Mínimo X Torneios</SelectItem>
                  </SelectContent>
                </Select>
                
                {localFilters.volumeFilter === 'minimum' && (
                  <Input
                    type="number"
                    placeholder="Ex: 50"
                    value={localFilters.minimumVolume || ""}
                    onChange={(e) => updateLocalFilters({
                      minimumVolume: e.target.value ? parseInt(e.target.value) : null
                    })}
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-2">
                {hasLocalChanges() && (
                  <Badge variant="secondary" className="text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300">
                    Mudanças Pendentes
                  </Badge>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocalFilters(filters)}
                  disabled={!hasLocalChanges()}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                
                <Button
                  size="sm"
                  onClick={applyFilters}
                  disabled={!hasLocalChanges()}
                  className="text-xs bg-poker-green hover:bg-poker-green/90"
                >
                  Aplicar Mudanças
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
}