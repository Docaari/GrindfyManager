/**
 * URL canonicalize — Sprint News-3 RF-02 (Layer 1 dedupe).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-02
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §4
 *
 * Funcao pura. Nunca throw — URL invalido retorna input intocado.
 */

const STRIP_PARAMS = new Set([
  // utm_*
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  // social/clickthroughs
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "share",
  "si",
  "feature",
  "igshid",
]);

export function canonicalizeUrl(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  // Lowercase host. Path mantem case original.
  let host = url.hostname.toLowerCase();
  // twitter.com -> x.com
  if (host === "twitter.com" || host === "www.twitter.com") {
    host = "x.com";
  }
  url.hostname = host;

  // Strip fragment.
  url.hash = "";

  // Strip + sort query params.
  const sp = new URLSearchParams();
  const entries: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (STRIP_PARAMS.has(k.toLowerCase())) continue;
    entries.push([k, v]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [k, v] of entries) sp.append(k, v);
  url.search = sp.toString();

  // Strip trailing slash do path (exceto path raiz '/').
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  url.pathname = path;

  // Decodifica percent-encoding redundante (%2F -> /).
  // Aplicamos apenas no pathname construido — a serializacao do URL ja faz
  // muito disso, mas %2F especificamente nao eh decodificado por padrao.
  let serialized = url.toString();
  serialized = serialized.replace(/%2F/gi, "/").replace(/%2f/gi, "/");

  return serialized;
}
