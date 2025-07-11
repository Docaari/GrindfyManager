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
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Filter } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  
  // ETAPA 1: Nova estrutura de abas (6 → 3)
  const [activeTab, setActiveTab] = useState('evolution');
  const [showPreviousQuarter, setShowPreviousQuarter] = useState(false);
  
  // ETAPA 2: Filtros rápidos sempre visíveis
  const [selectedPeriod, setSelectedPeriod] = useState(90); // Padrão: 90 dias
  const [selectedBuyinRange, setSelectedBuyinRange] = useState('all');
  const [selectedSpeeds, setSelectedSpeeds] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
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

  // ETAPA 2: Períodos rápidos padrão (90 dias ativo)
  const quickPeriods = [
    { label: '30 dias', value: 30 },
    { label: '90 dias', value: 90, default: true },
    { label: '6 meses', value: 180 },
    { label: 'Este ano', value: 365 },
    { label: 'Tudo', value: null }
  ];

  // ETAPA 2: Função para alternar velocidades
  const toggleSpeed = (speed: string) => {
    setSelectedSpeeds(prev => 
      prev.includes(speed) 
        ? prev.filter(s => s !== speed)
        : [...prev, speed]
    );
  };


  
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
        limit: "100",
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
            <TrendingUp className="h-8 w-8 text-poker-green" />
          </div>
        </Card>
      </div>

      {/* Segunda Linha - 6 Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <MetricsCard
          title="ABI"
          value={formatCurrency(stats?.abi || 0)}
          icon={Coins}
          trend="neutral"
          trendValue="Buy-in Médio"
        />
        <MetricsCard
          title="ITM"
          value={formatPercentage(stats?.itm || 0)}
          icon={Target}
          trend={(stats?.itm || 0) > 20 ? "positive" : (stats?.itm || 0) < 15 ? "negative" : "neutral"}
          trendValue="In The Money"
        />
        <MetricsCard
          title="Lucro Médio/Torneio"
          value={formatCurrency(stats?.avgProfitPerTournament || 0)}
          icon={BarChart3}
          trend="neutral"
          trendValue="Por Evento"
        />
        <MetricsCard
          title="Lucro Médio/Dia"
          value={formatCurrency(stats?.avgProfitPerDay || 0)}
          icon={Clock}
          trend="neutral"
          trendValue="Diário"
        />
        <MetricsCard
          title="FTs"
          value={stats?.finalTables || 0}
          icon={Award}
          trend="positive"
          trendValue={`${(stats?.finalTablesRate || 0).toFixed(1)}% Final Tables`}
        />
        <MetricsCard
          title="Cravadas"
          value={stats?.bigHits || 0}
          icon={TrendingUp}
          trend="positive"
          trendValue={`${(stats?.bigHitsRate || 0).toFixed(1)}% Vitórias`}
        />
      </div>

      {/* Terceira Linha - 6 Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <MetricsCard
          title="Dias Jogados"
          value={stats?.daysPlayed || 0}
          icon={Calendar}
          trend="neutral"
          trendValue="Dias Únicos"
        />
        <MetricsCard
          title="Finalização Precoce"
          value={`${(stats?.earlyFinishRate || 0).toFixed(1)}%`}
          icon={Clock}
          trend="negative"
          trendValue="Últimos 10%"
        />
        <MetricsCard
          title="Finalização Tardia"
          value={`${(stats?.lateFinishRate || 0).toFixed(1)}%`}
          icon={Clock}
          trend="positive"
          trendValue="Primeiros 10%"
        />
        <MetricsCard
          title="Stake Range"
          value={stats?.stakeRange ? `$${Math.round(Number(stats.stakeRange.min) || 0)}-$${Math.round(Number(stats.stakeRange.max) || 0)}` : '$0-$0'}
          icon={Coins}
          trend="neutral"
          trendValue="Faixa"
        />
        <MetricsCard
          title="Média Participantes"
          value={Math.round(stats?.avgFieldSize || 0)}
          icon={Trophy}
          trend="neutral"
          trendValue="Field Size"
        />
        <MetricsCard
          title="Big Hit"
          value={formatCurrency(stats?.biggestPrize || 0)}
          icon={Award}
          trend="positive"
          trendValue="Maior Premiação"
        />
      </div>

      {/* ETAPA 2: Barra de Filtros Rápidos Sempre Visíveis */}
      <div className="bg-gray-800 rounded-xl p-4 mb-6 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filtros Rápidos de Período */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Período:</span>
            <div className="flex bg-gray-700 rounded-lg p-1">
              {quickPeriods.map(period => (
                <button
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    selectedPeriod === period.value 
                      ? 'bg-[#24c25e] text-white' 
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Filtros de Buy-in */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Buy-in:</span>
            <select 
              value={selectedBuyinRange}
              onChange={(e) => setSelectedBuyinRange(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm"
            >
              <option value="all">Todos</option>
              <option value="low">$5-$50</option>
              <option value="mid">$51-$200</option>
              <option value="high">$201+</option>
            </select>
          </div>
          
          {/* Filtros de Velocidade */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Velocidade:</span>
            <div className="flex space-x-1">
              {['Normal', 'Turbo', 'Hyper'].map(speed => (
                <button
                  key={speed}
                  onClick={() => toggleSpeed(speed)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    selectedSpeeds.includes(speed)
                      ? 'bg-[#24c25e] text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {speed}
                </button>
              ))}
            </div>
          </div>
          
          {/* Botão Filtros Avançados */}
          <button 
            onClick={() => setShowAdvancedFilters(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros Avançados
          </button>
        </div>
      </div>

      {/* ETAPA 1: Nova estrutura de abas (6 → 3) */}
      <div className="space-y-6">
        {/* Navegação das Abas */}
        <div className="flex space-x-1 bg-gray-800 rounded-xl p-1">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab.active 
                  ? 'bg-[#24c25e] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Conteúdo das Abas */}
        
        {/* ABA 1: EVOLUÇÃO - Apenas o gráfico principal */}
        {activeTab === 'evolution' && (
          <div className="space-y-6">
            {/* Gráfico Principal - MAIOR E MAIS VISUAL */}
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">📈 Evolução do Profit Acumulado</h3>
                
                {/* Toggle para mostrar trimestre anterior */}
                <label className="flex items-center space-x-3">
                  <span className="text-sm text-gray-400">Comparar com trimestre anterior</span>
                  <input
                    type="checkbox"
                    checked={showPreviousQuarter}
                    onChange={(e) => setShowPreviousQuarter(e.target.checked)}
                    className="w-4 h-4 text-[#24c25e] bg-gray-700 border-gray-600 rounded focus:ring-[#24c25e]"
                  />
                </label>
              </div>
              
              {/* Área do gráfico - AUMENTAR ALTURA */}
              <div className="h-96 md:h-[500px]">
                <ProfitChart 
                  data={performance || []} 
                  showComparison={showPreviousQuarter}
                />
              </div>
              
              {/* Legenda quando comparação estiver ativa */}
              {showPreviousQuarter && (
                <div className="flex justify-center mt-4 space-x-6">
                  <div className="flex items-center">
                    <div className="w-4 h-0.5 bg-[#24c25e] mr-2"></div>
                    <span className="text-sm text-gray-400">Trimestre Atual</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-0.5 bg-[#24c25e] opacity-40 border-dashed mr-2"></div>
                    <span className="text-sm text-gray-400">Trimestre Anterior</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: ANÁLISES POR CATEGORIAS */}
        {activeTab === 'analysis' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Row 1 */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">📊 Volume por Site</h3>
              <AnalyticsCharts type="site" data={siteAnalytics || []} />
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">💰 Profit por Site</h3>
              <AnalyticsCharts type="siteProfit" data={siteAnalytics || []} />
            </div>
            
            {/* Row 2 */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">📈 Volume por Faixa de Buy-in</h3>
              <AnalyticsCharts type="buyin" data={buyinAnalytics || []} />
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">📊 ROI por Faixa de Buy-in</h3>
              <AnalyticsCharts type="buyinROI" data={buyinAnalytics || []} />
            </div>
            
            {/* Row 3 */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">🎯 Volume por Tipo</h3>
              <AnalyticsCharts type="category" data={categoryAnalytics || []} />
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">💵 Profit por Tipo</h3>
              <AnalyticsCharts type="categoryProfit" data={categoryAnalytics || []} />
            </div>
          </div>
        )}

        {/* ABA 3: PERÍODO E HEADS-UP */}
        {activeTab === 'period' && (
          <div className="space-y-6">
            {/* Row 1 - Análises por Dia da Semana */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📊 Volume por Dia da Semana</h3>
                <AnalyticsCharts type="dayVolume" data={dayAnalytics || []} />
              </div>
              
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">💵 Profit por Dia da Semana</h3>
                <AnalyticsCharts type="dayProfit" data={dayAnalytics || []} />
              </div>
            </div>
            
            {/* Row 2 - ROI Semanal */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">📈 ROI por Dia da Semana</h3>
              <AnalyticsCharts type="dayROI" data={dayAnalytics || []} />
            </div>
            
            {/* Row 3 - Heads-Up */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">🤝 Estatísticas Heads-Up</h3>
              

              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#24c25e] mb-2">{stats?.headsUpTotal || 0}</p>
                  <p className="text-sm text-gray-400">Total HUs</p>
                </div>
                
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#24c25e] mb-2">{stats?.headsUpWins || 0}</p>
                  <p className="text-sm text-gray-400">Vitórias</p>
                </div>
                
                <div className="text-center">
                  <p className="text-4xl font-bold text-[#24c25e] mb-2">
                    {stats?.headsUpTotal > 0 ? ((stats?.headsUpWins || 0) / stats.headsUpTotal * 100).toFixed(1) : '0.0'}%
                  </p>
                  <p className="text-sm text-gray-400">Win Rate %</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

