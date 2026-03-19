import { describe, it, expect } from 'vitest';
import {
  getUserTags,
  hasTagAccess,
  hasPageAccess,
  getSubscriptionPlanName,
  getSubscriptionPlanInfo,
} from '../../../client/src/lib/permissions';
import type { SubscriptionPlan } from '../../../client/src/lib/permissions';

// =============================================================================
// Testes de Caracterizacao: Funcoes de permissao do cliente (client/src/lib/permissions.ts)
//
// Wrapper do lado client que usa SUBSCRIPTION_PROFILES do shared/permissions.ts.
// Estas funcoes sao usadas pelo usePermission hook e pelo Dashboard para
// controle de acesso (ex: usePermission('dashboard_access')).
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// getUserTags (client) — retorna tags de um plano
// ---------------------------------------------------------------------------

describe('getUserTags (client)', () => {
  it('deve retornar tags do plano basico', () => {
    const tags = getUserTags('basico');
    expect(tags).toContain('Grade');
    expect(tags).toContain('Grind');
  });

  it('deve retornar tags do plano premium incluindo Dashboard', () => {
    const tags = getUserTags('premium');
    expect(tags).toContain('Dashboard');
    expect(tags).toContain('Import');
  });

  it('deve retornar tags do plano pro com funcionalidades extras', () => {
    const tags = getUserTags('pro');
    expect(tags).toContain('Warm Up');
    expect(tags).toContain('Calendario');
    expect(tags).toContain('Estudos');
    expect(tags).toContain('Biblioteca');
  });

  it('deve retornar array vazio para plano invalido', () => {
    // O type system nao permite, mas em runtime pode acontecer
    const tags = getUserTags('invalido' as SubscriptionPlan);
    expect(tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasTagAccess (client) — verifica acesso por tag
// ---------------------------------------------------------------------------

describe('hasTagAccess (client)', () => {
  it('deve retornar true para plano premium com tag Dashboard', () => {
    expect(hasTagAccess('premium', 'Dashboard')).toBe(true);
  });

  it('deve retornar false para plano basico com tag Dashboard', () => {
    expect(hasTagAccess('basico', 'Dashboard')).toBe(false);
  });

  it('deve retornar true para plano admin com qualquer tag', () => {
    expect(hasTagAccess('admin', 'Admin Full')).toBe(true);
    expect(hasTagAccess('admin', 'Analytics')).toBe(true);
  });

  it('deve retornar true para plano basico com tag Grade', () => {
    expect(hasTagAccess('basico', 'Grade')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasPageAccess (client) — verifica acesso por pagina
// ---------------------------------------------------------------------------

describe('hasPageAccess (client)', () => {
  it('deve retornar true para plano premium na pagina dashboard', () => {
    expect(hasPageAccess('premium', 'dashboard')).toBe(true);
  });

  it('deve retornar false para plano basico na pagina dashboard', () => {
    expect(hasPageAccess('basico', 'dashboard')).toBe(false);
  });

  it('deve retornar true para plano basico na pagina grade-planner', () => {
    expect(hasPageAccess('basico', 'grade-planner')).toBe(true);
  });

  it('deve retornar true para plano pro na pagina estudos', () => {
    expect(hasPageAccess('pro', 'estudos')).toBe(true);
  });

  it('deve retornar false para plano premium na pagina estudos', () => {
    expect(hasPageAccess('premium', 'estudos')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionPlanName — nome legivel do plano
// ---------------------------------------------------------------------------

describe('getSubscriptionPlanName', () => {
  it('deve retornar "Basico" para basico', () => {
    expect(getSubscriptionPlanName('basico')).toBe('Básico');
  });

  it('deve retornar "Premium" para premium', () => {
    expect(getSubscriptionPlanName('premium')).toBe('Premium');
  });

  it('deve retornar "Pro" para pro', () => {
    expect(getSubscriptionPlanName('pro')).toBe('Pro');
  });

  it('deve retornar "Admin" para admin', () => {
    expect(getSubscriptionPlanName('admin')).toBe('Admin');
  });

  it('deve retornar "Desconhecido" para plano invalido', () => {
    expect(getSubscriptionPlanName('invalido' as SubscriptionPlan)).toBe('Desconhecido');
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionPlanInfo — informacoes detalhadas do plano
// ---------------------------------------------------------------------------

describe('getSubscriptionPlanInfo', () => {
  it('deve retornar info completa para plano premium', () => {
    const info = getSubscriptionPlanInfo('premium');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('Premium');
    expect(info!.tags).toContain('Dashboard');
    expect(info!.pages).toContain('dashboard');
    expect(Array.isArray(info!.features)).toBe(true);
  });

  it('deve retornar null para plano inexistente', () => {
    const info = getSubscriptionPlanInfo('invalido' as SubscriptionPlan);
    expect(info).toBeNull();
  });

  it('deve retornar description para cada plano valido', () => {
    const plans: SubscriptionPlan[] = ['basico', 'premium', 'pro', 'admin'];
    for (const plan of plans) {
      const info = getSubscriptionPlanInfo(plan);
      expect(info).not.toBeNull();
      expect(info!.description.length).toBeGreaterThan(0);
    }
  });

  it('info de admin deve ter todas as tags', () => {
    const info = getSubscriptionPlanInfo('admin');
    expect(info).not.toBeNull();
    expect(info!.tags.length).toBeGreaterThanOrEqual(13);
  });
});
