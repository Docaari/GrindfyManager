import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  bestResult: number;
  worstResult: number;
  tournaments: any[];
}

export default function TournamentLibraryNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [speedFilter, setSpeedFilter] = useState("all");
  const [buyinRangeFilter, setBuyinRangeFilter] = useState("all");
  const [roiFilter, setRoiFilter] = useState("all");
  const [sortBy, setSortBy] = useState("avgProfit");
  const [sortOrder, setSortOrder] = useState("desc");
  const [period, setPeriod] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState<TournamentGroup | null>(null);

  // Helper functions (defined before use)
  const getBuyinRange = (buyin: number) => {
    if (buyin <= 5) return "micro";
    if (buyin <= 25) return "low";
    if (buyin <= 100) return "mid";
    if (buyin <= 500) return "high";
    return "premium";
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
    queryKey: ["/api/tournament-library", period, { searchTerm, siteFilter, categoryFilter, speedFilter, buyinRangeFilter, roiFilter }],
    queryFn: async () => {
      const filters = {
        sites: siteFilter !== "all" ? [siteFilter] : [],
        categories: categoryFilter !== "all" ? [categoryFilter] : [],
        speeds: speedFilter !== "all" ? [speedFilter] : []
      };
      
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
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
      const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBuyinRange = buyinRangeFilter === "all" || getBuyinRange(group.avgBuyin) === buyinRangeFilter;
      const matchesRoi = roiFilter === "all" || 
        (roiFilter === "positive" && group.roi > 0) ||
        (roiFilter === "negative" && group.roi < 0) ||
        (roiFilter === "high" && group.roi > 20) ||
        (roiFilter === "medium" && group.roi >= 0 && group.roi <= 20);
      
      return matchesSearch && matchesBuyinRange && matchesRoi;
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
            <p className="text-gray-400">Análise inteligente com agrupamento de torneios similares</p>
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

      {/* Filters */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros e Ordenação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar torneios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
            
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">Todos os Tempos</SelectItem>
                <SelectItem value="7d">7 Dias</SelectItem>
                <SelectItem value="30d">30 Dias</SelectItem>
                <SelectItem value="90d">90 Dias</SelectItem>
                <SelectItem value="365d">1 Ano</SelectItem>
              </SelectContent>
            </Select>

            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Todos os Sites" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">Todos os Sites</SelectItem>
                {sites.map((site: string) => (
                  <SelectItem key={site} value={site}>{site}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((category: string) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={buyinRangeFilter} onValueChange={setBuyinRangeFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="ABI Range" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="micro">Micro ($0-$5)</SelectItem>
                <SelectItem value="low">Low ($5-$25)</SelectItem>
                <SelectItem value="mid">Mid ($25-$100)</SelectItem>
                <SelectItem value="high">High ($100-$500)</SelectItem>
                <SelectItem value="premium">Premium ($500+)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roiFilter} onValueChange={setRoiFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="ROI" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="positive">ROI Positivo</SelectItem>
                <SelectItem value="negative">ROI Negativo</SelectItem>
                <SelectItem value="high">ROI Alto (&gt;20%)</SelectItem>
                <SelectItem value="medium">ROI Médio (0-20%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-400">Ordenar por:</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-poker-surface border-gray-700">
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
                className="border-gray-700"
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortOrder === "desc" ? "Maior → Menor" : "Menor → Maior"}
              </Button>
            </div>
            <div className="text-sm text-gray-400">
              {filteredAndSortedGroups.length} grupos encontrados
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tournament Groups Grid */}
      {filteredAndSortedGroups.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Trophy className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum Grupo Encontrado</h3>
              <p>Grupos são criados automaticamente quando você tem 10+ torneios similares.</p>
              <p className="mt-2">Ajuste os filtros ou importe mais histórico de torneios.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedGroups.map((group) => (
            <Card key={group.id} className="bg-poker-surface border-gray-700 hover:border-green-500 transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-white text-sm font-semibold mb-1 line-clamp-2">
                      {group.groupName}
                    </CardTitle>
                    <div className="flex gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {group.site}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {group.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${group.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercentage(group.roi)}
                    </div>
                    <div className="text-xs text-gray-400">ROI</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white">{group.volume}</div>
                    <div className="text-xs text-gray-400">Torneios</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-semibold ${group.avgProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(group.avgProfit)}
                    </div>
                    <div className="text-xs text-gray-400">Lucro Médio</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white">{group.finalTables}</div>
                    <div className="text-xs text-gray-400">FTs ({formatPercentage(group.finalTableRate)})</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white">{group.bigHits}</div>
                    <div className="text-xs text-gray-400">Vitórias ({formatPercentage(group.bigHitRate)})</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 mb-4">
                  <div className="text-center">
                    <div className="text-white font-semibold">{formatCurrency(group.avgBuyin)}</div>
                    <div>ABI</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-semibold">{formatPercentage(group.itmRate)}</div>
                    <div>ITM%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-semibold">{group.avgFieldSize}</div>
                    <div>Campo Médio</div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                  <div className="text-xs">
                    <span className="text-green-400">Melhor: {formatCurrency(group.bestResult)}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedGroup(group)}
                    className="text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}