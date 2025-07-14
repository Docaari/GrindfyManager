import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";
import { apiRequest } from "@/lib/queryClient";
import MetricsCard from "@/components/MetricsCard";
import ProfitChart from "@/components/ProfitChart";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import TournamentTable from "@/components/TournamentTable";
// import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "@/components/DashboardFilters";
import DynamicCharts from "@/components/DynamicCharts";
import AccessDenied from "@/components/AccessDenied";
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Filter, Monitor, CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Dashboard() {
  const hasDashboardAccess = usePermission('dashboard_access');
  
  // Verificação de permissão no início
  if (!hasDashboardAccess) {
    return <AccessDenied featureName="Dashboard" description="Acesso ao dashboard de performance e analytics." />;
  }
  const [period, setPeriod] = useState("all");
  const queryClient = useQueryClient();
  
  // ETAPA 1: Nova estrutura de abas (6 → 3)
  const [activeTab, setActiveTab] = useState('evolution');
  const [showPreviousQuarter, setShowPreviousQuarter] = useState(false);
  
  // Custom date range modal state
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    from: '',
    to: ''
  });
  const [tempDateRange, setTempDateRange] = useState({
    from: '',
    to: ''
  });
  
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

  // Functions for custom date range
  const formatDateForDisplay = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });
  };

  const formatDateForInput = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  const isValidDateRange = (from: string, to: string) => {
    if (!from || !to) return false;
    return new Date(from) <= new Date(to);
  };

  const handleOpenDateModal = () => {
    const today = new Date();
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    setTempDateRange({
      from: customDateRange.from || oneMonthAgo.toISOString().split('T')[0],
      to: customDateRange.to || today.toISOString().split('T')[0]
    });
    setShowDateModal(true);
  };

  const handleApplyDateRange = () => {
    if (!isValidDateRange(tempDateRange.from, tempDateRange.to)) {
      console.log('🚨 FILTRO DEBUG - Datas inválidas:', tempDateRange);
      return;
    }
    
    console.log('🔍 FILTRO DEBUG - Aplicando filtro personalizado:', tempDateRange);
    console.log('🔍 FILTRO DEBUG - Data De:', tempDateRange.from);
    console.log('🔍 FILTRO DEBUG - Data Até:', tempDateRange.to);
    
    setCustomDateRange(tempDateRange);
    setPeriod('custom');
    setFilters(prev => {
      const newFilters = {
        ...prev,
        dateFrom: tempDateRange.from,
        dateTo: tempDateRange.to
      };
      console.log('🔍 FILTRO DEBUG - Novos filtros definidos:', newFilters);
      return newFilters;
    });
    setShowDateModal(false);
    
    console.log('🔍 FILTRO DEBUG - Período definido como:', 'custom');
    
    // Invalidar todas as queries para forçar recarregamento
    console.log('🔍 FILTRO DEBUG - Invalidando todas as queries analytics...');
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-site"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-month"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-day"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-speed"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-field"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/final-table"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-category"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-buyin"] });
    console.log('🔍 FILTRO DEBUG - Todas as queries invalidadas!');
  };

  const handleCancelDateRange = () => {
    setTempDateRange(customDateRange);
    setShowDateModal(false);
  };

  const handlePeriodChange = (newPeriod: string) => {
    console.log('🔍 FILTRO DEBUG - Período selecionado:', newPeriod);
    
    // Calcular datas para debug
    if (newPeriod !== 'custom') {
      const today = new Date();
      let startDate: Date;
      
      switch (newPeriod) {
        case '7d':
          startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0); // Para 'all'
      }
      
      if (newPeriod !== 'all') {
        console.log('🔍 FILTRO DEBUG - Data de hoje:', today.toISOString().split('T')[0]);
        console.log('🔍 FILTRO DEBUG - Data de início calculada:', startDate.toISOString().split('T')[0]);
        console.log('🔍 FILTRO DEBUG - Período em dias:', Math.floor((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
      }
    }
    
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters.dateFrom;
        delete newFilters.dateTo;
        return newFilters;
      });
    }
  };

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
      
      console.log('🔍 STATS DEBUG - Período enviado para API:', period);
      console.log('🔍 STATS DEBUG - Filtros enviados:', filters);
      console.log('🔍 STATS DEBUG - URL completa:', `/api/dashboard/stats?${params}`);
      
      // Debug detalhado dos filtros
      if (filters.sites?.length > 0) {
        console.log('🔍 FILTRO DEBUG - Sites selecionados:', filters.sites);
      }
      if (filters.categories?.length > 0) {
        console.log('🔍 FILTRO DEBUG - Categorias selecionadas:', filters.categories);
      }
      if (filters.speeds?.length > 0) {
        console.log('🔍 FILTRO DEBUG - Velocidades selecionadas:', filters.speeds);
      }
      
      const data = await apiRequest('GET', `/api/dashboard/stats?${params}`);
      
      console.log('🔍 STATS DEBUG - Dados recebidos:', data);
      console.log('🔍 STATS DEBUG - Quantidade de torneios:', data.count);
      console.log('🔍 STATS DEBUG - Mesas Finais recebidas:', data.finalTables);
      console.log('🔍 STATS DEBUG - Validação: Final Tables devem ser apenas posições 1-9');
      
      return data;
    },
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ["/api/dashboard/performance", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      return apiRequest('GET', `/api/dashboard/performance?${params}`);
    },
  });

  const { data: tournaments, isLoading: tournamentsLoading } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      return apiRequest('GET', "/api/tournaments?limit=10");
    },
  });

  // Get available filter options from all tournaments
  const { data: allTournaments } = useQuery({
    queryKey: ["/api/tournaments", "all"],
    queryFn: async () => {
      console.log('🔍 ETAPA 1 - Fazendo requisição para /api/tournaments?limit=10000');
      const data = await apiRequest('GET', "/api/tournaments?limit=10000");
      console.log('🔍 ETAPA 2 - Dados recebidos:', data);
      console.log('🔍 ETAPA 3 - Tipo dos dados:', typeof data);
      console.log('🔍 ETAPA 4 - É array?', Array.isArray(data));
      console.log('🔍 ETAPA 5 - Estrutura:', data ? Object.keys(data).slice(0, 5) : 'null/undefined');
      return data;
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
      return apiRequest('GET', `/api/tournaments?${params}`);
    },
  });

  // Debug query para verificar faixa de datas disponíveis
  const { data: dateRangeDebug } = useQuery({
    queryKey: ["/api/debug/date-range"],
    queryFn: async () => {
      const data = await apiRequest('GET', "/api/debug/date-range");
      
      console.log('🔍 DATE RANGE DEBUG - Faixa de datas disponíveis:', data);
      console.log('🔍 DATE RANGE DEBUG - Tem dados de 1 ano?', data.hasOneYearData);
      console.log('🔍 DATE RANGE DEBUG - Total de dias:', data.totalDays);
      console.log('🔍 DATE RANGE DEBUG - Data mais antiga:', data.oldestDate);
      console.log('🔍 DATE RANGE DEBUG - Data mais recente:', data.newestDate);
      
      return data;
    },
  });

  // Extract unique values for filter options with safety checks
  const availableOptions = {
    sites: Array.from(new Set(
      Array.isArray(allTournaments) 
        ? allTournaments.map((t: any) => t.site).filter(Boolean) 
        : []
    )) as string[],
    categories: Array.from(new Set(
      Array.isArray(allTournaments) 
        ? allTournaments.map((t: any) => t.category).filter(Boolean) 
        : []
    )) as string[],
    speeds: Array.from(new Set(
      Array.isArray(allTournaments) 
        ? allTournaments.map((t: any) => t.speed).filter(Boolean) 
        : []
    )) as string[]
  };



  // Advanced analytics queries with filters
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      return apiRequest('GET', `/api/analytics/by-site?${params}`);
    },
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      return apiRequest('GET', `/api/analytics/by-buyin?${params}`);
    },
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      
      console.log('🔍 CATEGORY ANALYTICS DEBUG - Período:', period);
      console.log('🔍 CATEGORY ANALYTICS DEBUG - Filtros:', filters);
      console.log('🔍 CATEGORY ANALYTICS DEBUG - URL:', `/api/analytics/by-category?${params}`);
      
      const data = await apiRequest('GET', `/api/analytics/by-category?${params}`);
      console.log('🔍 CATEGORY ANALYTICS DEBUG - Dados recebidos:', data);
      
      return data;
    },
  });

  const { data: dayAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-day", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      return apiRequest('GET', `/api/analytics/by-day?${params}`);
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
      return apiRequest('GET', `/api/analytics/by-speed?${params}`);
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
      const data = await apiRequest('GET', `/api/analytics/by-month?${params}`);
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
      return apiRequest('GET', `/api/analytics/by-field?${params}`);
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
      return apiRequest('GET', `/api/analytics/final-table?${params}`);
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
                {['7d', '30d', '90d', '365d', 'all'].map((periodOption) => (
                  <button
                    key={periodOption}
                    onClick={() => handlePeriodChange(periodOption)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      period === periodOption
                        ? 'bg-poker-green text-white shadow-md'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {periodOption === '7d' && '7 dias'}
                    {periodOption === '30d' && '30 dias'}
                    {periodOption === '90d' && '90 dias'}
                    {periodOption === '365d' && '1 ano'}
                    {periodOption === 'all' && 'Todos'}
                  </button>
                ))}
                
                {/* Custom Date Range Button */}
                <Dialog open={showDateModal} onOpenChange={setShowDateModal}>
                  <DialogTrigger asChild>
                    <button
                      onClick={handleOpenDateModal}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                        period === 'custom'
                          ? 'bg-poker-green text-white shadow-md'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      <CalendarIcon className="h-4 w-4" />
                      {period === 'custom' && customDateRange.from && customDateRange.to 
                        ? `De ${formatDateForDisplay(customDateRange.from)} até ${formatDateForDisplay(customDateRange.to)}`
                        : 'De X até Y'
                      }
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-900 border-gray-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">Período Personalizado</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            De:
                          </label>
                          <div className="relative">
                            <Input
                              type="date"
                              value={tempDateRange.from}
                              onChange={(e) => setTempDateRange(prev => ({ ...prev, from: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white focus:border-poker-green"
                            />
                            <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Até:
                          </label>
                          <div className="relative">
                            <Input
                              type="date"
                              value={tempDateRange.to}
                              onChange={(e) => setTempDateRange(prev => ({ ...prev, to: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white focus:border-poker-green"
                            />
                            <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      
                      {/* Validation Message */}
                      {tempDateRange.from && tempDateRange.to && !isValidDateRange(tempDateRange.from, tempDateRange.to) && (
                        <p className="text-red-400 text-sm">
                          A data "De" não pode ser maior que a data "Até"
                        </p>
                      )}
                      
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={handleCancelDateRange}
                          className="bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleApplyDateRange}
                          disabled={!isValidDateRange(tempDateRange.from, tempDateRange.to)}
                          className="bg-poker-green text-white hover:bg-poker-green/90 disabled:opacity-50"
                        >
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
      {/* LINHA 1 - MÉTRICAS DE VOLUME (Azul) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Contagem</p>
              <p className="text-3xl font-bold text-white">{stats?.count || 0}</p>
            </div>
            <Trophy className="h-8 w-8 text-blue-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Reentradas</p>
              <p className="text-3xl font-bold text-white">{stats?.reentries || 0}</p>
            </div>
            <Coins className="h-8 w-8 text-blue-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Dias Jogados</p>
              <p className="text-3xl font-bold text-white">{stats?.daysPlayed || 0}</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Média Part</p>
              <p className="text-3xl font-bold text-white">{Math.round(stats?.avgFieldSize || 0)}</p>
            </div>
            <Trophy className="h-8 w-8 text-blue-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">ABI</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(stats?.abi || 0)}</p>
            </div>
            <Target className="h-8 w-8 text-blue-400" />
          </div>
        </Card>
      </div>
      {/* LINHA 2 - MÉTRICAS FINANCEIRAS (Verde) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Lucro</p>
              <p className={`text-3xl font-bold ${(stats?.profit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(stats?.profit || 0)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">ROI</p>
              <p className={`text-3xl font-bold ${(stats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercentage(stats?.roi || 0)}
              </p>
            </div>
            <Percent className="h-8 w-8 text-green-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Lucro por Dia</p>
              <p className={`text-3xl font-bold ${(stats?.avgProfitPerDay || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerDay || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {formatCurrency(stats?.avgProfitPerDay || 0)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Lucro Médio</p>
              <p className={`text-3xl font-bold ${(stats?.avgProfitPerTournament || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerTournament || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {formatCurrency(stats?.avgProfitPerTournament || 0)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-400" />
          </div>
        </Card>

        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Maior Resultado</p>
              <p className={`text-3xl font-bold ${(stats?.biggestPrize || 0) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {formatCurrency(stats?.biggestPrize || 0)}
              </p>
            </div>
            <Trophy className="h-8 w-8 text-green-400" />
          </div>
        </Card>
      </div>
      {/* LINHA 3 - MÉTRICAS DE PERFORMANCE (Amarelo) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">ITM</p>
              <p className="text-3xl font-bold text-white">{formatPercentage(stats?.itm || 0)}</p>
            </div>
            <Award className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Final. Precoce</p>
              <p className="text-3xl font-bold text-white">{formatPercentage(stats?.earlyFinishRate || 0)}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Final. Tardia</p>
              <p className="text-3xl font-bold text-white">{formatPercentage(stats?.lateFinishRate || 0)}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Mesas Finais</p>
              <p className="text-3xl font-bold text-white">{stats?.finalTables || 0}</p>
            </div>
            <Award className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Cravadas</p>
              <p className="text-3xl font-bold text-white">{stats?.firstPlaceCount || 0}</p>
            </div>
            <Trophy className="h-8 w-8 text-yellow-400" />
          </div>
        </Card>
      </div>
      {/* LINHA 4 - MÉTRICAS DE CATEGORIAS (Vermelho/Roxo) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Vanilla</p>
              <p className="text-3xl font-bold text-white">
                {(() => {
                  // Se há filtro de categoria ativo e "Vanilla" não está incluído, retorna 0
                  if (filters.categories?.length > 0 && !filters.categories.includes('Vanilla')) {
                    console.log('🔍 CARD DEBUG - Vanilla: Filtro ativo, mas Vanilla não selecionado = 0');
                    return 0;
                  }
                  const value = categoryAnalytics?.find(c => c.category === 'Vanilla')?.volume || 0;
                  console.log('🔍 CARD DEBUG - Vanilla: Valor do categoryAnalytics =', value);
                  return value;
                })()}
              </p>
            </div>
            <div className="text-3xl text-red-400">🎯</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">PKO</p>
              <p className="text-3xl font-bold text-white">
                {(() => {
                  // Se há filtro de categoria ativo e "PKO" não está incluído, retorna 0
                  if (filters.categories?.length > 0 && !filters.categories.includes('PKO')) {
                    console.log('🔍 CARD DEBUG - PKO: Filtro ativo, mas PKO não selecionado = 0');
                    return 0;
                  }
                  const value = categoryAnalytics?.find(c => c.category === 'PKO')?.volume || 0;
                  console.log('🔍 CARD DEBUG - PKO: Valor do categoryAnalytics =', value);
                  return value;
                })()}
              </p>
            </div>
            <div className="text-3xl text-red-400">🎖️</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Mystery</p>
              <p className="text-3xl font-bold text-white">
                {(() => {
                  // Se há filtro de categoria ativo e "Mystery" não está incluído, retorna 0
                  if (filters.categories?.length > 0 && !filters.categories.includes('Mystery')) {
                    console.log('🔍 CARD DEBUG - Mystery: Filtro ativo, mas Mystery não selecionado = 0');
                    return 0;
                  }
                  const value = categoryAnalytics?.find(c => c.category === 'Mystery')?.volume || 0;
                  console.log('🔍 CARD DEBUG - Mystery: Valor do categoryAnalytics =', value);
                  return value;
                })()}
              </p>
            </div>
            <div className="text-3xl text-red-400">🎁</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Normal</p>
              <p className="text-3xl font-bold text-white">
                {(() => {
                  // Se há filtro de velocidade ativo e "Normal" não está incluído, retorna 0
                  if (filters.speeds?.length > 0 && !filters.speeds.includes('Normal')) {
                    console.log('🔍 CARD DEBUG - Normal: Filtro ativo, mas Normal não selecionado = 0');
                    return 0;
                  }
                  const value = Number(speedAnalytics?.find(s => s.speed === 'Normal')?.volume || 0);
                  console.log('🔍 CARD DEBUG - Normal: Valor do speedAnalytics =', value);
                  return value;
                })()}
              </p>
            </div>
            <div className="text-3xl text-purple-400">⏰</div>
          </div>
        </Card>
        
        <Card className="bg-poker-surface border-gray-700 p-6 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Turbo/Hyper</p>
              <p className="text-3xl font-bold text-white">
                {(() => {
                  let turboValue = 0;
                  let hyperValue = 0;
                  
                  // Verificar se há filtro de velocidade ativo
                  if (filters.speeds?.length > 0) {
                    // Se "Turbo" está incluído no filtro, pega valor do speedAnalytics
                    if (filters.speeds.includes('Turbo')) {
                      turboValue = Number(speedAnalytics?.find(s => s.speed === 'Turbo')?.volume || 0);
                    }
                    // Se "Hyper" está incluído no filtro, pega valor do speedAnalytics
                    if (filters.speeds.includes('Hyper')) {
                      hyperValue = Number(speedAnalytics?.find(s => s.speed === 'Hyper')?.volume || 0);
                    }
                  } else {
                    // Se não há filtro de velocidade, pega ambos os valores
                    turboValue = Number(speedAnalytics?.find(s => s.speed === 'Turbo')?.volume || 0);
                    hyperValue = Number(speedAnalytics?.find(s => s.speed === 'Hyper')?.volume || 0);
                  }
                  
                  const totalValue = turboValue + hyperValue;
                  console.log('🔍 CARD DEBUG - Turbo/Hyper: Turbo =', turboValue, ', Hyper =', hyperValue, ', Total =', totalValue);
                  return totalValue;
                })()}
              </p>
            </div>
            <div className="text-3xl text-purple-400">⚡</div>
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
                    <CardTitle className="text-white">
                      {filters.dateFrom && filters.dateTo 
                        ? `Período: ${new Date(filters.dateFrom).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${new Date(filters.dateTo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                        : period === '7d' ? 'Últimos 7 Dias'
                        : period === '30d' ? 'Últimos 30 Dias'
                        : period === '90d' ? 'Últimos 90 Dias'
                        : period === '365d' ? 'Últimos 365 Dias'
                        : period === 'month' ? 'Mês Atual'
                        : period === 'year' ? 'Ano Atual'
                        : period === 'all' ? 'Todos os Torneios'
                        : 'Torneios Recentes'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-96 overflow-y-auto">
                      <TournamentTable tournaments={filteredTournaments || []} />
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
                      ⚡ Eliminação por Field
                    </CardTitle>
                    <CardDescription className="text-gray-400">Frequência de eliminação por faixa percentual</CardDescription>
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