// Sistema de Tags e Perfis para Controle de Acesso
// Substitui o sistema de permissões individuais por tags organizadas por plano

// Super-admin permanente - acesso total irrestrito
export const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

export function isSuperAdmin(email: string): boolean {
  return email === SUPER_ADMIN_EMAIL;
}

export interface SubscriptionProfile {
  name: string;
  description: string;
  tags: string[];
  pages: string[];
  features: string[];
}

// Tags principais organizadas por nível de acesso correto
export const TAGS = {
  // Funcionalidades Base (Básico)
  GRADE: 'Grade',
  GRIND: 'Grind',
  
  // Funcionalidades Premium (Premium+)
  DASHBOARD: 'Dashboard',
  IMPORT: 'Import',
  
  // Funcionalidades Pro (Pro+)
  WARM_UP: 'Warm Up',
  CALENDARIO: 'Calendario',
  ESTUDOS: 'Estudos',
  BIBLIOTECA: 'Biblioteca',
  
  // Funcionalidades Admin (Admin only)
  ANALYTICS: 'Analytics',
  USUARIOS: 'Usuarios',
  BUGS: 'Bugs',
  ADMIN_FULL: 'Admin Full',
};

// Perfis de Assinatura com Tags - LÓGICA CORRETA
export const SUBSCRIPTION_PROFILES: Record<string, SubscriptionProfile> = {
  basico: {
    name: 'Básico',
    description: 'Funcionalidades base: Grade e Grind',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
    ],
    pages: [
      'grade-planner',
      'grind-session',
    ],
    features: [
      'Planejamento de Grade',
      'Sessões de Grind',
    ],
  },
  
  premium: {
    name: 'Premium',
    description: 'Funcionalidades base + Dashboard + Import + Warm Up',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
      TAGS.DASHBOARD,
      TAGS.IMPORT,
      TAGS.WARM_UP,
    ],
    pages: [
      'grade-planner',
      'grind-session',
      'dashboard',
      'upload-history',
      'mental-prep',
    ],
    features: [
      'Planejamento de Grade',
      'Sessões de Grind',
      'Dashboard completo',
      'Import de dados',
      'Preparação Mental',
    ],
  },
  
  pro: {
    name: 'Pro',
    description: 'Funcionalidades Premium + Warm Up + Calendario + Estudos + Biblioteca',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
      TAGS.DASHBOARD,
      TAGS.IMPORT,
      TAGS.WARM_UP,
      TAGS.CALENDARIO,
      TAGS.ESTUDOS,
      TAGS.BIBLIOTECA,
    ],
    pages: [
      'grade-planner',
      'grind-session',
      'dashboard',
      'upload-history',
      'mental-prep',
      'planner',
      'estudos',
      'biblioteca',
    ],
    features: [
      'Todas as funcionalidades Premium',
      'Warm Up mental',
      'Calendário inteligente',
      'Sistema de estudos',
      'Biblioteca de torneios',
    ],
  },
  
  admin: {
    name: 'Admin',
    description: 'Acesso completo ao sistema + funcionalidades administrativas',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
      TAGS.DASHBOARD,
      TAGS.IMPORT,
      TAGS.WARM_UP,
      TAGS.CALENDARIO,
      TAGS.ESTUDOS,
      TAGS.BIBLIOTECA,
      TAGS.ANALYTICS,
      TAGS.USUARIOS,
      TAGS.BUGS,
      TAGS.ADMIN_FULL,
    ],
    pages: [
      'grade-planner',
      'grind-session',
      'dashboard',
      'upload-history',
      'mental-prep',
      'planner',
      'estudos',
      'biblioteca',
      'analytics',
      'admin-users',
      'admin-bugs',
    ],
    features: [
      'Todas as funcionalidades Pro',
      'Analytics administrativos',
      'Gerenciamento de usuários',
      'Relatórios de bugs',
      'Analytics administrativos',
      'Relatórios de bugs',
      'Controle total do sistema',
    ],
  },
};

// Funções utilitárias para verificação de acesso
export function hasPageAccess(subscriptionPlan: string, pageName: string, userEmail?: string): boolean {
  console.log("🔍 PAGE ACCESS DEBUG:", {
    subscriptionPlan,
    pageName,
    userEmail,
    isSuperAdmin: userEmail ? isSuperAdmin(userEmail) : false
  });

  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    console.log("✅ SUPER ADMIN BYPASS - Access granted");
    return true;
  }
  
  // 🔧 CORREÇÃO CRÍTICA: Remover barra inicial se existir
  const cleanPageName = pageName.replace(/^\//, '').split('?')[0];
  console.log("🔍 CLEAN PAGE NAME:", cleanPageName);
  
  // Mapeamento de páginas para tags
  const pageToTag: { [key: string]: string } = {
    'grade-planner': TAGS.GRADE,
    'grind-session': TAGS.GRIND,
    'dashboard': TAGS.DASHBOARD,
    'upload-history': TAGS.IMPORT,
    'mental-prep': TAGS.WARM_UP,
    'planner': TAGS.CALENDARIO,
    'estudos': TAGS.ESTUDOS,
    'biblioteca': TAGS.BIBLIOTECA,
    'tournament-library': TAGS.BIBLIOTECA,
    'analytics': TAGS.ANALYTICS,
    'admin-users': TAGS.USUARIOS,
    'admin-bugs': TAGS.BUGS,
  };
  
  const requiredTag = pageToTag[cleanPageName];
  console.log("🔍 REQUIRED TAG:", requiredTag);
  
  if (!requiredTag) {
    console.log("❌ NO REQUIRED TAG FOUND - Access denied");
    return false;
  }
  
  const hasAccess = hasTagAccess(subscriptionPlan, requiredTag, userEmail);
  console.log("🔍 FINAL ACCESS RESULT:", hasAccess);
  
  return hasAccess;
}

