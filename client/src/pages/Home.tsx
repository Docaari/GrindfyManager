import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingUp, Trophy, Target, Calendar, Clock, DollarSign, Users, Mail, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserStats {
  totalSessions: number;
  totalTournaments: number;
  totalProfit: number;
  roi: number;
  averageBuyIn: number;
  itm: number;
  finalTables: number;
  bigHits: number;
  lastActivity: string;
  weeklyGoal: number;
  weeklyProgress: number;
}

interface SubscriptionData {
  isActive: boolean;
  planType: string;
  daysUntilExpiration: number;
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    planType: string;
    autoRenewal: boolean;
  } | null;
}

export default function Home() {
  const { user } = useAuth();

  const { data: userStats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/user/stats'],
  });

  const { data: subscriptionData } = useQuery<SubscriptionData>({
    queryKey: ['/api/subscription/status'],
  });

  const getMotivationalMessage = () => {
    if (!userStats || !subscriptionData) return "Bem-vindo ao Grindfy!";

    const { totalSessions, roi, totalProfit } = userStats;
    const { isActive, planType, daysUntilExpiration } = subscriptionData;

    if (!isActive) {
      if (totalSessions > 0) {
        return `Você já registrou ${totalSessions} sessões e teve ${roi > 0 ? 'lucro' : 'aprendizado'} de ${roi.toFixed(1)}%! Continue evoluindo com o Grindfy.`;
      }
      return "Comece sua jornada rumo ao sucesso no poker! O Grindfy está aqui para te ajudar.";
    }

    if (daysUntilExpiration <= 7) {
      return `Sua assinatura ${planType} expira em ${daysUntilExpiration} dias. Renove para continuar evoluindo!`;
    }

    if (totalProfit > 0) {
      return `Parabéns! Você já lucrou R$ ${totalProfit.toFixed(2)} com ${totalSessions} sessões registradas.`;
    }

    if (totalSessions > 10) {
      return `Excelente dedicação! ${totalSessions} sessões registradas. Continue focado no seu crescimento.`;
    }

    return "Você está no caminho certo! Cada sessão registrada é um passo rumo ao sucesso.";
  };

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

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Carregando dados...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Olá, {user?.firstName || user?.username}!
          </h1>
          <p className="text-xl text-gray-300 mb-6">
            {getMotivationalMessage()}
          </p>
          
          {subscriptionData && (
            <div className="flex justify-center items-center gap-4 mb-6">
              <Badge 
                variant="outline" 
                className={`${getPlanBadgeColor(subscriptionData.planType)} text-lg px-4 py-2`}
              >
                Plano {getPlanName(subscriptionData.planType)}
              </Badge>
              <Badge 
                variant="outline"
                className={subscriptionData.isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}
              >
                {subscriptionData.isActive ? 'Ativo' : 'Expirado'}
              </Badge>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Sessões Registradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">
                {userStats?.totalSessions || 0}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Total de sessões de grind
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                ROI Geral
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(userStats?.roi || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(userStats?.roi || 0).toFixed(1)}%
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Retorno sobre investimento
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Lucro Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(userStats?.totalProfit || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                R$ {(userStats?.totalProfit || 0).toFixed(2)}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Resultado acumulado
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Torneios Jogados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400">
                {userStats?.totalTournaments || 0}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Total de torneios
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Detalhada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">ABI Médio:</span>
                <span className="text-white font-semibold">R$ {(userStats?.averageBuyIn || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">ITM:</span>
                <span className="text-white font-semibold">{(userStats?.itm || 0).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Final Tables:</span>
                <span className="text-white font-semibold">{userStats?.finalTables || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Big Hits:</span>
                <span className="text-white font-semibold">{userStats?.bigHits || 0}</span>
              </div>
              {userStats?.lastActivity && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Última Atividade:</span>
                  <span className="text-white font-semibold">
                    {formatDistanceToNow(new Date(userStats.lastActivity), { 
                      addSuffix: true, 
                      locale: ptBR 
                    })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Target className="h-5 w-5" />
                Progresso Semanal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">Meta Semanal de Sessões</span>
                  <span className="text-white">{userStats?.weeklyProgress || 0}/{userStats?.weeklyGoal || 5}</span>
                </div>
                <Progress 
                  value={((userStats?.weeklyProgress || 0) / (userStats?.weeklyGoal || 5)) * 100} 
                  className="h-2"
                />
              </div>
              <p className="text-sm text-gray-400">
                {(userStats?.weeklyProgress || 0) >= (userStats?.weeklyGoal || 5) 
                  ? "Parabéns! Meta semanal alcançada!" 
                  : `Faltam ${(userStats?.weeklyGoal || 5) - (userStats?.weeklyProgress || 0)} sessões para atingir sua meta.`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {!subscriptionData?.isActive && (
            <Button 
              size="lg" 
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold"
            >
              <Trophy className="h-5 w-5 mr-2" />
              Renovar Assinatura
            </Button>
          )}
          
          {subscriptionData?.isActive && subscriptionData.daysUntilExpiration <= 7 && (
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg font-semibold"
            >
              <Clock className="h-5 w-5 mr-2" />
              Renovar Antes do Vencimento
            </Button>
          )}

          <Button 
            variant="outline" 
            size="lg" 
            className="border-gray-600 text-gray-300 hover:bg-gray-800 px-8 py-3 text-lg"
          >
            <MessageCircle className="h-5 w-5 mr-2" />
            Contato e Suporte
          </Button>

          <Button 
            variant="outline" 
            size="lg" 
            className="border-gray-600 text-gray-300 hover:bg-gray-800 px-8 py-3 text-lg"
          >
            <Mail className="h-5 w-5 mr-2" />
            Falar com Especialista
          </Button>
        </div>

        {/* Subscription Info */}
        {subscriptionData?.subscription && (
          <Card className="bg-gray-800 border-gray-700 mt-12">
            <CardHeader>
              <CardTitle className="text-white">Informações da Assinatura</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-300 mb-2">Plano Atual:</p>
                  <p className="text-white font-semibold">{getPlanName(subscriptionData.subscription.planType)}</p>
                </div>
                <div>
                  <p className="text-gray-300 mb-2">Vencimento:</p>
                  <p className="text-white font-semibold">
                    {new Date(subscriptionData.subscription.endDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-300 mb-2">Renovação Automática:</p>
                  <p className="text-white font-semibold">
                    {subscriptionData.subscription.autoRenewal ? 'Ativada' : 'Desativada'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-300 mb-2">Status:</p>
                  <Badge 
                    variant="outline"
                    className={subscriptionData.isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}
                  >
                    {subscriptionData.isActive ? 'Ativo' : 'Expirado'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}