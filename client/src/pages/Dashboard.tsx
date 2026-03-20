import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import AccessDenied from "@/components/AccessDenied";
import { useLocation } from "wouter";

import { DollarSign, TrendingUp, Target, Calendar, Monitor, Users, Zap, Trophy } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

import type { DashboardFiltersState } from '@/components/dashboard/types';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { TabEvolution } from '@/components/dashboard/TabEvolution';
import { TabSite } from '@/components/dashboard/TabSite';
import { TabBuyin } from '@/components/dashboard/TabBuyin';
import { TabCategory } from '@/components/dashboard/TabCategory';
import { TabSpeed } from '@/components/dashboard/TabSpeed';
import { TabPeriod } from '@/components/dashboard/TabPeriod';
import { TabParticipants } from '@/components/dashboard/TabParticipants';
import { TabPosition } from '@/components/dashboard/TabPosition';

export default function Dashboard() {
  const hasDashboardAccess = usePermission('dashboard_access');

  const { user } = useAuth();

  // Verificação de permissão no início
  if (!hasDashboardAccess) {
    return <AccessDenied
      featureName="Dashboard"
      description="Acesso ao dashboard de performance e analytics."
      currentPlan={user?.subscriptionPlan || "free"}
      requiredPlan="premium"
      pageName="Dashboard"
      onViewPlans={() => {}}
    />;
  }
  const [period, setPeriod] = useState("all");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('evolution');
  const [filters, setFilters] = useState<DashboardFiltersState>({});
  const [, navigate] = useLocation();

  const dashboardTabs = [
    { id: 'evolution', name: 'Geral', icon: TrendingUp, emoji: '📈', active: activeTab === 'evolution' },
    { id: 'por-site', name: 'Site', icon: Monitor, emoji: '🌐', active: activeTab === 'por-site' },
    { id: 'por-abi', name: 'ABI', icon: DollarSign, emoji: '💰', active: activeTab === 'por-abi' },
    { id: 'por-tipo', name: 'Tipo', icon: Target, emoji: '🏷️', active: activeTab === 'por-tipo' },
    { id: 'velocidade', name: 'Velocidade', icon: Zap, emoji: '⚡', active: activeTab === 'velocidade' },
    { id: 'por-periodo', name: 'Período', icon: Calendar, emoji: '📅', active: activeTab === 'por-periodo' },
    { id: 'por-participantes', name: 'Med. Participantes', icon: Users, emoji: '👥', active: activeTab === 'por-participantes' },
    { id: 'por-posicao', name: 'Posição', icon: Trophy, emoji: '🥇', active: activeTab === 'por-posicao' }
  ];

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["/api/dashboard/stats", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period, filters: JSON.stringify(filters) });
      return await apiRequest('GET', `/api/dashboard/stats?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: performance, isLoading: performanceLoading, isError: performanceError } = useQuery({
    queryKey: ["/api/dashboard/performance", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period, filters: JSON.stringify(filters) });
      return apiRequest('GET', `/api/dashboard/performance?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: allTournaments } = useQuery({
    queryKey: ["/api/tournaments", "all"],
    queryFn: async () => apiRequest('GET', "/api/tournaments?limit=10000"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: filteredTournaments } = useQuery({
    queryKey: ["/api/tournaments", "filtered", period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20", period, filters: JSON.stringify(filters) });
      return apiRequest('GET', `/api/tournaments?${params}`);
    },
    staleTime: 1 * 60 * 1000,
  });

  const availableOptions = useMemo(() => ({
    sites: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.site).filter(Boolean) : [])) as string[],
    categories: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.category).filter(Boolean) : [])) as string[],
    speeds: Array.from(new Set(Array.isArray(allTournaments) ? allTournaments.map((t: any) => t.speed).filter(Boolean) : [])) as string[]
  }), [allTournaments]);

  const { data: siteAnalytics, isLoading: siteLoading } = useQuery({
    queryKey: ["/api/analytics/by-site", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-site?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: buyinAnalytics, isLoading: buyinLoading } = useQuery({
    queryKey: ["/api/analytics/by-buyin", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-buyin?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: categoryAnalytics, isLoading: categoryLoading } = useQuery({
    queryKey: ["/api/analytics/by-category", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-category?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: dayAnalytics, isLoading: dayLoading } = useQuery({
    queryKey: ["/api/analytics/by-day", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-day?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: speedAnalytics, isLoading: speedLoading } = useQuery({
    queryKey: ["/api/analytics/by-speed", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-speed?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: monthAnalytics, isLoading: monthLoading } = useQuery({
    queryKey: ["/api/analytics/by-month", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-month?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: fieldAnalytics, isLoading: fieldLoading } = useQuery({
    queryKey: ["/api/analytics/by-field", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/by-field?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const { data: finalTableAnalytics, isLoading: finalTableLoading } = useQuery({
    queryKey: ["/api/analytics/final-table", period, filters],
    queryFn: async () => { const params = new URLSearchParams({ period, filters: JSON.stringify(filters) }); return apiRequest('GET', `/api/analytics/final-table?${params}`); },
    staleTime: 2 * 60 * 1000,
  });

  const isMainLoading = statsLoading || performanceLoading;
  const hasError = statsError || performanceError;
  const hasNoData = !isMainLoading && !hasError && stats?.count === 0;

  if (hasError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Performance Dashboard</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-red-400 text-lg font-semibold mb-4">
            Erro ao carregar dados do dashboard
          </div>
          <p className="text-gray-400 mb-6">
            Ocorreu um problema ao buscar suas estatisticas. Tente novamente.
          </p>
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
              queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
            }}
            className="bg-poker-green text-white hover:bg-poker-green/90 px-6 py-3"
          >
            Tentar novamente
          </Button>
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

      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        period={period}
        setPeriod={setPeriod}
        availableOptions={availableOptions}
      />

      {/* Empty state quando nao tem dados */}
      {hasNoData && (
        <div className="relative mb-8">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-12 text-center">
            <div className="text-gray-400 text-lg font-semibold mb-3">
              Importe seus torneios para ver as estatisticas
            </div>
            <p className="text-gray-500 mb-6">
              O dashboard mostrara suas metricas de performance assim que voce importar seus historicos de torneios.
            </p>
            <Button
              onClick={() => navigate('/upload')}
              className="bg-poker-green text-white hover:bg-poker-green/90 px-6 py-3"
            >
              Importar Torneios
            </Button>
          </div>
        </div>
      )}

      {!isMainLoading && (
        <DashboardMetrics
          stats={stats}
          categoryAnalytics={categoryAnalytics}
          speedAnalytics={speedAnalytics}
          isMainLoading={false}
        />
      )}
      {isMainLoading && (
        <DashboardMetrics
          stats={undefined}
          categoryAnalytics={undefined}
          speedAnalytics={undefined}
          isMainLoading={true}
        />
      )}

      {!isMainLoading && (
        <div className="mt-8">
          <DashboardTabs tabs={dashboardTabs} activeTab={activeTab} setActiveTab={setActiveTab} />

          <div className="space-y-6">
            {activeTab === 'evolution' && (
              <TabEvolution performance={performance} filteredTournaments={filteredTournaments} period={period} filters={filters} />
            )}
            {activeTab === 'por-site' && (
              <TabSite siteAnalytics={siteAnalytics} siteLoading={siteLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-abi' && (
              <TabBuyin buyinAnalytics={buyinAnalytics} buyinLoading={buyinLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-tipo' && (
              <TabCategory categoryAnalytics={categoryAnalytics} categoryLoading={categoryLoading} period={period} filters={filters} />
            )}
            {activeTab === 'velocidade' && (
              <TabSpeed speedAnalytics={speedAnalytics} speedLoading={speedLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-periodo' && (
              <TabPeriod dayAnalytics={dayAnalytics} dayLoading={dayLoading} monthAnalytics={monthAnalytics} monthLoading={monthLoading} filters={filters} />
            )}
            {activeTab === 'por-participantes' && (
              <TabParticipants fieldAnalytics={fieldAnalytics} fieldLoading={fieldLoading} monthAnalytics={monthAnalytics} monthLoading={monthLoading} period={period} filters={filters} />
            )}
            {activeTab === 'por-posicao' && (
              <TabPosition fieldAnalytics={fieldAnalytics} fieldLoading={fieldLoading} finalTableAnalytics={finalTableAnalytics} finalTableLoading={finalTableLoading} filters={filters} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
