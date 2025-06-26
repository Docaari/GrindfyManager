import { useState } from "react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  Scatter,
  ScatterChart
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  ChevronDown,
  BarChart3,
  Globe,
  Trophy,
  Users,
  Clock,
  Percent
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  tournaments,
}: DynamicChartsProps) {
  const [showMoreTournaments, setShowMoreTournaments] = useState(false);

  // Tooltip style padrão para todos os gráficos
  const defaultTooltipStyle = {
    backgroundColor: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px'
  };

  // Componente de tooltip padrão
  const DefaultTooltip = (props: any) => <Tooltip {...props} contentStyle={defaultTooltipStyle} />;

  // Site colors mapping
  const SITE_COLORS = {
    'GGNetwork': '#f97316', // Orange
    'Pokerstars': '#dc2626', // Red
    'PokerStars': '#dc2626', // Red (alternative name)
    'WPN': '#16a34a', // Green
    '888': '#2563eb', // Blue
    'Party': '#fbbf24', // Light Yellow
    'iPoker': '#d97706', // Dark Yellow
    'Revolution': '#ec4899', // Pink
    'Chico': '#991b1b', // Dark Red
  };

  // Category colors mapping
  const CATEGORY_COLORS = {
    'Vanilla': '#2563eb', // Blue
    'PKO': '#f97316', // Orange
    'Mystery': '#16a34a', // Green
  };

  // Transform profit data for cumulative profit chart with tournament info
  const cumulativeProfitData = profitData?.map((item, index) => {
    const cumulativeProfit = profitData.slice(0, index + 1)
      .reduce((sum, curr) => sum + parseFloat(String(curr.profit || '0')), 0);

    // Find tournaments for this date to show big hits
    const dayTournaments = tournaments?.filter(t => 
      format(new Date(t.datePlayed), 'yyyy-MM-dd') === item.date
    ) || [];

    const biggestWin = dayTournaments.reduce((max, t) => 
      parseFloat(String(t.prize || '0')) > parseFloat(String(max.prize || '0')) ? t : max, 
      { prize: 0 }
    );

    return {
      ...item,
      profit: parseFloat(String(item.profit || '0')),
      cumulativeProfit,
      formattedDate: format(new Date(item.date), 'dd/MM/yyyy'),
      biggestWin: biggestWin.prize > 0 ? biggestWin : null
    };
  }) || [];

  // Transform analytics data for multi-metric charts
  const transformAnalyticsData = (data: any[]) => {
    return data?.map(item => ({
      ...item,
      volume: parseInt(String(item.volume || '0')),
      profit: parseFloat(String(item.profit || '0')),
      roi: parseFloat(String(item.roi || '0'))
    })) || [];
  };

  const siteData = transformAnalyticsData(siteAnalytics);
  const categoryData = transformAnalyticsData(categoryAnalytics);

  // Transform buy-in data
  const buyinData = transformAnalyticsData(buyinAnalytics);

  // Transform day analytics data with proper formatting
  const dayData = dayAnalytics?.map(item => ({
    ...item,
    dayOfWeek: parseInt(String(item.dayOfWeek || '0')),
    profit: parseFloat(String(item.profit || '0')),
    roi: parseFloat(String(item.roi || '0')),
    volume: parseInt(String(item.volume || '0')),
    shortDay: item.dayName?.substring(0, 3) || 'N/A'
  })) || [];

  // Generate monthly data
  const monthlyData = tournaments?.reduce((acc: any[], tournament: any) => {
    const month = format(new Date(tournament.datePlayed), 'yyyy-MM');
    const existing = acc.find(item => item.month === month);

    if (existing) {
      existing.volume += 1;
      existing.profit += parseFloat(String(tournament.prize || '0'));
    } else {
      acc.push({
        month,
        monthName: format(new Date(tournament.datePlayed), 'MMM/yy'),
        volume: 1,
        profit: parseFloat(String(tournament.prize || '0'))
      });
    }

    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month)) || [];



  // Generate field elimination analytics
  const generateFieldAnalytics = () => {
    const ranges = [
      { label: '99%-75%', min: 0.75, max: 0.99 },
      { label: '75%-50%', min: 0.50, max: 0.75 },
      { label: '50%-37%', min: 0.37, max: 0.50 },
      { label: '37%-25%', min: 0.25, max: 0.37 },
      { label: '25%-18%', min: 0.18, max: 0.25 },
      { label: '18%-10%', min: 0.10, max: 0.18 },
      { label: '10%-5%', min: 0.05, max: 0.10 },
      { label: '5%-1%', min: 0.01, max: 0.05 },
      { label: 'FT (≤9)', min: 0, max: 0.01 }
    ];

    const results = ranges.map(range => {
      const count = tournaments?.filter(t => {
        if (!t.position || !t.fieldSize) return false;

        const percentage = t.position / t.fieldSize;

        if (range.label === 'FT (≤9)') {
          return t.position <= 9;
        }
        return percentage >= range.min && percentage < range.max;
      }).length || 0;

      return {
        range: range.label,
        count,
        percentage: tournaments?.length ? (count / tournaments.length * 100).toFixed(1) : '0'
      };
    });

    return results;
  };

  const fieldData = generateFieldAnalytics();

  // Final table positions analytics - Show frequency for positions 1-9
  const finalTableData = tournaments?.filter(t => t.finalTable || t.position <= 9)
    .reduce((acc: any[], tournament: any) => {
      const position = tournament.position;
      if (position >= 1 && position <= 9) {
        const existing = acc.find(item => item.position === position);

        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ position, count: 1 });
        }
      }

      return acc;
    }, []).sort((a, b) => a.position - b.position) || [];



  // Heads-up analytics - Total HU: times reaching top 2, Wins: times finishing 1st
  const headsUpData = tournaments?.filter(t => t.position && t.position >= 1 && t.position <= 2) || [];
  const winsCount = tournaments?.filter(t => t.position === 1).length || 0;
  const headsUpStats = {
    total: headsUpData.length, // Quantas vezes chegou entre os 2 primeiros
    wins: winsCount, // Quantas vezes ganhou (posição 1)
    winRate: headsUpData.length > 0 ? (winsCount / headsUpData.length * 100).toFixed(1) : '0'
  };

  // Recent tournaments (limited display) - Use filtered tournaments, sorted by date (most recent first)
  const recentTournaments = tournaments
    ?.sort((a, b) => new Date(b.datePlayed).getTime() - new Date(a.datePlayed).getTime())
    ?.slice(0, showMoreTournaments ? 40 : 20) || [];

  // Custom tooltip for category profit - ensuring USD display
  const CustomCategoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-white font-medium">{data.category}</p>
          <p className="text-green-400">
            Profit: ${Number(data.profit || 0).toFixed(2)} USD
          </p>
          <p className="text-blue-400">
            Volume: {data.volume} torneios
          </p>
          <p className="text-yellow-400">
            ROI: {Number(data.roi || 0).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for cumulative profit
  const CustomProfitTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      // Find tournaments for this specific date to show big hits
      const dayTournaments = tournaments?.filter(t => {
        const tournamentDate = format(new Date(t.datePlayed), 'yyyy-MM-dd');
        return tournamentDate === data.date;
      }) || [];

      // Find the biggest win for this day
      const biggestWin = dayTournaments.reduce((max, t) => {
        const tPrize = parseFloat(String(t.prize || '0'));
        const maxPrize = parseFloat(String(max.prize || '0'));
        return tPrize > maxPrize ? t : max;
      }, { prize: 0 });

      return (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg max-w-xs">
          <p className="text-white font-medium">{data.formattedDate}</p>
          <p className="text-green-400">
            Profit do dia: ${data.profit?.toFixed(2)}
          </p>
          <p className="text-blue-400">
            Acumulado: ${data.cumulativeProfit?.toFixed(2)}
          </p>

          {biggestWin.prize > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <p className="text-yellow-400 text-sm font-medium">Maior resultado do dia:</p>
              <p className="text-white text-sm" title={biggestWin.name}>
                {biggestWin.name?.length > 35 
                  ? `${biggestWin.name.substring(0, 35)}...` 
                  : biggestWin.name}
              </p>
              <p className="text-green-400 text-sm">
                Pos: {biggestWin.position} | ${parseFloat(String(biggestWin.prize)).toFixed(2)}
              </p>
            </div>
          )}

          {dayTournaments.length > 0 && (
            <p className="text-gray-400 text-xs mt-1">
              {dayTournaments.length} torneio{dayTournaments.length > 1 ? 's' : ''} neste dia
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="evolution" className="w-full">
        <TabsList className="grid w-full grid-cols-6 bg-gray-800 border border-gray-700">
          <TabsTrigger 
            value="evolution" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Evolução
          </TabsTrigger>
          <TabsTrigger 
            value="sites" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <Globe className="h-4 w-4 mr-2" />
            Por Site
          </TabsTrigger>
          <TabsTrigger 
            value="buyin" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Por ABI
          </TabsTrigger>
          <TabsTrigger 
            value="category" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <Trophy className="h-4 w-4 mr-2" />
            Por Categoria
          </TabsTrigger>
          <TabsTrigger 
            value="period" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Período
          </TabsTrigger>
          <TabsTrigger 
            value="elimination" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300"
          >
            <Percent className="h-4 w-4 mr-2" />
            %Left
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Evolution - Cumulative Profit Chart */}
        <TabsContent value="evolution" className="mt-4">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                Evolução do Profit Acumulado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-[25px] pb-[25px]">
              <div className="h-[600px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeProfitData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="formattedDate" 
                      stroke="#9ca3af" 
                      fontSize={14}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis stroke="#9ca3af" fontSize={14} />
                    <Tooltip content={<CustomProfitTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cumulativeProfit"
                      stroke="#10b981"
                      fill="url(#profitGradient)"
                      strokeWidth={3}
                    />
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Sites Analytics */}
        <TabsContent value="sites" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  Volume por Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="site" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <DefaultTooltip />
                      <Bar dataKey="volume">
                        {siteData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={SITE_COLORS[entry.site as keyof typeof SITE_COLORS] || '#6b7280'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-400" />
                  Profit por Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={siteData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="site" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="profit">
                        {siteData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={SITE_COLORS[entry.site as keyof typeof SITE_COLORS] || '#6b7280'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Buy-in Analytics */}
        <TabsContent value="buyin" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-yellow-400" />
                  Volume por Faixa de Buy-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buyinData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="buyinRange" 
                        stroke="#9ca3af" 
                        fontSize={12}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="volume" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-400" />
                  ROI por Faixa de Buy-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={buyinData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="buyinRange" 
                        stroke="#9ca3af" 
                        fontSize={12}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="roi" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Category Analytics */}
        <TabsContent value="category" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-orange-400" />
                  Volume por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="volume">
                        {categoryData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] || '#6b7280'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-400" />
                  Profit por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip content={<CustomCategoryTooltip />} />
                      <Bar dataKey="profit">
                        {categoryData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] || '#6b7280'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Period Analytics (formerly Participantes) */}
        <TabsContent value="period" className="mt-4">
          {/* Primeira linha - Volume e Profit Mensal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-400" />
                  Volume Mensal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="monthName" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                        formatter={(value: any, name: string) => [
                          `${value} torneios`, 
                          'Volume'
                        ]}
                      />
                      <Bar dataKey="volume" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-400" />
                  Profit Mensal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="monthName" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                        formatter={(value: any, name: string) => [
                          `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`, 
                          'Profit'
                        ]}
                      />
                      <Bar 
                        dataKey="profit" 
                        fill={(entry: any) => Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'}
                      >
                        {monthlyData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Segunda linha - Gráficos por dia da semana */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"></div>

          {/* Terceira linha - Gráficos por dia da semana (continuação) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-400" />
                  Volume por Dia da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="shortDay" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                        formatter={(value: any, name: string) => [
                          `${value} torneios`, 
                          'Volume'
                        ]}
                      />
                      <Bar dataKey="volume" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-400" />
                  Profit por Dia da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="shortDay" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                        formatter={(value: any, name: string) => [
                          `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`, 
                          'Profit'
                        ]}
                      />
                      <Bar 
                        dataKey="profit" 
                        name="profit"
                      >
                        {dayData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Percent className="h-5 w-5 text-yellow-400" />
                  ROI por Dia da Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="shortDay" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                        formatter={(value: any, name: string) => [
                          `${Number(value).toFixed(2)}%`, 
                          'ROI'
                        ]}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="roi" 
                        stroke="#f59e0b" 
                        strokeWidth={3}
                        dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                        name="roi"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 6: Field Elimination Analytics (%Left) */}
        <TabsContent value="elimination" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Percent className="h-5 w-5 text-red-400" />
                  Eliminação por Faixa do Field
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fieldData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="range" 
                        stroke="#9ca3af" 
                        fontSize={10}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="count" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  Posições em Mesa Final
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={finalTableData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="position" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #4b5563',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="count" fill="#fbbf24" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-poker-surface border-gray-700 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-400" />
                  Estatísticas Heads-Up
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-2xl font-bold text-white">{headsUpStats.total}</div>
                      <div className="text-gray-400">Total HU</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">{headsUpStats.wins}</div>
                      <div className="text-gray-400">Vitórias</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">{headsUpStats.winRate}%</div>
                      <div className="text-gray-400">Win Rate HU</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      {/* Recent Tournaments Section */}
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
                    <span className="text-white truncate" title={tournament.name}>
                      {tournament.name?.length > 30 
                        ? `${tournament.name.substring(0, 30)}...` 
                        : tournament.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Tipo</span>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-current"
                      style={{ 
                        color: CATEGORY_COLORS[tournament.category as keyof typeof CATEGORY_COLORS] || '#6b7280',
                        borderColor: CATEGORY_COLORS[tournament.category as keyof typeof CATEGORY_COLORS] || '#6b7280'
                      }}
                    >
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
                    Number(tournament.prize) > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${Number(tournament.prize || 0).toFixed(2)}
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
    </div>
  );
}
