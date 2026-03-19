import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  TrendingUp,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Settings,
  Search,
  Filter,
  MoreHorizontal,
  Zap,
  Globe,
  BarChart3,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';

interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  onlineUsers: number;
  onlineUsersList: any[];
  hourlyActivity: { hour: number; activity: number }[];
  topActiveUsers: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    activityCount: number;
  }[];
}

interface Alert {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
}

interface MonitoringData {
  onlineUsers: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    lastActivity: Date;
  }[];
  realtimeActivity: {
    id: string;
    userId: string;
    email: string;
    page: string;
    action: string;
    feature: string;
    createdAt: Date;
  }[];
  alerts: Alert[];
  systemHealth: {
    totalUsers: { count: number }[];
    activeUsers: { count: number }[];
    activityLast1h: { count: number }[];
    errorRate: number;
  };
}

const AdminDashboard: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 segundos

  // Buscar estatísticas do dashboard
  const { data: dashboardStats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<AdminDashboardStats>({
    queryKey: ['/api/admin/dashboard-stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/dashboard-stats');
      const jsonData = await response.json();
      return jsonData || {};
    },
    refetchInterval: refreshInterval
  });

  // Buscar dados de monitoramento
  const { data: monitoringData, isLoading: monitoringLoading, isError: monitoringError, refetch: refetchMonitoring } = useQuery<MonitoringData>({
    queryKey: ['/api/admin/monitoring'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/monitoring');
      const jsonData = await response.json();
      return jsonData || {};
    },
    refetchInterval: 10000 // 10 segundos para tempo real
  });

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (statsError || monitoringError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-gray-900">Erro ao carregar dados</h3>
          <p className="text-gray-600">Não foi possível carregar os dados do dashboard.</p>
          <Button onClick={() => { refetchStats(); refetchMonitoring(); }} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (statsLoading || monitoringLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-8 w-64 bg-gray-200 mb-2" />
          <Skeleton className="h-4 w-96 bg-gray-200 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="border-gray-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24 bg-gray-200" />
                  <Skeleton className="h-4 w-4 bg-gray-200 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 bg-gray-200 mb-1" />
                  <Skeleton className="h-3 w-20 bg-gray-200" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-10 w-full bg-gray-200 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48 bg-gray-200" />
                </CardHeader>
                <CardContent>
                  {[1, 2, 3].map(j => (
                    <Skeleton key={j} className="h-12 w-full bg-gray-200 mb-3" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard Admin</h1>
              <p className="text-gray-600 mt-1">Painel de controle e monitoramento em tempo real</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Globe className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-gray-700">
                  {dashboardStats?.onlineUsers || 0} usuários online
                </span>
              </div>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
            </div>
          </div>
        </div>

        {/* Alertas de Sistema */}
        {monitoringData?.alerts && monitoringData.alerts.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {monitoringData.alerts.map((alert, index) => (
                <div key={index} className={`p-4 rounded-lg border ${getAlertColor(alert.type)}`}>
                  <div className="flex items-start space-x-3">
                    {alert.type === 'error' && <XCircle className="h-5 w-5 mt-0.5" />}
                    {alert.type === 'warning' && <AlertTriangle className="h-5 w-5 mt-0.5" />}
                    {alert.type === 'info' && <CheckCircle className="h-5 w-5 mt-0.5" />}
                    <div className="flex-1">
                      <h3 className="font-medium">{alert.title}</h3>
                      <p className="text-sm mt-1">{alert.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cards de Estatísticas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{dashboardStats?.totalUsers || 0}</div>
              <p className="text-xs text-blue-700">
                +{dashboardStats?.newUsers7d || 0} esta semana
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Usuários Ativos</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">{dashboardStats?.activeUsers || 0}</div>
              <p className="text-xs text-green-700">
                {dashboardStats?.onlineUsers || 0} online agora
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-yellow-800">Usuários Inativos</CardTitle>
              <UserX className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-900">{dashboardStats?.inactiveUsers || 0}</div>
              <p className="text-xs text-yellow-700">
                {dashboardStats?.blockedUsers || 0} bloqueados
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Atividade</CardTitle>
              <Activity className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">
                {Number(monitoringData?.systemHealth?.activityLast1h?.[0]?.count || 0)}
              </div>
              <p className="text-xs text-purple-700">
                ações na última hora
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs de Seções */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="activity">Atividade</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
          </TabsList>

          {/* Aba Visão Geral */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usuários Mais Ativos */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Usuários Mais Ativos (7 dias)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboardStats?.topActiveUsers?.slice(0, 5).map((user, index) => (
                      <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {user.activityCount} ações
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Atividade por Hora */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Clock className="h-5 w-5 mr-2" />
                    Atividade por Hora (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardStats?.hourlyActivity?.map((activity) => (
                      <div key={activity.hour} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{activity.hour}:00</span>
                        <div className="flex items-center space-x-2 flex-1 mx-4">
                          <Progress value={(activity.activity / 100) * 100} className="h-2" />
                          <span className="text-sm font-medium">{activity.activity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Aba Usuários */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Gestão de Usuários</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar usuários..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativos</SelectItem>
                      <SelectItem value="inactive">Inativos</SelectItem>
                      <SelectItem value="blocked">Bloqueados</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button>
                    <Filter className="h-4 w-4 mr-2" />
                    Filtros Avançados
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Integração com lista de usuários em desenvolvimento</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Atividade */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  Atividade em Tempo Real
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {monitoringData?.realtimeActivity?.slice(0, 10).map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div>
                          <p className="font-medium text-gray-900">{activity.email}</p>
                          <p className="text-sm text-gray-600">
                            {activity.action} em {activity.page}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(activity.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Monitoramento */}
          <TabsContent value="monitoring" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usuários Online */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Globe className="h-5 w-5 mr-2" />
                    Usuários Online
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {monitoringData?.onlineUsers?.slice(0, 8).map((user) => (
                      <div key={user.userId} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <div>
                            <p className="font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                          </div>
                        </div>
                        <span className="text-xs text-green-600">
                          {new Date(user.lastActivity).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Saúde do Sistema */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Saúde do Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Taxa de Erro</span>
                      <span className="text-sm font-medium">
                        {monitoringData?.systemHealth?.errorRate || 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Atividade (1h)</span>
                      <span className="text-sm font-medium">
                        {Number(monitoringData?.systemHealth?.activityLast1h?.[0]?.count || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuários Ativos</span>
                      <span className="text-sm font-medium">
                        {Number(monitoringData?.systemHealth?.activeUsers?.[0]?.count || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total de Usuários</span>
                      <span className="text-sm font-medium">
                        {Number(monitoringData?.systemHealth?.totalUsers?.[0]?.count || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;