import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { Users, Activity, TrendingUp, Clock, Mouse, Upload, Calendar, AlertCircle, RefreshCw, Search, ArrowUp, ArrowDown, UserPlus, Percent } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import AccessDenied from '@/components/AccessDenied';

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
  const hasPermission = usePermission('analytics_access');
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('users');
  const [dateRange, setDateRange] = useState('30d');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Item 4: Search state for users table
  const [userSearch, setUserSearch] = useState('');

  // Item 5: Sort state for users table
  const [userSort, setUserSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'totalSessions', direction: 'desc' });

  // Item 6: Sort state for features table
  const [featureSort, setFeatureSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'usageCount', direction: 'desc' });

  // Fetch user analytics
  const { data: userAnalytics, isLoading: loadingUsers, isError: errorUsers, refetch: refetchUsers } = useQuery<UserAnalytics[]>({
    queryKey: ['/api/analytics/users', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/users?period=${dateRange}`);
      const data = Array.isArray(response) ? response : [];
      setLastUpdated(new Date());
      return data;
    },
    enabled: hasPermission,
  });

  // Fetch feature analytics
  const { data: featureAnalytics, isLoading: loadingFeatures, isError: errorFeatures, refetch: refetchFeatures } = useQuery<FeatureAnalytics[]>({
    queryKey: ['/api/analytics/features', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/features?period=${dateRange}`);
      const data = Array.isArray(response) ? response : [];
      setLastUpdated(new Date());
      return data;
    },
    enabled: hasPermission,
  });

  // Fetch executive stats
  const { data: executiveStats, isLoading: loadingExecutive, isError: errorExecutive, refetch: refetchExecutive } = useQuery<ExecutiveStats>({
    queryKey: ['/api/analytics/executive', dateRange],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/executive?period=${dateRange}`);
      setLastUpdated(new Date());
      return response || {};
    },
    enabled: hasPermission,
  });

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Item 2: Poker-themed colors (greens, blues, teals instead of all-red tones)
  const colors = ['#16a34a', '#059669', '#0d9488', '#0891b2', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'];

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return 'Data invalida';
    }
  };

  // Item 10: Refresh handler
  const handleRefresh = useCallback(() => {
    refetchUsers();
    refetchFeatures();
    refetchExecutive();
    setLastUpdated(new Date());
  }, [refetchUsers, refetchFeatures, refetchExecutive]);

  // Item 4 & 5: Filtered and sorted users
  const filteredAndSortedUsers = useMemo(() => {
    if (!userAnalytics) return [];
    let filtered = userAnalytics;
    if (userSearch.trim()) {
      const search = userSearch.toLowerCase();
      filtered = filtered.filter(u =>
        (u.firstName?.toLowerCase() || '').includes(search) ||
        (u.lastName?.toLowerCase() || '').includes(search) ||
        (u.email?.toLowerCase() || '').includes(search)
      );
    }
    const sorted = [...filtered].sort((a, b) => {
      const field = userSort.field;
      let aVal: any = (a as any)[field];
      let bVal: any = (b as any)[field];
      if (field === 'name') {
        aVal = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
        bVal = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
      }
      if (field === 'pagesVisited') {
        aVal = a.pagesVisited.length;
        bVal = b.pagesVisited.length;
      }
      if (field === 'featuresUsed') {
        aVal = a.featuresUsed.length;
        bVal = b.featuresUsed.length;
      }
      if (typeof aVal === 'string') {
        return userSort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return userSort.direction === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
    return sorted;
  }, [userAnalytics, userSearch, userSort]);

  // Item 6: Sorted features
  const sortedFeatures = useMemo(() => {
    if (!featureAnalytics) return [];
    return [...featureAnalytics].sort((a, b) => {
      const field = featureSort.field as keyof FeatureAnalytics;
      let aVal: any = a[field];
      let bVal: any = b[field];
      if (typeof aVal === 'string') {
        return featureSort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return featureSort.direction === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
  }, [featureAnalytics, featureSort]);

  const toggleUserSort = (field: string) => {
    setUserSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'desc' }
    );
  };

  const toggleFeatureSort = (field: string) => {
    setFeatureSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'desc' }
    );
  };

  const SortArrow = ({ field, sortState }: { field: string; sortState: { field: string; direction: 'asc' | 'desc' } }) => {
    if (sortState.field !== field) return null;
    return sortState.direction === 'asc'
      ? <ArrowUp className="w-3 h-3 inline ml-1" />
      : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const isLoading = loadingUsers || loadingFeatures || loadingExecutive;
  const hasError = errorUsers && errorFeatures && errorExecutive;

  if (!hasPermission) {
    return <AccessDenied
      featureName="Analytics Avancados"
      description="Acesso a analytics detalhados de uso da plataforma."
      currentPlan={user?.subscriptionPlan || "free"}
      requiredPlan="admin"
      pageName="Analytics"
      onViewPlans={() => {}}
    />;
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-white">Erro ao carregar dados</h3>
          <p className="text-gray-400">Nao foi possivel carregar os dados de analytics.</p>
          <Button onClick={handleRefresh} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
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
    <TooltipProvider>
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Analytics Avancados</h1>
          <p className="text-gray-400">Analise detalhada de uso da plataforma e comportamento dos usuarios</p>
        </div>

        {/* Period Filter + Refresh + Last Updated */}
        <div className="flex items-center gap-4 mb-6">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="7d">Ultimos 7 dias</SelectItem>
              <SelectItem value="30d">Ultimos 30 dias</SelectItem>
              <SelectItem value="90d">Ultimos 90 dias</SelectItem>
              <SelectItem value="1y">Ultimo ano</SelectItem>
            </SelectContent>
          </Select>

          {/* Item 10: Refresh button */}
          <Button onClick={handleRefresh} variant="outline" size="sm" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>

          {/* Item 9: Last updated timestamp */}
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Atualizado: {format(lastUpdated, 'HH:mm')}
            </span>
          )}
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 border-gray-700">
            {/* Item 1: Changed from bg-red-600 to bg-emerald-600 */}
            <TabsTrigger value="users" className="data-[state=active]:bg-emerald-600">
              <Users className="w-4 h-4 mr-2" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="features" className="data-[state=active]:bg-emerald-600">
              <Activity className="w-4 h-4 mr-2" />
              Ferramentas
            </TabsTrigger>
            <TabsTrigger value="executive" className="data-[state=active]:bg-emerald-600">
              <TrendingUp className="w-4 h-4 mr-2" />
              Executivo
            </TabsTrigger>
          </TabsList>

          {/* USER ANALYTICS TAB */}
          <TabsContent value="users" className="space-y-6">
            {errorUsers && (
              <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-red-300 text-sm">Erro ao carregar dados de usuarios.</span>
                <Button onClick={() => refetchUsers()} variant="outline" size="sm" className="ml-auto text-white border-gray-600">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Usuarios</CardTitle>
                  <Users className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userAnalytics?.length || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Usuarios Ativos</CardTitle>
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
                  <CardTitle className="text-sm font-medium text-gray-400">Tempo Medio de Sessao</CardTitle>
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
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Sessoes</CardTitle>
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Detalhes dos Usuarios</CardTitle>
                  {/* Item 4: Search input */}
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Buscar usuario..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-9 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900">
                      {/* Item 5: Sortable column headers */}
                      <tr>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('name')}>
                          Usuario <SortArrow field="name" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('isActive')}>
                          Status <SortArrow field="isActive" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('totalSessions')}>
                          Sessoes <SortArrow field="totalSessions" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('totalDuration')}>
                          Tempo Total <SortArrow field="totalDuration" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('avgSessionDuration')}>
                          Media/Sessao <SortArrow field="avgSessionDuration" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('lastActivity')}>
                          Ultima Atividade <SortArrow field="lastActivity" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('pagesVisited')}>
                          Paginas Visitadas <SortArrow field="pagesVisited" sortState={userSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleUserSort('featuresUsed')}>
                          Funcionalidades <SortArrow field="featuresUsed" sortState={userSort} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedUsers.map((user) => (
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
                            {user.lastActivity ? formatDate(user.lastActivity) : 'Sem atividade'}
                          </td>
                          {/* Item 14: Tooltip showing actual pages on hover */}
                          <td className="px-4 py-3 text-white">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-gray-500">
                                  {user.pagesVisited.length}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-600 text-white max-w-xs">
                                {user.pagesVisited.length > 0
                                  ? <ul className="text-xs space-y-0.5">{user.pagesVisited.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                  : <span className="text-xs text-gray-400">Nenhuma pagina visitada</span>
                                }
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          {/* Item 14: Tooltip showing actual features on hover */}
                          <td className="px-4 py-3 text-white">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-gray-500">
                                  {user.featuresUsed.length}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-600 text-white max-w-xs">
                                {user.featuresUsed.length > 0
                                  ? <ul className="text-xs space-y-0.5">{user.featuresUsed.map((f, i) => <li key={i}>{f}</li>)}</ul>
                                  : <span className="text-xs text-gray-400">Nenhuma funcionalidade usada</span>
                                }
                              </TooltipContent>
                            </Tooltip>
                          </td>
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
            {errorFeatures && (
              <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-red-300 text-sm">Erro ao carregar dados de funcionalidades.</span>
                <Button onClick={() => refetchFeatures()} variant="outline" size="sm" className="ml-auto text-white border-gray-600">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}
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
                    {featureAnalytics?.slice().sort((a, b) => b.usageCount - a.usageCount)[0]?.feature || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-400">
                    {featureAnalytics?.slice().sort((a, b) => b.usageCount - a.usageCount)[0]?.usageCount || 0} usos
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
                  <CardTitle className="text-sm font-medium text-gray-400">Sessoes Grind</CardTitle>
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
                {(!featureAnalytics || featureAnalytics.length === 0) ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">Sem dados disponiveis</div>
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  {/* Item 2: Changed bar fill from red to poker-green */}
                  <BarChart data={featureAnalytics?.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="feature" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="usageCount" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
                )}
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
                      {/* Item 6: Sortable feature column headers */}
                      <tr>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('feature')}>
                          Funcionalidade <SortArrow field="feature" sortState={featureSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('page')}>
                          Pagina <SortArrow field="page" sortState={featureSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('usageCount')}>
                          Usos <SortArrow field="usageCount" sortState={featureSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('uniqueUsers')}>
                          Usuarios Unicos <SortArrow field="uniqueUsers" sortState={featureSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('avgDuration')}>
                          Duracao Media <SortArrow field="avgDuration" sortState={featureSort} />
                        </th>
                        <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleFeatureSort('lastUsed')}>
                          Ultimo Uso <SortArrow field="lastUsed" sortState={featureSort} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFeatures.map((feature, index) => (
                        <tr key={index} className="border-b border-gray-700">
                          <td className="px-4 py-3 text-white font-medium">{feature.feature}</td>
                          <td className="px-4 py-3 text-white">{feature.page}</td>
                          <td className="px-4 py-3 text-white">{feature.usageCount}</td>
                          <td className="px-4 py-3 text-white">{feature.uniqueUsers}</td>
                          <td className="px-4 py-3 text-white">{formatDuration(feature.avgDuration)}</td>
                          <td className="px-4 py-3 text-white">
                            {feature.lastUsed ? formatDate(feature.lastUsed) : 'Sem uso'}
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
            {errorExecutive && (
              <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-red-300 text-sm">Erro ao carregar dados executivos.</span>
                <Button onClick={() => refetchExecutive()} variant="outline" size="sm" className="ml-auto text-white border-gray-600">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}
            {/* Item 11: Replaced "Total de Usuarios" and "Usuarios Ativos" with "Taxa de Retencao" and "Novos Usuarios" */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Taxa de Retencao</CardTitle>
                  <Percent className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {executiveStats?.totalUsers
                      ? `${Math.round((executiveStats.activeUsers / executiveStats.totalUsers) * 100)}%`
                      : '0%'}
                  </div>
                  <div className="text-sm text-gray-400">usuarios ativos / total</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Novos Usuarios</CardTitle>
                  <UserPlus className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{executiveStats?.totalUsers || 0}</div>
                  <div className="text-sm text-gray-400">no periodo</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total de Sessoes</CardTitle>
                  <Calendar className="h-4 w-4 text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{executiveStats?.totalSessions || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Duracao Media</CardTitle>
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
              {/* Item 8: Replaced PieChart with horizontal BarChart */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Paginas Mais Visitadas</CardTitle>
                </CardHeader>
                <CardContent>
                  {(!executiveStats?.topPages || executiveStats.topPages.length === 0) ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">Sem dados disponiveis</div>
                  ) : (
                  <ResponsiveContainer width="100%" height={Math.max(300, (executiveStats?.topPages?.length || 0) * 35)}>
                    <BarChart data={executiveStats?.topPages || []} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" stroke="#9CA3AF" />
                      <YAxis type="category" dataKey="page" stroke="#9CA3AF" width={80} tick={{ fontSize: 12 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="visits" fill="#16a34a">
                        {executiveStats?.topPages?.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Peak Hours */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Horarios de Pico</CardTitle>
                </CardHeader>
                <CardContent>
                  {(!executiveStats?.peakHours || executiveStats.peakHours.length === 0) ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">Sem dados disponiveis</div>
                  ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={executiveStats.peakHours}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      {/* Item 7: Peak hours X-axis format */}
                      <XAxis dataKey="hour" stroke="#9CA3AF" tickFormatter={(hour) => `${String(hour).padStart(2, '0')}h`} />
                      <YAxis stroke="#9CA3AF" />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                      />
                      {/* Item 2: Changed bar fill from red to poker-green */}
                      <Bar dataKey="activity" fill="#16a34a" />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Growth Trends */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Tendencias de Crescimento</CardTitle>
              </CardHeader>
              <CardContent>
                {(!executiveStats?.growthTrends || executiveStats.growthTrends.length === 0) ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">Sem dados de tendencia disponiveis</div>
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={executiveStats.growthTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                      }}
                    />
                    {/* Item 3: Added Legend */}
                    <Legend />
                    {/* Item 2: Changed line strokes from red/orange to green/blue */}
                    <Line type="monotone" dataKey="users" stroke="#16a34a" strokeWidth={2} />
                    <Line type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </TooltipProvider>
  );
};

export default Analytics;
