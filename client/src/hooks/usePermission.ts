import { useAuth } from '@/contexts/AuthContext';
import { hasTagAccess, isSuperAdmin } from '../../../shared/permissions';

// Mapeamento de permission names para tags do sistema de assinatura
const permissionToTag: Record<string, string> = {
  'dashboard_access': 'Dashboard',
  'grind_session_access': 'Grind',
  'grind_access': 'Grind',
  'grade_planner_access': 'Grade',
  'upload_access': 'Import',
  'warm_up_access': 'Warm Up',
  'mental_prep_access': 'Warm Up',
  'weekly_planner_access': 'Calendario',
  'studies_access': 'Estudos',
  'tournament_library_access': 'Biblioteca',
  'analytics_access': 'Analytics',
  'user_management': 'Usuarios',
  'system_config': 'Bugs',
  'admin_full': 'Admin Full',
};

export const usePermission = (permission: string): boolean => {
  const { user } = useAuth();

  if (!user) {
    return false;
  }

  // Super-admin tem acesso total
  if (isSuperAdmin(user.email)) {
    return true;
  }

  // Verificar permissões individuais (tabela user_permissions)
  if (user.permissions.includes(permission)) {
    return true;
  }

  // Verificar via plano de assinatura (subscriptionPlan → tags)
  const requiredTag = permissionToTag[permission];
  if (requiredTag) {
    return hasTagAccess(user.subscriptionPlan, requiredTag, user.email, user.permissions);
  }

  return false;
};
