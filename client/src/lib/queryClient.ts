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

export function getCsrfToken(): string | null {
  return csrfToken;
}

// FIX (auth-launch P0.3): singleton refresh promise.
// Sem isso, N requests 401 paralelos disparam N POSTs /api/auth/refresh,
// invalidando refresh tokens entre si (rotacao) e podendo deslogar o usuario.
// O singleton garante que so o primeiro 401 inicie um refresh; os demais
// aguardam o resultado do mesmo POST.
let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
    });
    return refreshRes.ok;
  } catch {
    return false;
  }
}

function getRefreshPromise(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh().finally(() => {
    // Limpa a referencia apos resolve/reject pra permitir refresh subsequente
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function initCsrf() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrfToken;
  } catch {
    // CSRF init failure is non-fatal during development
  }
}

export interface ApiRequestOptions {
  /**
   * F3b: quando true, NAO faz refresh+redirect em 401. Apenas lanca o erro
   * com `error.response.status === 401` para que o caller possa reagir
   * (ex: registrar telemetria access_blocked sem perder a sessao). Use com
   * cuidado: callers que dependem do refresh automatico devem deixar default.
   */
  silentMode?: boolean;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  customHeadersOrOptions?: Record<string, string> | ApiRequestOptions,
  maybeOptions?: ApiRequestOptions
): Promise<any> {
  // Backward-compat: 4th arg pode ser headers (legado) ou options. Detectamos
  // por presenca de `silentMode` (so options tem essa key).
  let customHeaders: Record<string, string> | undefined;
  let options: ApiRequestOptions = {};
  if (customHeadersOrOptions) {
    if ("silentMode" in customHeadersOrOptions) {
      options = customHeadersOrOptions as ApiRequestOptions;
    } else {
      customHeaders = customHeadersOrOptions as Record<string, string>;
    }
  }
  if (maybeOptions) options = maybeOptions;

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

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (data && method !== 'GET') {
    // For FormData, send directly; for other data, stringify
    fetchOptions.body = data instanceof FormData ? data : JSON.stringify(data);
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401 responses - token might be expired
  if (response.status === 401) {
    // F3b: silentMode skip refresh+redirect — apenas lanca o erro com
    // shape padrao (error.response.status === 401) para o caller decidir.
    if (options.silentMode) {
      await throwIfResNotOk(response);
      return response.json();
    }

    try {
      // P0.3: refresh via singleton — multiplos 401s paralelos compartilham
      // a mesma promise de refresh ao inves de cada um disparar o seu.
      const refreshOk = await getRefreshPromise();

      if (refreshOk) {
        // Retry the original request (cookies automatically updated by server)
        const retryRes = await fetch(url, {
          ...fetchOptions,
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

// Upload with XMLHttpRequest for progress tracking (FP-02)
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed: number;
}

export function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    // Track speed with moving average over last 3 seconds
    const speedSamples: { time: number; loaded: number }[] = [];

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const now = Date.now();
      speedSamples.push({ time: now, loaded: e.loaded });

      // Keep only samples from last 3 seconds
      const cutoff = now - 3000;
      while (speedSamples.length > 1 && speedSamples[0].time < cutoff) {
        speedSamples.shift();
      }

      let speed = 0;
      if (speedSamples.length >= 2) {
        const first = speedSamples[0];
        const last = speedSamples[speedSamples.length - 1];
        const timeDiff = (last.time - first.time) / 1000;
        if (timeDiff > 0) {
          speed = (last.loaded - first.loaded) / timeDiff;
        }
      }

      onProgress({
        loaded: e.loaded,
        total: e.total,
        percentage: Math.min(Math.floor((e.loaded / e.total) * 100), 100),
        speed,
      });
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        // P0.3: refresh via singleton (compartilhado com apiRequest)
        getRefreshPromise()
          .then((refreshOk) => {
            if (refreshOk) {
              // Retry upload
              const retryXhr = new XMLHttpRequest();
              retryXhr.open('POST', url);
              retryXhr.withCredentials = true;
              if (csrfToken) retryXhr.setRequestHeader('X-CSRF-Token', csrfToken);
              retryXhr.onload = () => {
                if (retryXhr.status >= 200 && retryXhr.status < 300) {
                  try {
                    resolve(JSON.parse(retryXhr.responseText));
                  } catch {
                    resolve(retryXhr.responseText);
                  }
                } else {
                  reject(new Error(retryXhr.statusText || 'Upload failed after retry'));
                }
              };
              retryXhr.onerror = () => reject(new Error('Network error on retry'));
              retryXhr.onabort = () => reject(new Error('Upload cancelado'));
              if (signal) {
                if (signal.aborted) { retryXhr.abort(); return; }
                signal.addEventListener('abort', () => retryXhr.abort(), { once: true });
              }
              retryXhr.send(formData);
            } else {
              localStorage.removeItem('grindfy_user_data');
              window.location.href = '/login';
              reject(new Error('Session expired'));
            }
          })
          .catch(() => {
            reject(new Error('Session expired'));
          });
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        let message = xhr.statusText;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.message) message = data.message;
        } catch {}
        reject(new Error(message || 'Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Erro de rede durante o upload'));
    xhr.onabort = () => reject(new Error('Upload cancelado'));

    // Abort signal support
    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.open('POST', url);
    xhr.withCredentials = true;
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }
    xhr.send(formData);
  });
}

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
