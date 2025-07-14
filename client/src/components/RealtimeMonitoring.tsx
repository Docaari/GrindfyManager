import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle, Users, Clock, TrendingUp, Server, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';

interface OnlineUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  lastActivity: Date;
}

interface RealtimeActivity {
  id: string;
  userId: string;
  email: string;
  page: string;
  action: string;
  feature: string;
  createdAt: Date;
}

interface Alert {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

interface SystemHealth {
  totalUsers: { count: number }[];
  activeUsers: { count: number }[];
  activityLast1h: { count: number }[];
  errorRate: number;
}

interface MonitoringData {
  onlineUsers: OnlineUser[];
  realtimeActivity: RealtimeActivity[];
  alerts: Alert[];
  systemHealth: SystemHealth;
}

const RealtimeMonitoring: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 segundos
  const queryClient = useQueryClient();

  // Buscar dados de monitoramento
  const { data: monitoringData, isLoading, error } = useQuery<MonitoringData>({
    queryKey: ['/api/admin/monitoring'],
    queryFn: () => apiRequest('/api/admin/monitoring'),
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: true
  });

  // Forçar atualização manual
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/monitoring'] });
  };

  // Definir cores de alerta
  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Ícones para diferentes tipos de alerta
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'info': return <CheckCircle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  // Formatação de tempo relativo
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2 animate-pulse" />
              Carregando monitoramento...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-red-600">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Erro no Monitoramento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Não foi possível carregar os dados de monitoramento.
          </p>
          <Button onClick={handleRefresh} className="bg-red-600 hover:bg-red-700">
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles de Monitoramento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Server className="h-5 w-5 mr-2 text-blue-600" />
              Painel de Monitoramento em Tempo Real
            </div>
            <Button 
              onClick={handleRefresh}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <Label htmlFor="auto-refresh" className="text-sm">
                  Atualização automática
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Label className="text-sm">Intervalo:</Label>
                <select 
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                  <option value={30000}>30s</option>
                  <option value={60000}>1min</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">
                Última atualização: {formatRelativeTime(new Date())}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertas do Sistema */}
      {monitoringData?.alerts && monitoringData.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Alertas do Sistema ({monitoringData.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {monitoringData.alerts.map((alert, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getAlertColor(alert.type)}`}>
                  <div className="flex items-start space-x-3">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1">
                      <h4 className="font-medium">{alert.title}</h4>
                      <p className="text-sm mt-1">{alert.message}</p>
                      <span className="text-xs mt-2 block opacity-75">
                        {formatRelativeTime(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usuários Online */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-green-600" />
              Usuários Online ({monitoringData?.onlineUsers?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {monitoringData?.onlineUsers?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum usuário online no momento</p>
                </div>
              ) : (
                monitoringData?.onlineUsers?.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {formatRelativeTime(user.lastActivity)}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Atividade em Tempo Real */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-blue-600" />
              Atividade em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {monitoringData?.realtimeActivity?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma atividade recente</p>
                </div>
              ) : (
                monitoringData?.realtimeActivity?.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {activity.action}
                        </Badge>
                        <span className="text-sm font-medium text-gray-900">
                          {activity.email?.split('@')[0]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {activity.page} {activity.feature && `→ ${activity.feature}`}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(activity.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas do Sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
            Saúde do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {Number(monitoringData?.systemHealth?.totalUsers?.[0]?.count || 0)}
              </div>
              <p className="text-sm text-gray-600">Total de Usuários</p>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {Number(monitoringData?.systemHealth?.activeUsers?.[0]?.count || 0)}
              </div>
              <p className="text-sm text-gray-600">Usuários Ativos</p>
            </div>
            
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {Number(monitoringData?.systemHealth?.activityLast1h?.[0]?.count || 0)}
              </div>
              <p className="text-sm text-gray-600">Atividade (1h)</p>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {(monitoringData?.systemHealth?.errorRate || 0).toFixed(1)}%
              </div>
              <p className="text-sm text-gray-600">Taxa de Erro</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealtimeMonitoring;