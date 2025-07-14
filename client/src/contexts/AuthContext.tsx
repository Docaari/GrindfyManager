import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Auto-refresh token every 10 minutes
  useEffect(() => {
    if (user) {
      const interval = setInterval(refreshToken, 10 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const accessToken = localStorage.getItem('accessToken');
      
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      const response = await apiRequest('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Token might be expired, try to refresh
        const refreshed = await refreshToken();
        if (!refreshed) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // apiRequest already returns JSON data, no need to call .json()
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setUser(data.user);
      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, message: 'Erro de conexão' };
    }
  };

  const logout = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const refreshTokenValue = localStorage.getItem('refreshToken');
      if (!refreshTokenValue) return false;

      const response = await apiRequest('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        // Get updated user info
        await checkAuth();
        return true;
      } else {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      return false;
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user || !user.permissions || !Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permission) || user.permissions.includes('admin_full');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasPermission,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};