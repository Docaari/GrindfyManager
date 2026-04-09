// Landing page pricing helpers
// Source of truth for prices: shared/permissions.ts (PLANS)

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  highlighted: boolean;
  cta: string;
  discount?: number;
  totalAnnual?: number;
}

const planFeatures: Record<string, string[]> = {
  free: [
    'Trial de 7 dias com acesso completo',
    'Dashboard basico de performance',
    'Import de historico (1 rede)',
  ],
  monthly: [
    'Dashboard completo de performance',
    'Import ilimitado de todas as redes',
    'Biblioteca de torneios',
    'Grade semanal com perfis A/B/C',
    'Grind ao vivo com acompanhamento',
    'Preparacao mental e warm-up',
  ],
  annual: [
    'Dashboard completo de performance',
    'Import ilimitado de todas as redes',
    'Biblioteca de torneios',
    'Grade semanal com perfis A/B/C',
    'Grind ao vivo com acompanhamento',
    'Preparacao mental e warm-up',
    'Suporte prioritario',
  ],
};

export function getPricingPlans(): PricingPlan[] {
  return [
    {
      id: 'free',
      name: 'Gratis',
      price: 0,
      period: 'mes',
      features: planFeatures.free,
      highlighted: false,
      cta: 'Comecar Gratis',
    },
    {
      id: 'monthly',
      name: 'Mensal',
      price: 29.90,
      period: 'mes',
      features: planFeatures.monthly,
      highlighted: false,
      cta: 'Assinar Agora',
    },
    {
      id: 'annual',
      name: 'Anual',
      price: 19.90,
      period: 'ano',
      features: planFeatures.annual,
      highlighted: true,
      cta: 'Assinar Agora',
      discount: 33,
      totalAnnual: 238.80,
    },
  ];
}

export function formatPrice(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function calculateAnnualSavings(monthlyPrice: number, annualPricePerMonth: number): number {
  return (monthlyPrice - annualPricePerMonth) * 12;
}

export function getPlanFeatures(planId: string): string[] {
  return planFeatures[planId] ?? [];
}
