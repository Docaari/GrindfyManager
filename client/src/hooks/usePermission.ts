import { useAuth } from '@/contexts/AuthContext';

export const usePermission = (permission: string): boolean => {
  const { user } = useAuth();
  
  if (!user) {
    return false;
  }
  
  const hasPermission = user.permissions.includes(permission);
  
  return hasPermission;
};