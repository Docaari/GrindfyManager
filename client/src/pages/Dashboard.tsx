import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import MetricsCard from "@/components/MetricsCard";
import ProfitChart from "@/components/ProfitChart";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import TournamentTable from "@/components/TournamentTable";
// import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "@/components/DashboardFilters";
import DynamicCharts from "@/components/DynamicCharts";
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Filter, Monitor } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  
  // ETAPA 1: Nova estrutura de abas (6 → 3)
  const [activeTab, setActiveTab] = useState('evolution');
  const [showPreviousQuarter, setShowPreviousQuarter] = useState(false);
  
  // Dashboard filters state - advanced filter system
  const [filters, setFilters] = useState<{
    sites?: string[];
    categories?: string[];
    speeds?: string[];
    keyword?: string;
    keywordType?: 'contains' | 'not_contains';
    dateFrom?: string;
    dateTo?: string;
  }>({});

  // ETAPA 1: Configuração das novas abas
  const dashboardTabs = [
    {
      id: 'evolution',
      name: 'Evolução',
      icon: TrendingUp,
      active: activeTab === 'evolution'
    },
    {
      id: 'analysis', 
      name: 'Por Site, ABI & Tipo',
      icon: BarChart3,
      active: activeTab === 'analysis'
    },
    {
      id: 'period',
      name: 'Por Período & Heads-Up',
      icon: Calendar,
      active: activeTab === 'period'
    }
  ];

  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/dashboard/stats?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ["/api/dashboard/performance", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/dashboard/performance?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch performance");
      return response.json();
    },
  });

  const { data: tournaments, isLoading: tournamentsLoading } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments?limit=10", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournaments");
      return response.json();
    },
  });

  // Get available filter options from all tournaments
  const { data: allTournaments } = useQuery({
    queryKey: ["/api/tournaments", "all"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments?limit=10000", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch all tournaments");
      return response.json();
    },
  });

  // Get filtered tournaments for recent tournaments list
  const { data: filteredTournaments } = useQuery({
    queryKey: ["/api/tournaments", "filtered", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "20",
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/tournaments?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch filtered tournaments");
      return response.json();
    },
  });

  // Extract unique values for filter options
  const availableOptions = {
    sites: Array.from(new Set(allTournaments?.map((t: any) => t.site).filter(Boolean) || [])) as string[],
    categories: Array.from(new Set(allTournaments?.map((t: any) => t.category).filter(Boolean) || [])) as string[],
    speeds: Array.from(new Set(allTournaments?.map((t: any) => t.speed).filter(Boolean) || [])) as string[]
  };

  // Advanced analytics queries with filters
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-site?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch site analytics");
      return response.json();
    },
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-buyin?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch buyin analytics");
      return response.json();
    },
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-category?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch category analytics");
      return response.json();
    },
  });

  const { data: dayAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-day", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-day?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch day analytics");
      return response.json();
    },
  });

  // ETAPA 4: Analytics por velocidade
  const { data: speedAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-speed", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-speed?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch speed analytics");
      return response.json();
    },
  });

  // ETAPA 5: Analytics mensais
  const { data: monthAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-month", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-month?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch month analytics");
      const data = await response.json();
      console.log('DEBUG Frontend - Monthly analytics data received:', data);
      return data;
    },
  });

  // ETAPA 5: Analytics de eliminação por field
  const { data: fieldAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-field", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/by-field?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch field analytics");
      return response.json();
    },
  });

  // ETAPA 5: Analytics de posições finais
  const { data: finalTableAnalytics } = useQuery({
    queryKey: ["/api/analytics/final-table", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      const response = await fetch(`/api/analytics/final-table?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch final table analytics");
      return response.json();
    },
  });



  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (statsLoading || performanceLoading || tournamentsLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Performance Dashboard</h2>
          <p className="text-gray-400">Loading your tournament data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Performance Dashboard</h2>
            <p className="text-gray-400">Track your tournament performance and profitability</p>
          </div>
          
        </div>

        
      </div>
      {/* Filtros Avançados */}
      <div className="bg-poker-surface border-gray-700 rounded-xl p-6 mb-6">
        <div className="space-y-4">
          {/* Primeira linha - Filtros principais */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-poker-green" />
              <span className="text-sm font-medium text-white">Filtros:</span>
            </div>
            
            {/* Filtro de Período */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Período:</span>
              <div className="flex items-center gap-2">
                {['7d', '30d', '90d', '1y', 'all'].map((periodOption) => (
                  <button
                    key={periodOption}
                    onClick={() => setPeriod(periodOption)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      period === periodOption
                        ? 'bg-poker-green text-white shadow-md'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {periodOption === '7d' && '7 dias'}
                    {periodOption === '30d' && '30 dias'}
                    {periodOption === '90d' && '90 dias'}
                    {periodOption === '1y' && '1 ano'}
                    {periodOption === 'all' && 'Todos'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro de Palavra-chave */}
            <div className="flex items-center gap-2">
              <select
                value={filters.keywordType || 'contains'}
                onChange={(e) => setFilters(prev => ({ ...prev, keywordType: e.target.value }))}
                className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-poker-green focus:outline-none"
              >
                <option value="contains">Contém</option>
                <option value="not_contains">Não Contém</option>
              </select>
              <input
                type="text"
                placeholder="Palavra-chave..."
                value={filters.keyword || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
                className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-poker-green focus:outline-none w-40"
              />
            </div>

            {/* Contador de Filtros Ativos */}
            {Object.keys(filters).filter(key => {
              const value = filters[key as keyof typeof filters];
              return value && (Array.isArray(value) ? value.length > 0 : true);
            }).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-poker-green text-white px-2 py-1 rounded-full">
                  {Object.keys(filters).filter(key => {
                    const value = filters[key as keyof typeof filters];
                    return value && (Array.isArray(value) ? value.length > 0 : true);
                  }).length} filtros ativos
                </span>
                <button
                  onClick={() => setFilters({})}
                  className="text-xs text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 px-3 py-1.5 rounded-md transition-colors"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {/* Segunda linha - Filtros de múltipla escolha */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Filtros de Site */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sites:</span>
              <div className="flex flex-wrap gap-1">
                {availableOptions.sites.map(site => (
                  <button
                    key={site}
                    onClick={() => {
                      const currentSites = filters.sites || [];
                      const newSites = currentSites.includes(site)
                        ? currentSites.filter(s => s !== site)
                        : [...currentSites, site];
                      setFilters(prev => ({ ...prev, sites: newSites.length > 0 ? newSites : undefined }));
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                      (filters.sites || []).includes(site)
                        ? 'bg-poker-green text-white shadow-md' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {site}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros de Categoria */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Categorias:</span>
              <div className="flex flex-wrap gap-1">
                {availableOptions.categories.map(category => (
                  <button
                    key={category}
                    onClick={() => {
                      const currentCategories = filters.categories || [];
                      const newCategories = currentCategories.includes(category)
                        ? currentCategories.filter(c => c !== category)
                        : [...currentCategories, category];
                      setFilters(prev => ({ ...prev, categories: newCategories.length > 0 ? newCategories : undefined }));
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                      (filters.categories || []).includes(category)
                        ? 'bg-poker-green text-white shadow-md' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros de Velocidade */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Velocidades:</span>
              <div className="flex flex-wrap gap-1">
                {availableOptions.speeds.map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      const currentSpeeds = filters.speeds || [];
                      const newSpeeds = currentSpeeds.includes(speed)
                        ? currentSpeeds.filter(s => s !== speed)
                        : [...currentSpeeds, speed];
                      setFilters(prev => ({ ...prev, speeds: newSpeeds.length > 0 ? newSpeeds : undefined }));
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                      (filters.speeds || []).includes(speed)
                        ? 'bg-poker-green text-white shadow-md' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Linha 1 - Métricas Principais (5 cards grandes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Contagem</p>
              <p className="text-3xl font-bold text-white">{stats?.count || 0}</p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <Trophy className="h-8 w-8 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Reentradas</p>
              <p className="text-3xl font-bold text-white">{stats?.reentries || 0}</p>
              <p className="text-xs text-gray-500">Total de Reentradas</p>
            </div>
            <Coins className="h-8 w-8 text-poker-accent" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Lucro</p>
              <p className={`text-3xl font-bold ${(stats?.profit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(stats?.profit || 0)}
              </p>
              <p className="text-xs text-gray-500">Profit Total</p>
            </div>
            <DollarSign className="h-8 w-8 text-poker-green" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">ROI</p>
              <p className={`text-3xl font-bold ${(stats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercentage(stats?.roi || 0)}
              </p>
              <p className="text-xs text-gray-500">Retorno sobre Investimento</p>
            </div>
            <Percent className="h-8 w-8 text-poker-primary" />
          </div>
        </Card>

        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-cyan-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">ABI</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(stats?.abi || 0)}</p>
              <p className="text-xs text-gray-500">Average Buy-in</p>
            </div>
            <Target className="h-8 w-8 text-poker-accent" />
          </div>
        </Card>
      </div>
      {/* Linha 2 - Métricas Secundárias (5 cards médios) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-3 h-24 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between h-full">
            <div>
              <p className="text-xs font-medium text-gray-400">ITM</p>
              <p className="text-lg font-bold text-white">{formatPercentage(stats?.itm || 0)}</p>
            </div>
            <Award className="h-5 w-5 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-3 h-24 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between h-full">
            <div>
              <p className="text-xs font-medium text-gray-400">Mesas Finais</p>
              <p className="text-lg font-bold text-white">{stats?.finalTables || 0}</p>
            </div>
            <Award className="h-5 w-5 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-3 h-24 border-l-4 border-l-pink-500">
          <div className="flex items-center justify-between h-full">
            <div>
              <p className="text-xs font-medium text-gray-400">Lucro Total</p>
              <p className="text-lg font-bold text-white">{formatCurrency(stats?.prizes || 0)}</p>
            </div>
            <Trophy className="h-5 w-5 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-3 h-24 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between h-full">
            <div>
              <p className="text-xs font-medium text-gray-400">ROI</p>
              <p className={`text-lg font-bold ${(stats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercentage(stats?.roi || 0)}
              </p>
            </div>
            <Percent className="h-5 w-5 text-poker-primary" />
          </div>
        </Card>

        <Card className="bg-poker-surface border-gray-700 p-3 h-24 border-l-4 border-l-teal-500">
          <div className="flex items-center justify-between h-full">
            <div>
              <p className="text-xs font-medium text-gray-400">ABI</p>
              <p className="text-lg font-bold text-white">{formatCurrency(stats?.abi || 0)}</p>
            </div>
            <Target className="h-5 w-5 text-poker-accent" />
          </div>
        </Card>
      </div>
      {/* Linha 3 - Métricas de Apoio (5 cards grandes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-lime-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Stake Médio</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(stats?.avgStake || 0)}</p>
              <p className="text-xs text-gray-500">Investimento Médio</p>
            </div>
            <DollarSign className="h-8 w-8 text-poker-green" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Prêmio</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(stats?.prizes || 0)}</p>
              <p className="text-xs text-gray-500">Total de Prêmios</p>
            </div>
            <Trophy className="h-8 w-8 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Média Part</p>
              <p className="text-3xl font-bold text-white">{Math.round(stats?.avgParticipants || 0)}</p>
              <p className="text-xs text-gray-500">Participantes Médio</p>
            </div>
            <Trophy className="h-8 w-8 text-poker-accent" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Final. Precoce</p>
              <p className="text-3xl font-bold text-white">{formatPercentage(stats?.earlyElimination || 0)}</p>
              <p className="text-xs text-gray-500">Eliminação Precoce</p>
            </div>
            <Clock className="h-8 w-8 text-red-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Final. Tardia</p>
              <p className="text-3xl font-bold text-white">{formatPercentage(stats?.lateElimination || 0)}</p>
              <p className="text-xs text-gray-500">Eliminação Tardia</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
      </div>
      {/* ETAPA 4: Reorganização de Torneios por Categorias e Velocidades */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-400">Vanilla</p>
              <p className="text-3xl font-bold text-white">
                {categoryAnalytics?.find(c => c.category === 'Vanilla')?.volume || 0}
              </p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <div className="text-3xl">🎯</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-400">PKO</p>
              <p className="text-3xl font-bold text-white">
                {categoryAnalytics?.find(c => c.category === 'PKO')?.volume || 0}
              </p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <div className="text-3xl">🎖️</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-pink-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-pink-400">Mystery</p>
              <p className="text-3xl font-bold text-white">
                {categoryAnalytics?.find(c => c.category === 'Mystery')?.volume || 0}
              </p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <div className="text-3xl">🎁</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-400">Normal</p>
              <p className="text-3xl font-bold text-white">
                {speedAnalytics?.find(s => s.speed === 'Normal')?.volume || 0}
              </p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <div className="text-3xl">⏰</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-400">Turbo/Hyper</p>
              <p className="text-3xl font-bold text-white">
                {((speedAnalytics?.find(s => s.speed === 'Turbo')?.volume || 0) + (speedAnalytics?.find(s => s.speed === 'Hyper')?.volume || 0))}
              </p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <div className="text-3xl">⚡</div>
          </div>
        </Card>
      </div>
      {/* Dashboard Tabs */}
      <div className="mt-8">
        <div className="flex space-x-4 mb-6">
          {dashboardTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                tab.active 
                  ? 'bg-poker-primary text-white' 
                  : 'bg-poker-surface text-gray-400 hover:bg-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'evolution' && (
            <div>
              <h3 className="text-xl font-bold mb-4">Evolução da Performance</h3>
              <div className="space-y-6">
                {/* Gráfico de Lucro Acumulado - Grande */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Gráfico de Lucro Acumulado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-96">
                      <ProfitChart data={performance || []} />
                    </div>
                  </CardContent>
                </Card>

                {/* ETAPA 6: Campos de Resultado Inline */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Torneios Recentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-96 overflow-y-auto">
                      <TournamentTable tournaments={tournaments || []} />
                    </div>
                  </CardContent>
                </Card>

                </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div>
              <h3 className="text-xl font-bold mb-4">Análise por Site, ABI & Tipo</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📊 Volume por Site</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por site de poker</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="siteVolume" data={siteAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💰 Profit por Site</CardTitle>
                    <CardDescription className="text-gray-400">Lucro total por site de poker</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="siteProfit" data={siteAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💰 Volume por Buy-in</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por faixa de buy-in</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="buyinVolume" data={buyinAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📊 Profit por Buy-in</CardTitle>
                    <CardDescription className="text-gray-400">Lucro total por faixa de buy-in</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="buyinProfit" data={buyinAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">🎯 Volume por Categoria</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por tipo (Vanilla, PKO, Mystery)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="categoryVolume" data={categoryAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💵 Profit por Tipo</CardTitle>
                    <CardDescription className="text-gray-400">Lucro total por categoria de torneio</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="categoryProfit" data={categoryAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">⚡ Volume por Velocidade</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por velocidade</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="speedVolume" data={speedAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">🚀 Profit por Velocidade</CardTitle>
                    <CardDescription className="text-gray-400">Lucro total por velocidade de torneio</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="speedProfit" data={speedAnalytics || []} />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'period' && (
            <div>
              <h3 className="text-xl font-bold mb-6">Análise por Período & Heads-Up</h3>
              
              {/* Grid 3x2 - Reorganizado com pares lógicos Volume/Profit */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* LINHA 1: Volume Mensal | Profit Mensal */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      📊 Volume Mensal
                    </CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por mês</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="monthVolume" data={monthAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      💰 Profit Mensal
                    </CardTitle>
                    <CardDescription className="text-gray-400">Evolução do lucro por mês</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="monthProfit" data={monthAnalytics || []} />
                  </CardContent>
                </Card>
                
                {/* LINHA 2: Volume por Dia da Semana | Profit por Dia da Semana */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      📅 Volume por Dia da Semana
                    </CardTitle>
                    <CardDescription className="text-gray-400">Frequência de jogo por dia</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="day" data={dayAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      💵 Profit por Dia da Semana
                    </CardTitle>
                    <CardDescription className="text-gray-400">Performance por dia da semana</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="dayProfit" data={dayAnalytics || []} />
                  </CardContent>
                </Card>
                
                {/* LINHA 3: Eliminação por Field | Posições Final Table */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      🎯 Eliminação por Field
                    </CardTitle>
                    <CardDescription className="text-gray-400">Análise de posições de eliminação</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="field" data={fieldAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      🏆 Posições Final Table
                    </CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de posições finais (1º-9º)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="finalTable" data={finalTableAnalytics || []} />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}