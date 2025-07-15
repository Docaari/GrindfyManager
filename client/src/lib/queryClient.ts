import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  customHeaders?: Record<string, string>
): Promise<any> {
  // Use consistent token key naming with AuthContext
  const token = localStorage.getItem('grindfy_access_token');
  
  console.log('🔐 API REQUEST DEBUG:', {
    url,
    method,
    hasToken: !!token,
    tokenStart: token ? token.substring(0, 20) + '...' : 'none'
  });
  
  const headers: Record<string, string> = {
    ...customHeaders
  };
  
  // Only set Content-Type for non-FormData requests
  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (data && method !== 'GET') {
    // For FormData, send directly; for other data, stringify
    options.body = data instanceof FormData ? data : JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  console.log('🔐 API RESPONSE DEBUG:', {
    url,
    status: response.status,
    statusText: response.statusText,
    hasAuthHeader: !!headers['Authorization']
  });
  
  // Handle 401 responses - token might be expired
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('grindfy_refresh_token');
    if (refreshToken) {
      try {
        // Try to refresh the token
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
          
          // Retry the original request with new token
          const retryRes = await fetch(url, {
            ...options,
            headers: {
              ...headers,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          await throwIfResNotOk(retryRes);
          return await retryRes.json();
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Clear tokens and redirect to login
        localStorage.removeItem('grindfy_access_token');
        localStorage.removeItem('grindfy_refresh_token');
        localStorage.removeItem('grindfy_user_data');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }
    
    // No refresh token or refresh failed
    localStorage.removeItem('grindfy_access_token');
    localStorage.removeItem('grindfy_refresh_token');
    localStorage.removeItem('grindfy_user_data');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  await throwIfResNotOk(response);
  return await response.json();
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
