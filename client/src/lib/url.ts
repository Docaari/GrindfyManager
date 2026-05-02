/**
 * URL helpers compartilhados pelo frontend.
 *
 * `parseSearch(path)` extrai a querystring de uma string de path (formato
 * wouter `useLocation()` ou similar) e retorna `URLSearchParams`. Tolera
 * paths sem `?` (retorna params vazios).
 */
export function parseSearch(path: string): URLSearchParams {
  const idx = path.indexOf('?');
  if (idx < 0) return new URLSearchParams();
  return new URLSearchParams(path.slice(idx + 1));
}
