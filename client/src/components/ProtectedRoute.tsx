import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasRouteAccess, getMinimumPlanForRoute, getPlanDisplayName, isSuperAdmin, hasTagAccess } from '../../../shared/permissions';
import { useLocation } from 'wouter';
import AccessDenied from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Função auxiliar para obter informações da página baseado no documento de especificação
function getPageInfo(route: string): { featureName: string; description: string; pageName: string } {
  const cleanRoute = route.split('?')[0];
  
  const pageInfoMap: Record<string, { featureName: string; description: string; pageName: string }> = {
    '/dashboard': {
      featureName: 'Dashboard Analítico Avançado',
      description: 'Análises detalhadas, gráficos de performance e insights de seus resultados',
      pageName: 'Dashboard'
    },
    '/upload': {
      featureName: 'Import de Históricos Multi-Site',
      description: 'Importe históricos de torneios automaticamente com parsing inteligente',
      pageName: 'Import'
    },
    '/upload-history': {
      featureName: 'Import de Históricos Multi-Site',
      description: 'Importe históricos de torneios automaticamente com parsing inteligente',
      pageName: 'Import'
    },
    '/coach': {
      featureName: 'Planejamento de Grade Semanal',
      description: 'Organize sua rotina de grind e maximize sua eficiência',
      pageName: 'Grade'
    },
    '/grade-planner': {
      featureName: 'Planejamento de Grade Semanal',
      description: 'Organize sua rotina de grind e maximize sua eficiência',
      pageName: 'Grade'
    },
    '/grind': {
      featureName: 'Sessão de Grind ao Vivo',
      description: 'Acompanhamento em tempo real com registro e análise de performance',
      pageName: 'Grind'
    },
    '/grind-session': {
      featureName: 'Sessão de Grind ao Vivo',
      description: 'Acompanhamento em tempo real com registro e análise de performance',
      pageName: 'Grind'
    },
    '/grind-live': {
      featureName: 'Sessão de Grind ao Vivo',
      description: 'Acompanhamento em tempo real com registro e análise de performance',
      pageName: 'Grind'
    },
    '/warm-up': {
      featureName: 'Preparação Mental para Grind',
      description: 'Rotinas de aquecimento e preparação estratégica',
      pageName: 'Warm Up'
    },
    '/mental': {
      featureName: 'Preparação Mental para Grind',
      description: 'Rotinas de aquecimento e preparação estratégica',
      pageName: 'Warm Up'
    },
    '/mental-prep': {
      featureName: 'Preparação Mental para Grind',
      description: 'Rotinas de aquecimento e preparação estratégica',
      pageName: 'Warm Up'
    },
    '/planner': {
      featureName: 'Calendário Integrado',
      description: 'Gerencie rotina completa: poker, estudos e vida pessoal',
      pageName: 'Calendário'
    },
    '/calendario': {
      featureName: 'Calendário Integrado',
      description: 'Gerencie rotina completa: poker, estudos e vida pessoal',
      pageName: 'Calendário'
    },
    '/estudos': {
      featureName: 'Organização de Estudos',
      description: 'Planeje sessões de estudo com cronogramas e progresso',
      pageName: 'Estudos'
    },
    '/calculadoras': {
      featureName: 'Calculadoras Profissionais',
      description: 'RPs, Bets Geométricas, Mysterys, Bounty Power e mais',
      pageName: 'Ferramentas'
    },
    '/ferramentas': {
      featureName: 'Calculadoras Profissionais',
      description: 'RPs, Bets Geométricas, Mysterys, Bounty Power e mais',
      pageName: 'Ferramentas'
    },
    '/admin/users': {
      featureName: 'Gestão de Usuários',
      description: 'Administração completa de contas e permissões de usuários',
      pageName: 'Usuarios'
    },
    '/admin-users': {
      featureName: 'Gestão de Usuários',
      description: 'Administração completa de contas e permissões de usuários',
      pageName: 'Usuarios'
    }
  };

  return pageInfoMap[cleanRoute] || {
    featureName: 'Funcionalidade Premium',
    description: 'Esta funcionalidade requer um plano superior para acesso',
    pageName: 'Premium'
  };
}

export default function ProtectedRoute({ 
  children, 
  fallback 
}: ProtectedRouteProps) {
  const { user, isAuthenticated, hasPermission } = useAuth();
  const [location] = useLocation();

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

  // Se não há tag mapeada, permitir acesso (páginas públicas)
  if (!requiredTag) {
    return <>{children}</>;
  }

  // CORREÇÃO CRÍTICA: Verificar se o usuário tem a tag necessária usando plano + permissões individuais
  const hasAccess = hasTagAccess(user.subscriptionPlan, requiredTag, user.email, user.permissions);

  // Se não tem acesso, mostra tela de bloqueio
  if (!hasAccess) {
    const requiredPlan = getMinimumPlanForRoute(location);
    const currentPlanName = getPlanDisplayName(user.subscriptionPlan || 'basico');
    const pageInfo = getPageInfo(location);
    
    return (
      <AccessDenied
        featureName={pageInfo.featureName}
        description={pageInfo.description}
        currentPlan={currentPlanName}
        requiredPlan={requiredPlan}
        pageName={pageInfo.pageName}
        onViewPlans={() => window.location.href = '/assinaturas'}
      />
    );
  }

  // Se tem acesso, renderiza o conteúdo
  return <>{children}</>;
}