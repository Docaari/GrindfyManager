import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, Activity, TrendingUp, Clock, Mouse, Upload, FileText, Eye, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface UserActivityData {
  id: string;
  userId: string;
  page: string;
  action: string;
  feature?: string;
  duration?: number;
  metadata?: any;
  createdAt: string;
  user?: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

interface UserAnalytics {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  totalSessions: number;
  totalDuration: number;
  avgSessionDuration: number;
  lastActivity: string;
  pagesVisited: string[];
  featuresUsed: string[];
  loginCount: number;
  uploadCount: number;
  grindSessionsCreated: number;
  warmupSessionsCompleted: number;
  isActive: boolean;
}

interface FeatureAnalytics {
  feature: string;
  page: string;
  usageCount: number;
  uniqueUsers: number;
  avgDuration: number;
  lastUsed: string;
}

interface ExecutiveStats {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  avgSessionDuration: number;
  topPages: Array<{ page: string; visits: number }>;
  topFeatures: Array<{ feature: string; usage: number }>;
  peakHours: Array<{ hour: number; activity: number }>;
  growthTrends: Array<{ date: string; users: number; sessions: number }>;
}

const Analytics: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState('users');
  const [dateRange, setDateRange] = useState('30d');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  // Fetch user analytics
  const { data: userAnalytics, isLoading: loadingUsers, isError: errorUsers, refetch: refetchUsers } = useQuery<UserAnalytics[]>({
    queryKey: ['/api/analytics/users', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/users?period=${dateRange}`);
      return Array.isArray(response) ? response : [];
    },
  });

  // Fetch feature analytics
  const { data: featureAnalytics, isLoading: loadingFeatures, isError: errorFeatures, refetch: refetchFeatures } = useQuery<FeatureAnalytics[]>({
    queryKey: ['/api/analytics/features', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/features?period=${dateRange}`);
      return Array.isArray(response) ? response : [];
    },
  });

  // Fetch executive stats
  const { data: executiveStats, isLoading: loadingExecutive, isError: errorExecutive, refetch: refetchExecutive } = useQuery<ExecutiveStats>({
    queryKey: ['/api/analytics/executive', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/executive?period=${dateRange}`);
      return response || {};
    },
  });

  // Fetch user activity
  const { data: userActivity, isLoading: loadingActivity } = useQuery<UserActivityData[]>({
    queryKey: ['/api/analytics/activity', dateRange, selectedUser],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/activity?period=${dateRange}&userId=${selectedUser}`);
      return Array.isArray(response) ? response : [];
    },
  });

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const colors = ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#65A30D', '#16A34A', '#059669', '#0D9488'];

  if (errorUsers || errorFeatures || errorExecutive) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-white">Erro ao carregar dados</h3>
          <p className="text-gray-400">Não foi possível carregar os dados de analytics.</p>
          <Button onClick={() => { refetchUsers(); refetchFeatures(); refetchExecutive(); }} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (loadingUsers || loadingFeatures || loadingExecutive) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-8 w-64 bg-gray-700 mb-2" />
          <Skeleton className="h-4 w-96 bg-gray-700 mb-6" />
          <Skeleton className="h-10 w-48 bg-gray-700 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24 bg-gray-700" />
                  <Skeleton className="h-4 w-4 bg-gray-700 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <Skeleton className="h-6 w-48 bg-gray-700" />
            </CardHeader>
            <CardContent>
              {[1, 2, 3, 4, 5].map(j => (
                <Skeleton key={j} className="h-10 w-full bg-gray-700 mb-3" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">📊 Analytics Avançados</h1>
          <p className="text-gray-400">Análise detalhada de uso da plataforma e comportamento dos usuários</p>
        </div>

        {/* Period Filter */}
        <div className="flex items-center gap-4 mb-6">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="1y">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 border-gray-700">
            <TabsTrigger value="users" className="data-[state=active]:bg-red-600">
              <Users className="w-4 h-4 mr-2" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="features" className="data-[state=active]:bg-red-600">
              <Activity className="w-4 h-4 mr-2" />
              Ferramentas
            </TabsTrigger>
            <TabsTrigger value="executive" className="data-[state=active]:bg-red-600">
              <TrendingUp className="w-4 h-4 mr-2" />
              Executivo
            </TabsTrigger>
          </TabsList>

          {/* USER ANALYTICS TAB */}
          <TabsContent value="users" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Usuários</CardTitle>
                  <Users className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userAnalytics?.length || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Usuários Ativos</CardTitle>
                  <Activity className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {userAnalytics?.filter(u => u.isActive).length || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Tempo Médio de Sessão</CardTitle>
                  <Clock className="h-4 w-4 text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {formatDuration((userAnalytics?.reduce((sum: number, u: any) => sum + u.avgSessionDuration, 0) ?? 0) / (userAnalytics?.length || 1) || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Sessões</CardTitle>
                  <Calendar className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {userAnalytics?.reduce((sum, u) => sum + u.totalSessions, 0) || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* User Details Table */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Detalhes dos Usuários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900">
                      <tr>
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Sessões</th>
                        <th className="px-4 py-3">Tempo Total</th>
                        <th className="px-4 py-3">Média/Sessão</th>
                        <th className="px-4 py-3">Última Atividade</th>
                        <th className="px-4 py-3">Páginas Visitadas</th>
                        <th className="px-4 py-3">Funcionalidades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userAnalytics?.map((user) => (
                        <tr key={user.userId} className="border-b border-gray-700">
                          <td className="px-4 py-3 text-white">
                            <div>
                              <div className="font-medium">{user.firstName} {user.lastName}</div>
                              <div className="text-sm text-gray-400">{user.email}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={user.isActive ? 'default' : 'secondary'}>
                              {user.isActive ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-white">{user.totalSessions}</td>
                          <td className="px-4 py-3 text-white">{formatDuration(user.totalDuration)}</td>
                          <td className="px-4 py-3 text-white">{formatDuration(user.avgSessionDuration)}</td>
                          <td className="px-4 py-3 text-white">
                            {format(new Date(user.lastActivity), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </td>
                          <td className="px-4 py-3 text-white">{user.pagesVisited.length}</td>
                          <td className="px-4 py-3 text-white">{user.featuresUsed.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FEATURE ANALYTICS TAB */}
          <TabsContent value="features" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Funcionalidades</CardTitle>
                  <Mouse className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{featureAnalytics?.length || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Mais Usada</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-white">
                    {featureAnalytics?.[0]?.feature || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-400">
                    {featureAnalytics?.[0]?.usageCount || 0} usos
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Uploads Realizados</CardTitle>
                  <Upload className="h-4 w-4 text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {featureAnalytics?.find(f => f.feature === 'upload')?.usageCount || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Sessões Grind</CardTitle>
                  <Activity className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {featureAnalytics?.find(f => f.feature === 'grind_session')?.usageCount || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Feature Usage Chart */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Uso por Funcionalidade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={featureAnalytics?.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="feature" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="usageCount" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Feature Details Table */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Detalhes das Funcionalidades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900">
                      <tr>
                        <th className="px-4 py-3">Funcionalidade</th>
                        <th className="px-4 py-3">Página</th>
                        <th className="px-4 py-3">Usos</th>
                        <th className="px-4 py-3">Usuários Únicos</th>
                        <th className="px-4 py-3">Duração Média</th>
                        <th className="px-4 py-3">Último Uso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {featureAnalytics?.map((feature, index) => (
                        <tr key={index} className="border-b border-gray-700">
                          <td className="px-4 py-3 text-white font-medium">{feature.feature}</td>
                          <td className="px-4 py-3 text-white">{feature.page}</td>
                          <td className="px-4 py-3 text-white">{feature.usageCount}</td>
                          <td className="px-4 py-3 text-white">{feature.uniqueUsers}</td>
                          <td className="px-4 py-3 text-white">{formatDuration(feature.avgDuration)}</td>
                          <td className="px-4 py-3 text-white">
                            {format(new Date(feature.lastUsed), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EXECUTIVE ANALYTICS TAB */}
          <TabsContent value="executive" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Usuários</CardTitle>
                  <Users className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{executiveStats?.totalUsers || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Usuários Ativos</CardTitle>
                  <Activity className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{executiveStats?.activeUsers || 0}</div>
                  <div className="text-sm text-gray-400">
                    {executiveStats?.totalUsers ? Math.round((executiveStats.activeUsers / executiveStats.totalUsers) * 100) : 0}% do total
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Sessões</CardTitle>
                  <Calendar className="h-4 w-4 text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{executiveStats?.totalSessions || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Duração Média</CardTitle>
                  <Clock className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {formatDuration(executiveStats?.avgSessionDuration || 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Pages */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Páginas Mais Visitadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={executiveStats?.topPages || []}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ page, visits }) => `${page}: ${visits}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="visits"
                      >
                        {executiveStats?.topPages?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Peak Hours */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Horários de Pico</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={executiveStats?.peakHours || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="hour" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="activity" fill="#DC2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Growth Trends */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Tendências de Crescimento</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={executiveStats?.growthTrends || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                      }}
                    />
                    <Line type="monotone" dataKey="users" stroke="#DC2626" strokeWidth={2} />
                    <Line type="monotone" dataKey="sessions" stroke="#EA580C" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Analytics;