import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Filter, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface DashboardFilters {
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: {
    min: number | null;
    max: number | null;
  };
  fieldSizeRange: {
    min: number | null;
    max: number | null;
  };
  keywordFilter: {
    type: 'contains' | 'not_contains' | 'none';
    keyword: string;
  };
}

interface DashboardFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  availableOptions: {
    sites: string[];
    categories: string[];
    speeds: string[];
  };
  period: string;
  onPeriodChange: (period: string) => void;
}

const buyinQuickFilters = [
  { label: "$5-$10", min: 5, max: 10 },
  { label: "$11-$20", min: 11, max: 20 },
  { label: "$21-$32", min: 21, max: 32 },
  { label: "$33-$45", min: 33, max: 45 },
  { label: "$46-$60", min: 46, max: 60 },
  { label: "$60-$99", min: 60, max: 99 },
  { label: "$100-$160", min: 100, max: 160 },
  { label: "$161+", min: 161, max: null },
];

const fieldSizeQuickFilters = [
  { label: "<100", min: null, max: 99 },
  { label: "100-200", min: 100, max: 200 },
  { label: "200-400", min: 200, max: 400 },
  { label: "400-600", min: 400, max: 600 },
  { label: "600-1000", min: 600, max: 1000 },
  { label: "1000-2000", min: 1000, max: 2000 },
  { label: "2000-4000", min: 2000, max: 4000 },
  { label: "4000+", min: 4000, max: null },
];

const periodQuickFilters = [
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
  { label: "2 anos", value: "730d" },
  { label: "1 ano", value: "365d" },
];

const periodAdvancedFilters = [
  { label: "Mês até agora", value: "month" },
  { label: "Ano até agora", value: "year" },
  { label: "Todo período", value: "all" },
];

export default function DashboardFilters({ filters, onFiltersChange, availableOptions, period, onPeriodChange }: DashboardFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Estado local para os filtros (não aplicados ainda)
  const [localFilters, setLocalFilters] = useState<DashboardFilters>(filters);

  // Sincronizar filtros locais quando os filtros aplicados mudarem
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const updateLocalFilters = (updates: Partial<DashboardFilters>) => {
    setLocalFilters({ ...localFilters, ...updates });
  };

  const applyFilters = () => {
    onFiltersChange(localFilters);
  };

  const resetFilters = () => {
    const resetFiltersState: DashboardFilters = {
      dateRange: { from: null, to: null },
      sites: [],
      categories: [],
      speeds: [],
      buyinRange: { min: null, max: null },
      fieldSizeRange: { min: null, max: null },
      keywordFilter: { type: 'none', keyword: '' },
    };
    setLocalFilters(resetFiltersState);
    onFiltersChange(resetFiltersState);
  };

  const hasActiveFilters = () => {
    return (
      localFilters.dateRange.from !== null ||
      localFilters.dateRange.to !== null ||
      localFilters.sites.length > 0 ||
      localFilters.categories.length > 0 ||
      localFilters.speeds.length > 0 ||
      localFilters.buyinRange.min !== null ||
      localFilters.buyinRange.max !== null ||
      localFilters.fieldSizeRange.min !== null ||
      localFilters.fieldSizeRange.max !== null ||
      localFilters.keywordFilter.type !== 'none'
    );
  };

  const hasLocalChanges = () => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (localFilters.dateRange.from || localFilters.dateRange.to) count++;
    if (localFilters.sites.length > 0) count++;
    if (localFilters.categories.length > 0) count++;
    if (localFilters.speeds.length > 0) count++;
    if (localFilters.buyinRange.min !== null || localFilters.buyinRange.max !== null) count++;
    if (localFilters.fieldSizeRange.min !== null || localFilters.fieldSizeRange.max !== null) count++;
    if (localFilters.keywordFilter.type !== 'none') count++;
    return count;
  };

  const toggleSite = (site: string) => {
    const newSites = localFilters.sites.includes(site)
      ? localFilters.sites.filter(s => s !== site)
      : [...localFilters.sites, site];
    updateLocalFilters({ sites: newSites });
  };

  const toggleCategory = (category: string) => {
    const newCategories = localFilters.categories.includes(category)
      ? localFilters.categories.filter(c => c !== category)
      : [...localFilters.categories, category];
    updateLocalFilters({ categories: newCategories });
  };

  const toggleSpeed = (speed: string) => {
    const newSpeeds = localFilters.speeds.includes(speed)
      ? localFilters.speeds.filter(s => s !== speed)
      : [...localFilters.speeds, speed];
    updateLocalFilters({ speeds: newSpeeds });
  };

  const setBuyinQuickFilter = (min: number | null, max: number | null) => {
    updateLocalFilters({ buyinRange: { min, max } });
  };

  const setFieldSizeQuickFilter = (min: number | null, max: number | null) => {
    updateLocalFilters({ fieldSizeRange: { min, max } });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant={isOpen ? "default" : "outline"}
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className={`text-xs h-8 px-3 font-medium transition-all duration-200 ${
            isOpen 
              ? "bg-poker-green hover:bg-poker-green/90 text-white border-poker-green shadow-sm" 
              : "bg-poker-surface hover:bg-gray-700 text-gray-300 border-gray-600 hover:border-poker-green/50"
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {hasActiveFilters() && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
              {getActiveFiltersCount()}
            </Badge>
          )}
        </Button>
        
        {hasActiveFilters() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Limpar Filtros
          </Button>
        )}

        {/* Quick Period Filters */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 font-medium">Período:</span>
          <div className="flex items-center gap-2 flex-wrap">
            {periodQuickFilters.map((filterOption) => (
              <Button
                key={filterOption.value}
                variant={period === filterOption.value ? "default" : "outline"}
                size="sm"
                onClick={() => onPeriodChange(filterOption.value)}
                className={`text-xs h-8 px-3 font-medium transition-all duration-200 ${
                  period === filterOption.value 
                    ? "bg-poker-green hover:bg-poker-green/90 text-white border-poker-green shadow-sm" 
                    : "bg-poker-surface hover:bg-gray-700 text-gray-300 border-gray-600 hover:border-poker-green/50"
                }`}
              >
                {filterOption.label}
              </Button>
            ))}
            
            <div className="h-4 w-px bg-gray-600 mx-1" />
            
            {periodAdvancedFilters.map((filterOption) => (
              <Button
                key={filterOption.value}
                variant={period === filterOption.value ? "default" : "outline"}
                size="sm"
                onClick={() => onPeriodChange(filterOption.value)}
                className={`text-xs h-8 px-3 font-medium transition-all duration-200 ${
                  period === filterOption.value 
                    ? "bg-poker-green hover:bg-poker-green/90 text-white border-poker-green shadow-sm" 
                    : "bg-poker-surface hover:bg-gray-700 text-gray-300 border-gray-600 hover:border-poker-green/50"
                }`}
              >
                {filterOption.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Filtros Avançados
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label>Período</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[180px] justify-start text-left font-normal",
                        !localFilters.dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {localFilters.dateRange.from ? (
                        format(localFilters.dateRange.from, "dd/MM/yyyy")
                      ) : (
                        "Data inicial"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={localFilters.dateRange.from || undefined}
                      onSelect={(date) => updateLocalFilters({ 
                        dateRange: { ...localFilters.dateRange, from: date || null } 
                      })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                <span className="text-muted-foreground">até</span>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[180px] justify-start text-left font-normal",
                        !localFilters.dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {localFilters.dateRange.to ? (
                        format(localFilters.dateRange.to, "dd/MM/yyyy")
                      ) : (
                        "Data final"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={localFilters.dateRange.to || undefined}
                      onSelect={(date) => updateLocalFilters({ 
                        dateRange: { ...localFilters.dateRange, to: date || null } 
                      })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Sites Filter */}
            <div className="space-y-2">
              <Label>Sites</Label>
              <div className="flex flex-wrap gap-2">
                {availableOptions.sites.map((site) => (
                  <div key={site} className="flex items-center space-x-2">
                    <Checkbox
                      id={`site-${site}`}
                      checked={localFilters.sites.includes(site)}
                      onCheckedChange={() => toggleSite(site)}
                    />
                    <Label htmlFor={`site-${site}`} className="text-sm font-normal">
                      {site}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Categories Filter */}
            <div className="space-y-2">
              <Label>Categorias</Label>
              <div className="flex flex-wrap gap-2">
                {availableOptions.categories.map((category) => (
                  <div key={category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={localFilters.categories.includes(category)}
                      onCheckedChange={() => toggleCategory(category)}
                    />
                    <Label htmlFor={`category-${category}`} className="text-sm font-normal">
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Speeds Filter */}
            <div className="space-y-2">
              <Label>Velocidade</Label>
              <div className="flex flex-wrap gap-2">
                {availableOptions.speeds.map((speed) => (
                  <div key={speed} className="flex items-center space-x-2">
                    <Checkbox
                      id={`speed-${speed}`}
                      checked={localFilters.speeds.includes(speed)}
                      onCheckedChange={() => toggleSpeed(speed)}
                    />
                    <Label htmlFor={`speed-${speed}`} className="text-sm font-normal">
                      {speed}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Buy-in Range Filter */}
            <div className="space-y-3">
              <Label>Faixa de Buy-in</Label>
              
              {/* Quick Filters */}
              <div className="grid grid-cols-4 gap-2">
                {buyinQuickFilters.map((filter) => (
                  <Button
                    key={filter.label}
                    variant={
                      localFilters.buyinRange.min === filter.min && 
                      localFilters.buyinRange.max === filter.max 
                        ? "default" 
                        : "outline"
                    }
                    size="sm"
                    onClick={() => setBuyinQuickFilter(filter.min, filter.max)}
                    className="text-xs"
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>

              {/* Custom Range */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label htmlFor="buyin-min" className="text-xs">Mínimo</Label>
                  <Input
                    id="buyin-min"
                    type="number"
                    placeholder="$0"
                    value={localFilters.buyinRange.min || ''}
                    onChange={(e) => updateLocalFilters({
                      buyinRange: { 
                        ...localFilters.buyinRange, 
                        min: e.target.value ? Number(e.target.value) : null 
                      }
                    })}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="buyin-max" className="text-xs">Máximo</Label>
                  <Input
                    id="buyin-max"
                    type="number"
                    placeholder="$999"
                    value={localFilters.buyinRange.max || ''}
                    onChange={(e) => updateLocalFilters({
                      buyinRange: { 
                        ...localFilters.buyinRange, 
                        max: e.target.value ? Number(e.target.value) : null 
                      }
                    })}
                  />
                </div>
              </div>
            </div>

            {/* Field Size Range Filter */}
            <div className="space-y-3">
              <Label>Média de Participantes</Label>
              
              {/* Quick Filters */}
              <div className="grid grid-cols-4 gap-2">
                {fieldSizeQuickFilters.map((filter) => (
                  <Button
                    key={filter.label}
                    variant={
                      localFilters.fieldSizeRange.min === filter.min && 
                      localFilters.fieldSizeRange.max === filter.max 
                        ? "default" 
                        : "outline"
                    }
                    size="sm"
                    onClick={() => setFieldSizeQuickFilter(filter.min, filter.max)}
                    className="text-xs"
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>

              {/* Custom Range */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label htmlFor="field-min" className="text-xs">Mínimo</Label>
                  <Input
                    id="field-min"
                    type="number"
                    placeholder="0"
                    value={localFilters.fieldSizeRange.min || ''}
                    onChange={(e) => updateLocalFilters({
                      fieldSizeRange: { 
                        ...localFilters.fieldSizeRange, 
                        min: e.target.value ? Number(e.target.value) : null 
                      }
                    })}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="field-max" className="text-xs">Máximo</Label>
                  <Input
                    id="field-max"
                    type="number"
                    placeholder="9999"
                    value={localFilters.fieldSizeRange.max || ''}
                    onChange={(e) => updateLocalFilters({
                      fieldSizeRange: { 
                        ...localFilters.fieldSizeRange, 
                        max: e.target.value ? Number(e.target.value) : null 
                      }
                    })}
                  />
                </div>
              </div>
            </div>

            {/* Keyword Filter */}
            <div className="space-y-2">
              <Label>Filtro por Palavras-chave</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={localFilters.keywordFilter.type}
                  onValueChange={(value: 'contains' | 'not_contains' | 'none') => 
                    updateLocalFilters({ 
                      keywordFilter: { 
                        ...localFilters.keywordFilter, 
                        type: value,
                        keyword: value === 'none' ? '' : localFilters.keywordFilter.keyword
                      } 
                    })
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem filtro</SelectItem>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="not_contains">Não contém</SelectItem>
                  </SelectContent>
                </Select>
                
                {localFilters.keywordFilter.type !== 'none' && (
                  <Input
                    placeholder="Digite a palavra-chave..."
                    value={localFilters.keywordFilter.keyword}
                    onChange={(e) => updateLocalFilters({
                      keywordFilter: { 
                        ...localFilters.keywordFilter, 
                        keyword: e.target.value 
                      }
                    })}
                    className="flex-1"
                  />
                )}
              </div>
            </div>

            {/* Botões de ação */}
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