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
  { label: "1 ano", value: "365d" },
];

const periodAdvancedFilters = [
  { label: "Mês até agora", value: "month" },
  { label: "Ano até agora", value: "year" },
  { label: "Todo período", value: "all" },
];

export default function DashboardFilters({ filters, onFiltersChange, availableOptions, period, onPeriodChange }: DashboardFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilters = (updates: Partial<DashboardFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const resetFilters = () => {
    onFiltersChange({
      dateRange: { from: null, to: null },
      sites: [],
      categories: [],
      speeds: [],
      buyinRange: { min: null, max: null },
      fieldSizeRange: { min: null, max: null },
      keywordFilter: { type: 'none', keyword: '' },
    });
  };

  const hasActiveFilters = () => {
    return (
      filters.dateRange.from !== null ||
      filters.dateRange.to !== null ||
      filters.sites.length > 0 ||
      filters.categories.length > 0 ||
      filters.speeds.length > 0 ||
      filters.buyinRange.min !== null ||
      filters.buyinRange.max !== null ||
      filters.fieldSizeRange.min !== null ||
      filters.fieldSizeRange.max !== null ||
      filters.keywordFilter.type !== 'none'
    );
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    if (filters.sites.length > 0) count++;
    if (filters.categories.length > 0) count++;
    if (filters.speeds.length > 0) count++;
    if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) count++;
    if (filters.fieldSizeRange.min !== null || filters.fieldSizeRange.max !== null) count++;
    if (filters.keywordFilter.type !== 'none') count++;
    return count;
  };

  const toggleSite = (site: string) => {
    const newSites = filters.sites.includes(site)
      ? filters.sites.filter(s => s !== site)
      : [...filters.sites, site];
    updateFilters({ sites: newSites });
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    updateFilters({ categories: newCategories });
  };

  const toggleSpeed = (speed: string) => {
    const newSpeeds = filters.speeds.includes(speed)
      ? filters.speeds.filter(s => s !== speed)
      : [...filters.speeds, speed];
    updateFilters({ speeds: newSpeeds });
  };

  const setBuyinQuickFilter = (min: number | null, max: number | null) => {
    updateFilters({ buyinRange: { min, max } });
  };

  const setFieldSizeQuickFilter = (min: number | null, max: number | null) => {
    updateFilters({ fieldSizeRange: { min, max } });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
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
        <div className="flex items-center gap-2 flex-wrap">
          {periodQuickFilters.map((filterOption) => (
            <Button
              key={filterOption.value}
              variant={period === filterOption.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPeriodChange(filterOption.value)}
              className="text-xs h-8"
            >
              {filterOption.label}
            </Button>
          ))}
          
          {periodAdvancedFilters.map((filterOption) => (
            <Button
              key={filterOption.value}
              variant={period === filterOption.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPeriodChange(filterOption.value)}
              className="text-xs h-8"
            >
              {filterOption.label}
            </Button>
          ))}
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
                        !filters.dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateRange.from ? (
                        format(filters.dateRange.from, "dd/MM/yyyy")
                      ) : (
                        "Data inicial"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dateRange.from || undefined}
                      onSelect={(date) => updateFilters({ 
                        dateRange: { ...filters.dateRange, from: date || null } 
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
                        !filters.dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateRange.to ? (
                        format(filters.dateRange.to, "dd/MM/yyyy")
                      ) : (
                        "Data final"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dateRange.to || undefined}
                      onSelect={(date) => updateFilters({ 
                        dateRange: { ...filters.dateRange, to: date || null } 
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
                      checked={filters.sites.includes(site)}
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
                      checked={filters.categories.includes(category)}
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
                      checked={filters.speeds.includes(speed)}
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
                      filters.buyinRange.min === filter.min && 
                      filters.buyinRange.max === filter.max 
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
                    value={filters.buyinRange.min || ''}
                    onChange={(e) => updateFilters({
                      buyinRange: { 
                        ...filters.buyinRange, 
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
                    value={filters.buyinRange.max || ''}
                    onChange={(e) => updateFilters({
                      buyinRange: { 
                        ...filters.buyinRange, 
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
                      filters.fieldSizeRange.min === filter.min && 
                      filters.fieldSizeRange.max === filter.max 
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
                    value={filters.fieldSizeRange.min || ''}
                    onChange={(e) => updateFilters({
                      fieldSizeRange: { 
                        ...filters.fieldSizeRange, 
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
                    value={filters.fieldSizeRange.max || ''}
                    onChange={(e) => updateFilters({
                      fieldSizeRange: { 
                        ...filters.fieldSizeRange, 
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
                  value={filters.keywordFilter.type}
                  onValueChange={(value: 'contains' | 'not_contains' | 'none') => 
                    updateFilters({ 
                      keywordFilter: { 
                        ...filters.keywordFilter, 
                        type: value,
                        keyword: value === 'none' ? '' : filters.keywordFilter.keyword
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
                
                {filters.keywordFilter.type !== 'none' && (
                  <Input
                    placeholder="Digite a palavra-chave..."
                    value={filters.keywordFilter.keyword}
                    onChange={(e) => updateFilters({
                      keywordFilter: { 
                        ...filters.keywordFilter, 
                        keyword: e.target.value 
                      }
                    })}
                    className="flex-1"
                  />
                )}
              </div>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
}