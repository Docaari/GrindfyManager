import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Users, Clock, AlertCircle } from 'lucide-react';

interface RealtimeMonitoringProps {
  className?: string;
}

export default function RealtimeMonitoring({ className = '' }: RealtimeMonitoringProps) {
  const [stats, setStats] = useState({
    activeUsers: 0,
    totalSessions: 0,
    avgSessionTime: 0,
    errorRate: 0,
  });

  useEffect(() => {
    // Simulação de dados em tempo real
    const interval = setInterval(() => {
      setStats({
        activeUsers: Math.floor(Math.random() * 10) + 1,
        totalSessions: Math.floor(Math.random() * 50) + 20,
        avgSessionTime: Math.floor(Math.random() * 30) + 15,
        errorRate: Math.random() * 2,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Monitoramento em Tempo Real
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm">Usuários Ativos</span>
            </div>
            <Badge variant="secondary" className="bg-blue-500 text-white">
              {stats.activeUsers}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <span className="text-sm">Tempo Médio</span>
            </div>
            <Badge variant="secondary" className="bg-green-500 text-white">
              {stats.avgSessionTime}min
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              <span className="text-sm">Sessões Hoje</span>
            </div>
            <Badge variant="secondary" className="bg-purple-500 text-white">
              {stats.totalSessions}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm">Taxa de Erro</span>
            </div>
            <Badge variant="secondary" className="bg-red-500 text-white">
              {stats.errorRate.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}