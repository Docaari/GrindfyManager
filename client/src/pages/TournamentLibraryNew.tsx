import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trophy, Eye, AlertCircle, RefreshCw, XCircle } from "lucide-react";

// Tipo para os filtros (definindo aqui para remover dependência externa)
type TournamentLibraryFiltersType = {
  period: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: {
    min: number | null;
    max: number | null;
  };
  roiFilter: string;
  profitFilter: string;
  volumeFilter: string;
  minimumVolume: number | null;
};

// ICD (Índice de Confiança de Desempenho) calculation function
const calculateICD = (avgProfit: number, volume: number): number => {
  return avgProfit * (1 - Math.exp(-0.1 * volume));
};

interface TournamentGroup {
  id: string;
  groupName: string;
  site: string;
  category: string;
  speed: string;
  format: string;
  volume: number;
  totalProfit: number;
  avgProfit: number;
  roi: number;
  avgBuyin: number;
  finalTables: number;
  finalTableRate: number;
  bigHits: number;
  bigHitRate: number;
  itm: number;
  itmRate: number;
  avgFieldSize: number;
  totalReentries: number;
  bestResult: number;
  worstResult: number;
  tournaments: any[];
}

// --- Pure helper functions ---

const getSortValue = (group: TournamentGroup, sortField: string) => {
  switch (sortField) {
    case "icd": return calculateICD(group.avgProfit, group.volume);
    case "avgProfit": return group.avgProfit;
    case "roi": return group.roi;
    case "volume": return group.volume;
    case "totalProfit": return group.totalProfit;
    case "finalTableRate": return group.finalTableRate;
    case "itmRate": return group.itmRate;
    default: return 0;
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

const formatPercentage = (value: number) => {
  return `${value.toFixed(1)}%`;
};

const getSiteColor = (site: string) => {
  const colors: Record<string, string> = {
    'PokerStars': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'GGNetwork': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'WPN': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Bodog': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    '888poker': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'PartyPoker': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    'Coin': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  };
  return colors[site] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'Mystery': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    'PKO': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    'Bounty': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    'Vanilla': 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
  };
  return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

const getSpeedColor = (speed: string) => {
  const colors: Record<string, string> = {
    'Hyper': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'Turbo': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'Normal': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  };
  return colors[speed] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

export default function TournamentLibraryNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("icd");
  const [sortOrder, setSortOrder] = useState("desc");
  
  const [filters, setFilters] = useState<TournamentLibraryFiltersType>({
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
  });

  const { data: libraryGroups, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/tournament-library", filters],
    queryFn: async () => {
      const filterParams = {
        sites: filters.sites,
        categories: filters.categories,
        speeds: filters.speeds,
        buyinRange: filters.buyinRange,
        roiFilter: filters.roiFilter
      };
      
      const params = new URLSearchParams({
        period: filters.period,
        filters: JSON.stringify(filterParams)
      });
      
      const response = await fetch(`/api/tournament-library?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournament library");
      return response.json() as Promise<TournamentGroup[]>;
    },
  });

  // Apply client-side filtering and sorting (memoized)
  const filteredAndSortedGroups = useMemo(() => (libraryGroups || [])
    .filter((group) => {
      const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesBuyinRange = true;
      if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) {
        const min = filters.buyinRange.min || 0;
        const max = filters.buyinRange.max || Infinity;
        matchesBuyinRange = group.avgBuyin >= min && group.avgBuyin <= max;
      }

      const matchesRoi = filters.roiFilter === "all" ||
        (filters.roiFilter === "positive" && group.roi > 0) ||
        (filters.roiFilter === "negative" && group.roi < 0) ||
        (filters.roiFilter === "high" && group.roi > 20) ||
        (filters.roiFilter === "medium" && group.roi >= 0 && group.roi <= 20);

      let matchesProfit = true;
      if (filters.profitFilter === "higher" || filters.profitFilter === "lower") {
        const allGroups = libraryGroups || [];
        const avgProfit = allGroups.reduce((sum, g) => sum + g.avgProfit, 0) / allGroups.length;
        matchesProfit = filters.profitFilter === "higher" ? group.avgProfit > avgProfit : group.avgProfit < avgProfit;
      }

      let matchesVolume = true;
      if (filters.volumeFilter === "higher") {
        const allGroups = libraryGroups || [];
        const avgVolume = allGroups.reduce((sum, g) => sum + g.volume, 0) / allGroups.length;
        matchesVolume = group.volume > avgVolume;
      } else if (filters.volumeFilter === "minimum" && filters.minimumVolume !== null) {
        matchesVolume = group.volume >= filters.minimumVolume;
      }

      return matchesSearch && matchesBuyinRange && matchesRoi && matchesProfit && matchesVolume;
    })
    .sort((a, b) => {
      const aValue = getSortValue(a, sortBy);
      const bValue = getSortValue(b, sortBy);
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    }), [libraryGroups, searchTerm, filters, sortBy, sortOrder]);

  // Get unique values for filters
  const sites = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.site))), [libraryGroups]);
  const categories = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.category))), [libraryGroups]);
  const speeds = useMemo(() => Array.from(new Set((libraryGroups || []).map(g => g.speed))), [libraryGroups]);

  // KPI calculations (memoized)
  const kpis = useMemo(() => {
    if (filteredAndSortedGroups.length === 0) {
      return { bestICD: 0, worstICD: 0, bestICDGroup: null as TournamentGroup | null, worstICDGroup: null as TournamentGroup | null, selectionProfit: 0, filteredTournaments: 0 };
    }
    const icds = filteredAndSortedGroups.map(g => ({ group: g, icd: calculateICD(g.avgProfit, g.volume) }));
    const best = icds.reduce((a, b) => a.icd > b.icd ? a : b);
    const worst = icds.reduce((a, b) => a.icd < b.icd ? a : b);
    return {
      bestICD: best.icd,
      worstICD: worst.icd,
      bestICDGroup: best.group,
      worstICDGroup: worst.group,
      selectionProfit: filteredAndSortedGroups.reduce((sum, g) => sum + g.totalProfit, 0),
      filteredTournaments: filteredAndSortedGroups.reduce((sum, g) => sum + g.volume, 0),
    };
  }, [filteredAndSortedGroups]);
  const totalGroups = libraryGroups?.length || 0;

  const hasActiveFilters = filters.sites.length > 0 || filters.categories.length > 0 || filters.speeds.length > 0 || filters.roiFilter !== 'all' || filters.profitFilter !== 'all' || filters.volumeFilter !== 'all' || filters.minimumVolume !== null || filters.buyinRange.min !== null || filters.buyinRange.max !== null || searchTerm !== '';

  const handleClearFilters = useCallback(() => {
    setFilters({
      period: "all", sites: [], categories: [], speeds: [],
      buyinRange: { min: null, max: null },
      roiFilter: "all", profitFilter: "all", volumeFilter: "all", minimumVolume: null,
    });
    setSearchTerm("");
    setSortBy("icd");
    setSortOrder("desc");
  }, []);

  if (isError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Erro ao carregar biblioteca</h3>
          <p className="text-gray-400 mb-4">Não foi possível carregar os dados dos torneios.</p>
          <Button onClick={() => refetch()} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
          <p className="text-gray-400">Carregando análise inteligente dos torneios...</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="text-center space-y-2">
                <Skeleton className="h-4 w-20 mx-auto bg-gray-700" />
                <Skeleton className="h-8 w-16 mx-auto bg-gray-700" />
                <Skeleton className="h-3 w-24 mx-auto bg-gray-700" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-xl p-4 space-y-4">
              <Skeleton className="h-10 w-full bg-gray-700" />
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-10 w-full bg-gray-700" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="bg-poker-surface border-gray-700">
                  <CardHeader className="pb-4">
                    <Skeleton className="h-5 w-3/4 bg-gray-700 mb-2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 bg-gray-700 rounded-full" />
                      <Skeleton className="h-5 w-16 bg-gray-700 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-8 w-full bg-gray-700" />
                    <Skeleton className="h-16 w-full bg-gray-700" />
                    <Skeleton className="h-12 w-full bg-gray-700" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Header Principal */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
            <p className="text-gray-400">Análise inteligente de performance por torneios</p>
          </div>
        </div>
      </div>

      {/* ETAPA 1: Header Inteligente com KPIs */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card: Melhor ICD */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Melhor ICD</p>
            <p className="text-2xl font-bold text-[#24c25e]">{kpis.bestICD.toFixed(1)}</p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.bestICDGroup?.groupName || "N/A"}
            </p>
          </div>

          {/* Card: Pior ICD */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Pior ICD</p>
            <p className="text-2xl font-bold text-red-400">{kpis.worstICD.toFixed(1)}</p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.worstICDGroup?.groupName || "N/A"}
            </p>
          </div>
          
          {/* Card: Grupos Filtrados */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Grupos Filtrados</p>
            <p className="text-2xl font-bold text-white">{filteredAndSortedGroups.length}</p>
            <p className="text-xs text-gray-500">de {totalGroups} total</p>
          </div>
          
          {/* Card: Lucro da Seleção */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Lucro da Seleção</p>
            <p className={`text-2xl font-bold ${kpis.selectionProfit >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
              US$ {kpis.selectionProfit.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{kpis.filteredTournaments} torneios</p>
          </div>
        </div>
      </div>
      {/* ETAPA 2: Sistema de Busca e Filtros Protagonista */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar de Filtros */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-xl p-4 lg:p-6 sticky top-6 max-h-[calc(100vh-100px)] overflow-y-auto">
            {/* Barra de busca expandida */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-2">
                Buscar Torneios
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Nome, site, categoria..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-[#24c25e] focus:ring-1 focus:ring-[#24c25e]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              </div>
            </div>
            
            {/* ETAPA 6: Filtros Rápidos Expandidos */}
            <div className="mb-6">
              <p className="text-sm font-medium text-white mb-3">Filtros Rápidos</p>
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    setFilters(prev => ({ ...prev, roiFilter: 'positive' }));
                    setSortBy('icd');
                    setSortOrder('desc');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600 flex items-center justify-between"
                >
                  <span>🏆 Top ICD</span>
                  <span className="text-xs opacity-75">Melhor confiança</span>
                </button>
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, roiFilter: 'positive' }))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    filters.roiFilter === 'positive' 
                      ? 'bg-[#24c25e] text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>💰 Apenas Lucrativos</span>
                  <span className="text-xs opacity-75">ROI &gt; 0%</span>
                </button>
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, roiFilter: 'negative' }))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    filters.roiFilter === 'negative' 
                      ? 'bg-red-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>📉 Prejuízo</span>
                  <span className="text-xs opacity-75">ROI &lt; 0%</span>
                </button>
                <button 
                  onClick={() => setSortBy('volume')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    sortBy === 'volume' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>📊 Alto Volume</span>
                  <span className="text-xs opacity-75">50+ torneios</span>
                </button>
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, minimumVolume: 100 }))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    filters.minimumVolume === 100 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>🎯 Especialista</span>
                  <span className="text-xs opacity-75">100+ torneios</span>
                </button>
                <button 
                  onClick={() => {
                    setSortBy('finalTableRate');
                    setSortOrder('desc');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    sortBy === 'finalTableRate' 
                      ? 'bg-yellow-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>🎉 Finalistas</span>
                  <span className="text-xs opacity-75">Melhor FT%</span>
                </button>
              </div>
            </div>
            
            {/* ETAPA 7: Filtros Detalhados Expandidos */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Site ({sites.length} disponíveis)
                </label>
                <Select value={filters.sites[0] || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, sites: value === 'all' ? [] : [value] }))}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Todos os Sites" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Todos os Sites</SelectItem>
                    {sites.map((site: string) => (
                      <SelectItem key={site} value={site}>{site}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Categoria ({categories.length} disponíveis)
                </label>
                <Select value={filters.categories[0] || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, categories: value === 'all' ? [] : [value] }))}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Todas as Categorias" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Todas as Categorias</SelectItem>
                    {categories.map((category: string) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Velocidade ({speeds.length} disponíveis)
                </label>
                <Select value={filters.speeds[0] || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, speeds: value === 'all' ? [] : [value] }))}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Todas as Velocidades" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Todas as Velocidades</SelectItem>
                    {speeds.map((speed: string) => (
                      <SelectItem key={speed} value={speed}>{speed}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* ETAPA 8: Filtros Avançados */}
              <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm font-medium text-white mb-2">
                  Volume Mínimo
                </label>
                <Select value={filters.minimumVolume?.toString() || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, minimumVolume: value === 'all' ? null : parseInt(value) }))}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Qualquer Volume" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Qualquer Volume</SelectItem>
                    <SelectItem value="20">20+ torneios</SelectItem>
                    <SelectItem value="50">50+ torneios</SelectItem>
                    <SelectItem value="100">100+ torneios</SelectItem>
                    <SelectItem value="200">200+ torneios</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Faixa de Buy-in
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    value={filters.buyinRange.min || ''}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      buyinRange: { ...prev.buyinRange, min: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    value={filters.buyinRange.max || ''}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      buyinRange: { ...prev.buyinRange, max: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                </div>
              </div>
            </div>
            
            {/* Preview de Resultados + Limpar */}
            <div className="mt-6 p-3 bg-gray-700 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">
                Mostrando {filteredAndSortedGroups.length} de {totalGroups} grupos
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="w-full text-xs border-gray-600 text-gray-300 hover:bg-gray-600"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Limpar Filtros
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Área Principal - ETAPA 9: Responsividade */}
        <div className="lg:col-span-3 min-h-0">
          {/* Tags de Filtros Ativos */}
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.sites.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                Site: {filters.sites.join(', ')}
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, sites: [] }))}
                  className="ml-2 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
            {filters.categories.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                Categoria: {filters.categories.join(', ')}
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, categories: [] }))}
                  className="ml-2 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
            {filters.roiFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                ROI: {filters.roiFilter}
                <button 
                  onClick={() => setFilters(prev => ({ ...prev, roiFilter: 'all' }))}
                  className="ml-2 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          {/* Controles de Visualização */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">
              Tournament Library ({filteredAndSortedGroups.length} grupos)
            </h2>
            
            <div className="flex items-center space-x-4">
              {/* Ordenação */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Ordenar por:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="icd">ICD</SelectItem>
                    <SelectItem value="roi">ROI</SelectItem>
                    <SelectItem value="totalProfit">Lucro Total</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="avgProfit">Lucro Médio</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                  className="border-gray-600 text-gray-300"
                >
                  {sortOrder === "desc" ? "↓" : "↑"}
                </Button>
              </div>
            </div>
          </div>

          {/* ETAPA 3: Cards Redesenhados com Foco no ICD */}
          {filteredAndSortedGroups.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Trophy className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum Grupo Encontrado</h3>
              <p>Grupos são criados automaticamente quando você tem 20+ torneios similares.</p>
              <p className="mt-2">Ajuste os filtros ou importe mais histórico de torneios.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAndSortedGroups.map((group) => {
            const icd = calculateICD(group.avgProfit, group.volume);
            const icdColor = icd > 0 ? 'text-[#24c25e]' : 'text-red-400';
            const icdBgColor = icd > 0 ? 'bg-[#24c25e]/10' : 'bg-red-500/10';
            
            return (
              <Card key={group.id} className="bg-poker-surface border-gray-700 hover:border-[#24c25e] transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-[#24c25e]/20 relative overflow-hidden">
                {/* ICD Badge no topo */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${icd > 0 ? 'bg-[#24c25e]' : 'bg-red-500'}`}></div>
                
                <CardHeader className="pb-4">
                  {/* Header Principal com ICD em destaque */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <CardTitle className="text-white text-lg font-bold mb-2 line-clamp-2 leading-tight">
                        {group.groupName}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={`text-xs font-medium ${getSiteColor(group.site)}`}>
                          {group.site}
                        </Badge>
                        <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
                          {group.category}
                        </Badge>
                        <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
                          {group.speed}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* ICD destacado */}
                    <div className={`text-right ml-4 p-3 rounded-lg ${icdBgColor}`}>
                      <div className={`text-2xl font-bold ${icdColor}`}>
                        {icd.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-400 font-medium">ICD</div>
                    </div>
                  </div>
                  
                  {/* ETAPA 4: Sparklines de Performance */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">Últimos 10 Torneios</span>
                      <span className={`text-sm font-medium ${group.roi >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
                        {formatPercentage(group.roi)} ROI
                      </span>
                    </div>
                    <div className="h-8 bg-gray-800/50 rounded-lg p-1 flex items-end gap-1">
                      {(group.tournaments || []).slice(-10).map((t: any, i: number) => {
                        const profit = parseFloat(String(t.prize || 0));
                        const absMax = Math.max(...(group.tournaments || []).slice(-10).map((tt: any) => Math.abs(parseFloat(String(tt.prize || 0)))), 1);
                        const height = Math.max(10, (Math.abs(profit) / absMax) * 100);
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm ${profit >= 0 ? 'bg-[#24c25e]/60' : 'bg-red-500/60'}`}
                            style={{ height: `${height}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Volume e ABI */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                      <div className="text-white font-bold text-lg">{group.volume}</div>
                      <div className="text-xs text-gray-400">Torneios</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                      <div className="text-white font-bold text-lg">{formatCurrency(group.avgBuyin)}</div>
                      <div className="text-xs text-gray-400">ABI Médio</div>
                    </div>
                  </div>
                </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Profit Section */}
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className={`text-lg font-bold ${group.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(group.totalProfit)}
                      </div>
                      <div className="text-xs text-gray-400">Lucro Total</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${group.avgProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(group.avgProfit)}
                      </div>
                      <div className="text-xs text-gray-400">Lucro Médio</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${group.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercentage(group.roi)}
                      </div>
                      <div className="text-xs text-gray-400">ROI</div>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center bg-gray-800/30 rounded-lg p-2">
                    <div className="text-white font-bold">{formatPercentage(group.itmRate)}</div>
                    <div className="text-xs text-gray-400">ITM%</div>
                  </div>
                  <div className="text-center bg-gray-800/30 rounded-lg p-2">
                    <div className="text-white font-bold">{group.finalTables}</div>
                    <div className="text-xs text-gray-400">FTs ({formatPercentage(group.finalTableRate)})</div>
                  </div>
                  <div className="text-center bg-gray-800/30 rounded-lg p-2">
                    <div className="text-white font-bold">{group.bigHits}</div>
                    <div className="text-xs text-gray-400">Vitórias</div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-gray-400">Reentradas:</span>
                      <span className="text-white font-medium ml-1">{group.totalReentries || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Campo:</span>
                      <span className="text-white font-medium ml-1">{group.avgFieldSize}</span>
                    </div>
                  </div>
                </div>

                {/* Best Result and Action */}
                <div className="flex justify-between items-center pt-3 border-t border-gray-700">
                  <div className="text-sm">
                    <span className="text-gray-400">Melhor:</span>
                    <span className="text-green-400 font-medium ml-1">{formatCurrency(group.bestResult)}</span>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-gray-600 hover:border-poker-accent hover:bg-poker-accent/10"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Detalhes
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[80vh] bg-poker-surface border-gray-700">
                      <DialogHeader>
                        <DialogTitle className="text-white text-xl">
                          {group.groupName}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Lista detalhada de todos os torneios desta categoria
                        </DialogDescription>
                        <div className="flex gap-2 mt-2">
                          <Badge className={`text-xs font-medium ${getSiteColor(group.site)}`}>
                            {group.site}
                          </Badge>
                          <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
                            {group.category}
                          </Badge>
                          <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
                            {group.speed}
                          </Badge>
                        </div>
                      </DialogHeader>
                      
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className="text-poker-accent font-bold text-lg">{group.volume}</div>
                          <div className="text-xs text-gray-400">Torneios</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className={`font-bold text-lg ${group.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(group.totalProfit)}
                          </div>
                          <div className="text-xs text-gray-400">Lucro Total</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className={`font-bold text-lg ${group.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPercentage(group.roi)}
                          </div>
                          <div className="text-xs text-gray-400">ROI</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className="text-white font-bold text-lg">{formatPercentage(group.itmRate)}</div>
                          <div className="text-xs text-gray-400">ITM%</div>
                        </div>
                      </div>

                      {/* Tournament List */}
                      <ScrollArea className="h-96">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-700">
                              <TableHead className="text-gray-400">Data</TableHead>
                              <TableHead className="text-gray-400">Site</TableHead>
                              <TableHead className="text-gray-400">Nome</TableHead>
                              <TableHead className="text-gray-400">Tipo</TableHead>
                              <TableHead className="text-gray-400">Velocidade</TableHead>
                              <TableHead className="text-gray-400">Buy-in</TableHead>
                              <TableHead className="text-gray-400">Posição/Total</TableHead>
                              <TableHead className="text-gray-400">Profit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.tournaments
                              .sort((a: any, b: any) => new Date(b.datePlayed).getTime() - new Date(a.datePlayed).getTime())
                              .map((tournament: any, index: number) => {
                              const profit = parseFloat(String(tournament.prize)); // prize já contém o profit líquido
                              
                              return (
                                <TableRow key={`${tournament.id}-${index}`} className="border-gray-700">
                                  <TableCell className="text-white text-sm">
                                    {new Date(tournament.datePlayed).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit'
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`text-xs ${getSiteColor(tournament.site)}`}>
                                      {tournament.site}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-white text-sm max-w-32 truncate">
                                    {tournament.name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`text-xs ${getCategoryColor(tournament.category)}`}>
                                      {tournament.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`text-xs ${getSpeedColor(tournament.speed)}`}>
                                      {tournament.speed}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-white text-sm">
                                    {formatCurrency(parseFloat(String(tournament.buyIn)))}
                                  </TableCell>
                                  <TableCell className="text-white text-sm">
                                    {tournament.position || '-'}/{tournament.fieldSize || '-'}
                                    {tournament.position && tournament.position <= 9 && tournament.position > 0 && <Badge className="ml-1 text-xs bg-yellow-600">FT</Badge>}
                                    {tournament.position === 1 && <Badge className="ml-1 text-xs bg-green-600">WIN</Badge>}
                                  </TableCell>
                                  <TableCell className={`text-sm font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(profit)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}