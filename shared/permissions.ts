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

// Tags principais organizadas por nível de acesso
export const TAGS = {
  // Acesso Básico
  BASIC_ACCESS: 'basic_access',
  TOURNAMENT_LIBRARY: 'tournament_library',
  DASHBOARD_VIEW: 'dashboard_view',
  UPLOAD_BASIC: 'upload_basic',
  
  // Acesso Avançado
  ADVANCED_ANALYTICS: 'advanced_analytics',
  GRIND_SESSIONS: 'grind_sessions',
  GRADE_PLANNER: 'grade_planner',
  MENTAL_PREP: 'mental_prep',
  STUDIES: 'studies',
  
  // Acesso Premium
  COACH_INSIGHTS: 'coach_insights',
  ADVANCED_PLANNING: 'advanced_planning',
  PERFORMANCE_TRACKING: 'performance_tracking',
  EXPORT_DATA: 'export_data',
  
  // Acesso Admin
  ADMIN_FULL: 'admin_full',
  USER_MANAGEMENT: 'user_management',
  SYSTEM_SETTINGS: 'system_settings',
  ANALYTICS_ADMIN: 'analytics_admin',
  BUG_REPORTS: 'bug_reports',
};

// Perfis de Assinatura com Tags
export const SUBSCRIPTION_PROFILES: Record<string, SubscriptionProfile> = {
  basico: {
    name: 'Básico',
    description: 'Acesso básico às funcionalidades principais',
    tags: [
      TAGS.BASIC_ACCESS,
      TAGS.TOURNAMENT_LIBRARY,
      TAGS.DASHBOARD_VIEW,
      TAGS.UPLOAD_BASIC,
    ],
    pages: [
      'dashboard',
      'tournament-library',
      'upload-history',
    ],
    features: [
      'Visualização de torneios',
      'Dashboard básico',
      'Upload de dados',
      'Histórico básico',
    ],
  },
  
  premium: {
    name: 'Premium',
    description: 'Acesso completo às funcionalidades principais + analytics avançados',
    tags: [
      TAGS.BASIC_ACCESS,
      TAGS.TOURNAMENT_LIBRARY,
      TAGS.DASHBOARD_VIEW,
      TAGS.UPLOAD_BASIC,
      TAGS.ADVANCED_ANALYTICS,
      TAGS.GRIND_SESSIONS,
      TAGS.GRADE_PLANNER,
      TAGS.MENTAL_PREP,
    ],
    pages: [
      'dashboard',
      'tournament-library',
      'upload-history',
      'analytics',
      'grind-session',
      'grade-planner',
      'mental-prep',
    ],
    features: [
      'Todas as funcionalidades básicas',
      'Analytics avançados',
      'Sessões de grind',
      'Planejamento de grade',
      'Preparação mental',
    ],
  },
  
  pro: {
    name: 'Pro',
    description: 'Acesso completo + ferramentas de coaching e planejamento avançado',
    tags: [
      TAGS.BASIC_ACCESS,
      TAGS.TOURNAMENT_LIBRARY,
      TAGS.DASHBOARD_VIEW,
      TAGS.UPLOAD_BASIC,
      TAGS.ADVANCED_ANALYTICS,
      TAGS.GRIND_SESSIONS,
      TAGS.GRADE_PLANNER,
      TAGS.MENTAL_PREP,
      TAGS.STUDIES,
      TAGS.COACH_INSIGHTS,
      TAGS.ADVANCED_PLANNING,
      TAGS.PERFORMANCE_TRACKING,
      TAGS.EXPORT_DATA,
    ],
    pages: [
      'dashboard',
      'tournament-library',
      'upload-history',
      'analytics',
      'grind-session',
      'grade-planner',
      'mental-prep',
      'studies',
      'coaching',
      'performance',
    ],
    features: [
      'Todas as funcionalidades premium',
      'Sistema de estudos',
      'Insights de coaching',
      'Planejamento avançado',
      'Tracking de performance',
      'Exportação de dados',
    ],
  },
  
  admin: {
    name: 'Admin',
    description: 'Acesso completo ao sistema + funcionalidades administrativas',
    tags: [
      TAGS.BASIC_ACCESS,
      TAGS.TOURNAMENT_LIBRARY,
      TAGS.DASHBOARD_VIEW,
      TAGS.UPLOAD_BASIC,
      TAGS.ADVANCED_ANALYTICS,
      TAGS.GRIND_SESSIONS,
      TAGS.GRADE_PLANNER,
      TAGS.MENTAL_PREP,
      TAGS.STUDIES,
      TAGS.COACH_INSIGHTS,
      TAGS.ADVANCED_PLANNING,
      TAGS.PERFORMANCE_TRACKING,
      TAGS.EXPORT_DATA,
      TAGS.ADMIN_FULL,
      TAGS.USER_MANAGEMENT,
      TAGS.SYSTEM_SETTINGS,
      TAGS.ANALYTICS_ADMIN,
      TAGS.BUG_REPORTS,
    ],
    pages: [
      'dashboard',
      'tournament-library',
      'upload-history',
      'analytics',
      'grind-session',
      'grade-planner',
      'mental-prep',
      'studies',
      'coaching',
      'performance',
      'admin-users',
      'admin-settings',
      'admin-analytics',
      'admin-bugs',
    ],
    features: [
      'Todas as funcionalidades pro',
      'Gerenciamento de usuários',
      'Configurações do sistema',
      'Analytics administrativos',
      'Relatórios de bugs',
      'Controle total do sistema',
    ],
  },
};

// Funções utilitárias para verificação de acesso
export function hasPageAccess(subscriptionPlan: string, pageName: string, userEmail?: string): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  return profile ? profile.pages.includes(pageName) : false;
}

export function hasTagAccess(subscriptionPlan: string, requiredTag: string, userEmail?: string): boolean {
  // Super-admin tem acesso total a tudo
  if (userEmail && isSuperAdmin(userEmail)) {
    return true;
  }
  
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
  
  // Map routes to page names
  const routeToPage: { [key: string]: string } = {
    'dashboard': 'dashboard',
    'biblioteca': 'tournament-library',
    'tournament-library': 'tournament-library',
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
    'estudos': 'studies',
    'studies': 'studies',
    'coaching': 'coaching',
    'performance': 'performance',
    'admin/users': 'admin-users',
    'admin/dashboard': 'admin-analytics',
    'admin/bugs': 'admin-bugs',
    'admin-users': 'admin-users',
    'admin-settings': 'admin-settings',
    'admin-analytics': 'admin-analytics',
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
  
  // Map routes to page names
  const routeToPage: { [key: string]: string } = {
    'dashboard': 'dashboard',
    'biblioteca': 'tournament-library',
    'tournament-library': 'tournament-library',
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
    'estudos': 'studies',
    'studies': 'studies',
    'coaching': 'coaching',
    'performance': 'performance',
    'admin/users': 'admin-users',
    'admin/dashboard': 'admin-analytics',
    'admin/bugs': 'admin-bugs',
    'admin-users': 'admin-users',
    'admin-settings': 'admin-settings',
    'admin-analytics': 'admin-analytics',
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