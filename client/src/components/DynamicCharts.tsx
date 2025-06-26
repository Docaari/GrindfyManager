import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  BarChart3, 
  DollarSign, 
  Trophy,
  Users,
  Calendar,
  ChevronDown
} from "lucide-react";
import { format } from "date-fns";

interface DynamicChartsProps {
  profitData: any[];
  siteAnalytics: any[];
  buyinAnalytics: any[];
  categoryAnalytics: any[];
  dayAnalytics: any[];
  tournaments: any[];
}

export default function DynamicCharts({
  profitData,
  siteAnalytics,
  buyinAnalytics,
  categoryAnalytics,
  dayAnalytics,
  tournaments
}: DynamicChartsProps) {
  const [showMoreTournaments, setShowMoreTournaments] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);

  // Colors for charts
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  // Transform profit data for cumulative profit chart
  const cumulativeProfitData = profitData?.map((item, index) => {
    const cumulativeProfit = profitData.slice(0, index + 1)
      .reduce((sum, curr) => sum + curr.profit, 0);
    return {
      ...item,
      cumulativeProfit,
      formattedDate: format(new Date(item.date), 'dd/MM/yyyy')
    };
  }) || [];

  // Custom tooltip for profit evolution
  const ProfitTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-poker-surface border border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-white font-medium">{label}</p>
          <p className="text-green-400">
            Lucro Acumulado: ${data.cumulativeProfit?.toFixed(2)}
          </p>
          <p className="text-gray-300">
            Lucro do Dia: ${data.profit?.toFixed(2)}
          </p>
          <p className="text-gray-300">
            Torneios: {data.count}
          </p>
        </div>
      );
    }
    return null;
  };

  // Transform analytics data for multi-metric charts
  const transformAnalyticsData = (data: any[]) => {
    return data?.map(item => ({
      ...item,
      volume: parseInt(item.volume || '0'),
      profit: parseFloat(item.profit || '0'),
      roi: parseFloat(item.roi || '0')
    })) || [];
  };

  const siteData = transformAnalyticsData(siteAnalytics);
  const buyinData = transformAnalyticsData(buyinAnalytics);
  const categoryData = transformAnalyticsData(categoryAnalytics);

  // Day analytics with better labels
  const dayData = dayAnalytics?.map(item => ({
    ...item,
    shortDay: item.dayName?.substring(0, 3),
    volume: parseInt(item.volume || '0'),
    profit: parseFloat(item.profit || '0'),
    roi: parseFloat(item.roi || '0')
  })) || [];

  // Recent tournaments (last 20, or 40 if showing more)
  const recentTournaments = tournaments?.slice(0, showMoreTournaments ? 40 : 20) || [];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="profit" className="w-full">
        <TabsList className="grid w-full grid-cols-6 bg-poker-surface">
          <TabsTrigger value="profit" className="text-xs">Evolução</TabsTrigger>
          <TabsTrigger value="sites" className="text-xs">Por Site</TabsTrigger>
          <TabsTrigger value="buyin" className="text-xs">Por ABI</TabsTrigger>
          <TabsTrigger value="category" className="text-xs">Por Categoria</TabsTrigger>
          <TabsTrigger value="participants" className="text-xs">Participantes</TabsTrigger>
          <TabsTrigger value="recent" className="text-xs">Recentes</TabsTrigger>
        </TabsList>

        {/* Tab 1: Profit Evolution */}
        <TabsContent value="profit" className="mt-4">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                Evolução do Profit Acumulado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeProfitData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="formattedDate" 
                      stroke="#9ca3af"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="#9ca3af"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <Tooltip content={<ProfitTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="cumulativeProfit" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Analytics by Site */}
        <TabsContent value="sites" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Volume by Site */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Volume por Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="site" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="volume" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Profit by Site */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  Lucro por Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="site" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="profit" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* ROI by Site */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  ROI por Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="site" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="roi" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Analytics by Buy-in */}
        <TabsContent value="buyin" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Volume by Buy-in */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Volume por ABI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buyinData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="buyinRange" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="volume" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Profit by Buy-in */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  Lucro por ABI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buyinData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="buyinRange" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="profit" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* ROI by Buy-in */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  ROI por ABI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buyinData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="buyinRange" stroke="#9ca3af" tick={{ fontSize: 9 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="roi" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Analytics by Category */}
        <TabsContent value="category" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Volume by Category */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Volume por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="volume"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ category, volume }) => `${category}: ${volume}`}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Profit by Category */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  Lucro por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="profit" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* ROI by Category */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  ROI por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="roi" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Analytics by Participants and Day */}
        <TabsContent value="participants" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Profit by Day of Week */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-400" />
                  Lucro Médio por Dia da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="shortDay" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="profit" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Volume by Day of Week */}
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  Volume por Dia da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="shortDay" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="volume" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 6: Recent Tournaments */}
        <TabsContent value="recent" className="mt-4">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-400" />
                Torneios Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentTournaments.map((tournament: any, index: number) => (
                  <div key={tournament.id || index} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                    <div className="grid grid-cols-8 gap-4 flex-1 text-sm">
                      <div>
                        <span className="text-gray-400 block">Data</span>
                        <span className="text-white">
                          {format(new Date(tournament.datePlayed), 'dd/MM/yyyy')}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Site</span>
                        <span className="text-white">{tournament.site}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400 block">Nome</span>
                        <span className="text-white truncate">{tournament.name}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Tipo</span>
                        <Badge variant="outline" className="text-xs">
                          {tournament.category}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Velocidade</span>
                        <span className="text-white">{tournament.speed}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Buy-in</span>
                        <span className="text-white">${tournament.buyIn}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Posição</span>
                        <span className="text-white">{tournament.position || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <span className="text-gray-400 block">Profit</span>
                      <span className={`font-medium ${
                        tournament.prize > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        ${tournament.prize?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {tournaments && tournaments.length > 20 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowMoreTournaments(!showMoreTournaments)}
                    className="bg-transparent border-gray-600 text-white hover:bg-gray-700"
                  >
                    <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${
                      showMoreTournaments ? 'rotate-180' : ''
                    }`} />
                    {showMoreTournaments ? 'Mostrar Menos' : 'Mostrar Mais 20 Torneios'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}