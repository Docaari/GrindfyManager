import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { getTrialDaysRemaining, getSubscriptionStatus, PLANS } from '../../../shared/permissions';
import { CheckCircle, Crown, Clock, CreditCard } from 'lucide-react';

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

  const status = user ? getSubscriptionStatus(user) : 'expired';
  const trialDays = getTrialDaysRemaining(user?.trialEndsAt);

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

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

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
              <span className="text-sm text-gray-400">
                Valida ate {formatDate(user?.subscriptionEndsAt)}
              </span>
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
                onClick={() => subscribeMutation.mutate('monthly')}
                disabled={subscribeMutation.isPending || status === 'active'}
              >
                {status === 'active' ? 'Assinatura ativa' : subscribeMutation.isPending ? 'Processando...' : 'Assinar Mensal'}
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
                onClick={() => subscribeMutation.mutate('annual')}
                disabled={subscribeMutation.isPending || status === 'active'}
              >
                {status === 'active' ? 'Assinatura ativa' : subscribeMutation.isPending ? 'Processando...' : 'Assinar Anual'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Help Section */}
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Precisa de ajuda?</h3>
            <p className="text-sm text-gray-400">
              Entre em contato com o suporte para duvidas sobre assinaturas ou pagamentos.
              Apos solicitar sua assinatura, nosso time ira confirmar o pagamento e ativar seu acesso.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
