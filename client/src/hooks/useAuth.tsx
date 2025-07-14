import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
  emailVerified: boolean;
  permissions: string[];
  subscriptionType: string;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  console.log('🔐 Inicializando sistema de autenticação...');

  const renewToken = async (): Promise<boolean> => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const response = await apiRequest('POST', '/api/auth/refresh', {
        refreshToken
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        
        // Obtém informações do usuário
        const userResponse = await apiRequest('GET', '/api/auth/user', null, {
          'Authorization': `Bearer ${data.accessToken}`
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData);
          console.log('🔐 Token renovado com sucesso para:', userData.email);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Erro ao renovar token:', error);
      return false;
    }
  };

  // Verifica se há uma sessão salva
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!accessToken || !refreshToken) {
          console.log('🔐 Nenhuma sessão salva encontrada');
          setIsLoading(false);
          return;
        }

        // Tenta obter informações do usuário
        const response = await apiRequest('GET', '/api/auth/user', null, {
          'Authorization': `Bearer ${accessToken}`
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          console.log('🔐 Usuário autenticado:', userData.email);
        } else {
          // Token expirado, tenta renovar
          console.log('🔐 Token expirado, tentando renovar...');
          const renewed = await renewToken();
          if (!renewed) {
            // Limpa tokens inválidos
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            console.log('🔐 Sessão expirada, usuário precisa fazer login novamente');
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiRequest('POST', '/api/auth/login', {
        email,
        password
      });

      const data = await response.json();

      if (response.ok) {
        // Salva tokens
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        // Define usuário
        setUser(data.user);
        
        console.log('🔐 Login realizado com sucesso:', data.user.email);
        return { success: true };
      } else {
        console.log('🔐 Erro no login:', data.message);
        return { 
          success: false, 
          error: data.message,
          requiresVerification: data.requiresVerification 
        };
      }
    } catch (error) {
      console.error('Erro de conexão no login:', error);
      return { 
        success: false, 
        error: 'Erro de conexão. Tente novamente.' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    console.log('🔐 Logout realizado');
  };

  const refreshTokenFn = async (): Promise<boolean> => {
    return await renewToken();
  };

  const contextValue: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    refreshToken: refreshTokenFn,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};