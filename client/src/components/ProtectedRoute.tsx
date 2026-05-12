import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user, isAuthenticated, hasAccess, isAdmin } = useAuth();
  const [location] = useLocation();

  // Not authenticated - don't render (AuthProvider handles redirect)
  if (!isAuthenticated || !user) {
    return fallback || null;
  }

  // Admin-only routes — gate por PREFIXO (alem da whitelist legada): qualquer
  // rota sob `/admin`, `/admin/...` ou `/admin-...` exige isAdmin. Garante que
  // rotas admin futuras (ex.: /admin/dashboard, /admin/coach-analytics) nao
  // escapam do gate sem precisar atualizar uma whitelist hardcoded. `/analytics`
  // segue na whitelist (admin-only legado, sem prefixo /admin).
  const adminWhitelist = ['/analytics'];
  const cleanRoute = location.split('?')[0];
  const isAdminRoute =
    adminWhitelist.includes(cleanRoute) ||
    cleanRoute === '/admin' ||
    cleanRoute.startsWith('/admin/') ||
    cleanRoute.startsWith('/admin-');
  if (isAdminRoute) {
    if (!isAdmin) {
      return <AccessDenied reason="trial_expired" />;
    }
    return <>{children}</>;
  }

  // All other protected routes: check full access
  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
