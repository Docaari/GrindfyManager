import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, CreditCard, Crown, Star } from 'lucide-react';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  durationDays: number;
  price: number;
  currency: string;
  features: string[];
  isActive: boolean;
}

interface UserSubscription {
  id: string;
  planId: string;
  status: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  planName: string;
  planDescription: string;
  planPrice: number;
  planFeatures: string[];
}

export default function Subscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch subscription plans
  const { data: plans = [], isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/subscription-plans'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription-plans');
      const jsonData = await response.json();
      return Array.isArray(jsonData) ? jsonData : [];
    }
  });

  // Fetch current user subscription
  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<{ subscription: UserSubscription | null }>({
    queryKey: ['/api/subscriptions/current'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscriptions/current');
      const jsonData = await response.json();
      return jsonData || { subscription: null };
    }
  });

  // Create subscription mutation
  const createSubscription = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest('POST', '/api/subscriptions', {
        planId,
        paymentMethod: 'manual',
        paymentId: 'manual-' + Date.now()
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Assinatura Criada",
        description: "Sua assinatura foi criada com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar assinatura",
        variant: "destructive"
      });
    }
  });

  // Update subscription mutation
  const updateSubscription = useMutation({
    mutationFn: async ({ id, autoRenew }: { id: string; autoRenew: boolean }) => {
      const response = await apiRequest('PUT', `/api/subscriptions/${id}`, { autoRenew });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Assinatura Atualizada",
        description: "Configurações da assinatura foram atualizadas!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar assinatura",
        variant: "destructive"
      });
    }
  });

  // Cancel subscription mutation
  const cancelSubscription = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/subscriptions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Assinatura Cancelada",
        description: "Sua assinatura foi cancelada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao cancelar assinatura",
        variant: "destructive"
      });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Ativa</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Expirada</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="w-3 h-3 mr-1" />Cancelada</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
    }
  };

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'básico':
        return <Star className="w-5 h-5 text-blue-500" />;
      case 'premium':
        return <Crown className="w-5 h-5 text-purple-500" />;
      case 'pro':
        return <Crown className="w-5 h-5 text-yellow-500" />;
      default:
        return <CreditCard className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'BRL'
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getDaysRemaining = (endDate: string) => {
    const today = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-96 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Gerenciar Assinatura
          </h1>
          <p className="text-gray-600">
            Gerencie seu plano de assinatura e acesse funcionalidades premium
          </p>
        </div>

        {/* Current Subscription */}
        {currentSubscription?.subscription && (
          <Card className="mb-8 border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getPlanIcon(currentSubscription.subscription.planName)}
                  <div>
                    <CardTitle className="text-xl">
                      Plano {currentSubscription.subscription.planName}
                    </CardTitle>
                    <CardDescription>
                      {currentSubscription.subscription.planDescription}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(currentSubscription.subscription.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatPrice(currentSubscription.subscription.planPrice, 'USD')}
                  </div>
                  <div className="text-sm text-gray-600">por mês</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {formatDate(currentSubscription.subscription.startDate)}
                  </div>
                  <div className="text-sm text-gray-600">data de início</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {getDaysRemaining(currentSubscription.subscription.endDate)} dias
                  </div>
                  <div className="text-sm text-gray-600">restantes</div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Renovação Automática</span>
                <Switch
                  checked={currentSubscription.subscription.autoRenew}
                  onCheckedChange={(checked) => {
                    updateSubscription.mutate({
                      id: currentSubscription.subscription!.id,
                      autoRenew: checked
                    });
                  }}
                  disabled={updateSubscription.isPending}
                />
              </div>

              <div className="mb-4">
                <h4 className="font-medium mb-2">Recursos Inclusos:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {currentSubscription.subscription.planFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => cancelSubscription.mutate(currentSubscription.subscription!.id)}
                  disabled={cancelSubscription.isPending}
                >
                  {cancelSubscription.isPending ? 'Cancelando...' : 'Cancelar Assinatura'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Available Plans */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {currentSubscription?.subscription ? 'Outros Planos Disponíveis' : 'Escolha seu Plano'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan.id} className={`relative ${
                currentSubscription?.subscription?.planId === plan.id 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'hover:shadow-lg transition-shadow'
              }`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getPlanIcon(plan.name)}
                      <div>
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                      </div>
                    </div>
                    {currentSubscription?.subscription?.planId === plan.id && (
                      <Badge className="bg-blue-100 text-blue-800">Atual</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-3xl font-bold text-gray-900">
                      {formatPrice(plan.price, plan.currency)}
                    </div>
                    <div className="text-sm text-gray-600">por {plan.durationDays} dias</div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Recursos:</h4>
                    <div className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => createSubscription.mutate(plan.id)}
                    disabled={
                      createSubscription.isPending ||
                      currentSubscription?.subscription?.planId === plan.id
                    }
                  >
                    {currentSubscription?.subscription?.planId === plan.id
                      ? 'Plano Atual'
                      : createSubscription.isPending
                      ? 'Criando...'
                      : 'Selecionar Plano'
                    }
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <Card className="bg-gray-100">
          <CardHeader>
            <CardTitle className="text-lg">Precisa de Ajuda?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Dúvidas Frequentes</h4>
                <ul className="text-sm space-y-1 text-gray-600">
                  <li>• Como cancelar minha assinatura?</li>
                  <li>• Posso alterar meu plano a qualquer momento?</li>
                  <li>• Como funciona a renovação automática?</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Suporte</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Entre em contato conosco para qualquer dúvida sobre assinaturas
                </p>
                <Button variant="outline" size="sm">
                  Falar com Suporte
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}