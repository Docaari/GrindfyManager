import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorData;
    try {
      const text = await res.text();
      errorData = JSON.parse(text);
    } catch {
      errorData = { message: res.statusText };
    }
    
    const error = new Error(errorData.message || `${res.status}: ${res.statusText}`);
    (error as any).response = { 
      status: res.status, 
      data: errorData 
    };
    throw error;
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
          
          // ✅ RETORNAR A RESPONSE DIRETAMENTE PARA TOKEN REFRESH TAMBÉM
          return retryRes;
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

  // ✅ RETORNAR A RESPONSE DIRETAMENTE SEM PROCESSAMENTO AUTOMÁTICO
  // Deixar o frontend decidir como processar a resposta
  return response;
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
