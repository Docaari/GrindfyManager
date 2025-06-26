import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import MetricsCard from "@/components/MetricsCard";
import ProfitChart from "@/components/ProfitChart";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import TournamentTable from "@/components/TournamentTable";
import DashboardFilters, { type DashboardFilters as DashboardFiltersType } from "@/components/DashboardFilters";
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Trash2, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  const [exchangeRates, setExchangeRates] = useState({
    CNY: 7.20, // Default CNY to USD rate
    EUR: 0.92  // Default EUR to USD rate
  });
  
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Load saved exchange rates
  const { data: savedRates } = useQuery({
    queryKey: ["/api/settings/exchange-rates"],
    queryFn: async () => {
      const response = await fetch("/api/settings/exchange-rates", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch exchange rates");
      return response.json();
    },
  });

  // Update local state when saved rates are loaded
  useEffect(() => {
    if (savedRates) {
      setExchangeRates(savedRates);
    }
  }, [savedRates]);
  
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
    sites: Array.from(new Set(allTournaments?.map((t: any) => t.site) || [])),
    categories: Array.from(new Set(allTournaments?.map((t: any) => t.category) || [])),
    speeds: Array.from(new Set(allTournaments?.map((t: any) => t.speed) || []))
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

  // Clear all tournaments mutation
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/tournaments/clear');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "All tournament history cleared successfully",
      });
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-buyin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-category"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-day"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to clear tournament history",
        variant: "destructive",
      });
    },
  });

  const saveExchangeRates = useMutation({
    mutationFn: (rates: { CNY: number; EUR: number }) => 
      apiRequest("POST", "/api/settings/exchange-rates", rates),
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Taxas de câmbio atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExchangeRateChange = (currency: 'CNY' | 'EUR', value: string) => {
    const rate = parseFloat(value);
    if (!isNaN(rate) && rate > 0) {
      setExchangeRates(prev => ({
        ...prev,
        [currency]: rate
      }));
    }
  };

  const handleSaveRates = () => {
    saveExchangeRates.mutate(exchangeRates);
  };

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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-poker-surface border-gray-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Clear Tournament History</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    This will permanently delete all your tournament data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => clearHistoryMutation.mutate()}
                    disabled={clearHistoryMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {clearHistoryMutation.isPending ? "Clearing..." : "Clear History"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        {/* Currency Exchange Rates Section */}
        <Card className="bg-poker-surface border-gray-700 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Taxas de Câmbio (Temporário)
            </CardTitle>
            <CardDescription className="text-gray-400">
              Configure as taxas de conversão para CNY e EUR para USD
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="cny-rate" className="text-gray-300">CNY para USD</Label>
                <Input
                  id="cny-rate"
                  type="number"
                  step="0.01"
                  value={exchangeRates.CNY}
                  onChange={(e) => handleExchangeRateChange('CNY', e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="7.20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eur-rate" className="text-gray-300">EUR para USD</Label>
                <Input
                  id="eur-rate"
                  type="number"
                  step="0.01"
                  value={exchangeRates.EUR}
                  onChange={(e) => handleExchangeRateChange('EUR', e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="0.92"
                />
              </div>
              <Button 
                onClick={handleSaveRates}
                disabled={saveExchangeRates.isPending}
                className="bg-poker-green hover:bg-green-600"
              >
                {saveExchangeRates.isPending ? "Salvando..." : "Salvar Taxas"}
              </Button>
            </div>
          </CardContent>
        </Card>
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

      {/* Charts and Data */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-poker-surface border-gray-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            Performance
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            Recent Tournaments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Profit Evolution</CardTitle>
                <CardDescription className="text-gray-400">
                  Your profit progression over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProfitChart data={performance || []} />
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Performance Summary</CardTitle>
                <CardDescription className="text-gray-400">
                  Key performance indicators
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Profit Factor</span>
                    <span className="text-white font-mono">
                      {stats?.totalBuyins > 0 ? ((stats?.totalProfit + stats?.totalBuyins) / stats?.totalBuyins).toFixed(2) : "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Avg Profit/Tournament</span>
                    <span className="text-white font-mono">
                      {formatCurrency(stats?.totalTournaments > 0 ? stats?.totalProfit / stats?.totalTournaments : 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Best Session</span>
                    <span className="text-green-400 font-mono">-</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Worst Session</span>
                    <span className="text-red-400 font-mono">-</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">ROI by Buy-in Range</CardTitle>
                <CardDescription className="text-gray-400">
                  Performance across different stake levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center text-gray-400 py-8">
                  Chart visualization coming soon
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Performance by Site</CardTitle>
                <CardDescription className="text-gray-400">
                  ROI comparison across poker sites
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center text-gray-400 py-8">
                  Chart visualization coming soon
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Advanced Analytics</CardTitle>
              <CardDescription className="text-gray-400">
                Detailed performance breakdown by site, buy-in range, category, and day
              </CardDescription>
            </CardHeader>
            <CardContent>
              {siteAnalytics && buyinAnalytics && categoryAnalytics && dayAnalytics ? (
                <AnalyticsCharts 
                  siteData={siteAnalytics || []}
                  buyinData={buyinAnalytics || []}
                  categoryData={categoryAnalytics || []}
                  dayData={dayAnalytics || []}
                />
              ) : (
                <div className="text-center text-gray-400 py-8">
                  Loading analytics data...
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-6">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Recent Tournaments</CardTitle>
              <CardDescription className="text-gray-400">
                Your latest tournament results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TournamentTable tournaments={tournaments || []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
