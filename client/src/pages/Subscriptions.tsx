import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { getTrialDaysRemaining, getSubscriptionStatus, PLANS } from '../../../shared/permissions';
import { CheckCircle, Crown, Clock, CreditCard, ExternalLink, XCircle, Settings } from 'lucide-react';
import { useLocation } from 'wouter';

const FEATURES = [
  'Dashboard analitico completo',
  'Import de historicos multi-site',
  'Biblioteca de torneios',
  'Planejamento de grade semanal',
  'Sessoes de grind em tempo real',
  'Preparacao mental / Warm-up',
  'Sistema de estudos',
  'Calendario inteligente',
  'Calculadoras profissionais',
];

export default function Subscriptions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [checkoutCancelled, setCheckoutCancelled] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const status = user ? getSubscriptionStatus(user) : 'expired';
  const trialDays = getTrialDaysRemaining(user?.trialEndsAt);

  // Handle Stripe redirect query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setCheckoutSuccess(true);
      toast({
        title: 'Assinatura realizada!',
        description: 'Seu pagamento foi confirmado. Bem-vindo ao Grindfy!',
      });
      // Clean URL
      window.history.replaceState({}, '', '/subscriptions');
    } else if (params.get('cancelled') === 'true') {
      setCheckoutCancelled(true);
      toast({
        title: 'Checkout cancelado',
        description: 'Voce pode tentar novamente quando quiser.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/subscriptions');
    }
  }, []);

  // Stripe checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async (billingCycle: 'monthly' | 'annual') => {
      return apiRequest('POST', '/api/subscription/checkout', {
        planId: billingCycle, // planId matches billingCycle in PLANS
        billingCycle,
      });
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: 'Erro',
          description: 'Resposta de checkout inválida. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      const statusCode = error?.response?.status;
      // If Stripe unavailable (503), fall back to manual flow
      if (statusCode === 503) {
        subscribeMutation.mutate(
          checkoutMutation.variables as 'monthly' | 'annual'
        );
      } else {
        toast({
          title: 'Erro',
          description: error.message || 'Erro ao iniciar checkout',
          variant: 'destructive',
        });
      }
    },
  });

  // Manual subscription fallback
  const subscribeMutation = useMutation({
    mutationFn: async (billingCycle: 'monthly' | 'annual') => {
      return apiRequest('POST', '/api/subscription/subscribe', { billingCycle });
    },
    onSuccess: () => {
      toast({
        title: 'Solicitacao registrada',
        description: 'Sua solicitacao de assinatura foi registrada. Entre em contato com o suporte para finalizar o pagamento.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao registrar solicitacao',
        variant: 'destructive',
      });
    },
  });

  // Portal mutation
  const portalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/subscription/portal');
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: 'Erro',
          description: 'Não foi possível abrir o portal. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao abrir portal',
        variant: 'destructive',
      });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/subscription/cancel');
    },
    onSuccess: () => {
      toast({
        title: 'Assinatura cancelada',
        description: 'Sua assinatura sera cancelada ao fim do periodo atual.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao cancelar assinatura',
        variant: 'destructive',
      });
    },
  });

  const handleSubscribe = (billingCycle: 'monthly' | 'annual') => {
    checkoutMutation.mutate(billingCycle);
  };

  const handleCancel = () => {
    setCancelDialogOpen(true);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const isPending = checkoutMutation.isPending || subscribeMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            Planos Grindfy
          </h1>
          <p className="text-gray-400">
            Todas as ferramentas que voce precisa para evoluir no poker
          </p>
        </div>

        {/* Success banner */}
        {checkoutSuccess && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <div className="flex items-center justify-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Pagamento confirmado! Sua assinatura esta ativa.</span>
            </div>
          </div>
        )}

        {/* Cancelled banner */}
        {checkoutCancelled && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">Checkout cancelado. Voce pode tentar novamente quando quiser.</span>
            </div>
          </div>
        )}

        {/* Trial Banner */}
        {status === 'trial' && trialDays > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <Clock className="w-5 h-5" />
              <span className="font-medium">
                Voce tem {trialDays} {trialDays === 1 ? 'dia restante' : 'dias restantes'} no seu periodo de teste gratuito
              </span>
            </div>
          </div>
        )}

        {/* Active subscription status */}
        {status === 'active' && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Assinatura ativa</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  Valida ate {formatDate(user?.subscriptionEndsAt)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  <Settings className="w-4 h-4 mr-1" />
                  {portalMutation.isPending ? 'Abrindo...' : 'Gerenciar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-600/50 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar'}
                </Button>
                <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sua assinatura permanecera ativa ate o fim do periodo atual. Depois disso, o acesso aos recursos premium sera encerrado.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setCancelDialogOpen(false);
                          cancelMutation.mutate();
                        }}
                      >
                        Cancelar assinatura
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )}

        {/* Expired status */}
        {status === 'expired' && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
            <span className="text-red-400 font-medium">
              {user?.subscriptionEndsAt
                ? 'Sua assinatura expirou. Renove para continuar usando o Grindfy.'
                : 'Seu periodo de teste terminou. Assine para continuar usando o Grindfy.'}
            </span>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Monthly Plan */}
          <Card className="bg-gray-900 border-gray-700 hover:border-gray-600 transition-colors">
            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CreditCard className="w-6 h-6 text-gray-400" />
                <CardTitle className="text-xl text-white">Mensal</CardTitle>
              </div>
              <div className="mt-2">
                <span className="text-4xl font-bold text-white">R$ 29,90</span>
                <span className="text-gray-400 text-sm">/mes</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Sem fidelidade</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                {FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => handleSubscribe('monthly')}
                disabled={isPending || status === 'active'}
              >
                {status === 'active' ? 'Assinatura ativa' : isPending ? 'Processando...' : 'Assinar Mensal'}
              </Button>
            </CardContent>
          </Card>

          {/* Annual Plan */}
          <Card className="bg-gray-900 border-emerald-500/50 ring-1 ring-emerald-500/20 relative hover:border-emerald-500/70 transition-colors">
            {/* Best value badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-emerald-600 text-white px-3 py-1 text-xs font-bold">
                <Crown className="w-3 h-3 mr-1" />
                Melhor valor
              </Badge>
            </div>

            <CardHeader className="text-center pb-2 pt-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Crown className="w-6 h-6 text-emerald-400" />
                <CardTitle className="text-xl text-white">Anual</CardTitle>
              </div>
              <div className="mt-2">
                <span className="text-4xl font-bold text-white">R$ 19,90</span>
                <span className="text-gray-400 text-sm">/mes</span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm text-gray-500">R$ 238,80/ano</span>
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 text-xs">
                  33% off
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                {FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => handleSubscribe('annual')}
                disabled={isPending || status === 'active'}
              >
                {status === 'active' ? 'Assinatura ativa' : isPending ? 'Processando...' : 'Assinar Anual'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Manage Subscription section (for active users) */}
        {status === 'active' && (
          <Card className="bg-gray-900 border-gray-700 mb-8">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Gerenciar assinatura</h3>
              <p className="text-sm text-gray-400 mb-4">
                Acesse o portal para atualizar forma de pagamento, ver faturas ou alterar seu plano.
              </p>
              <Button
                variant="outline"
                className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {portalMutation.isPending ? 'Abrindo portal...' : 'Abrir Portal de Pagamento'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Help Section */}
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Precisa de ajuda?</h3>
            <p className="text-sm text-gray-400">
              Entre em contato com o suporte para duvidas sobre assinaturas ou pagamentos.
              Se o pagamento online nao estiver disponivel, nosso time ira confirmar o pagamento manualmente e ativar seu acesso.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
