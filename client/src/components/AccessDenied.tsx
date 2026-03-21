import React from 'react';
import { Lock, TrendingUp, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionStatus } from '../../../shared/permissions';

interface AccessDeniedProps {
  featureName?: string;
  description?: string;
  reason?: 'trial_expired' | 'subscription_expired';
  // Legacy props (ignored but kept for backward compat during transition)
  currentPlan?: string;
  requiredPlan?: string;
  pageName?: string;
  onViewPlans?: () => void;
}

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

export default function AccessDenied({
  featureName,
  description,
  reason,
}: AccessDeniedProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // Auto-detect reason if not provided
  const effectiveReason = reason || (user ? (
    getSubscriptionStatus(user) === 'expired'
      ? (user.subscriptionEndsAt ? 'subscription_expired' : 'trial_expired')
      : 'trial_expired'
  ) : 'trial_expired');

  const title = effectiveReason === 'subscription_expired'
    ? 'Sua assinatura expirou'
    : 'Seu periodo de teste terminou';

  const subtitle = effectiveReason === 'subscription_expired'
    ? 'Renove sua assinatura para continuar usando todas as funcionalidades do Grindfy.'
    : 'Assine o Grindfy para continuar usando todas as funcionalidades.';

  const buttonText = effectiveReason === 'subscription_expired'
    ? 'Renovar assinatura'
    : 'Assinar agora';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),rgba(0,0,0,0))]"></div>

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <Lock className="w-16 h-16 text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            {title}
          </h1>
          <p className="text-lg text-gray-300 max-w-xl mx-auto">
            {subtitle}
          </p>
          {featureName && (
            <p className="text-sm text-gray-400 mt-2">
              Voce tentou acessar: {featureName}
            </p>
          )}
        </div>

        {/* Features included */}
        <Card className="bg-slate-800/70 border-slate-700 mb-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Tudo incluso na sua assinatura:
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pricing preview */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="bg-slate-800/70 border-slate-700">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-gray-400 mb-1">Mensal</p>
              <p className="text-2xl font-bold text-white">R$ 29,90</p>
              <p className="text-xs text-gray-500">por mes</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/70 border-emerald-500/50 ring-1 ring-emerald-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-emerald-400 mb-1">Anual - 33% off</p>
              <p className="text-2xl font-bold text-white">R$ 19,90</p>
              <p className="text-xs text-gray-500">por mes (R$ 238,80/ano)</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <Button
            onClick={() => navigate('/subscriptions')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 text-lg font-semibold"
          >
            <TrendingUp className="w-5 h-5 mr-2" />
            {buttonText}
          </Button>
          <div>
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white hover:bg-slate-800"
              onClick={() => window.history.back()}
            >
              Voltar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
