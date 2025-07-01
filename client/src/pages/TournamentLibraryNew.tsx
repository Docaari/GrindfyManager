import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import TournamentLibraryFilters, { type TournamentLibraryFilters as TournamentLibraryFiltersType } from "@/components/TournamentLibraryFilters";
import { 
  Search, 
  Filter, 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Users, 
  Calendar,
  DollarSign,
  BarChart3,
  Eye,
  ArrowUpDown
} from "lucide-react";

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

export default function TournamentLibraryNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("avgProfit");
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

  // Handle search input
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const getSortValue = (group: TournamentGroup, sortField: string) => {
    switch (sortField) {
      case "avgProfit": return group.avgProfit;
      case "roi": return group.roi;
      case "volume": return group.volume;
      case "totalProfit": return group.totalProfit;
      case "finalTableRate": return group.finalTableRate;
      case "itmRate": return group.itmRate;
      default: return 0;
    }
  };

  const { data: libraryGroups, isLoading } = useQuery({
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

  // Apply client-side filtering and sorting
  const filteredAndSortedGroups = (libraryGroups || [])
    .filter((group) => {
      // Search filter
      const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Buy-in range filtering
      let matchesBuyinRange = true;
      if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) {
        const min = filters.buyinRange.min || 0;
        const max = filters.buyinRange.max || Infinity;
        matchesBuyinRange = group.avgBuyin >= min && group.avgBuyin <= max;
      }
      
      // ROI filtering
      const matchesRoi = filters.roiFilter === "all" || 
        (filters.roiFilter === "positive" && group.roi > 0) ||
        (filters.roiFilter === "negative" && group.roi < 0) ||
        (filters.roiFilter === "high" && group.roi > 20) ||
        (filters.roiFilter === "medium" && group.roi >= 0 && group.roi <= 20);
      
      // Profit filter
      let matchesProfit = true;
      if (filters.profitFilter === "higher" || filters.profitFilter === "lower") {
        const allGroups = libraryGroups || [];
        const avgProfit = allGroups.reduce((sum, g) => sum + g.avgProfit, 0) / allGroups.length;
        if (filters.profitFilter === "higher") {
          matchesProfit = group.avgProfit > avgProfit;
        } else if (filters.profitFilter === "lower") {
          matchesProfit = group.avgProfit < avgProfit;
        }
      }
      
      // Volume filter
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
    });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Color functions for tags (matching dashboard colors)
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

  // Get unique values for filters
  const sites = Array.from(new Set((libraryGroups || []).map(g => g.site)));
  const categories = Array.from(new Set((libraryGroups || []).map(g => g.category)));
  const speeds = Array.from(new Set((libraryGroups || []).map(g => g.speed)));

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
          <p className="text-gray-400">Carregando análise inteligente dos torneios...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="bg-poker-surface border-gray-700 animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-gray-600 rounded mb-4"></div>
                <div className="h-4 bg-gray-600 rounded mb-2"></div>
                <div className="h-4 bg-gray-600 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
            <p className="text-gray-400">Análise inteligente com agrupamento de torneios similares (mínimo 20 torneios por grupo)</p>
            <div className="flex gap-4 mt-3">
              <Badge variant="outline" className="text-green-400 border-green-400">
                <Trophy className="w-3 h-3 mr-1" />
                {filteredAndSortedGroups.length} Grupos
              </Badge>
              <Badge variant="outline" className="text-blue-400 border-blue-400">
                <Target className="w-3 h-3 mr-1" />
                {filteredAndSortedGroups.reduce((sum, g) => sum + g.volume, 0)} Torneios
              </Badge>
              {filteredAndSortedGroups.length > 0 && (
                <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  ROI Médio: {(filteredAndSortedGroups.reduce((sum, g) => sum + g.roi, 0) / filteredAndSortedGroups.length).toFixed(1)}%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Advanced Filters */}
      <TournamentLibraryFilters
        filters={filters}
        onFiltersChange={setFilters}
        sites={sites}
        categories={categories}
        speeds={speeds}
      />

      {/* Search and Sort */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Buscar torneios..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-400">Ordenar:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="bg-gray-700 border-gray-600 text-white w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              <SelectItem value="avgProfit">Lucro Médio</SelectItem>
              <SelectItem value="roi">ROI</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="totalProfit">Lucro Total</SelectItem>
              <SelectItem value="finalTableRate">Taxa FT</SelectItem>
              <SelectItem value="itmRate">ITM%</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="border-gray-600 text-gray-300"
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === "desc" ? "↓" : "↑"}
          </Button>
        </div>
        
        <div className="text-sm text-gray-400 flex items-center">
          {filteredAndSortedGroups.length} grupos
        </div>
      </div>
      {/* Tournament Groups Grid */}
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
          {filteredAndSortedGroups.map((group) => (
            <Card key={group.id} className="bg-poker-surface border-gray-700 hover:border-poker-accent transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-poker-accent/20">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <CardTitle className="text-white text-lg font-bold mb-3 line-clamp-2 leading-tight">
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
                  <div className="text-right ml-4">
                    <div className={`text-2xl font-bold ${group.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercentage(group.roi)}
                    </div>
                    <div className="text-xs text-gray-400 font-medium">ROI</div>
                  </div>
                </div>
                
                {/* ABI and Volume */}
                <div className="flex justify-between items-center bg-gray-800/50 rounded-lg p-3">
                  <div>
                    <div className="text-white font-bold text-lg">{formatCurrency(group.avgBuyin)}</div>
                    <div className="text-xs text-gray-400">ABI</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-[#ffffff]">{group.volume}</div>
                    <div className="text-xs text-gray-400">Torneios</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Profit Section */}
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-4">
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
          ))}
        </div>
      )}
    </div>
  );
}