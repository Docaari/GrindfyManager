import { useAuth } from '@/contexts/AuthContext';

export const usePermission = (permission: string): boolean => {
  const { user } = useAuth();
  
  if (!user) {
    console.log(`🔒 PERMISSION DEBUG - Usuário não autenticado para permissão: ${permission}`);
    return false;
  }
  
  const hasPermission = user.permissions.includes(permission);
  console.log(`🔒 PERMISSION DEBUG - Usuário ${user.email} para permissão ${permission}: ${hasPermission ? 'PERMITIDO' : 'NEGADO'}`);
  console.log(`🔒 PERMISSION DEBUG - Permissões do usuário:`, user.permissions);
  
  return hasPermission;
};