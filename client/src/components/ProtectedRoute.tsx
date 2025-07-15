import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasRouteAccess, getMinimumPlanForRoute, getPlanDisplayName, isSuperAdmin } from '../../../shared/permissions';
import { useLocation } from 'wouter';
import AccessDenied from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredTag?: string;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  requiredTag, 
  fallback 
}: ProtectedRouteProps) {
  const { user, isAuthenticated, hasPermission } = useAuth();
  const [location] = useLocation();

  console.log("🔐 PROTECTED ROUTE DEBUG:", {
    location,
    user: user?.email,
    isAuthenticated,
    subscriptionPlan: user?.subscriptionPlan,
    permissions: user?.permissions
  });

  // Se não estiver autenticado, não renderiza nada (AuthProvider vai redirecionar)
  if (!isAuthenticated || !user) {
    return fallback || null;
  }

  // Mapear rotas para permissões do banco de dados (sistema antigo que funciona)
  const routeToPermission: { [key: string]: string } = {
    '/dashboard': 'dashboard_access',
    '/upload-history': 'upload_access',
    '/grade-planner': 'grade_planner_access',
    '/grind-session': 'grind_session_access',
    '/grind': 'grind_session_access',
    '/grind-live': 'grind_session_access',
    '/mental-prep': 'mental_prep_access',
    '/warm-up': 'warm_up_access',
    '/planner': 'weekly_planner_access',
    '/estudos': 'studies_access',
    '/biblioteca': 'analytics_access',
    '/tournament-library': 'analytics_access',
    '/analytics': 'analytics_access',
    '/admin-users': 'admin_full',
    '/admin-bugs': 'admin_full',
  };

  // Limpar rota (remover parâmetros)
  const cleanRoute = location.split('?')[0];
  const requiredPermission = routeToPermission[cleanRoute];

  console.log("🔐 PERMISSION CHECK:", {
    cleanRoute,
    requiredPermission,
    hasPermission: requiredPermission ? hasPermission(requiredPermission) : true
  });

  // Se não há permissão mapeada, permitir acesso (páginas públicas)
  if (!requiredPermission) {
    return <>{children}</>;
  }

  // Verificar se o usuário tem a permissão necessária
  const hasAccess = hasPermission(requiredPermission);

  // Se não tem acesso, mostra tela de bloqueio
  if (!hasAccess) {
    const requiredPlan = getMinimumPlanForRoute(location);
    const currentPlanName = getPlanDisplayName(user.subscriptionPlan || 'basico');
    
    console.log("🔐 ACCESS DENIED:", {
      requiredPermission,
      hasAccess,
      requiredPlan,
      currentPlanName
    });
    
    return (
      <AccessDenied
        currentPlan={currentPlanName}
        requiredPlan={requiredPlan}
        pageName={getPageName(location)}
        onViewPlans={() => window.location.href = '/assinaturas'}
      />
    );
  }

  console.log("🔐 ACCESS GRANTED for", cleanRoute);
  
  // Se tem acesso, renderiza o conteúdo
  return <>{children}</>;
}

// Função auxiliar para obter nome da página
function getPageName(route: string): string {
  const pageNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/upload-history': 'Importar Dados',
    '/biblioteca': 'Biblioteca de Torneios',
    '/grade-planner': 'Grade Planner',
    '/grind-live': 'Grind Sessions',
    '/warm-up': 'Warm Up',
    '/calendario': 'Calendário',
    '/estudos': 'Estudos',
    '/ferramentas': 'Ferramentas',
    '/admin/analytics': 'Analytics Avançados',
    '/admin/users': 'Gestão de Usuários',
    '/admin/bugs': 'Gestão de Bugs'
  };

  return pageNames[route] || 'Página Restrita';
}