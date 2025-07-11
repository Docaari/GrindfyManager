import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import MetricsCard from "@/components/MetricsCard";
import ProfitChart from "@/components/ProfitChart";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import TournamentTable from "@/components/TournamentTable";
import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "@/components/DashboardFilters";
import DynamicCharts from "@/components/DynamicCharts";
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Filter, Monitor } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  
  // ETAPA 1: Nova estrutura de abas (6 → 3)
  const [activeTab, setActiveTab] = useState('evolution');
  const [showPreviousQuarter, setShowPreviousQuarter] = useState(false);
  
  // Dashboard filters state
  const [filters, setFilters] = useState<DashboardFiltersType>({
    dateRange: { from: null, to: null },
    sites: [],
    categories: [],
    speeds: [],
    buyinRange: { min: null, max: null },
    fieldSizeRange: { min: null, max: null },
    keywordFilter: { type: 'none', keyword: '' },
  });

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
      return response.json();
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

        {/* Dashboard Filters */}
        <DashboardFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableOptions={availableOptions}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* Dashboard Filters - Remover pois agora está integrado acima */}
      </div>

      {/* Primeira Linha - 4 Principais Indicadores (maiores) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Contagem</p>
              <p className="text-3xl font-bold text-white">{stats?.count || 0}</p>
              <p className="text-xs text-gray-500">Torneios</p>
            </div>
            <Trophy className="h-8 w-8 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Reentradas</p>
              <p className="text-3xl font-bold text-white">{stats?.reentries || 0}</p>
              <p className="text-xs text-gray-500">Total de Reentradas</p>
            </div>
            <Coins className="h-8 w-8 text-poker-accent" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6">
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
        
        <Card className="bg-poker-surface border-gray-700 p-6">
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
      </div>

      {/* Segunda Linha - 6 Indicadores Secundários (menores) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">ABI</p>
              <p className="text-xl font-bold text-white">{formatCurrency(stats?.abi || 0)}</p>
            </div>
            <Target className="h-6 w-6 text-poker-accent" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">ITM</p>
              <p className="text-xl font-bold text-white">{formatPercentage(stats?.itm || 0)}</p>
            </div>
            <Award className="h-6 w-6 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Prêmios</p>
              <p className="text-xl font-bold text-white">{formatCurrency(stats?.prizes || 0)}</p>
            </div>
            <Trophy className="h-6 w-6 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Stake Médio</p>
              <p className="text-xl font-bold text-white">{formatCurrency(stats?.avgStake || 0)}</p>
            </div>
            <DollarSign className="h-6 w-6 text-poker-green" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Média Participantes</p>
              <p className="text-xl font-bold text-white">{Math.round(stats?.avgParticipants || 0)}</p>
            </div>
            <Trophy className="h-6 w-6 text-poker-accent" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Cravadas</p>
              <p className="text-xl font-bold text-white">{stats?.bigHits || 0}</p>
            </div>
            <TrendingUp className="h-6 w-6 text-poker-primary" />
          </div>
        </Card>
      </div>

      {/* Terceira Linha - 5 Indicadores Terciários (menores) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Mesas Finais</p>
              <p className="text-xl font-bold text-white">{stats?.finalTables || 0}</p>
            </div>
            <Award className="h-6 w-6 text-poker-gold" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Finalização Precoce</p>
              <p className="text-xl font-bold text-white">{formatPercentage(stats?.earlyElimination || 0)}</p>
            </div>
            <Clock className="h-6 w-6 text-red-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Finalização Tardia</p>
              <p className="text-xl font-bold text-white">{formatPercentage(stats?.lateElimination || 0)}</p>
            </div>
            <Clock className="h-6 w-6 text-yellow-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Profit Médio</p>
              <p className={`text-xl font-bold ${(stats?.avgProfit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(stats?.avgProfit || 0)}
              </p>
            </div>
            <DollarSign className="h-6 w-6 text-poker-green" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Maiores Torneios</p>
              <p className="text-xl font-bold text-white">{stats?.bigTournaments || 0}</p>
            </div>
            <Trophy className="h-6 w-6 text-poker-accent" />
          </div>
        </Card>
      </div>

      {/* ETAPA 2: Filtros Rápidos sempre visíveis */}
      <div className="mt-8">
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-400 font-medium">Filtros:</span>
            
            {/* Filtro de Período */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-[#24c25e] focus:outline-none"
            >
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="90d">90 dias</option>
              <option value="1y">1 ano</option>
              <option value="all">Todos</option>
            </select>

            {/* Filtro de Site */}
            <select
              value={filters.site || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, site: e.target.value || undefined }))}
              className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-[#24c25e] focus:outline-none"
            >
              <option value="">Todos os Sites</option>
              {availableOptions.sites.map(site => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>

            {/* Filtro de Categoria */}
            <select
              value={filters.category || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value || undefined }))}
              className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-[#24c25e] focus:outline-none"
            >
              <option value="">Todas as Categorias</option>
              {availableOptions.categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            {/* Filtro de Velocidade */}
            <select
              value={filters.speed || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, speed: e.target.value || undefined }))}
              className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-[#24c25e] focus:outline-none"
            >
              <option value="">Todas as Velocidades</option>
              {availableOptions.speeds.map(speed => (
                <option key={speed} value={speed}>{speed}</option>
              ))}
            </select>

            {/* Botão Limpar Filtros */}
            {(filters.site || filters.category || filters.speed) && (
              <button
                onClick={() => setFilters({})}
                className="text-xs text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 px-2 py-1 rounded-md transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* ETAPA 3: Sistema de Screen Cap com Alertas */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium text-gray-300">Screen Capture</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-400">3 telas ativas</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md transition-colors">
                Capturar Tela
              </button>
              <button className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-md transition-colors">
                Alertas
              </button>
            </div>
          </div>
        </div>

        {/* ETAPA 4: Reorganização de Torneios por Categorias */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-400">Vanilla</h3>
                  <p className="text-xl font-bold text-white">
                    {categoryAnalytics?.find(c => c.category === 'Vanilla')?.volume || 0}
                  </p>
                </div>
                <div className="text-2xl">🎯</div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-orange-400">PKO</h3>
                  <p className="text-xl font-bold text-white">
                    {categoryAnalytics?.find(c => c.category === 'PKO')?.volume || 0}
                  </p>
                </div>
                <div className="text-2xl">🎖️</div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-pink-400">Mystery</h3>
                  <p className="text-xl font-bold text-white">
                    {categoryAnalytics?.find(c => c.category === 'Mystery')?.volume || 0}
                  </p>
                </div>
                <div className="text-2xl">🎁</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ETAPA 5: Sistema de Prioridades e Rebuys */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-300">Prioridades:</span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-full transition-colors">
                  Alta (2)
                </button>
                <button className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded-full transition-colors">
                  Média (5)
                </button>
                <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full transition-colors">
                  Baixa (3)
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Rebuys:</span>
              <span className="text-sm font-medium text-white">
                {stats?.totalReentries || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Tabs */}
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

                {/* ETAPA 7: Sistema de Notas Rápidas */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Notas Rápidas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Adicionar nota rápida..."
                          className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-[#24c25e] focus:outline-none text-sm transition-colors"
                        />
                        <button className="bg-[#24c25e] hover:bg-[#1ea650] text-white px-4 py-2 rounded-lg text-sm transition-all duration-200 hover:scale-105">
                          Adicionar
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-gray-700 rounded-lg p-3 hover:bg-gray-650 transition-colors duration-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">15:30</span>
                            <button className="text-xs text-red-400 hover:text-red-300 transition-colors">Remover</button>
                          </div>
                          <p className="text-sm text-white">Exemplo de nota rápida</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ETAPA 10: Sistema de Alertas Inteligentes */}
                <Card className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                      Alertas Inteligentes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Trophy className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm font-medium text-yellow-300">Performance Alert</span>
                        </div>
                        <p className="text-sm text-gray-300">ROI acima da média nos últimos 7 dias (+{((stats?.roi || 0) * 100).toFixed(1)}%)</p>
                      </div>
                      
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          <span className="text-sm font-medium text-green-300">Streak Alert</span>
                        </div>
                        <p className="text-sm text-gray-300">Sequência positiva de {stats?.count || 0} torneios</p>
                      </div>
                      
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium text-blue-300">Volume Alert</span>
                        </div>
                        <p className="text-sm text-gray-300">Meta mensal: {stats?.count || 0}/100 torneios</p>
                      </div>
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
                    <CardTitle className="text-white">Volume por Site</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="site" data={siteAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Profit por Site</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="siteProfit" data={siteAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Volume por Buy-in</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="buyin" data={buyinAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">ROI por Buy-in</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="buyinROI" data={buyinAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Volume por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="category" data={categoryAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Profit por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="categoryProfit" data={categoryAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Volume por Velocidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="speed" data={speedAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Profit por Velocidade</CardTitle>
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
              <h3 className="text-xl font-bold mb-4">Análise por Período & Heads-Up</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Volume por Dia da Semana</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="day" data={dayAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Volume Mensal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="monthVolume" data={monthAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Profit Mensal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="monthProfit" data={monthAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Eliminação por Field</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsCharts type="field" data={fieldAnalytics || []} />
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Posições Final Table</CardTitle>
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