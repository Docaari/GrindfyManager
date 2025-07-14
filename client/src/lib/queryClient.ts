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
): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  // Handle 401 responses - token might be expired
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
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
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);
          
          // Retry the original request with new token
          const retryRes = await fetch(url, {
            ...options,
            headers: {
              ...headers,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          return retryRes;
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }
    
    // No refresh token or refresh failed
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    throw new Error('Unauthorized');
  }

  return response;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('accessToken');
    
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
