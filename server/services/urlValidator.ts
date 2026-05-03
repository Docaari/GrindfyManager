/**
 * URL validator — usado pelo News pipeline (Grok cron + seed) pra detectar
 * URLs hallucinated (404 / 403 / abort).
 *
 * Sprint home-reform-4 item 11: Grok retorna URLs especificas que tipicamente
 * 404'am no destino real. Esse helper faz HEAD check com timeout curto e
 * permite o caller substituir por uma URL homepage de fallback.
 */

const HEAD_TIMEOUT_MS = 6000;

/**
 * Faz HEAD em `url`. Considera valido HTTP 2xx OU 3xx (redirect resolvido pelo
 * fetch). Considera INvalido qualquer outro codigo, network error ou timeout.
 *
 * Alguns sites bloqueiam HEAD (405) — nesse caso fazemos fallback pra GET com
 * Range: bytes=0-0 pra economizar banda. So usar quando HEAD retornar 405.
 */
export async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
    const r = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 GrindfyNewsBot/1.0" },
    });
    clearTimeout(t);
    if (r.ok) return true;
    if (r.status >= 300 && r.status < 400) return true;
    if (r.status === 405) {
      return await getReachableFallback(url);
    }
    return false;
  } catch {
    return false;
  }
}

async function getReachableFallback(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 GrindfyNewsBot/1.0",
        Range: "bytes=0-0",
      },
    });
    clearTimeout(t);
    return r.ok || (r.status >= 300 && r.status < 400) || r.status === 206;
  } catch {
    return false;
  }
}

/**
 * Retorna `url` se reachable; senao retorna `fallback` (homepage da source).
 * Loga substituicao pra observabilidade do cron.
 */
export async function resolveItemUrl(
  url: string,
  fallback: string | null,
  context: { sourceId: string; title: string },
): Promise<string> {
  const ok = await isUrlReachable(url);
  if (ok) return url;
  if (!fallback) {
    console.warn(
      "[urlValidator] URL invalida sem fallback — mantendo original",
      { sourceId: context.sourceId, url, title: context.title.slice(0, 60) },
    );
    return url;
  }
  console.warn("[urlValidator] URL invalida — substituindo por homepage", {
    sourceId: context.sourceId,
    original: url,
    fallback,
    title: context.title.slice(0, 60),
  });
  return fallback;
}
