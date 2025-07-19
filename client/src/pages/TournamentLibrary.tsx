import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplateCard from "@/components/TemplateCard";
import { Search, Filter, Plus, Calendar, Clock, Trophy, Target, Users, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";

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

export default function TournamentLibrary() {
  const hasPermission = usePermission('tournament_library_access');
  
  if (!hasPermission) {
    return <AccessDenied />;
  }
  
  const [searchTerm, setSearchTerm] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [speedFilter, setSpeedFilter] = useState("all");
  const [buyinRangeFilter, setBuyinRangeFilter] = useState("all");
  const [roiFilter, setRoiFilter] = useState("all");
  const [sortBy, setSortBy] = useState("roi");
  const [sortOrder, setSortOrder] = useState("desc");
  const queryClient = useQueryClient();

  const { data: libraryGroups = [], isLoading } = useQuery({
    queryKey: ["/api/tournament-library"],
    queryFn: async () => {
      const response = await fetch("/api/tournament-library?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournament library");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: customGroups } = useQuery({
    queryKey: ["/api/custom-groups"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/custom-groups');
      return response.json();
    },
  });

  // Advanced filtering and sorting logic
  const filteredGroups = (libraryGroups || []).filter((group: TournamentGroup) => {
    const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSite = siteFilter === "all" || group.site === siteFilter;
    const matchesFormat = formatFilter === "all" || group.format === formatFilter;
    const matchesCategory = categoryFilter === "all" || group.category === categoryFilter;
    const matchesSpeed = speedFilter === "all" || group.speed === speedFilter;
    
    // Buy-in range filtering
    const buyinRange = getBuyinRange(group.avgBuyin);
    const matchesBuyinRange = buyinRangeFilter === "all" || buyinRange === buyinRangeFilter;
    
    // ROI filtering
    const roiValue = group.roi || 0;
    const matchesRoi = roiFilter === "all" || 
      (roiFilter === "positive" && roiValue > 0) ||
      (roiFilter === "negative" && roiValue < 0) ||
      (roiFilter === "high" && roiValue > 20) ||
      (roiFilter === "medium" && roiValue >= 0 && roiValue <= 20);
    
    return matchesSearch && matchesSite && matchesFormat && matchesCategory && 
           matchesSpeed && matchesBuyinRange && matchesRoi;
  }).sort((a: TournamentGroup, b: TournamentGroup) => {
    const aValue = getSortValue(a, sortBy);
    const bValue = getSortValue(b, sortBy);
    return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
  });

  // Helper functions for filtering
  const getBuyinRange = (buyin: number) => {
    if (buyin <= 5) return "micro";
    if (buyin <= 25) return "low";
    if (buyin <= 100) return "mid";
    if (buyin <= 500) return "high";
    return "premium";
  };

  const getSortValue = (group: TournamentGroup, sortField: string) => {
    switch (sortField) {
      case "icd": return calculateICD(group.avgProfit, group.volume);
      case "roi": return group.roi || 0;
      case "profit": return group.totalProfit || 0;
      case "volume": return group.volume || 0;
      case "buyin": return group.avgBuyin || 0;
      case "avgProfit": return group.avgProfit || 0;
      default: return 0;
    }
  };

  const sites = Array.from(new Set((libraryGroups || []).map((g: TournamentGroup) => g.site)));
  const formats = Array.from(new Set((libraryGroups || []).map((g: TournamentGroup) => g.format)));
  const categories = Array.from(new Set((libraryGroups || []).map((g: TournamentGroup) => g.category)));

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
          <p className="text-gray-400">Loading your tournament templates...</p>
        </div>
      </div>
    );
  }

  // Cálculos para o header KPI
  const bestICD = filteredGroups.length > 0 ? Math.max(...filteredGroups.map(g => calculateICD(g.avgProfit, g.volume))) : 0;
  const worstICD = filteredGroups.length > 0 ? Math.min(...filteredGroups.map(g => calculateICD(g.avgProfit, g.volume))) : 0;
  const bestICDGroup = filteredGroups.find(g => calculateICD(g.avgProfit, g.volume) === bestICD);
  const worstICDGroup = filteredGroups.find(g => calculateICD(g.avgProfit, g.volume) === worstICD);
  const selectionProfit = filteredGroups.reduce((sum, g) => sum + g.totalProfit, 0);
  const filteredTournaments = filteredGroups.reduce((sum, g) => sum + g.volume, 0);
  const totalGroups = libraryGroups?.length || 0;

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
            <p className="text-gray-400">Análise inteligente de performance por torneios</p>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Users className="w-4 h-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Custom Group</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Group similar tournaments for better analysis
                  </DialogDescription>
                </DialogHeader>
                {/* Group creation form will be added */}
              </DialogContent>
            </Dialog>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      </div>

      {/* ETAPA 1: Header Inteligente com KPIs */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card: Melhor ICD */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Melhor ICD</p>
            <p className="text-2xl font-bold text-[#24c25e]">{bestICD.toFixed(1)}</p>
            <p className="text-xs text-gray-500 truncate">
              {bestICDGroup?.groupName || "N/A"}
            </p>
          </div>
          
          {/* Card: Pior ICD */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Pior ICD</p>
            <p className="text-2xl font-bold text-red-400">{worstICD.toFixed(1)}</p>
            <p className="text-xs text-gray-500 truncate">
              {worstICDGroup?.groupName || "N/A"}
            </p>
          </div>
          
          {/* Card: Grupos Filtrados */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Grupos Filtrados</p>
            <p className="text-2xl font-bold text-white">{filteredGroups.length}</p>
            <p className="text-xs text-gray-500">de {totalGroups} total</p>
          </div>
          
          {/* Card: Lucro da Seleção */}
          <div className="text-center">
            <p className="text-sm text-gray-400">Lucro da Seleção</p>
            <p className={`text-2xl font-bold ${selectionProfit >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
              US$ {selectionProfit.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{filteredTournaments} torneios</p>
          </div>
        </div>
      </div>

      {/* ETAPA 2: Sistema de Busca e Filtros Protagonista */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar de Filtros */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-xl p-6 sticky top-6">
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
            
            {/* Filtros Rápidos */}
            <div className="mb-6">
              <p className="text-sm font-medium text-white mb-3">Filtros Rápidos</p>
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    setRoiFilter('positive');
                    setSortBy('icd');
                    setSortOrder('desc');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  🏆 Top ICD
                </button>
                <button 
                  onClick={() => setRoiFilter('positive')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    roiFilter === 'positive' 
                      ? 'bg-[#24c25e] text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  💰 Apenas Lucrativos
                </button>
                <button 
                  onClick={() => setRoiFilter('negative')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    roiFilter === 'negative' 
                      ? 'bg-red-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  📉 Prejuízo
                </button>
                <button 
                  onClick={() => setSortBy('volume')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    sortBy === 'volume' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  📊 Alto Volume
                </button>
              </div>
            </div>
            
            {/* Filtros Detalhados */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Site</label>
                <Select value={siteFilter} onValueChange={setSiteFilter}>
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
                <label className="block text-sm font-medium text-white mb-2">Categoria</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
                <label className="block text-sm font-medium text-white mb-2">Velocidade</label>
                <Select value={speedFilter} onValueChange={setSpeedFilter}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Todas as Velocidades" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Todas as Velocidades</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Turbo">Turbo</SelectItem>
                    <SelectItem value="Hyper">Hyper</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Buy-in</label>
                <Select value={buyinRangeFilter} onValueChange={setBuyinRangeFilter}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Todas as Stakes" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Todas as Stakes</SelectItem>
                    <SelectItem value="micro">Micro ($0-$5)</SelectItem>
                    <SelectItem value="low">Low ($5-$25)</SelectItem>
                    <SelectItem value="mid">Mid ($25-$100)</SelectItem>
                    <SelectItem value="high">High ($100-$500)</SelectItem>
                    <SelectItem value="premium">Premium ($500+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Preview de Resultados */}
            <div className="mt-6 p-3 bg-gray-700 rounded-lg">
              <p className="text-xs text-gray-400">
                Mostrando {filteredGroups.length} grupos
              </p>
            </div>
          </div>
        </div>
        
        {/* Área Principal */}
        <div className="lg:col-span-3">
          {/* Tags de Filtros Ativos */}
          <div className="flex flex-wrap gap-2 mb-4">
            {siteFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                Site: {siteFilter}
                <button 
                  onClick={() => setSiteFilter('all')}
                  className="ml-2 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
            {categoryFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                Categoria: {categoryFilter}
                <button 
                  onClick={() => setCategoryFilter('all')}
                  className="ml-2 hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
            {roiFilter !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 bg-[#24c25e]/20 text-[#24c25e] text-sm rounded-full">
                ROI: {roiFilter}
                <button 
                  onClick={() => setRoiFilter('all')}
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
              Tournament Library ({filteredGroups.length} grupos)
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
                    <SelectItem value="profit">Lucro Total</SelectItem>
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
          {filteredGroups.length === 0 ? (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <Trophy className="h-16 w-16 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum Grupo Encontrado</h3>
                  <p>Comece enviando seu histórico de torneios para criar grupos automaticamente.</p>
                </div>
                <Button 
                  onClick={() => window.location.href = "/upload"}
                  className="bg-[#24c25e] hover:bg-[#20a852] text-white"
                >
                  Enviar Histórico de Torneios
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredGroups.map((group: TournamentGroup) => {
                const groupICD = calculateICD(group.avgProfit, group.volume);
                const getPerformanceColor = (icd: number) => {
                  if (icd >= 80) return 'border-l-[#24c25e]';
                  if (icd >= 50) return 'border-l-yellow-500';
                  if (icd >= 20) return 'border-l-orange-500';
                  return 'border-l-red-500';
                };
                
                return (
                  <div 
                    key={group.id} 
                    className={`bg-gray-800 rounded-xl p-6 border-l-4 hover:bg-gray-750 transition-colors cursor-pointer ${getPerformanceColor(groupICD)}`}
                  >
                    {/* Header do Card */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        {/* Badges de Site/Categoria */}
                        <span className="px-2 py-1 bg-gray-700 text-xs rounded text-gray-300">{group.site}</span>
                        <span className="px-2 py-1 bg-gray-700 text-xs rounded text-gray-300">{group.category}</span>
                        <span className="px-2 py-1 bg-gray-700 text-xs rounded text-gray-300">{group.speed}</span>
                      </div>
                      
                      {/* ICD - Métrica Principal */}
                      <div className="text-right">
                        <p className="text-3xl font-bold text-[#24c25e]">{groupICD.toFixed(1)}</p>
                        <p className="text-xs text-gray-400">ICD</p>
                      </div>
                    </div>
                    
                    {/* Título do Torneio */}
                    <h3 className="text-lg font-semibold text-white mb-4 line-clamp-2">
                      {group.groupName}
                    </h3>
                    
                    {/* Métricas Secundárias - Ordem: Lucro → ROI → Volume */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {/* Lucro - Segunda prioridade */}
                      <div className="text-center">
                        <p className={`text-xl font-bold ${group.totalProfit >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
                          US$ {group.totalProfit.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">Lucro Total</p>
                      </div>
                      
                      {/* ROI - Terceira prioridade */}
                      <div className="text-center">
                        <p className={`text-lg font-semibold ${group.roi >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
                          {group.roi.toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-400">ROI</p>
                      </div>
                      
                      {/* Volume - Quarta prioridade */}
                      <div className="text-center">
                        <p className="text-lg font-semibold text-white">{group.volume}</p>
                        <p className="text-xs text-gray-400">Torneios</p>
                      </div>
                    </div>
                    
                    {/* Sparkline de ROI Simplificado */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs text-gray-400">Tendência de Performance</p>
                        <p className="text-xs text-gray-400">Volume: {group.volume}</p>
                      </div>
                      <div className="h-8 bg-gray-700 rounded relative overflow-hidden">
                        <div 
                          className={`absolute inset-0 bg-gradient-to-r ${
                            group.roi >= 0 
                              ? 'from-[#24c25e]/20 to-[#24c25e]/40' 
                              : 'from-red-500/20 to-red-500/40'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(10, (group.volume / 50) * 100))}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs text-white font-medium">
                            {group.roi >= 0 ? '📈' : '📉'} {group.roi.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Métricas Adicionais */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">ITM:</span>
                        <span className="text-white ml-2">{group.itmRate?.toFixed(1) || 0}%</span>
                      </div>
                      <div>
                        <span className="text-gray-400">FT:</span>
                        <span className="text-white ml-2">{group.finalTableRate?.toFixed(1) || 0}%</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Buy-in:</span>
                        <span className="text-white ml-2">US$ {group.avgBuyin?.toFixed(2) || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Lucro Médio:</span>
                        <span className={`ml-2 ${group.avgProfit >= 0 ? 'text-[#24c25e]' : 'text-red-400'}`}>
                          US$ {group.avgProfit?.toFixed(2) || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}