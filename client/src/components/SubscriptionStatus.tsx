import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Shield, Target, TrendingUp, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SubscriptionData {
  isActive: boolean;
  planType: string;
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    planType: string;
    autoRenewal: boolean;
  } | null;
  metrics: {
    dailyLoginStreak: number;
    weeklySessionCount: number;
    motivationScore: number;
    lastLogin: string;
  } | null;
}

export default function SubscriptionStatus() {
  const { data: subscriptionData, isLoading, error } = useQuery<SubscriptionData>({
    queryKey: ['/api/subscription/status'],
    refetchInterval: 30000 // Atualizar a cada 30 segundos
  });

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Carregando Status da Assinatura...
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
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Shield className="h-5 w-5" />
            Erro ao Carregar Assinatura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">
            Não foi possível carregar as informações da assinatura. Tente novamente mais tarde.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getPlanBadgeColor = (planType: string) => {
    switch (planType) {
      case 'basic':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'premium':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'pro':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPlanName = (planType: string) => {
    switch (planType) {
      case 'basic':
        return 'Básico';
      case 'premium':
        return 'Premium';
      case 'pro':
        return 'Pro';
      default:
        return planType;
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800 border-green-300' 
      : 'bg-red-100 text-red-800 border-red-300';
  };

  const getMotivationColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Card Principal - Status da Assinatura */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Status da Assinatura
          </CardTitle>
          <CardDescription>
            Informações sobre sua assinatura atual e acesso às funcionalidades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge 
              variant="outline" 
              className={getPlanBadgeColor(subscriptionData?.planType || 'basic')}
            >
              Plano {getPlanName(subscriptionData?.planType || 'basic')}
            </Badge>
            <Badge 
              variant="outline"
              className={getStatusBadgeColor(subscriptionData?.isActive || false)}
            >
              {subscriptionData?.isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          {subscriptionData?.subscription && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Início:</span>
                </div>
                <p className="text-sm font-medium">
                  {new Date(subscriptionData.subscription.startDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Vencimento:</span>
                </div>
                <p className="text-sm font-medium">
                  {new Date(subscriptionData.subscription.endDate).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(subscriptionData.subscription.endDate), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Renovação Automática:</span>
            <Badge variant="outline" className="text-xs">
              {subscriptionData?.subscription?.autoRenewal ? 'Ativada' : 'Desativada'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Card de Métricas de Engajamento */}
      {subscriptionData?.metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Métricas de Engajamento
            </CardTitle>
            <CardDescription>
              Acompanhe sua atividade e progresso na plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Target className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">Streak Diário</span>
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  {subscriptionData.metrics.dailyLoginStreak}
                </p>
                <p className="text-xs text-gray-500">dias consecutivos</p>
              </div>

              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Sessões Semanais</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {subscriptionData.metrics.weeklySessionCount}
                </p>
                <p className="text-xs text-gray-500">esta semana</p>
              </div>

              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Motivação</span>
                </div>
                <p className={`text-2xl font-bold ${getMotivationColor(subscriptionData.metrics.motivationScore)}`}>
                  {subscriptionData.metrics.motivationScore}%
                </p>
                <p className="text-xs text-gray-500">score atual</p>
              </div>

              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Último Login</span>
                </div>
                <p className="text-sm font-medium text-purple-600">
                  {formatDistanceToNow(new Date(subscriptionData.metrics.lastLogin), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acesso às Funcionalidades */}
      <Card>
        <CardHeader>
          <CardTitle>Funcionalidades Disponíveis</CardTitle>
          <CardDescription>
            Recursos liberados para o seu plano atual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {subscriptionData?.planType === 'basic' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600">✓ Dashboard e Analytics</p>
                <p className="text-sm font-medium text-green-600">✓ Upload de Torneios</p>
                <p className="text-sm font-medium text-gray-400">✗ Estudos Avançados</p>
                <p className="text-sm font-medium text-gray-400">✗ Grind Sessions</p>
                <p className="text-sm font-medium text-gray-400">✗ Warm-up Mental</p>
              </div>
            )}

            {subscriptionData?.planType === 'premium' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600">✓ Todas as funcionalidades básicas</p>
                <p className="text-sm font-medium text-green-600">✓ Estudos Avançados</p>
                <p className="text-sm font-medium text-green-600">✓ Grind Sessions</p>
                <p className="text-sm font-medium text-green-600">✓ Warm-up Mental</p>
                <p className="text-sm font-medium text-green-600">✓ Grade Planner</p>
                <p className="text-sm font-medium text-gray-400">✗ Relatórios Executivos</p>
              </div>
            )}

            {subscriptionData?.planType === 'pro' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600">✓ Todas as funcionalidades premium</p>
                <p className="text-sm font-medium text-green-600">✓ Weekly Planner</p>
                <p className="text-sm font-medium text-green-600">✓ Performance Avançada</p>
                <p className="text-sm font-medium text-green-600">✓ Relatórios Executivos</p>
                <p className="text-sm font-medium text-green-600">✓ Analytics de Usuário</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}