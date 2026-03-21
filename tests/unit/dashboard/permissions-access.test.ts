import { describe, it, expect } from 'vitest';
import {
  isSuperAdmin,
  SUPER_ADMIN_EMAILS,
  SUBSCRIPTION_PROFILES,
  TAGS,
  hasPageAccess,
  hasTagAccess,
  getUserTags,
  getRequiredPlanForTag,
  getRequiredPlanForPage,
  getMinimumPlanForRoute,
  hasRouteAccess,
  getPlanDisplayName,
  LEGACY_PERMISSIONS_MAP,
} from '../../../shared/permissions';

// =============================================================================
// Testes de Caracterizacao: Sistema de permissoes e acesso (shared/permissions.ts)
//
// Usado pelo Dashboard para controle de acesso via usePermission hook.
// Documenta o comportamento ATUAL do sistema de tags e perfis de assinatura.
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// isSuperAdmin — verifica se email e do super admin
// ---------------------------------------------------------------------------

describe('isSuperAdmin', () => {
  it('deve retornar true para email do super admin', () => {
    expect(isSuperAdmin(SUPER_ADMIN_EMAILS[0])).toBe(true);
  });

  it('deve retornar false para qualquer outro email', () => {
    expect(isSuperAdmin('outro@email.com')).toBe(false);
  });

  it('deve retornar false para string vazia', () => {
    expect(isSuperAdmin('')).toBe(false);
  });

  it('deve ser case-sensitive', () => {
    expect(isSuperAdmin(SUPER_ADMIN_EMAILS[0].toUpperCase())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUBSCRIPTION_PROFILES — estrutura dos perfis de assinatura
// ---------------------------------------------------------------------------

describe('SUBSCRIPTION_PROFILES', () => {
  it('deve ter 4 perfis: basico, premium, pro, admin', () => {
    expect(Object.keys(SUBSCRIPTION_PROFILES)).toEqual(
      expect.arrayContaining(['basico', 'premium', 'pro', 'admin'])
    );
    expect(Object.keys(SUBSCRIPTION_PROFILES)).toHaveLength(4);
  });

  it('perfil basico deve ter tags Grade e Grind apenas', () => {
    const basico = SUBSCRIPTION_PROFILES['basico'];
    expect(basico.tags).toEqual([TAGS.GRADE, TAGS.GRIND]);
  });

  it('perfil premium deve ter tags do basico + Dashboard + Import', () => {
    const premium = SUBSCRIPTION_PROFILES['premium'];
    expect(premium.tags).toContain(TAGS.GRADE);
    expect(premium.tags).toContain(TAGS.GRIND);
    expect(premium.tags).toContain(TAGS.DASHBOARD);
    expect(premium.tags).toContain(TAGS.IMPORT);
    expect(premium.tags).toHaveLength(4);
  });

  it('perfil pro deve ter todas as tags do premium + extras', () => {
    const pro = SUBSCRIPTION_PROFILES['pro'];
    // Deve conter todas as tags do premium
    for (const tag of SUBSCRIPTION_PROFILES['premium'].tags) {
      expect(pro.tags).toContain(tag);
    }
    // Deve conter tags extras
    expect(pro.tags).toContain(TAGS.WARM_UP);
    expect(pro.tags).toContain(TAGS.CALENDARIO);
    expect(pro.tags).toContain(TAGS.ESTUDOS);
    expect(pro.tags).toContain(TAGS.BIBLIOTECA);
    expect(pro.tags).toContain(TAGS.FERRAMENTAS);
  });

  it('perfil admin deve ter TODAS as tags', () => {
    const admin = SUBSCRIPTION_PROFILES['admin'];
    const allTagValues = Object.values(TAGS);
    for (const tag of allTagValues) {
      expect(admin.tags).toContain(tag);
    }
  });

  it('cada perfil deve ter name, description, tags, pages e features', () => {
    for (const [, profile] of Object.entries(SUBSCRIPTION_PROFILES)) {
      expect(profile).toHaveProperty('name');
      expect(profile).toHaveProperty('description');
      expect(profile).toHaveProperty('tags');
      expect(profile).toHaveProperty('pages');
      expect(profile).toHaveProperty('features');
      expect(Array.isArray(profile.tags)).toBe(true);
      expect(Array.isArray(profile.pages)).toBe(true);
      expect(Array.isArray(profile.features)).toBe(true);
    }
  });

  it('perfil basico nao deve ter acesso ao dashboard', () => {
    const basico = SUBSCRIPTION_PROFILES['basico'];
    expect(basico.tags).not.toContain(TAGS.DASHBOARD);
    expect(basico.pages).not.toContain('dashboard');
  });

  it('perfil premium deve ter acesso ao dashboard', () => {
    const premium = SUBSCRIPTION_PROFILES['premium'];
    expect(premium.tags).toContain(TAGS.DASHBOARD);
    expect(premium.pages).toContain('dashboard');
  });
});

// ---------------------------------------------------------------------------
// getUserTags — retorna tags de um plano
// ---------------------------------------------------------------------------

describe('getUserTags', () => {
  it('deve retornar tags do plano basico', () => {
    const tags = getUserTags('basico');
    expect(tags).toEqual([TAGS.GRADE, TAGS.GRIND]);
  });

  it('deve retornar tags do plano premium', () => {
    const tags = getUserTags('premium');
    expect(tags).toContain(TAGS.DASHBOARD);
    expect(tags).toContain(TAGS.IMPORT);
  });

  it('deve retornar array vazio para plano inexistente', () => {
    const tags = getUserTags('inexistente');
    expect(tags).toEqual([]);
  });

  it('deve retornar array vazio para string vazia', () => {
    const tags = getUserTags('');
    expect(tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasTagAccess — verifica se plano tem acesso a uma tag
// ---------------------------------------------------------------------------

describe('hasTagAccess', () => {
  it('deve retornar true para super admin independente do plano', () => {
    expect(hasTagAccess('basico', TAGS.ADMIN_FULL, SUPER_ADMIN_EMAILS[0])).toBe(true);
  });

  it('deve retornar true para tag que o plano possui', () => {
    expect(hasTagAccess('premium', TAGS.DASHBOARD)).toBe(true);
  });

  it('deve retornar false para tag que o plano NAO possui', () => {
    expect(hasTagAccess('basico', TAGS.DASHBOARD)).toBe(false);
  });

  it('deve retornar true quando permissao individual concede acesso', () => {
    const individualPerms = ['dashboard_access'];
    expect(hasTagAccess('basico', TAGS.DASHBOARD, undefined, individualPerms)).toBe(true);
  });

  it('deve retornar false para plano basico acessando Analytics', () => {
    expect(hasTagAccess('basico', TAGS.ANALYTICS)).toBe(false);
  });

  it('deve retornar true para plano admin acessando qualquer tag', () => {
    const allTags = Object.values(TAGS);
    for (const tag of allTags) {
      expect(hasTagAccess('admin', tag)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// hasPageAccess — verifica acesso a uma pagina
// ---------------------------------------------------------------------------

describe('hasPageAccess', () => {
  it('deve retornar true para super admin em qualquer pagina', () => {
    expect(hasPageAccess('basico', 'dashboard', SUPER_ADMIN_EMAILS[0])).toBe(true);
    expect(hasPageAccess('basico', 'analytics', SUPER_ADMIN_EMAILS[0])).toBe(true);
  });

  it('deve retornar true para plano premium acessando dashboard', () => {
    expect(hasPageAccess('premium', 'dashboard')).toBe(true);
  });

  it('deve retornar false para plano basico acessando dashboard', () => {
    expect(hasPageAccess('basico', 'dashboard')).toBe(false);
  });

  it('deve retornar true para plano basico acessando grade-planner', () => {
    expect(hasPageAccess('basico', 'grade-planner')).toBe(true);
  });

  it('deve retornar true para plano basico acessando grind-session', () => {
    expect(hasPageAccess('basico', 'grind-session')).toBe(true);
  });

  it('deve retornar false para pagina desconhecida', () => {
    expect(hasPageAccess('admin', 'pagina-inexistente')).toBe(false);
  });

  it('deve limpar barra inicial do nome da pagina', () => {
    // hasPageAccess remove /  do inicio
    expect(hasPageAccess('premium', '/dashboard')).toBe(true);
  });

  it('deve limpar query parameters do nome da pagina', () => {
    expect(hasPageAccess('premium', 'dashboard?tab=analytics')).toBe(true);
  });

  it('deve retornar false para plano basico acessando estudos', () => {
    expect(hasPageAccess('basico', 'estudos')).toBe(false);
  });

  it('deve retornar true para plano pro acessando estudos', () => {
    expect(hasPageAccess('pro', 'estudos')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasRouteAccess — verifica acesso a uma rota
// ---------------------------------------------------------------------------

describe('hasRouteAccess', () => {
  it('deve retornar true para paginas publicas (login, register, settings)', () => {
    expect(hasRouteAccess('basico', 'login')).toBe(true);
    expect(hasRouteAccess('basico', 'register')).toBe(true);
    expect(hasRouteAccess('basico', 'settings')).toBe(true);
  });

  it('deve retornar true para rota vazia (home)', () => {
    expect(hasRouteAccess('basico', '')).toBe(true);
  });

  it('deve retornar true para super admin em qualquer rota', () => {
    expect(hasRouteAccess('basico', 'analytics', SUPER_ADMIN_EMAILS[0])).toBe(true);
  });

  it('deve retornar true para plano premium na rota dashboard', () => {
    expect(hasRouteAccess('premium', 'dashboard')).toBe(true);
  });

  it('deve retornar false para plano basico na rota dashboard', () => {
    expect(hasRouteAccess('basico', 'dashboard')).toBe(false);
  });

  it('deve mapear rotas alternativas corretamente', () => {
    // grind-live e grind mapeiam para GRIND
    expect(hasRouteAccess('basico', 'grind')).toBe(true);
    expect(hasRouteAccess('basico', 'grind-live')).toBe(true);
    expect(hasRouteAccess('basico', 'grind-session')).toBe(true);
  });

  it('deve mapear rota estudos/studies para mesma tag', () => {
    expect(hasRouteAccess('pro', 'estudos')).toBe(true);
    expect(hasRouteAccess('pro', 'studies')).toBe(true);
  });

  it('deve limpar barra inicial da rota', () => {
    expect(hasRouteAccess('premium', '/dashboard')).toBe(true);
  });

  it('deve retornar false para rota desconhecida (nao mapeada)', () => {
    expect(hasRouteAccess('admin', 'rota-inexistente')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRequiredPlanForTag — retorna plano minimo para uma tag
// ---------------------------------------------------------------------------

describe('getRequiredPlanForTag', () => {
  it('deve retornar "basico" para tag Grade', () => {
    expect(getRequiredPlanForTag(TAGS.GRADE)).toBe('basico');
  });

  it('deve retornar "basico" para tag Grind', () => {
    expect(getRequiredPlanForTag(TAGS.GRIND)).toBe('basico');
  });

  it('deve retornar "premium" para tag Dashboard', () => {
    expect(getRequiredPlanForTag(TAGS.DASHBOARD)).toBe('premium');
  });

  it('deve retornar "premium" para tag Import', () => {
    expect(getRequiredPlanForTag(TAGS.IMPORT)).toBe('premium');
  });

  it('deve retornar "pro" para tag Warm Up', () => {
    expect(getRequiredPlanForTag(TAGS.WARM_UP)).toBe('pro');
  });

  it('deve retornar "admin" para tag desconhecida', () => {
    expect(getRequiredPlanForTag('TagInexistente')).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// getRequiredPlanForPage — retorna plano minimo para uma pagina
// ---------------------------------------------------------------------------

describe('getRequiredPlanForPage', () => {
  it('deve retornar "basico" para grade-planner', () => {
    expect(getRequiredPlanForPage('grade-planner')).toBe('basico');
  });

  it('deve retornar "premium" para dashboard', () => {
    expect(getRequiredPlanForPage('dashboard')).toBe('premium');
  });

  it('deve retornar "admin" para pagina inexistente', () => {
    expect(getRequiredPlanForPage('inexistente')).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// getMinimumPlanForRoute — retorna plano minimo para uma rota
// ---------------------------------------------------------------------------

describe('getMinimumPlanForRoute', () => {
  it('deve retornar "premium" para rota /dashboard', () => {
    expect(getMinimumPlanForRoute('/dashboard')).toBe('premium');
  });

  it('deve retornar "basico" para rota /grind', () => {
    expect(getMinimumPlanForRoute('/grind')).toBe('basico');
  });

  it('deve limpar barra inicial e query params', () => {
    expect(getMinimumPlanForRoute('/dashboard?tab=site')).toBe('premium');
  });

  it('deve mapear rota /grind-session para basico', () => {
    expect(getMinimumPlanForRoute('/grind-session')).toBe('basico');
  });

  it('deve mapear rota /estudos para pro', () => {
    expect(getMinimumPlanForRoute('/estudos')).toBe('pro');
  });
});

// ---------------------------------------------------------------------------
// getPlanDisplayName — nome legivel do plano
// ---------------------------------------------------------------------------

describe('getPlanDisplayName', () => {
  it('deve retornar "Basico" para plano basico', () => {
    expect(getPlanDisplayName('basico')).toBe('Básico');
  });

  it('deve retornar "Premium" para plano premium', () => {
    expect(getPlanDisplayName('premium')).toBe('Premium');
  });

  it('deve retornar "Pro" para plano pro', () => {
    expect(getPlanDisplayName('pro')).toBe('Pro');
  });

  it('deve retornar "Admin" para plano admin', () => {
    expect(getPlanDisplayName('admin')).toBe('Admin');
  });

  it('deve retornar "Desconhecido" para plano inexistente', () => {
    expect(getPlanDisplayName('inexistente')).toBe('Desconhecido');
  });
});

// ---------------------------------------------------------------------------
// LEGACY_PERMISSIONS_MAP — mapeamento de permissoes antigas para tags
// ---------------------------------------------------------------------------

describe('LEGACY_PERMISSIONS_MAP', () => {
  it('deve mapear admin_full para tag ADMIN_FULL', () => {
    expect(LEGACY_PERMISSIONS_MAP['admin_full']).toBe(TAGS.ADMIN_FULL);
  });

  it('deve mapear dashboard_view para tag DASHBOARD', () => {
    expect(LEGACY_PERMISSIONS_MAP['dashboard_view']).toBe(TAGS.DASHBOARD);
  });

  it('deve mapear upload_data para tag IMPORT', () => {
    expect(LEGACY_PERMISSIONS_MAP['upload_data']).toBe(TAGS.IMPORT);
  });

  it('deve mapear grind_sessions para tag GRIND', () => {
    expect(LEGACY_PERMISSIONS_MAP['grind_sessions']).toBe(TAGS.GRIND);
  });

  it('deve ter mapeamentos para todas as permissoes legadas conhecidas', () => {
    const expectedKeys = [
      'admin_full', 'user_management', 'analytics_access',
      'upload_data', 'grind_sessions', 'tournament_library',
      'dashboard_view', 'mental_prep', 'studies', 'coaching',
      'performance_tracking', 'export_data', 'system_settings',
      'bug_reports'
    ];
    for (const key of expectedKeys) {
      expect(LEGACY_PERMISSIONS_MAP).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// TAGS — constantes de tags
// ---------------------------------------------------------------------------

describe('TAGS', () => {
  it('deve ter 13 tags definidas', () => {
    expect(Object.keys(TAGS)).toHaveLength(13);
  });

  it('cada tag deve ser uma string nao vazia', () => {
    for (const [, value] of Object.entries(TAGS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('deve ter tags para funcionalidades base', () => {
    expect(TAGS.GRADE).toBe('Grade');
    expect(TAGS.GRIND).toBe('Grind');
  });

  it('deve ter tags para funcionalidades premium', () => {
    expect(TAGS.DASHBOARD).toBe('Dashboard');
    expect(TAGS.IMPORT).toBe('Import');
  });

  it('deve ter tags para funcionalidades pro', () => {
    expect(TAGS.WARM_UP).toBe('Warm Up');
    expect(TAGS.CALENDARIO).toBe('Calendario');
    expect(TAGS.ESTUDOS).toBe('Estudos');
    expect(TAGS.BIBLIOTECA).toBe('Biblioteca');
    expect(TAGS.FERRAMENTAS).toBe('Ferramentas');
  });

  it('deve ter tags para funcionalidades admin', () => {
    expect(TAGS.ANALYTICS).toBe('Analytics');
    expect(TAGS.USUARIOS).toBe('Usuarios');
    expect(TAGS.BUGS).toBe('Bugs');
    expect(TAGS.ADMIN_FULL).toBe('Admin Full');
  });
});
