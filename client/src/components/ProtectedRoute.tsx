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

  // Admin-only routes
  const adminRoutes = ['/analytics', '/admin/users', '/admin/bugs', '/admin-users', '/admin-bugs'];
  const cleanRoute = location.split('?')[0];
  if (adminRoutes.includes(cleanRoute)) {
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