export function hasTagAccess(subscriptionPlan: string, requiredTag: string, userEmail?: string): boolean {
  console.log("🔍 TAG ACCESS DEBUG:", {
    subscriptionPlan,
    requiredTag,
    userEmail,
    isSuperAdmin: userEmail ? isSuperAdmin(userEmail) : false
  });

  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    console.log("✅ SUPER ADMIN BYPASS - Tag access granted");
    return true;
  }
  
  const userTags = getUserTags(subscriptionPlan);
  console.log("🔍 USER TAGS:", userTags);
  
  const hasTag = userTags.includes(requiredTag);
  console.log("🔍 TAG CHECK RESULT:", hasTag);
  
  return hasTag;
}

export function getUserTags(subscriptionPlan: string): string[] {
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  return profile ? profile.tags : [];
}

export function getRequiredPlanForTag(tag: string): string {
  for (const [planName, profile] of Object.entries(SUBSCRIPTION_PROFILES)) {
    if (profile.tags.includes(tag)) {
      return planName;
    }
  }
  return 'admin';
}

export function getRequiredPlanForPage(pageName: string): string {
  for (const [planName, profile] of Object.entries(SUBSCRIPTION_PROFILES)) {
    if (profile.pages.includes(pageName)) {
      return planName;
    }
  }
  return 'admin';
}

export function getMinimumPlanForRoute(route: string): string {
  // Remove leading slash and query parameters
  const cleanRoute = route.replace(/^\//, '').split('?')[0];
  
  // Map routes to page names - CORRIGIDO
  const routeToPage: { [key: string]: string } = {
    'dashboard': 'dashboard',
    'biblioteca': 'biblioteca',
    'tournament-library': 'biblioteca',
    'upload-history': 'upload-history',
    'upload': 'upload-history',
    'analytics': 'analytics',
    'grind': 'grind-session',
    'grind-live': 'grind-session',
    'grind-session': 'grind-session',
    'coach': 'grade-planner',
    'grade-planner': 'grade-planner',
    'mental': 'mental-prep',
    'mental-prep': 'mental-prep',
    'estudos': 'estudos',
    'studies': 'estudos',
    'planner': 'planner',
    'admin/users': 'admin-users',
    'admin/bugs': 'admin-bugs',
    'admin-users': 'admin-users',
    'admin-bugs': 'admin-bugs',
  };
  
  const pageName = routeToPage[cleanRoute] || cleanRoute;
  return getRequiredPlanForPage(pageName);
}

export function hasRouteAccess(subscriptionPlan: string, route: string, userEmail?: string): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // Remove leading slash and query parameters
  const cleanRoute = route.replace(/^\//, '').split('?')[0];
  
  // Map routes to page names - CORRIGIDO
  const routeToPage: { [key: string]: string } = {
    'dashboard': 'dashboard',
    'biblioteca': 'biblioteca',
    'tournament-library': 'biblioteca',
    'upload-history': 'upload-history',
    'upload': 'upload-history',
    'analytics': 'analytics',
    'grind': 'grind-session',
    'grind-live': 'grind-session',
    'grind-session': 'grind-session',
    'coach': 'grade-planner',
    'grade-planner': 'grade-planner',
    'mental': 'mental-prep',
    'mental-prep': 'mental-prep',
    'warm-up': 'mental-prep',
    'estudos': 'estudos',
    'studies': 'estudos',
    'planner': 'planner',
    'admin/users': 'admin-users',
    'admin/bugs': 'admin-bugs',
    'admin-users': 'admin-users',
    'admin-bugs': 'admin-bugs',
  };
  
  const pageName = routeToPage[cleanRoute] || cleanRoute;
  
  return hasPageAccess(subscriptionPlan, pageName, userEmail);
}

export function getPlanDisplayName(plan: string): string {
  const profile = SUBSCRIPTION_PROFILES[plan];
  return profile ? profile.name : 'Desconhecido';
}

// Compatibilidade com sistema antigo de permissões
export const LEGACY_PERMISSIONS_MAP: Record<string, string> = {
  // Mapeamento de permissões antigas para tags
  'admin_full': TAGS.ADMIN_FULL,
  'user_management': TAGS.USER_MANAGEMENT,
  'analytics_access': TAGS.ADVANCED_ANALYTICS,
  'upload_data': TAGS.UPLOAD_BASIC,
  'grind_sessions': TAGS.GRIND_SESSIONS,
  'tournament_library': TAGS.TOURNAMENT_LIBRARY,
  'dashboard_view': TAGS.DASHBOARD_VIEW,
  'mental_prep': TAGS.MENTAL_PREP,
  'studies': TAGS.STUDIES,
  'coaching': TAGS.COACH_INSIGHTS,
  'performance_tracking': TAGS.PERFORMANCE_TRACKING,
  'export_data': TAGS.EXPORT_DATA,
  'system_settings': TAGS.SYSTEM_SETTINGS,
  'bug_reports': TAGS.BUG_REPORTS,
};