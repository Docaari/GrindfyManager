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
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award, BarChart3, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats", period],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/stats?period=${period}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ["/api/dashboard/performance", period],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/performance?period=${period}`, {
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

  // Advanced analytics queries
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site", period],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/by-site?period=${period}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch site analytics");
      return response.json();
    },
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin", period],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/by-buyin?period=${period}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch buyin analytics");
      return response.json();
    },
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", period],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/by-category?period=${period}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch category analytics");
      return response.json();
    },
  });

  const { data: dayAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-day", period],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/by-day?period=${period}`, {
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
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
      </div>

      {/* Seção 3.1 PRD - Indicadores Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <MetricsCard
          title="Contagem"
          value={stats?.count || 0}
          icon={Trophy}
          trend="neutral"
          trendValue="Torneios"
        />
        <MetricsCard
          title="Lucro"
          value={formatCurrency(stats?.profit || 0)}
          icon={DollarSign}
          trend={(stats?.profit || 0) > 0 ? "positive" : "negative"}
          trendValue={`${(stats?.roi || 0).toFixed(1)}% ROI`}
        />
        <MetricsCard
          title="ABI"
          value={formatCurrency(stats?.abi || 0)}
          icon={Coins}
          trend="neutral"
          trendValue="Buy-in Médio"
        />
        <MetricsCard
          title="ROI"
          value={formatPercentage(stats?.roi || 0)}
          icon={TrendingUp}
          trend={(stats?.roi || 0) > 0 ? "positive" : "negative"}
          trendValue="Retorno"
        />
        <MetricsCard
          title="ITM"
          value={formatPercentage(stats?.itm || 0)}
          icon={Target}
          trend={(stats?.itm || 0) > 20 ? "positive" : (stats?.itm || 0) < 15 ? "negative" : "neutral"}
          trendValue="In The Money"
        />
        <MetricsCard
          title="Reentradas"
          value={stats?.reentries || 0}
          icon={Clock}
          trend="neutral"
          trendValue="Total"
        />
      </div>

      {/* Segunda Linha - Indicadores Complementares */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <MetricsCard
          title="Lucro Médio/Torneio"
          value={formatCurrency(stats?.avgProfitPerTournament || 0)}
          icon={BarChart3}
          trend="neutral"
          trendValue="Por Evento"
        />
        <MetricsCard
          title="Stake Range"
          value={stats?.stakeRange ? `$${(stats.stakeRange.min || 0).toFixed(0)}-$${(stats.stakeRange.max || 0).toFixed(0)}` : '$0-$0'}
          icon={Coins}
          trend="neutral"
          trendValue="Faixa"
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
        <MetricsCard
          title="Média Participantes"
          value={Math.round(stats?.avgFieldSize || 0)}
          icon={Trophy}
          trend="neutral"
          trendValue="Field Size"
        />
        <MetricsCard
          title="Lucro Médio/Dia"
          value={formatCurrency(stats?.avgProfitPerDay || 0)}
          icon={Clock}
          trend="neutral"
          trendValue="Diário"
        />
      </div>

      {/* Terceira Linha - Indicadores Complementares PRD 3.1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
        <MetricsCard
          title="Finalização Precoce"
          value={stats?.earlyFinishes || 0}
          icon={Clock}
          trend="negative"
          trendValue={`${(stats?.earlyFinishRate || 0).toFixed(1)}% últimos 10%`}
        />
        <MetricsCard
          title="Finalização Tardia"
          value={stats?.lateFinishes || 0}
          icon={Clock}
          trend="positive"
          trendValue={`${(stats?.lateFinishRate || 0).toFixed(1)}% primeiros 10%`}
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
