import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getUserTags, hasTagAccess, isSuperAdmin } from '../../../shared/permissions';

interface User {
  id: string;
  userPlatformId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: string;
  subscriptionPlan: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: () => boolean;
  reloadUserPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Token storage keys
const ACCESS_TOKEN_KEY = 'grindfy_access_token';
const REFRESH_TOKEN_KEY = 'grindfy_refresh_token';
const USER_DATA_KEY = 'grindfy_user_data';

// Token refresh interval (5 minutes before expiration)
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes (token lifetime)
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000; // 5 minutes before expiry

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeAuth();
    
    // Cleanup timer on unmount
    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, []);

  const initializeAuth = async () => {
    try {
      // Try to restore user from localStorage first
      const savedUser = localStorage.getItem(USER_DATA_KEY);
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (savedUser && accessToken && refreshToken) {
        setUser(JSON.parse(savedUser));
        
        // Verify token and start refresh cycle
        await verifyAndRefreshToken();
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      clearStoredAuth();
      setIsLoading(false);
    }
  };

  const verifyAndRefreshToken = async (retryCount = 0) => {
    const maxRetries = 3;
    
    try {
      // First try to use current token
      const userData = await apiRequest('GET', '/api/auth/me');
      setUser(userData);
      
      // Update stored user data
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
      
      // Schedule next refresh
      scheduleTokenRefresh();
      
      setIsLoading(false);
      
    } catch (error) {
      // Try to refresh token
      const refreshSuccess = await refreshAccessToken();
      
      if (refreshSuccess) {
        // Retry verification after successful refresh
        if (retryCount < maxRetries) {
          await verifyAndRefreshToken(retryCount + 1);
        } else {
          console.error('Auth: Maximum retry attempts exceeded');
          handleAuthFailure();
        }
      } else {
        handleAuthFailure();
      }
    }
  };

  const refreshAccessToken = async (retryCount = 0): Promise<boolean> => {
    const maxRetries = 3;
    
    try {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      
      if (!refreshToken) {
        return false;
      }

      const data = await apiRequest('POST', '/api/auth/refresh', { refreshToken });
      
      // Store new tokens
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);

      // Schedule next refresh
      scheduleTokenRefresh();
      
      return true;
      
    } catch (error) {
      console.error('Auth: Token refresh failed:', error);
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        return await refreshAccessToken(retryCount + 1);
      }
      
      return false;
    }
  };

  const scheduleTokenRefresh = () => {
    // Clear existing timer
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    // Schedule refresh 5 minutes before expiration
    const timer = setTimeout(() => {
      console.log('🔐 Renovação automática programada executando...');
      refreshAccessToken();
    }, REFRESH_INTERVAL - REFRESH_BEFORE_EXPIRY);

    setRefreshTimer(timer);
  };

  const handleAuthFailure = () => {
    console.log('🔐 Falha na autenticação, limpando dados...');
    clearStoredAuth();
    setUser(null);
    setIsLoading(false);
  };

  const clearStoredAuth = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      setRefreshTimer(null);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('🔐 Realizando login...');
      
      const data = await apiRequest('POST', '/api/auth/login', { email, password });
      
      if (data.success) {
        // Store tokens and user data persistently
        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));

        setUser(data.user);
        
        // Start refresh cycle
        scheduleTokenRefresh();
        
        console.log('🔐 Login realizado com sucesso, sessão persistente ativa');
        
        // Redirect to home page after successful login
        setTimeout(() => {
          window.location.href = '/home';
        }, 100);
        
        return { success: true };
      } else {
        // Handle email verification required
        if (data.message && data.message.includes('verificado')) {
          return { success: false, requiresVerification: true, error: data.message };
        }
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('🔐 Erro no login:', error);
      console.error('🔐 Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        fullError: error
      });
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = () => {
    console.log('🔐 Realizando logout...');
    
    // Call logout endpoint in background (don't wait for response)
    apiRequest('POST', '/api/auth/logout').catch(error => {
      console.error('🔐 Erro no logout:', error);
    });
    
    // Clear stored data immediately
    clearStoredAuth();
    setUser(null);
    console.log('🔐 Logout concluído');
  };

  const forceTokenSync = () => {
    console.log('🔐 Forçando sincronização de tokens...');
    clearStoredAuth();
    setUser(null);
    window.location.href = '/login';
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    
    // Check traditional permission system for backward compatibility
    if (user.permissions?.includes(permission) || user.permissions?.includes('admin_full')) {
      return true;
    }
    
    // Map legacy permission names to actual tags
    const permissionToTagMap: { [key: string]: string } = {
      'premium_features': 'Dashboard', // Premium features relacionadas ao dashboard
      'analytics_access': 'Analytics',
      'admin_full': 'Admin Full',
      'dashboard_access': 'Dashboard',
      'grind_access': 'Grind',
      'upload_access': 'Import',
      'grade_planner_access': 'Grade',
      'grind_session_access': 'Grind',
      'mental_prep_access': 'Warm Up',
      'studies_access': 'Estudos',
      'warm_up_access': 'Warm Up',
      'weekly_planner_access': 'Calendario',
      'performance_access': 'Analytics',
      'user_management': 'Usuarios',
      'system_config': 'Admin Full',
      'user_analytics': 'Analytics',
      'executive_reports': 'Analytics',
    };
    
    // Use mapped tag or fallback to original permission name
    const tagToCheck = permissionToTagMap[permission] || permission;
    
    // Check new tag-based system
    return hasTagAccess(user.subscriptionPlan, tagToCheck, user.email);
  };

  const isCurrentUserSuperAdmin = (): boolean => {
    if (!user) return false;
    return isSuperAdmin(user.email);
  };

  const reloadUserPermissions = async (): Promise<void> => {
    try {
      console.log('🔄 Recarregando permissões do usuário...');
      
      // Fetch updated user data from server
      const userData = await apiRequest('GET', '/api/auth/me');
      
      // Update user in state
      setUser(userData);
      
      // Update stored user data
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
      
      console.log('✅ Permissões atualizadas com sucesso');
    } catch (error) {
      console.error('❌ Erro ao recarregar permissões:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider 
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        isSuperAdmin: isCurrentUserSuperAdmin,
        reloadUserPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Create a safe default context during hot reload
    return {
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: async () => ({ success: false, message: 'Context not ready' }),
      logout: () => {},
      hasPermission: () => false
    };
  }
  return context;
};