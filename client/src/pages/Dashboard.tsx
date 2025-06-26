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
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3 } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  
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
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px] bg-poker-surface border-gray-700 text-white">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="365d">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dashboard Filters */}
        <DashboardFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableOptions={availableOptions}
        />


      </div>

      {/* Primeira Linha - 3 Principais Indicadores (maiores) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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

      {/* Terceira Linha - 5 Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
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

      {/* Dynamic Charts with Filters */}
      <div className="space-y-6">
        <DynamicCharts
          profitData={performance || []}
          siteAnalytics={siteAnalytics || []}
          buyinAnalytics={buyinAnalytics || []}
          categoryAnalytics={categoryAnalytics || []}
          dayAnalytics={dayAnalytics || []}
          tournaments={allTournaments || []}
        />
      </div>
    </div>
  );
}

