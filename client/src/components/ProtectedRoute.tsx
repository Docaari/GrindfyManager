import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasRouteAccess, getMinimumPlanForRoute, getPlanDisplayName, isSuperAdmin, hasTagAccess } from '../../../shared/permissions';
import { useLocation } from 'wouter';
import AccessDenied from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ 
  children, 
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

  // CORREÇÃO COMPLETA: Mapear rotas para tags exatas conforme especificação
  const routeToTag: { [key: string]: string } = {
    '/coach': 'Grade',
    '/grade-planner': 'Grade',
    '/grind': 'Grind', 
    '/grind-session': 'Grind',
    '/grind-live': 'Grind',
    '/dashboard': 'Dashboard',
    '/upload': 'Import',
    '/upload-history': 'Import',
    '/library': 'Biblioteca',
    '/biblioteca': 'Biblioteca',
    '/tournament-library': 'Biblioteca',
    '/mental': 'Warm Up',
    '/mental-prep': 'Warm Up',
    '/warm-up': 'Warm Up',
    '/planner': 'Calendario',
    '/estudos': 'Estudos',
    '/calculadoras': 'Ferramentas',
    '/analytics': 'Analytics',
    '/admin/users': 'Usuarios',
    '/admin-users': 'Usuarios',
    '/admin/bugs': 'Bugs',
    '/admin-bugs': 'Bugs',
  };

  // Limpar rota (remover parâmetros)
  const cleanRoute = location.split('?')[0];
  const requiredTag = routeToTag[cleanRoute];

  console.log("🔐 TAG CHECK:", {
    cleanRoute,
    requiredTag,
    userPlan: user.subscriptionPlan,
    userEmail: user.email
  });

  // Se não há tag mapeada, permitir acesso (páginas públicas)
  if (!requiredTag) {
    console.log("🔐 PUBLIC PAGE - Access granted");
    return <>{children}</>;
  }

  // Verificar se o usuário tem a tag necessária usando o sistema de tags
  const hasAccess = hasTagAccess(user.subscriptionPlan, requiredTag, user.email);

  // Se não tem acesso, mostra tela de bloqueio
  if (!hasAccess) {
    const requiredPlan = getMinimumPlanForRoute(location);
    const currentPlanName = getPlanDisplayName(user.subscriptionPlan || 'basico');
    
    console.log("🔐 ACCESS DENIED:", {
      requiredTag,
      hasAccess,
      requiredPlan,
      currentPlanName,
      userSubscriptionPlan: user.subscriptionPlan,
      userEmail: user.email
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