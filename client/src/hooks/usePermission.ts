import { useAuth } from '@/contexts/AuthContext';
import { hasFullAccess, isSuperAdmin } from '../../../shared/permissions';

export const usePermission = (permission: string): boolean => {
  const { user } = useAuth();
  if (!user) return false;

  // Super-admin bypasses all
  if (isSuperAdmin(user.email)) return true;

  // Admin-only pages
  const adminOnlyPermissions = ['admin_full', 'user_management', 'analytics_access', 'system_config', 'user_analytics', 'executive_reports'];
  if (adminOnlyPermissions.includes(permission)) {
    return false;
  }

  // Everything else: just check if user has full access (trial or subscription)
  return hasFullAccess(user);
};
