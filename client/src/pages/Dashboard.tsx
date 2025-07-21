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
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Calendar, Filter, Monitor, CalendarIcon, X, ChevronUp, ChevronDown, Users, Zap } from "lucide-react";
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
    participantMin?: number;
    participantMax?: number;
    profileBased?: boolean;
  }>({});

  // Temporary filter states for text filters (not applied until button click)
  const [tempKeyword, setTempKeyword] = useState('');
  const [tempKeywordType, setTempKeywordType] = useState<'contains' | 'not_contains'>('contains');
  const [tempParticipantRange, setTempParticipantRange] = useState({ min: '', max: '' });

  // Profile-based filtering toggle
  const [profileBasedMode, setProfileBasedMode] = useState(false);
  
  // Collapsible filter section state
  const [filtersExpanded, setFiltersExpanded] = useState(true);

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
      return;
    }
    
    setCustomDateRange(tempDateRange);
    setPeriod('custom');
    setFilters(prev => ({
      ...prev,
      dateFrom: tempDateRange.from,
      dateTo: tempDateRange.to
    }));
    setShowDateModal(false);
    
    // Invalidar queries principais apenas - mais eficiente
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
  };

  const handleCancelDateRange = () => {
    setTempDateRange(customDateRange);
    setShowDateModal(false);
  };

  const handlePeriodChange = (newPeriod: string) => {
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

  // Quick participant filter handlers - immediate application
  const handleParticipantQuickFilter = (min: number, max?: number) => {
    setFilters(prev => ({
      ...prev,
      participantMin: min,
      participantMax: max
    }));
  };

  // Text filter application handler
  const applyTextFilter = () => {
    if (tempKeyword.trim()) {
      setFilters(prev => ({
        ...prev,
        keyword: tempKeyword.trim(),
        keywordType: tempKeywordType
      }));
    }
  };

  // Manual participant range application handler
  const applyParticipantRange = () => {
    const min = tempParticipantRange.min ? parseInt(tempParticipantRange.min) : undefined;
    const max = tempParticipantRange.max ? parseInt(tempParticipantRange.max) : undefined;
    
    if (min || max) {
      setFilters(prev => ({
        ...prev,
        participantMin: min,
        participantMax: max
      }));
    }
  };

  // Remove specific filter tag
  const removeFilterTag = (filterType: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (filterType === 'keyword') {
        delete newFilters.keyword;
        delete newFilters.keywordType;
        setTempKeyword('');
      } else if (filterType === 'participants') {
        delete newFilters.participantMin;
        delete newFilters.participantMax;
        setTempParticipantRange({ min: '', max: '' });
      }
      return newFilters;
    });
  };

  // ETAPA 1: Configuração das novas abas
  // NOVA ESTRUTURA: 7 abas individuais com design moderno Grade page
  const dashboardTabs = [
    {
      id: 'evolution',
      name: 'Evolução',
      icon: TrendingUp,
      emoji: '📈',
      active: activeTab === 'evolution'
    },
    {
      id: 'por-site',
      name: 'Por Site',
      icon: Monitor,
      emoji: '🌐',
      active: activeTab === 'por-site'
    },
    {
      id: 'por-abi',
      name: 'Por ABI',
      icon: DollarSign,
      emoji: '💰',
      active: activeTab === 'por-abi'
    },
    {
      id: 'por-tipo',
      name: 'Por Tipo',
      icon: Target,
      emoji: '🏷️',
      active: activeTab === 'por-tipo'
    },
    {
      id: 'velocidade',
      name: 'Velocidade',
      icon: Zap,
      emoji: '⚡',
      active: activeTab === 'velocidade'
    },
    {
      id: 'por-periodo',
      name: 'Por Período',
      icon: Calendar,
      emoji: '📅',
      active: activeTab === 'por-periodo'
    },
    {
      id: 'por-participantes',
      name: 'Por Participantes',
      icon: Users,
      emoji: '👥',
      active: activeTab === 'por-participantes'
    },
    {
      id: 'por-posicao',
      name: 'Por Posição',
      icon: Trophy,
      emoji: '🥇',
      active: activeTab === 'por-posicao'
    }
  ];

  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: [profileBasedMode ? "/api/analytics/profile-dashboard-stats" : "/api/dashboard/stats", period, filters, profileBasedMode],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      
      // Choose endpoint based on mode
      const endpoint = profileBasedMode 
        ? `/api/analytics/profile-dashboard-stats?${params}`
        : `/api/dashboard/stats?${params}`;
      
      return await apiRequest('GET', endpoint);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const { data: tournaments, isLoading: tournamentsLoading } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      return apiRequest('GET', "/api/tournaments?limit=10");
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - dados menos dinâmicos
  });

  // Get available filter options from all tournaments
  const { data: allTournaments } = useQuery({
    queryKey: ["/api/tournaments", "all"],
    queryFn: async () => {
      return apiRequest('GET', "/api/tournaments?limit=10000");
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - dados para filtros, menos dinâmicos
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
    staleTime: 1 * 60 * 1000, // 1 minute - dados filtrados são mais dinâmicos
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
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      
      return apiRequest('GET', `/api/analytics/by-category?${params}`);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // ETAPA 5: Analytics mensais
  const { data: monthAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-month", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        filters: JSON.stringify(filters)
      });
      return apiRequest('GET', `/api/analytics/by-month?${params}`);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    staleTime: 2 * 60 * 1000, // 2 minutes
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
      {/* Filtros Modernos - Seção Colapsável */}
      <div className="bg-gradient-to-br from-poker-surface/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl mb-8 shadow-xl">
        {/* Header fixo - sempre visível */}
        <div className="p-8 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-poker-green/20 rounded-lg">
                <Filter className="h-5 w-5 text-poker-green" />
              </div>
              <h3 className="text-lg font-semibold text-white">Filtros de Analytics</h3>
            </div>
            
            {/* Contador de Filtros Ativos */}
            {Object.keys(filters).filter(key => {
              const value = filters[key as keyof typeof filters];
              return value && (Array.isArray(value) ? value.length > 0 : true);
            }).length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-poker-green/20 px-3 py-1.5 rounded-lg border border-poker-green/30">
                  <div className="w-2 h-2 bg-poker-green rounded-full animate-pulse"></div>
                  <span className="text-sm text-poker-green font-medium">
                    {Object.keys(filters).filter(key => {
                      const value = filters[key as keyof typeof filters];
                      return value && (Array.isArray(value) ? value.length > 0 : true);
                    }).length} filtros ativos
                  </span>
                </div>
                <button
                  onClick={() => setFilters({})}
                  className="px-4 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 border border-red-700/30 rounded-lg transition-all duration-200 hover:scale-105"
                >
                  Limpar Todos
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Conteúdo dos filtros - colapsável */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-8 pb-6 space-y-6">

          {/* Card de Período - Modernizado */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700/50 rounded-xl p-8 mb-12 shadow-2xl">
            <div className="mb-6">
              <h4 className="text-lg font-bold text-white flex items-center gap-3">
                ⚡ Período de Análise
              </h4>
              <p className="text-gray-400 text-sm mt-1">Selecione o período para visualização das métricas</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { key: 'current_month', label: 'Mês Atual' },
                { key: 'last_3_months', label: 'Últimos 3M' },
                { key: 'last_6_months', label: 'Últimos 6M' },
                { key: 'current_year', label: 'Ano Atual' },
                { key: 'last_12_months', label: 'Últimos 12M' },
                { key: 'last_24_months', label: 'Últimos 24M' },
                { key: 'last_36_months', label: 'Últimos 36M' },
                { key: 'all', label: 'Tudo' }
              ].map((periodOption) => (
                <button
                  key={periodOption.key}
                  onClick={() => handlePeriodChange(periodOption.key)}
                  className={`px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 border transform ${
                    period === periodOption.key
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-emerald-500 shadow-xl shadow-emerald-500/30 scale-110'
                      : 'bg-gray-800/70 text-gray-300 border-gray-600/50 hover:bg-gray-700/70 hover:text-white hover:border-gray-500 hover:scale-105 hover:shadow-lg'
                  }`}
                >
                  {periodOption.label}
                </button>
              ))}
              
              {/* Custom Date Range */}
              <Dialog open={showDateModal} onOpenChange={setShowDateModal}>
                <DialogTrigger asChild>
                  <button
                    onClick={handleOpenDateModal}
                    className={`px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 border flex items-center gap-2 transform ${
                      period === 'custom'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500 shadow-xl shadow-blue-500/30 scale-110'
                        : 'bg-gray-800/70 text-gray-300 border-gray-600/50 hover:bg-gray-700/70 hover:text-white hover:border-gray-500 hover:scale-105 hover:shadow-lg'
                    }`}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {period === 'custom' && customDateRange.from && customDateRange.to 
                      ? `${formatDateForDisplay(customDateRange.from)} - ${formatDateForDisplay(customDateRange.to)}`
                      : 'Personalizado'
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

          {/* Filtros Rápidos - Multiple Choice */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card Sites */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Sites de Poker
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
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
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                      (filters.sites || []).includes(site)
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500 shadow-md shadow-blue-500/20' 
                        : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {site}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Categories */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  Categorias
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
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
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                      (filters.categories || []).includes(category)
                        ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white border-orange-500 shadow-md shadow-orange-500/20' 
                        : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Speeds */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  Velocidades
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
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
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                      (filters.speeds || []).includes(speed)
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white border-purple-500 shadow-md shadow-purple-500/20' 
                        : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filtros de Participantes */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                Filtros por Participantes
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '<100', min: 0, max: 99 },
                { label: '100-300', min: 100, max: 300 },
                { label: '300-700', min: 300, max: 700 },
                { label: '700-1500', min: 700, max: 1500 },
                { label: '1500-3000', min: 1500, max: 3000 },
                { label: '3000-6000', min: 3000, max: 6000 },
                { label: '6000-12000', min: 6000, max: 12000 },
                { label: '12000+', min: 12000 }
              ].map((range) => (
                <button
                  key={range.label}
                  onClick={() => handleParticipantQuickFilter(range.min, range.max)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    (filters.participantMin === range.min && filters.participantMax === range.max) ||
                    (filters.participantMin === range.min && !range.max && !filters.participantMax)
                      ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border-cyan-500 shadow-md shadow-cyan-500/20' 
                      : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtros Especiais - Texto e Range Manual */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card Filtro de Texto */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Busca por Palavra-chave
                </h4>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={tempKeywordType}
                    onChange={(e) => setTempKeywordType(e.target.value as 'contains' | 'not_contains')}
                    className="bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none transition-colors"
                  >
                    <option value="contains">Contém</option>
                    <option value="not_contains">Não Contém</option>
                  </select>
                  <input
                    type="text"
                    value={tempKeyword}
                    onChange={(e) => setTempKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyTextFilter()}
                    placeholder="Digite o texto para buscar..."
                    className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:border-green-500 focus:outline-none transition-colors"
                  />
                </div>
                <button
                  onClick={applyTextFilter}
                  disabled={!tempKeyword.trim()}
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white font-medium rounded-lg hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 shadow-lg disabled:shadow-none"
                >
                  {tempKeyword.trim() ? 'Aplicar Filtro de Texto' : 'Digite uma palavra-chave'}
                </button>
              </div>
            </div>

            {/* Card Range Manual de Participantes */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-600/50 rounded-xl p-5">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  Range Manual de Participantes
                </h4>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={tempParticipantRange.min}
                    onChange={(e) => setTempParticipantRange(prev => ({ ...prev, min: e.target.value }))}
                    placeholder="Mínimo"
                    className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none transition-colors"
                    min="0"
                  />
                  <span className="text-gray-400 text-sm font-medium">até</span>
                  <input
                    type="number"
                    value={tempParticipantRange.max}
                    onChange={(e) => setTempParticipantRange(prev => ({ ...prev, max: e.target.value }))}
                    placeholder="Máximo"
                    className="flex-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none transition-colors"
                    min="1"
                  />
                </div>
                <button
                  onClick={applyParticipantRange}
                  disabled={!tempParticipantRange.min && !tempParticipantRange.max}
                  className="w-full px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white font-medium rounded-lg hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 shadow-lg disabled:shadow-none"
                >
                  {(tempParticipantRange.min || tempParticipantRange.max) ? 'Aplicar Range Manual' : 'Digite valores mín/máx'}
                </button>
              </div>
            </div>
          </div>

          {/* Tags de Filtros Especiais Ativos */}
          {(filters.keyword || (filters.participantMin !== undefined || filters.participantMax !== undefined)) && (
            <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-600/40 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-poker-green rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-gray-300">Filtros Especiais Ativos:</span>
                </div>
                
                {filters.keyword && (
                  <div className="flex items-center gap-2 bg-gradient-to-r from-green-600/30 to-green-700/30 border border-green-500/40 rounded-lg px-4 py-2 shadow-lg shadow-green-500/10">
                    <span className="text-sm font-medium text-green-200">
                      {filters.keywordType === 'contains' ? 'Contém' : 'Não Contém'}: "{filters.keyword}"
                    </span>
                    <button
                      onClick={() => removeFilterTag('keyword')}
                      className="text-green-300 hover:text-red-400 transition-colors duration-200 font-bold text-lg"
                    >
                      ×
                    </button>
                  </div>
                )}
                
                {(filters.participantMin !== undefined || filters.participantMax !== undefined) && (
                  <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-600/30 to-yellow-700/30 border border-yellow-500/40 rounded-lg px-4 py-2 shadow-lg shadow-yellow-500/10">
                    <span className="text-sm font-medium text-yellow-200">
                      Range Manual: {filters.participantMin || '0'} - {filters.participantMax || '∞'}
                    </span>
                    <button
                      onClick={() => removeFilterTag('participants')}
                      className="text-yellow-300 hover:text-red-400 transition-colors duration-200 font-bold text-lg"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Botão de Toggle para Expandir/Colapsar */}
        <div className="flex justify-center p-4 pt-0">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="group flex items-center justify-center w-16 h-10 bg-gradient-to-r from-poker-surface/70 to-gray-800/70 backdrop-blur-sm border border-gray-600/50 rounded-lg hover:from-poker-surface/90 hover:to-gray-800/90 hover:border-gray-500/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-poker-green/10"
          >
            {filtersExpanded ? (
              <ChevronUp className="h-6 w-6 text-gray-300 group-hover:text-poker-green transition-all duration-300 transform group-hover:scale-110" />
            ) : (
              <ChevronDown className="h-6 w-6 text-gray-300 group-hover:text-poker-green transition-all duration-300 transform group-hover:scale-110" />
            )}
          </button>
        </div>
      </div>

      {/* LINHA 1 - MÉTRICAS DE VOLUME (Azul) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.count || 0}
          </div>
          <div className="weekly-card-label">Contagem</div>
          <div className="weekly-card-sublabel">Torneios</div>
        </div>
        
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Coins className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.reentries || 0}
          </div>
          <div className="weekly-card-label">Reentradas</div>
          <div className="weekly-card-sublabel">Total</div>
        </div>
        
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Calendar className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {stats?.daysPlayed || 0}
          </div>
          <div className="weekly-card-label">Dias Jogados</div>
          <div className="weekly-card-sublabel">Sessões</div>
        </div>
        
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Users className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {Math.round(stats?.avgFieldSize || 0)}
          </div>
          <div className="weekly-card-label">Média Part</div>
          <div className="weekly-card-sublabel">Estimativa</div>
        </div>
        
        <div className="weekly-summary-card metric-volume">
          <div className="weekly-card-icon text-blue-400">
            <Target className="h-8 w-8" />
          </div>
          <div className="weekly-card-value">
            {formatCurrency(stats?.abi || 0)}
          </div>
          <div className="weekly-card-label">ABI</div>
          <div className="weekly-card-sublabel">Médio</div>
        </div>
      </div>
      {/* LINHA 2 - MÉTRICAS FINANCEIRAS (Verde) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <DollarSign className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.profit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(stats?.profit || 0)}
          </div>
          <div className="weekly-card-label">Lucro</div>
          <div className="weekly-card-sublabel">Total</div>
        </div>
        
        <div className="weekly-summary-card metric-roi">
          <div className="weekly-card-icon text-green-400">
            <Percent className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPercentage(stats?.roi || 0)}
          </div>
          <div className="weekly-card-label">ROI</div>
          <div className="weekly-card-sublabel">Retorno</div>
        </div>
        
        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <TrendingUp className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.avgProfitPerDay || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerDay || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.avgProfitPerDay || 0)}
          </div>
          <div className="weekly-card-label">Lucro por Dia</div>
          <div className="weekly-card-sublabel">Médio</div>
        </div>
        
        <div className="weekly-summary-card metric-profit">
          <div className="weekly-card-icon text-green-400">
            <BarChart3 className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.avgProfitPerTournament || 0) > 0 ? 'text-green-400' : (stats?.avgProfitPerTournament || 0) < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.avgProfitPerTournament || 0)}
          </div>
          <div className="weekly-card-label">Lucro Médio</div>
          <div className="weekly-card-sublabel">Torneio</div>
        </div>

        <div className="weekly-summary-card metric-wins">
          <div className="weekly-card-icon text-green-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className={`weekly-card-value ${(stats?.biggestPrize || 0) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
            {formatCurrency(stats?.biggestPrize || 0)}
          </div>
          <div className="weekly-card-label">Maior Resultado</div>
          <div className="weekly-card-sublabel">Recorde</div>
        </div>
      </div>
      {/* LINHA 3 - MÉTRICAS DE PERFORMANCE (Amarelo) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-fts">
          <div className="weekly-card-icon text-yellow-400">
            <Award className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.itm || 0)}
          </div>
          <div className="weekly-card-label">ITM</div>
          <div className="weekly-card-sublabel">In The Money</div>
        </div>
        
        <div className="weekly-summary-card metric-finish-rate">
          <div className="weekly-card-icon text-yellow-400">
            <Clock className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.earlyFinishRate || 0)}
          </div>
          <div className="weekly-card-label">Final. Precoce</div>
          <div className="weekly-card-sublabel">Early Finish</div>
        </div>
        
        <div className="weekly-summary-card metric-finish-rate">
          <div className="weekly-card-icon text-yellow-400">
            <Clock className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {formatPercentage(stats?.lateFinishRate || 0)}
          </div>
          <div className="weekly-card-label">Final. Tardia</div>
          <div className="weekly-card-sublabel">Late Finish</div>
        </div>
        
        <div className="weekly-summary-card metric-fts">
          <div className="weekly-card-icon text-yellow-400">
            <Award className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {stats?.finalTables || 0}
          </div>
          <div className="weekly-card-label">Mesas Finais</div>
          <div className="weekly-card-sublabel">Final Tables</div>
        </div>
        
        <div className="weekly-summary-card metric-wins">
          <div className="weekly-card-icon text-yellow-400">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="weekly-card-value text-yellow-400">
            {stats?.firstPlaceCount || 0}
          </div>
          <div className="weekly-card-label">Cravadas</div>
          <div className="weekly-card-sublabel">Vitórias</div>
        </div>
      </div>
      {/* LINHA 4 - MÉTRICAS DE CATEGORIAS (Vermelho/Roxo) */}
      <div className="dashboard-summary grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <div className="weekly-summary-card metric-vanilla">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎯</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              // Se há filtro de categoria ativo e "Vanilla" não está incluído, retorna 0
              if (filters.categories?.length > 0 && !filters.categories.includes('Vanilla')) {
                return 0;
              }
              return Array.isArray(categoryAnalytics) ? categoryAnalytics.find(c => c.category === 'Vanilla')?.volume || 0 : 0;
            })()}
          </div>
          <div className="weekly-card-label">Vanilla</div>
          <div className="weekly-card-sublabel">Torneios</div>
        </div>
        
        <div className="weekly-summary-card metric-pko">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎖️</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              // Se há filtro de categoria ativo e "PKO" não está incluído, retorna 0
              if (filters.categories?.length > 0 && !filters.categories.includes('PKO')) {
                return 0;
              }
              return Array.isArray(categoryAnalytics) ? categoryAnalytics.find(c => c.category === 'PKO')?.volume || 0 : 0;
            })()}
          </div>
          <div className="weekly-card-label">PKO</div>
          <div className="weekly-card-sublabel">Progressive</div>
        </div>
        
        <div className="weekly-summary-card metric-mystery">
          <div className="weekly-card-icon">
            <div className="text-3xl text-red-400">🎁</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              // Se há filtro de categoria ativo e "Mystery" não está incluído, retorna 0
              if (filters.categories?.length > 0 && !filters.categories.includes('Mystery')) {
                return 0;
              }
              return Array.isArray(categoryAnalytics) ? categoryAnalytics.find(c => c.category === 'Mystery')?.volume || 0 : 0;
            })()}
          </div>
          <div className="weekly-card-label">Mystery</div>
          <div className="weekly-card-sublabel">Mystery</div>
        </div>
        
        <div className="weekly-summary-card metric-normal">
          <div className="weekly-card-icon">
            <div className="text-3xl text-purple-400">⏰</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              // Se há filtro de velocidade ativo e "Normal" não está incluído, retorna 0
              if (filters.speeds?.length > 0 && !filters.speeds.includes('Normal')) {
                return 0;
              }
              return Array.isArray(speedAnalytics) ? Number(speedAnalytics.find(s => s.speed === 'Normal')?.volume || 0) : 0;
            })()}
          </div>
          <div className="weekly-card-label">Normal</div>
          <div className="weekly-card-sublabel">Velocidade</div>
        </div>
        
        <div className="weekly-summary-card metric-turbo">
          <div className="weekly-card-icon">
            <div className="text-3xl text-purple-400">⚡</div>
          </div>
          <div className="weekly-card-value">
            {(() => {
              let turboValue = 0;
              let hyperValue = 0;
              
              // Verificar se há filtro de velocidade ativo
              if (filters.speeds?.length > 0) {
                // Se "Turbo" está incluído no filtro, pega valor do speedAnalytics
                if (filters.speeds.includes('Turbo')) {
                  turboValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find(s => s.speed === 'Turbo')?.volume || 0) : 0;
                }
                // Se "Hyper" está incluído no filtro, pega valor do speedAnalytics
                if (filters.speeds.includes('Hyper')) {
                  hyperValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find(s => s.speed === 'Hyper')?.volume || 0) : 0;
                }
              } else {
                // Se não há filtro de velocidade, pega ambos os valores
                turboValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find(s => s.speed === 'Turbo')?.volume || 0) : 0;
                hyperValue = Array.isArray(speedAnalytics) ? Number(speedAnalytics.find(s => s.speed === 'Hyper')?.volume || 0) : 0;
              }
              
              return turboValue + hyperValue;
            })()}
          </div>
          <div className="weekly-card-label">Turbo/Hyper</div>
          <div className="weekly-card-sublabel">Velocidade</div>
        </div>
      </div>
      {/* Dashboard Tabs - Design Moderno Grade Page */}
      <div className="mt-8">
        <div className="dashboard-tabs flex flex-wrap gap-4 mb-12">
          {dashboardTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`chart-tab-button ${tab.active ? 'active' : ''}`}
            >
              <span className="text-lg mr-3">{tab.emoji}</span>
              <tab.icon className="h-5 w-5 mr-3" />
              <span className="font-semibold">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content - 7 Individual Tabs */}
        <div className="space-y-6">
          {activeTab === 'evolution' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">📈 Evolução da Performance</h3>
              <div className="space-y-12">
                {/* Evolução do Lucro - Container Principal */}
                <div className="profit-chart-container">
                  <ProfitChart 
                    data={performance || []} 
                    tournaments={filteredTournaments || []} 
                  />
                </div>

                {/* Tabela de Torneios - Container Separado */}
                <div className="tournament-table-section">
                  <Card className="tournament-table-card">
                    <CardHeader className="tournament-table-header">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-4">
                        <span className="text-3xl">🏆</span>
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
                      <CardDescription className="text-gray-300 text-lg">
                        Histórico detalhado de torneios do período selecionado
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="tournament-table-content">
                      <div className="tournament-table-wrapper">
                        <TournamentTable tournaments={filteredTournaments || []} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'por-site' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-8">🌐 Análise Por Site</h3>
              <div className="space-y-8">
                {/* Primeira linha: Volume e Profit */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">📊</span>
                        Volume por Site
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Distribuição de torneios por site de poker
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[400px]">
                        <AnalyticsCharts type="siteVolume" data={siteAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">💰</span>
                        Profit por Site
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Lucro total por site de poker
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[400px]">
                        <AnalyticsCharts type="siteProfit" data={siteAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Segunda linha: Evolução do Profit por Site */}
                <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
                  <CardHeader className="pb-6">
                    <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                      <span className="text-3xl">📈</span>
                      Evolução do Profit por Site
                    </CardTitle>
                    <CardDescription className="text-gray-300 text-base">
                      Evolução temporal do lucro acumulado por site de poker
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[450px]">
                      <AnalyticsCharts type="siteEvolution" data={siteAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'por-abi' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-8">💰 Análise Por ABI</h3>
              <div className="space-y-8">
                {/* Primeira linha: 4 gráficos em layout 2x2 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Volume por Buy-in */}
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">📊</span>
                        Volume por ABI
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Distribuição de torneios por faixa de buy-in
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[350px]">
                        <AnalyticsCharts type="buyinVolume" data={buyinAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Profit por ABI com valores escritos */}
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">💰</span>
                        Profit por ABI
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Lucro total por faixa de buy-in com valores
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[350px]">
                        <AnalyticsCharts type="buyinProfitWithValues" data={buyinAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* ROI por ABI */}
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">📈</span>
                        ROI por ABI
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Retorno sobre investimento por faixa de buy-in
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[350px]">
                        <AnalyticsCharts type="buyinROI" data={buyinAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Lucro Médio por ABI com valores escritos */}
                  <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
                    <CardHeader className="pb-6">
                      <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">💵</span>
                        Lucro Médio por ABI
                      </CardTitle>
                      <CardDescription className="text-gray-300 text-base">
                        Lucro médio por torneio em cada faixa de buy-in
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="h-[350px]">
                        <AnalyticsCharts type="buyinAvgProfitWithValues" data={buyinAnalytics || []} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Segunda linha: Evolução do ABI Médio - Full Width */}
                <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10">
                  <CardHeader className="pb-6">
                    <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
                      <span className="text-3xl">📊</span>
                      Evolução do ABI Médio
                    </CardTitle>
                    <CardDescription className="text-gray-300 text-base">
                      Evolução temporal do ABI médio jogado ao longo dos meses
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[400px]">
                      <AnalyticsCharts type="abiEvolution" data={buyinAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'por-tipo' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">🏷️ Análise Por Tipo</h3>
              <div className="space-y-8">
                {/* Container Principal com Design Moderno - Layout 2x2 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Volume por Tipo - Pizza Chart */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">🥧 Volume por Tipo</h3>
                          <p className="text-gray-400 text-sm mt-1">Distribuição de torneios por categoria</p>
                        </div>
                        <div className="text-3xl opacity-50">🎯</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="categoryVolume" data={categoryAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* Profit por Tipo - Barras com valores escritos */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">💰 Profit por Tipo</h3>
                          <p className="text-gray-400 text-sm mt-1">Lucro total por categoria com valores nas barras</p>
                        </div>
                        <div className="text-3xl opacity-50">💵</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="categoryProfit" data={categoryAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* ROI por Tipo - Barras */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">📊 ROI por Tipo</h3>
                          <p className="text-gray-400 text-sm mt-1">Percentual de retorno por categoria</p>
                        </div>
                        <div className="text-3xl opacity-50">📈</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="categoryROI" data={categoryAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* Lucro Médio por Tipo - Barras com valores escritos */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">🎯 Lucro Médio por Tipo</h3>
                          <p className="text-gray-400 text-sm mt-1">Profit médio por torneio com valores nas barras</p>
                        </div>
                        <div className="text-3xl opacity-50">📊</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="categoryAvgProfit" data={categoryAnalytics || []} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evolução do Profit por Tipo - Full Width */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                  <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">📈 Evolução do Profit por Tipo</h3>
                        <p className="text-gray-400 text-sm mt-2">Progressão temporal do lucro por categoria (múltiplas linhas)</p>
                      </div>
                      <div className="text-4xl opacity-50">📊</div>
                    </div>
                    <div className="h-[400px]">
                      <AnalyticsCharts type="categoryEvolution" data={categoryAnalytics || []} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'velocidade' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">⚡ Análise de Velocidade</h3>
              <div className="space-y-8">
                {/* Container Principal com Design Moderno - Layout 2x2 + Full Width */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Volume por Velocidade - Pizza Chart */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-blue-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">📊 Volume por Velocidade</h3>
                          <p className="text-gray-400 text-sm mt-1">Distribuição de torneios por tipo de velocidade</p>
                        </div>
                        <div className="text-3xl opacity-50">⚡</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="speedVolume" data={speedAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* Profit por Velocidade - Barras com valores */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">💰 Profit por Velocidade</h3>
                          <p className="text-gray-400 text-sm mt-1">Lucro total por velocidade com valores nas barras</p>
                        </div>
                        <div className="text-3xl opacity-50">💵</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="speedProfit" data={speedAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* ROI por Velocidade - Barras */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">📊 ROI por Velocidade</h3>
                          <p className="text-gray-400 text-sm mt-1">Percentual de retorno por velocidade</p>
                        </div>
                        <div className="text-3xl opacity-50">📈</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="speedROI" data={speedAnalytics || []} />
                      </div>
                    </div>
                  </div>

                  {/* Lucro Médio por Velocidade - Barras com valores */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                    <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white">🎯 Lucro Médio por Velocidade</h3>
                          <p className="text-gray-400 text-sm mt-1">Profit médio por torneio com valores nas barras</p>
                        </div>
                        <div className="text-3xl opacity-50">📊</div>
                      </div>
                      <div className="h-[350px]">
                        <AnalyticsCharts type="speedAvgProfit" data={speedAnalytics || []} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evolução do Profit por Velocidade - Full Width */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                  <div className="relative bg-gray-900 rounded-lg p-8 border border-gray-700">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">📈 Evolução do Profit por Velocidade</h3>
                        <p className="text-gray-400 text-sm mt-2">Progressão temporal do lucro por velocidade (múltiplas linhas)</p>
                      </div>
                      <div className="text-4xl opacity-50">⚡</div>
                    </div>
                    <div className="h-[400px]">
                      <AnalyticsCharts type="speedEvolution" data={speedAnalytics || []} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'por-periodo' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">📅 Análise Por Período</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📊 Volume Mensal</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por mês</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="monthVolume" data={monthAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💰 Profit Mensal</CardTitle>
                    <CardDescription className="text-gray-400">Evolução do lucro por mês</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="monthProfit" data={monthAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📅 Volume por Dia da Semana</CardTitle>
                    <CardDescription className="text-gray-400">Frequência de jogo por dia</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="day" data={dayAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💵 Profit por Dia da Semana</CardTitle>
                    <CardDescription className="text-gray-400">Performance por dia da semana</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="dayProfit" data={dayAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'por-participantes' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">👥 Análise Por Participantes</h3>
              
              {/* Quick Filter Buttons for Participant Ranges */}
              <div className="mb-6 flex flex-wrap gap-2">
                <button 
                  onClick={() => handleParticipantQuickFilter(0, 100)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  &lt;100
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(100, 300)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  100-300
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(300, 700)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  300-700
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(700, 1500)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  700-1500
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(1500, 3000)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  1500-3000
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(3000, 6000)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  3000-6000
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(6000, 12000)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  6000-12000
                </button>
                <button 
                  onClick={() => handleParticipantQuickFilter(12000)} 
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  12000+
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📊 Volume Por Faixa de Participantes</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de torneios por número de participantes (Pizza)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      {/* TODO: Implement participantsVolume pie chart */}
                      <AnalyticsCharts type="field" data={fieldAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">💰 Lucro Por Faixa de Participantes</CardTitle>
                    <CardDescription className="text-gray-400">Performance de lucro por número de participantes (Barras)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      {/* TODO: Implement participantsProfit bar chart */}
                      <AnalyticsCharts type="field" data={fieldAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'por-posicao' && (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">🥇 Análise Por Posição</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">⚡ Eliminação por Field</CardTitle>
                    <CardDescription className="text-gray-400">Frequência de eliminação por faixa percentual do field</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="field" data={fieldAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">🏆 Posições Final Table</CardTitle>
                    <CardDescription className="text-gray-400">Distribuição de posições finais (1º-9º)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      <AnalyticsCharts type="finalTable" data={finalTableAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">🏆 Total de Heads Up</CardTitle>
                    <CardDescription className="text-gray-400">Volume total de situações heads-up (2 participantes finais)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      {/* TODO: Implement headsUpTotal chart */}
                      <AnalyticsCharts type="finalTable" data={finalTableAnalytics || []} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">📈 Vitórias de Heads Up (%)</CardTitle>
                    <CardDescription className="text-gray-400">Taxa de vitórias em situações heads-up</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px]">
                      {/* TODO: Implement headsUpWinRate chart */}
                      <AnalyticsCharts type="finalTable" data={finalTableAnalytics || []} />
                    </div>
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