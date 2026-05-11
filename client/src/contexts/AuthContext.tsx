import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest, initCsrf, getCsrfToken, queryClient } from '@/lib/queryClient';
import { hasFullAccess, isSuperAdmin } from '../../../shared/permissions';

interface User {
  id: string;
  userPlatformId: string;
  email: string;
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  status: string;
  subscriptionPlan: string;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  permissions: string[];
}

interface LoginResult {
  success: boolean;
  message?: string;
  requiresVerification?: boolean;
  email?: string;
  error?: string;
  locked?: boolean;
  remainingTime?: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAccess: boolean;
  isAdmin: boolean;
  isSuperAdmin: () => boolean;
  reloadUserPermissions: () => Promise<void>;
  updateUser: (updatedUser: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Storage key for user profile data (non-sensitive, ok in localStorage)
const USER_DATA_KEY = 'grindfy_user_data';

// Token refresh interval (5 minutes before expiration)
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes (token lifetime - default fallback)
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000; // 5 minutes before expiry (default fallback)

// FIX (auth-launch P1.10): JWT-aware refresh scheduling.
// Antes usava intervalo fixo de 10min. Quando server muda lifetime do
// access_token (ex: 5min em prod) ou usuario fica idle, schedule pode
// disparar tarde demais e cair em 401 spam. Decoda exp do cookie via
// /api/auth/me roundtrip nao eh viavel (httpOnly), entao usa fetch /me
// para detectar o exp ou fallback fixed window.
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000; // refresh 60s antes de expirar
const MIN_REFRESH_DELAY_MS = 30 * 1000;     // nunca menos de 30s
const MAX_REFRESH_DELAY_MS = 30 * 60 * 1000; // nunca mais de 30min

/**
 * Decoda payload de um JWT (sem validar assinatura — apenas extrai claims).
 * Retorna null se nao for JWT valido.
 */
function decodeJwtPayload(token: string): { exp?: number; iat?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url decode
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '==='.slice((payload.length + 3) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  // P1.10: Last known access token exp timestamp (ms epoch). Atualizado quando
  // login/refresh retornam tokens no body (back-compat ainda inclui mesmo com
  // httpOnly cookies). null = fallback para REFRESH_INTERVAL.
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null);

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
      // SECURITY (auth-launch Wave 3): retroactively purge JWTs that older app
      // builds (and the old verify-email auto-login) persisted in localStorage.
      // The session lives in httpOnly cookies; these keys must never be present.
      try {
        localStorage.removeItem('grindfy_access_token');
        localStorage.removeItem('grindfy_refresh_token');
      } catch { /* localStorage unavailable (SSR/incognito edge) — ignore */ }

      // Initialize CSRF token
      await initCsrf();

      // Try to restore user from localStorage first for instant UI
      const savedUser = localStorage.getItem(USER_DATA_KEY);

      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }

      // Verify session is still valid via cookie-based auth
      await verifyAndRefreshToken();
    } catch (error) {
      clearStoredAuth();
      setIsLoading(false);
    }
  };

  const verifyAndRefreshToken = async (retryCount = 0) => {
    const maxRetries = 3;

    try {
      // Use fetch directly (not apiRequest) to avoid redirect loop on 401
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const userData = await res.json();
      setUser(userData);

      // Update stored user data
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));

      // Schedule next refresh
      scheduleTokenRefresh();

      setIsLoading(false);

    } catch (error) {
      // Try to refresh token (cookie-based)
      const refreshSuccess = await refreshAccessToken();

      if (refreshSuccess) {
        // Retry verification after successful refresh
        if (retryCount < maxRetries) {
          await verifyAndRefreshToken(retryCount + 1);
        } else {
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
      // Cookie-based refresh - no body needed, cookie sent automatically
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        return false;
      }

      // P1.10: tentar extrair exp do accessToken retornado no body (back-compat)
      try {
        const data = await response.clone().json();
        if (data?.accessToken) {
          const payload = decodeJwtPayload(data.accessToken);
          if (payload?.exp) {
            setAccessTokenExpiresAt(payload.exp * 1000);
          }
        }
      } catch {
        // Resposta sem body JSON ou sem accessToken — usa fallback.
      }

      // Schedule next refresh
      scheduleTokenRefresh();

      return true;

    } catch (error) {

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

    // FIX (auth-launch P1.10): JWT-aware schedule.
    // Se sabemos accessTokenExpiresAt, schedula refresh em (exp - now - safety).
    // Senao, fallback para janela fixa antiga (REFRESH_INTERVAL - REFRESH_BEFORE_EXPIRY).
    let delayMs: number;
    if (accessTokenExpiresAt) {
      const remaining = accessTokenExpiresAt - Date.now() - REFRESH_SAFETY_MARGIN_MS;
      delayMs = Math.max(MIN_REFRESH_DELAY_MS, Math.min(remaining, MAX_REFRESH_DELAY_MS));
      // Se ja expirou ou esta a <30s, refresh imediatamente.
      if (remaining <= 0) {
        delayMs = MIN_REFRESH_DELAY_MS;
      }
    } else {
      delayMs = REFRESH_INTERVAL - REFRESH_BEFORE_EXPIRY;
    }

    const timer = setTimeout(() => {
      refreshAccessToken();
    }, delayMs);

    setRefreshTimer(timer);
  };

  const handleAuthFailure = () => {
    clearStoredAuth();
    setUser(null);
    setIsLoading(false);
  };

  const clearStoredAuth = () => {
    localStorage.removeItem(USER_DATA_KEY);

    // FIX (auth-launch P0.4): limpar cache do TanStack Query no logout.
    // Sem isso, dados sensíveis do user anterior (saldos, sessoes, KPIs)
    // ficam acessiveis ate gcTime expirar (10min) — vazamento entre sessoes
    // se outro user logar no mesmo browser.
    try {
      queryClient.clear();
    } catch {
      // queryClient pode nao estar inicializado em alguns testes — ignorar.
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      setRefreshTimer(null);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      // Use apiRequest for login - it handles CSRF token automatically
      // and won't redirect on 401 since login endpoint doesn't require auth
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store user profile data (non-sensitive)
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));

        setUser(data.user);

        // P1.10: extrair exp do JWT pra schedule de refresh JWT-aware.
        if (data.accessToken) {
          const payload = decodeJwtPayload(data.accessToken);
          if (payload?.exp) {
            setAccessTokenExpiresAt(payload.exp * 1000);
          }
        }

        // Initialize CSRF token after login
        await initCsrf();

        // Fetch full user data (includes subscriptionPlan) immediately
        try {
          const fullUserData = await apiRequest('GET', '/api/auth/me');
          setUser(fullUserData);
          localStorage.setItem(USER_DATA_KEY, JSON.stringify(fullUserData));
        } catch (e) {
          // Fall back to login response data
        }

        // Start refresh cycle
        scheduleTokenRefresh();

        return { success: true };
      } else {
        // Handle various error scenarios
        if (data.locked) {
          return {
            success: false,
            locked: true,
            remainingTime: data.remainingTime,
            error: data.message
          };
        }

        if (data.requiresVerification) {
          return {
            success: false,
            requiresVerification: true,
            error: data.message,
            email: data.email
          };
        }

        return { success: false, error: data.message || 'Erro no login' };
      }
    } catch (error: any) {
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = () => {
    // Call logout endpoint in background (don't wait for response)
    // Server will clear httpOnly cookies
    apiRequest('POST', '/api/auth/logout').then(response => {
      // Response is handled but we don't need to wait
    }).catch(error => {
    });

    // Clear stored data immediately
    clearStoredAuth();
    setUser(null);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;

    // Super-admin has full access
    if (isSuperAdmin(user.email)) return true;

    // Admin-only permissions
    const adminOnlyPermissions = ['admin_full', 'user_management', 'analytics_access', 'system_config', 'user_analytics', 'executive_reports'];
    if (adminOnlyPermissions.includes(permission)) {
      return false;
    }

    // Everything else: check full access
    return hasFullAccess(user);
  };

  const isCurrentUserSuperAdmin = (): boolean => {
    if (!user) return false;
    return isSuperAdmin(user.email);
  };

  const computedHasAccess = user ? hasFullAccess(user) : false;
  const computedIsAdmin = user ? isSuperAdmin(user.email) : false;

  const reloadUserPermissions = async (): Promise<void> => {
    try {
      // Fetch updated user data from server
      const userData = await apiRequest('GET', '/api/auth/me');

      // Update user in state
      setUser(userData);

      // Update stored user data
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    } catch (error) {
      throw error;
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(updatedUser));
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
        hasAccess: computedHasAccess,
        isAdmin: computedIsAdmin,
        isSuperAdmin: isCurrentUserSuperAdmin,
        reloadUserPermissions,
        updateUser,
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
      hasPermission: () => false,
      hasAccess: false,
      isAdmin: false,
      isSuperAdmin: () => false,
      reloadUserPermissions: async () => {},
      updateUser: () => {},
    };
  }
  return context;
};
