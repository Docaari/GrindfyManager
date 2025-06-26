import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MetricsCard from "@/components/MetricsCard";
import ProfitChart from "@/components/ProfitChart";
import TournamentTable from "@/components/TournamentTable";
import { DollarSign, Percent, Trophy, Coins, TrendingUp, Target, Clock, Award } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [period, setPeriod] = useState("30d");
  
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard
          title="Total Profit"
          value={formatCurrency(stats?.totalProfit || 0)}
          icon={DollarSign}
          trend={stats?.totalProfit > 0 ? "positive" : "negative"}
          trendValue="vs last period"
        />
        <MetricsCard
          title="ROI"
          value={formatPercentage(stats?.roi || 0)}
          icon={Percent}
          trend={stats?.roi > 0 ? "positive" : "negative"}
          trendValue="vs last period"
        />
        <MetricsCard
          title="Tournaments"
          value={stats?.totalTournaments || 0}
          icon={Trophy}
          trend="neutral"
          trendValue="this period"
        />
        <MetricsCard
          title="Avg Buy-in"
          value={formatCurrency(stats?.avgBuyin || 0)}
          icon={Coins}
          trend="neutral"
          trendValue="this period"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard
          title="Total Buy-ins"
          value={formatCurrency(stats?.totalBuyins || 0)}
          icon={Target}
          trend="neutral"
          trendValue="invested"
        />
        <MetricsCard
          title="Final Tables"
          value={stats?.finalTables || 0}
          icon={Award}
          trend="positive"
          trendValue="achievements"
        />
        <MetricsCard
          title="Big Hits"
          value={stats?.bigHits || 0}
          icon={TrendingUp}
          trend="positive"
          trendValue="major wins"
        />
        <MetricsCard
          title="ITM Rate"
          value={formatPercentage(stats?.totalTournaments > 0 ? (stats?.finalTables / stats?.totalTournaments) * 100 : 0)}
          icon={Clock}
          trend="neutral"
          trendValue="finish rate"
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
