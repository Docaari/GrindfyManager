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
  const { user, isAuthenticated } = useAuth();
  const [location] = useLocation();

  // Se não estiver autenticado, não renderiza nada (AuthProvider vai redirecionar)
  if (!isAuthenticated || !user) {
    return fallback || null;
  }

  // Verifica acesso pela rota atual
  const userPlan = user.subscriptionPlan || 'basico';
  const hasAccess = hasRouteAccess(userPlan, location, user.email);

  // Se não tem acesso, mostra tela de bloqueio
  if (!hasAccess) {
    const requiredPlan = getMinimumPlanForRoute(location);
    const currentPlanName = getPlanDisplayName(userPlan);
    
    return (
      <AccessDenied
        currentPlan={currentPlanName}
        requiredPlan={requiredPlan}
        pageName={getPageName(location)}
        onViewPlans={() => window.location.href = '/assinaturas'}
      />
    );
  }

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