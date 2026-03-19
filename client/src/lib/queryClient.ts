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

// CSRF token stored in memory (not localStorage)
let csrfToken: string | null = null;

export async function initCsrf() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrfToken;
  } catch {
    // CSRF init failure is non-fatal during development
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  customHeaders?: Record<string, string>
): Promise<any> {
  const headers: Record<string, string> = {
    ...customHeaders
  };

  // Only set Content-Type for non-FormData requests
  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Add CSRF token for state-changing requests
  if (method !== 'GET' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
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
    try {
      // Try to refresh the token (cookie-based, no body needed)
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
      });

      if (refreshRes.ok) {
        // Retry the original request (cookies automatically updated by server)
        const retryRes = await fetch(url, {
          ...options,
          credentials: 'include',
        });

        // Process the retry response
        await throwIfResNotOk(retryRes);
        return retryRes.json();
      }
    } catch (refreshError) {
      // Refresh failed
    }

    // No refresh token or refresh failed - clear user data and redirect
    localStorage.removeItem('grindfy_user_data');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  // Process successful responses
  await throwIfResNotOk(response);

  // Return the processed JSON data
  return response.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
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
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
