import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trophy, Eye, AlertCircle, RefreshCw, XCircle, Filter, ChevronUp, ChevronDown } from "lucide-react";
import { getLibrarySiteColor, getLibraryCategoryColor, getLibrarySpeedColor } from "@/lib/poker-colors";
import { formatPercentage } from "@/lib/formatting";

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
  confidenceGrade: string;
  sdBuyins: number;
  volatilityLevel: string;
  roiLower: number;
  roiUpper: number;
  normalizedPosition: number | null;
  roiWithoutOutliers: number | null;
  outlierDependent: boolean;
  tournaments: any[];
}

const confidenceGradeOrder: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
const confidenceGradeColors: Record<string, string> = {
  A: 'bg-emerald-600',
  B: 'bg-blue-600',
  C: 'bg-yellow-600',
  D: 'bg-orange-600',
  F: 'bg-red-600',
};
const confidenceGradeTooltips: Record<string, string> = {
  A: 'A — 2000+ torneios, altamente confiavel',
  B: 'B — 1000-1999 torneios, confiavel',
  C: 'C — 500-999 torneios, moderado',
  D: 'D — 200-499 torneios, baixa confiabilidade',
  F: 'F — 50-199 torneios, dados insuficientes',
};

// --- Pure helper functions ---

const getSortValue = (group: TournamentGroup, sortField: string) => {
  switch (sortField) {
    case "confidence": return (confidenceGradeOrder[group.confidenceGrade] || 0) * 10000 + group.roi;
    case "avgProfit": return group.avgProfit;
    case "roi": return group.roi;
    case "volume": return group.volume;
    case "totalProfit": return group.totalProfit;
    case "finalTableRate": return group.finalTableRate;
    case "itmRate": return group.itmRate;
    case "sdBuyins": return group.sdBuyins;
    case "normalizedPosition": return group.normalizedPosition ?? 1;
    default: return 0;
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

// formatPercentage imported from @/lib/formatting
// Color functions imported from @/lib/poker-colors
const getSiteColor = getLibrarySiteColor;
const getCategoryColor = getLibraryCategoryColor;
const getSpeedColor = getLibrarySpeedColor;

export default function TournamentLibraryNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("confidence");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  
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
    queryKey: ["/api/tournament-library-grouped", filters],
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

      return await apiRequest('GET', `/api/tournament-library-grouped?${params}`) as TournamentGroup[];
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
      return { bestROIGroup: null as TournamentGroup | null, worstROIGroup: null as TournamentGroup | null, selectionProfit: 0, filteredTournaments: 0 };
    }
    const reliableGroups = filteredAndSortedGroups.filter(g => g.confidenceGrade === 'A' || g.confidenceGrade === 'B');
    const bestROIGroup = reliableGroups.length > 0
      ? reliableGroups.reduce((a, b) => a.roi > b.roi ? a : b)
      : null;
    const worstROIGroup = reliableGroups.length > 0
      ? reliableGroups.reduce((a, b) => a.roi < b.roi ? a : b)
      : null;
    return {
      bestROIGroup,
      worstROIGroup,
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
    setSortBy("confidence");
    setSortOrder("desc");
  }, []);

  if (isError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
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
          <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
          <p className="text-gray-400">Carregando analise estatistica dos torneios...</p>
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
            <h2 className="text-2xl font-bold mb-2">Biblioteca de Torneios</h2>
            <p className="text-gray-400">Analise estatistica de performance por grupo de torneio</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card: Melhor ROI (confiavel) */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Melhor ROI (confiavel)</p>
            <p className="text-2xl font-bold text-[#24c25e]">
              {kpis.bestROIGroup ? formatPercentage(kpis.bestROIGroup.roi) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.bestROIGroup?.groupName || "Sem grupos A/B"}
            </p>
          </div>

          {/* Card: Pior ROI (confiavel) */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Pior ROI (confiavel)</p>
            <p className="text-2xl font-bold text-red-400">
              {kpis.worstROIGroup ? formatPercentage(kpis.worstROIGroup.roi) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {kpis.worstROIGroup?.groupName || "Sem grupos A/B"}
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
              {formatCurrency(kpis.selectionProfit)}
            </p>
            <p className="text-xs text-gray-500">{kpis.filteredTournaments} torneios</p>
          </div>
        </div>
      </div>
      {/* Filtros — mesmo padrao do Dashboard */}
      <div className="bg-gradient-to-br from-poker-surface/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl mb-8 shadow-xl">
        {/* Header fixo */}
        <div className="p-6 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-poker-green/20 rounded-lg">
                <Filter className="h-5 w-5 text-poker-green" />
              </div>
              <h3 className="text-lg font-semibold text-white">Filtros</h3>
              {hasActiveFilters && (
                <div className="flex items-center gap-2 bg-poker-green/20 px-3 py-1 rounded-lg border border-poker-green/30">
                  <div className="w-2 h-2 bg-poker-green rounded-full animate-pulse"></div>
                  <span className="text-sm text-poker-green font-medium">Filtros ativos</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 border border-red-700/30 rounded-lg transition-all duration-200"
                >
                  Limpar Todos
                </button>
              )}
              {/* Busca inline */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar grupo..."
                  className="bg-gray-700/50 border border-gray-600/50 rounded-lg px-4 py-2 pr-9 text-sm text-white placeholder-gray-400 focus:border-poker-green focus:ring-1 focus:ring-poker-green w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Conteudo colapsavel */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-6 pb-4 space-y-5">

            {/* Periodo */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700/50 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                Periodo de Analise
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Tudo' },
                  { key: 'month', label: 'Mes Atual' },
                  { key: '90d', label: 'Ultimos 3M' },
                  { key: '180d', label: 'Ultimos 6M' },
                  { key: 'year', label: 'Ano Atual' },
                  { key: '365d', label: 'Ultimos 12M' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilters(prev => ({ ...prev, period: opt.key }))}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 border ${
                      filters.period === opt.key
                        ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/30 scale-105'
                        : 'bg-gray-800/70 text-gray-300 border-gray-600/50 hover:bg-gray-700/70 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros multi-select em grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sites */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Sites
                </h4>
                <div className="flex flex-wrap gap-2">
                  {sites.map((site: string) => (
                    <button
                      key={site}
                      onClick={() => {
                        const cur = filters.sites;
                        setFilters(prev => ({ ...prev, sites: cur.includes(site) ? cur.filter(s => s !== site) : [...cur, site] }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        filters.sites.includes(site)
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500 shadow-md shadow-blue-500/20'
                          : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      {site}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categorias */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  Categorias
                </h4>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat: string) => (
                    <button
                      key={cat}
                      onClick={() => {
                        const cur = filters.categories;
                        setFilters(prev => ({ ...prev, categories: cur.includes(cat) ? cur.filter(c => c !== cat) : [...cur, cat] }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        filters.categories.includes(cat)
                          ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Velocidades */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  Velocidades
                </h4>
                <div className="flex flex-wrap gap-2">
                  {speeds.map((spd: string) => (
                    <button
                      key={spd}
                      onClick={() => {
                        const cur = filters.speeds;
                        setFilters(prev => ({ ...prev, speeds: cur.includes(spd) ? cur.filter(s => s !== spd) : [...cur, spd] }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        filters.speeds.includes(spd)
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white border-purple-500 shadow-md shadow-purple-500/20'
                          : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      {spd}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filtros avancados — ROI + Volume + Buy-in */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* ROI */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  ROI
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'positive', label: 'Lucrativos' },
                    { key: 'negative', label: 'Prejuizo' },
                    { key: 'high', label: 'ROI > 20%' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setFilters(prev => ({ ...prev, roiFilter: prev.roiFilter === opt.key && opt.key !== 'all' ? 'all' : opt.key }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        filters.roiFilter === opt.key
                          ? 'bg-gradient-to-r from-green-600 to-green-700 text-white border-green-500 shadow-md shadow-green-500/20'
                          : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume Minimo */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                  Volume Minimo
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: null, label: 'Todos' },
                    { key: 50, label: '50+' },
                    { key: 200, label: '200+ (D)' },
                    { key: 500, label: '500+ (C)' },
                    { key: 1000, label: '1000+ (B)' },
                    { key: 2000, label: '2000+ (A)' },
                  ].map((opt) => (
                    <button
                      key={String(opt.key)}
                      onClick={() => setFilters(prev => ({ ...prev, minimumVolume: prev.minimumVolume === opt.key ? null : opt.key }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        filters.minimumVolume === opt.key
                          ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border-cyan-500 shadow-md shadow-cyan-500/20'
                          : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Faixa de Buy-in */}
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  Faixa de Buy-in
                </h4>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min $"
                    className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none"
                    value={filters.buyinRange.min || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      buyinRange: { ...prev.buyinRange, min: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                  <span className="text-gray-400 text-sm">—</span>
                  <input
                    type="number"
                    placeholder="Max $"
                    className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none"
                    value={filters.buyinRange.max || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      buyinRange: { ...prev.buyinRange, max: e.target.value ? parseFloat(e.target.value) : null }
                    }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Botao toggle expandir/colapsar */}
        <div className="flex justify-center p-3 pt-0">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="group flex items-center justify-center w-16 h-8 bg-gradient-to-r from-poker-surface/70 to-gray-800/70 border border-gray-600/50 rounded-lg hover:border-gray-500/70 transition-all duration-300"
          >
            {filtersExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-300 group-hover:text-poker-green transition-colors" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-300 group-hover:text-poker-green transition-colors" />
            )}
          </button>
        </div>
      </div>

      {/* Area Principal — full width */}
      <div>
          {/* Tags de Filtros Ativos */}
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.period !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
                Periodo: {filters.period === 'month' ? 'Mes atual' : filters.period === 'year' ? 'Ano atual' : filters.period}
                <button onClick={() => setFilters(prev => ({ ...prev, period: 'all' }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {filters.sites.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                Site: {filters.sites.join(', ')}
                <button onClick={() => setFilters(prev => ({ ...prev, sites: [] }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {filters.categories.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full">
                Categoria: {filters.categories.join(', ')}
                <button onClick={() => setFilters(prev => ({ ...prev, categories: [] }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {filters.speeds.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-orange-500/20 text-orange-400 text-sm rounded-full">
                Velocidade: {filters.speeds.join(', ')}
                <button onClick={() => setFilters(prev => ({ ...prev, speeds: [] }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {filters.roiFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                ROI: {filters.roiFilter === 'positive' ? 'Lucrativos' : filters.roiFilter === 'negative' ? 'Prejuizo' : filters.roiFilter}
                <button onClick={() => setFilters(prev => ({ ...prev, roiFilter: 'all' }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {filters.minimumVolume !== null && (
              <span className="inline-flex items-center px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
                Volume: {filters.minimumVolume}+
                <button onClick={() => setFilters(prev => ({ ...prev, minimumVolume: null }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
            {(filters.buyinRange.min !== null || filters.buyinRange.max !== null) && (
              <span className="inline-flex items-center px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm rounded-full">
                Buy-in: ${filters.buyinRange.min || 0} — ${filters.buyinRange.max || '∞'}
                <button onClick={() => setFilters(prev => ({ ...prev, buyinRange: { min: null, max: null } }))} className="ml-2 hover:text-white">×</button>
              </span>
            )}
          </div>

          {/* Controles de Visualização */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">
              {filteredAndSortedGroups.length} grupos encontrados
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
                    <SelectItem value="confidence">Confianca</SelectItem>
                    <SelectItem value="roi">ROI</SelectItem>
                    <SelectItem value="totalProfit">Lucro Total</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="avgProfit">Lucro Medio</SelectItem>
                    <SelectItem value="sdBuyins">Volatilidade</SelectItem>
                    <SelectItem value="normalizedPosition">Posicao</SelectItem>
                    <SelectItem value="finalTableRate">Final Table %</SelectItem>
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

          {/* Cards de Grupo com Metricas Estatisticas */}
          {filteredAndSortedGroups.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Trophy className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum Grupo Encontrado</h3>
              <p>Grupos são criados automaticamente quando você tem 50+ torneios similares.</p>
              <p className="mt-2">Ajuste os filtros ou importe mais histórico de torneios.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedGroups.map((group) => {
            const roiColor = group.roi >= 0 ? 'text-emerald-400' : 'text-red-400';
            const volatilityColor = group.volatilityLevel === 'low' ? 'text-emerald-400' : group.volatilityLevel === 'medium' ? 'text-yellow-400' : 'text-red-400';
            const posColor = group.normalizedPosition !== null ? (group.normalizedPosition < 0.5 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500';
            const gradeColor = confidenceGradeColors[group.confidenceGrade] || 'bg-gray-600';
            const gradeTooltip = confidenceGradeTooltips[group.confidenceGrade] || '';

            return (
              <Dialog key={group.id}>
              <DialogTrigger asChild>
              <Card className="bg-poker-surface border-gray-700 hover:border-[#24c25e] transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-[#24c25e]/20 relative overflow-hidden">
                <CardHeader className="pb-3">
                  {/* Header: Badge + Name + Site */}
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-white font-bold text-sm shrink-0 ${gradeColor}`}
                      title={gradeTooltip}
                    >
                      {group.confidenceGrade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-white text-base font-bold line-clamp-2 leading-tight mb-1">
                        {group.groupName}
                      </CardTitle>
                      <Badge className={`text-xs font-medium ${getSiteColor(group.site)}`}>
                        {group.site}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {/* ROI + IC + Profit */}
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className={`text-2xl font-bold ${roiColor}`}>
                          {formatPercentage(group.roi)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">ROI</span>
                      </div>
                      <div className={`text-lg font-bold ${group.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(group.totalProfit)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      IC 95%: {formatPercentage(group.roiLower)} — {formatPercentage(group.roiUpper)}
                    </div>
                  </div>

                  {/* Volume + ABI + Field */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{group.volume.toLocaleString()}</div>
                      <div className="text-xs text-gray-400">Volume</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{formatCurrency(group.avgBuyin)}</div>
                      <div className="text-xs text-gray-400">ABI</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{group.avgFieldSize.toLocaleString()}</div>
                      <div className="text-xs text-gray-400">Field</div>
                    </div>
                  </div>

                  {/* Volatility + Pos + ROI s/outliers */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className={`font-bold ${volatilityColor}`}>{group.sdBuyins.toFixed(1)} BI</div>
                      <div className="text-xs text-gray-400">Volat.</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className={`font-bold ${posColor}`}>
                        {group.normalizedPosition !== null ? `${(group.normalizedPosition * 100).toFixed(1)}%` : '—'}
                      </div>
                      <div className="text-xs text-gray-400">Pos.</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className={`font-bold ${group.roiWithoutOutliers !== null ? (group.roiWithoutOutliers >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>
                        {group.roiWithoutOutliers !== null ? formatPercentage(group.roiWithoutOutliers) : '—'}
                      </div>
                      <div className="text-xs text-gray-400" title="ROI recalculado sem os 3 maiores resultados">ROI Ajustado</div>
                    </div>
                  </div>

                  {/* ITM + FT + Reentries */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{formatPercentage(group.itmRate)}</div>
                      <div className="text-xs text-gray-400">ITM%</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{formatPercentage(group.finalTableRate)}</div>
                      <div className="text-xs text-gray-400">FT%</div>
                    </div>
                    <div className="text-center bg-gray-800/30 rounded-lg p-2">
                      <div className="text-white font-bold">{group.totalReentries || 0}</div>
                      <div className="text-xs text-gray-400">Reentradas</div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    <Badge className={`text-xs font-medium ${getCategoryColor(group.category)}`}>
                      {group.category}
                    </Badge>
                    <Badge className={`text-xs font-medium ${getSpeedColor(group.speed)}`}>
                      {group.speed}
                    </Badge>
                  </div>

                  {/* Outlier alert */}
                  {group.outlierDependent && (
                    <div className="bg-orange-900/50 border border-orange-500/50 rounded-lg px-3 py-2 text-xs text-orange-300 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Dependente de outliers
                    </div>
                  )}

                </CardContent>
              </Card>
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
                      
                      {/* Summary Stats - Linha 1 */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
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
                          <div className="text-xs text-gray-400">ROI (IC: {formatPercentage(group.roiLower)} a {formatPercentage(group.roiUpper)})</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className={`font-bold text-lg ${confidenceGradeColors[group.confidenceGrade]} text-white px-2 py-0.5 rounded inline-block`}>{group.confidenceGrade}</div>
                          <div className="text-xs text-gray-400">Confiabilidade</div>
                        </div>
                      </div>
                      {/* Summary Stats - Linha 2 */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className="text-white font-bold">{formatPercentage(group.itmRate)}</div>
                          <div className="text-xs text-gray-400">ITM%</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className={`font-bold ${group.volatilityLevel === 'low' ? 'text-emerald-400' : group.volatilityLevel === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}>{group.sdBuyins.toFixed(1)} BI</div>
                          <div className="text-xs text-gray-400">Volatilidade</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className={`font-bold ${group.normalizedPosition !== null && group.normalizedPosition < 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {group.normalizedPosition !== null ? `${(group.normalizedPosition * 100).toFixed(1)}%` : '—'}
                          </div>
                          <div className="text-xs text-gray-400">Pos. Normalizada</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className="text-emerald-400 font-bold">{formatCurrency(group.bestResult)}</div>
                          <div className="text-xs text-gray-400">Melhor</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <div className="text-red-400 font-bold">{formatCurrency(group.worstResult)}</div>
                          <div className="text-xs text-gray-400">Pior</div>
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
          );
        })}
        </div>
      )}
      </div>
    </div>
  );
}