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
  FERRAMENTAS: 'Ferramentas',
  
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
    description: 'Funcionalidades base + Dashboard + Import APENAS',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
      TAGS.DASHBOARD,
      TAGS.IMPORT,
    ],
    pages: [
      'grade-planner',
      'grind-session',
      'dashboard',
      'upload-history',
    ],
    features: [
      'Planejamento de Grade',
      'Sessões de Grind',
      'Dashboard completo',
      'Import de dados',
    ],
  },
  
  pro: {
    name: 'Pro',
    description: 'Funcionalidades Premium + Warm Up + Calendario + Estudos + Biblioteca + Ferramentas',
    tags: [
      TAGS.GRADE,
      TAGS.GRIND,
      TAGS.DASHBOARD,
      TAGS.IMPORT,
      TAGS.WARM_UP,
      TAGS.CALENDARIO,
      TAGS.ESTUDOS,
      TAGS.BIBLIOTECA,
      TAGS.FERRAMENTAS,
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
      TAGS.FERRAMENTAS,
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
export function hasPageAccess(
  subscriptionPlan: string, 
  pageName: string, 
  userEmail?: string, 
  individualPermissions?: string[]
): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // 🔧 CORREÇÃO CRÍTICA: Remover barra inicial se existir
  const cleanPageName = pageName.replace(/^\//, '').split('?')[0];
  
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
  
  if (!requiredTag) {
    return false;
  }
  
  return hasTagAccess(subscriptionPlan, requiredTag, userEmail, individualPermissions);
}

export function hasTagAccess(
  subscriptionPlan: string, 
  requiredTag: string, 
  userEmail?: string, 
  individualPermissions?: string[]
): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // CORREÇÃO CRÍTICA: Verificar permissões individuais PRIMEIRO
  if (individualPermissions && individualPermissions.length > 0) {
    const permissionToTag: { [key: string]: string } = {
      'grade_planner_access': 'Grade',
      'grind_access': 'Grind',
      'grind_session_access': 'Grind',
      'dashboard_access': 'Dashboard',
      'upload_access': 'Import',
      'warm_up_access': 'Warm Up',
      'weekly_planner_access': 'Calendario',
      'studies_access': 'Estudos',
      'mental_prep_access': 'Biblioteca',
      'analytics_access': 'Analytics',
      'user_management': 'Usuarios',
      'system_config': 'Bugs',
      'admin_full': 'Admin Full',
    };

    const hasIndividualAccess = individualPermissions.some(permission => 
      permissionToTag[permission] === requiredTag
    );

    if (hasIndividualAccess) {
      return true;
    }
  }
  
  // Verificar se o plano tem a tag necessária
  const userTags = getUserTags(subscriptionPlan);
  return userTags.includes(requiredTag);
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

export function hasRouteAccess(
  subscriptionPlan: string, 
  route: string, 
  userEmail?: string, 
  individualPermissions?: string[]
): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  // Remove leading slash and query parameters
  const cleanRoute = route.replace(/^\//, '').split('?')[0];
  
  // Páginas públicas (sem restrição de tag)
  const publicPages = ['', 'login', 'register', 'settings', 'test-permissions'];
  if (publicPages.includes(cleanRoute)) {
    return true;
  }
  
  // Map routes to tags - SISTEMA CORRIGIDO
  const routeToTag: { [key: string]: string } = {
    'dashboard': TAGS.DASHBOARD,
    'biblioteca': TAGS.BIBLIOTECA,
    'tournament-library': TAGS.BIBLIOTECA,
    'library': TAGS.BIBLIOTECA,
    'upload-history': TAGS.IMPORT,
    'upload': TAGS.IMPORT,
    'analytics': TAGS.ANALYTICS,
    'grind': TAGS.GRIND,
    'grind-live': TAGS.GRIND,
    'grind-session': TAGS.GRIND,
    'coach': TAGS.GRADE,
    'grade-planner': TAGS.GRADE,
    'mental': TAGS.WARM_UP,
    'mental-prep': TAGS.WARM_UP,
    'warm-up': TAGS.WARM_UP,
    'estudos': TAGS.ESTUDOS,
    'studies': TAGS.ESTUDOS,
    'planner': TAGS.CALENDARIO,
    'admin/users': TAGS.USUARIOS,
    'admin/bugs': TAGS.BUGS,
    'admin-users': TAGS.USUARIOS,
    'admin-bugs': TAGS.BUGS,
  };
  
  const requiredTag = routeToTag[cleanRoute];
  
  if (!requiredTag) {
    return false;
  }
  
  return hasTagAccess(subscriptionPlan, requiredTag, userEmail, individualPermissions);
}

export function getPlanDisplayName(plan: string): string {
  const profile = SUBSCRIPTION_PROFILES[plan];
  return profile ? profile.name : 'Desconhecido';
}

// Compatibilidade com sistema antigo de permissões
export const LEGACY_PERMISSIONS_MAP: Record<string, string> = {
  // Mapeamento de permissões antigas para tags existentes
  'admin_full': TAGS.ADMIN_FULL,
  'user_management': TAGS.USUARIOS,
  'analytics_access': TAGS.ANALYTICS,
  'upload_data': TAGS.IMPORT,
  'grind_sessions': TAGS.GRIND,
  'tournament_library': TAGS.BIBLIOTECA,
  'dashboard_view': TAGS.DASHBOARD,
  'mental_prep': TAGS.WARM_UP,
  'studies': TAGS.ESTUDOS,
  'coaching': TAGS.GRADE,
  'performance_tracking': TAGS.ANALYTICS,
  'export_data': TAGS.FERRAMENTAS,
  'system_settings': TAGS.ADMIN_FULL,
  'bug_reports': TAGS.BUGS,
};