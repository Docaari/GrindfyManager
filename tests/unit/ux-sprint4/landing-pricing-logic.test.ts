import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-03 — Logica de pricing da landing page (FP-01)
//
// Funcoes puras que controlam a logica de pricing na landing:
//   - `getPricingPlans`: retorna array de 3 planos (Gratis, Mensal, Anual)
//   - `formatPrice`: formata valor numerico para string BRL (R$ X,XX)
//   - `calculateAnnualSavings`: calcula economia anual entre mensal e anual
//   - `getPlanFeatures`: retorna features especificas de cada plano
//
// Modulo esperado: `client/src/lib/landing-pricing-helpers.ts`
//
// Fonte de verdade para precos: `shared/permissions.ts` (PLANS)
//   - monthly: pricePerMonth=29.90, totalPrice=29.90
//   - annual: pricePerMonth=19.90, totalPrice=238.80, discount=33
//   - Plano gratuito: nao existe em PLANS, definido estaticamente
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface PricingPlan {
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

// Stubs para compilacao — Implementer substituira
let getPricingPlans: () => PricingPlan[];
let formatPrice: (value: number) => string;
let calculateAnnualSavings: (monthlyPrice: number, annualPricePerMonth: number) => number;
let getPlanFeatures: (planId: string) => string[];

try {
  const mod = require('../../../client/src/lib/landing-pricing-helpers');
  if (mod.getPricingPlans) getPricingPlans = mod.getPricingPlans;
  if (mod.formatPrice) formatPrice = mod.formatPrice;
  if (mod.calculateAnnualSavings) calculateAnnualSavings = mod.calculateAnnualSavings;
  if (mod.getPlanFeatures) getPlanFeatures = mod.getPlanFeatures;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// getPricingPlans — retorna os 3 planos da landing
// ---------------------------------------------------------------------------

describe('getPricingPlans', () => {
  it('deve retornar exatamente 3 planos', () => {
    const plans = getPricingPlans();
    expect(plans).toHaveLength(3);
  });

  it('deve retornar planos na ordem: Gratis, Mensal, Anual', () => {
    const plans = getPricingPlans();
    expect(plans[0].id).toBe('free');
    expect(plans[1].id).toBe('monthly');
    expect(plans[2].id).toBe('annual');
  });

  it('deve retornar plano gratuito com preco zero', () => {
    const plans = getPricingPlans();
    const free = plans.find(p => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.price).toBe(0);
    expect(free!.name).toMatch(/gr[aá]tis/i);
  });

  it('deve retornar plano mensal com preco 29.90 e periodo "mes"', () => {
    const plans = getPricingPlans();
    const monthly = plans.find(p => p.id === 'monthly');
    expect(monthly).toBeDefined();
    expect(monthly!.price).toBe(29.90);
    expect(monthly!.period).toBe('mes');
  });

  it('deve retornar plano anual com preco 19.90/mes e total 238.80/ano', () => {
    const plans = getPricingPlans();
    const annual = plans.find(p => p.id === 'annual');
    expect(annual).toBeDefined();
    expect(annual!.price).toBe(19.90);
    expect(annual!.period).toBe('ano');
    expect(annual!.totalAnnual).toBe(238.80);
  });

  it('deve marcar plano anual com desconto de 33%', () => {
    const plans = getPricingPlans();
    const annual = plans.find(p => p.id === 'annual');
    expect(annual!.discount).toBe(33);
  });

  it('deve marcar apenas o plano anual como highlighted (recomendado)', () => {
    const plans = getPricingPlans();
    const highlighted = plans.filter(p => p.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].id).toBe('annual');
  });

  it('deve ter CTA "Comecar Gratis" no plano gratuito', () => {
    const plans = getPricingPlans();
    const free = plans.find(p => p.id === 'free');
    expect(free!.cta).toMatch(/come[cç]ar gr[aá]tis/i);
  });

  it('deve ter CTA "Assinar Agora" nos planos pagos', () => {
    const plans = getPricingPlans();
    const monthly = plans.find(p => p.id === 'monthly');
    const annual = plans.find(p => p.id === 'annual');
    expect(monthly!.cta).toMatch(/assinar agora/i);
    expect(annual!.cta).toMatch(/assinar agora/i);
  });

  it('cada plano deve ter pelo menos 1 feature', () => {
    const plans = getPricingPlans();
    plans.forEach(plan => {
      expect(plan.features.length).toBeGreaterThan(0);
    });
  });

  it('plano gratuito deve mencionar limitacao (ex: trial ou basico)', () => {
    const plans = getPricingPlans();
    const free = plans.find(p => p.id === 'free');
    const allFeatures = free!.features.join(' ').toLowerCase();
    expect(
      allFeatures.includes('trial') ||
      allFeatures.includes('7 dias') ||
      allFeatures.includes('basico') ||
      allFeatures.includes('básico')
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatPrice — formata valor numerico para BRL
// ---------------------------------------------------------------------------

describe('formatPrice', () => {
  it('deve formatar 29.90 como "R$ 29,90"', () => {
    expect(formatPrice(29.90)).toBe('R$ 29,90');
  });

  it('deve formatar 19.90 como "R$ 19,90"', () => {
    expect(formatPrice(19.90)).toBe('R$ 19,90');
  });

  it('deve formatar 0 como "R$ 0,00"', () => {
    expect(formatPrice(0)).toBe('R$ 0,00');
  });

  it('deve formatar 238.80 como "R$ 238,80"', () => {
    expect(formatPrice(238.80)).toBe('R$ 238,80');
  });

  it('deve formatar valor inteiro com centavos (100 → "R$ 100,00")', () => {
    expect(formatPrice(100)).toBe('R$ 100,00');
  });

  it('deve formatar valor com 1 casa decimal (9.9 → "R$ 9,90")', () => {
    expect(formatPrice(9.9)).toBe('R$ 9,90');
  });
});

// ---------------------------------------------------------------------------
// calculateAnnualSavings — calcula economia anual
// ---------------------------------------------------------------------------

describe('calculateAnnualSavings', () => {
  it('deve calcular economia anual entre mensal (29.90) e anual (19.90)', () => {
    // 29.90 * 12 = 358.80 | 19.90 * 12 = 238.80 | economia = 120.00
    const savings = calculateAnnualSavings(29.90, 19.90);
    expect(savings).toBeCloseTo(120.00, 1);
  });

  it('deve retornar 0 quando precos sao iguais', () => {
    expect(calculateAnnualSavings(29.90, 29.90)).toBe(0);
  });

  it('deve retornar valor positivo quando anual e mais barato', () => {
    const savings = calculateAnnualSavings(50, 30);
    expect(savings).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getPlanFeatures — retorna features por plano
// ---------------------------------------------------------------------------

describe('getPlanFeatures', () => {
  it('deve retornar features para plano gratuito', () => {
    const features = getPlanFeatures('free');
    expect(features.length).toBeGreaterThan(0);
  });

  it('deve retornar features para plano mensal', () => {
    const features = getPlanFeatures('monthly');
    expect(features.length).toBeGreaterThan(0);
  });

  it('deve retornar features para plano anual', () => {
    const features = getPlanFeatures('annual');
    expect(features.length).toBeGreaterThan(0);
  });

  it('plano anual deve ter pelo menos tantas features quanto o mensal', () => {
    const monthlyFeatures = getPlanFeatures('monthly');
    const annualFeatures = getPlanFeatures('annual');
    expect(annualFeatures.length).toBeGreaterThanOrEqual(monthlyFeatures.length);
  });

  it('deve retornar array vazio para plano desconhecido', () => {
    const features = getPlanFeatures('inexistente');
    expect(features).toEqual([]);
  });

  it('features devem estar em portugues (sem palavras em ingles comuns)', () => {
    const features = getPlanFeatures('monthly');
    features.forEach(feature => {
      // Nao deve conter palavras em ingles (exceto termos de poker: ROI, MTT)
      expect(feature).not.toMatch(/\b(unlimited|access|full|basic|free|premium)\b/i);
    });
  });
});
