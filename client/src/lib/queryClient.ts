
import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Token refresh state management
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Auto-refresh function with multiple retry attempts
async function refreshTokens(retryCount = 0): Promise<boolean> {
  const maxRetries = 3;
  
  try {
    const refreshToken = localStorage.getItem('grindfy_refresh_token');
    
    if (!refreshToken) {
      console.log('🔐 No refresh token found');
      return false;
    }

    console.log(`🔐 Attempting token refresh (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include',
    });
    
    if (refreshRes.ok) {
      const { accessToken, refreshToken: newRefreshToken } = await refreshRes.json();
      localStorage.setItem('grindfy_access_token', accessToken);
      localStorage.setItem('grindfy_refresh_token', newRefreshToken);
      
      console.log('🔐 Token refreshed successfully');
      return true;
    } else {
      throw new Error(`Refresh failed with status ${refreshRes.status}`);
    }
    
  } catch (error) {
    console.error(`🔐 Token refresh failed (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < maxRetries) {
      // Wait with exponential backoff before retry
      const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return await refreshTokens(retryCount + 1);
    }
    
    return false;
  }
}

// Schedule auto-refresh 5 minutes before token expiration
function scheduleTokenRefresh() {
  const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes (token expires in 15)
  
  setTimeout(async () => {
    console.log('🔐 Scheduled token refresh executing...');
    const success = await refreshTokens();
    
    if (success) {
      // Schedule next refresh
      scheduleTokenRefresh();
    } else {
      console.error('🔐 Scheduled refresh failed, user will need to login again');
    }
  }, REFRESH_INTERVAL);
}

// Initialize auto-refresh on first successful request
let refreshScheduled = false;

export async function apiRequest(
  url: string,
  options?: {
    method?: string;
    body?: string;
  }
): Promise<any> {
  const token = localStorage.getItem('grindfy_access_token');
  
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body,
    credentials: "include",
  });

  // Handle 401 responses with auto-refresh
  if (res.status === 401) {
    console.log('🔐 Received 401, attempting token refresh...');
    
    // Prevent multiple simultaneous refresh attempts
    if (isRefreshing) {
      if (refreshPromise) {
        const success = await refreshPromise;
        if (success) {
          // Retry original request with new token
          const newToken = localStorage.getItem('grindfy_access_token');
          if (newToken) {
            headers["Authorization"] = `Bearer ${newToken}`;
            res = await fetch(url, {
              method: options?.method || "GET",
              headers,
              body: options?.body,
              credentials: "include",
            });
          }
        }
      }
    } else {
      isRefreshing = true;
      refreshPromise = refreshTokens();
      
      try {
        const refreshSuccess = await refreshPromise;
        
        if (refreshSuccess) {
          // Retry the original request with new token
          const newToken = localStorage.getItem('grindfy_access_token');
          if (newToken) {
            headers["Authorization"] = `Bearer ${newToken}`;
            res = await fetch(url, {
              method: options?.method || "GET",
              headers,
              body: options?.body,
              credentials: "include",
            });
            
            // Schedule auto-refresh if not already scheduled
            if (!refreshScheduled) {
              scheduleTokenRefresh();
              refreshScheduled = true;
            }
          }
        } else {
          // Refresh failed, clear tokens and redirect
          localStorage.removeItem('grindfy_access_token');
          localStorage.removeItem('grindfy_refresh_token');
          localStorage.removeItem('grindfy_user_data');
          window.location.href = '/login';
          throw new Error('Session expired');
        }
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    }
  }

  // Schedule auto-refresh on first successful authenticated request
  if (res.ok && token && !refreshScheduled) {
    scheduleTokenRefresh();
    refreshScheduled = true;
  }

  await throwIfResNotOk(res);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('grindfy_access_token');
    
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
