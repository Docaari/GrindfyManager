/**
 * SSRF-resistant fetch for code paths that retrieve attacker-influenced URLs
 * (the news pipeline: RSS feed URLs, per-article enrichment links pulled from
 * feed content). Blocks non-http(s) schemes, loopback / link-local / RFC1918 /
 * cloud-metadata destinations (by hostname literal AND by resolved IP), and
 * follows redirects manually so a public URL can't 302 to an internal one.
 *
 * Launch Fase 2 — Wave 5 (A10 SSRF).
 *
 * Limitation: there is a small DNS TOCTOU window between the lookup we do here
 * and undici's own connect. For a defence-in-depth news scraper this is an
 * acceptable bar; tightening it further would need a custom undici dispatcher.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 60_000;

// Hostnames that must never be fetched even before DNS resolution.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/** True when an IP literal points at loopback / private / link-local / reserved space. */
export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    const inRange = (cidr: string) => {
      const [base, bitsStr] = cidr.split("/");
      const baseInt = ipv4ToInt(base)!;
      const bits = Number(bitsStr);
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (baseInt & mask);
    };
    return [
      "0.0.0.0/8",      // "this" network
      "10.0.0.0/8",     // RFC1918
      "100.64.0.0/10",  // CGNAT
      "127.0.0.0/8",    // loopback
      "169.254.0.0/16", // link-local (incl. 169.254.169.254 cloud metadata)
      "172.16.0.0/12",  // RFC1918
      "192.0.0.0/24",   // IETF protocol assignments
      "192.0.2.0/24",   // TEST-NET-1
      "192.168.0.0/16", // RFC1918
      "198.18.0.0/15",  // benchmarking
      "240.0.0.0/4",    // reserved (incl. 255.255.255.255)
    ].some(inRange);
  }
  if (family === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::1" || lower === "::") return true;
    // unique-local fc00::/7, link-local fe80::/10, IPv4-mapped ::ffff:a.b.c.d
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP literal — be conservative
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`safeFetch: invalid URL`);
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    throw new Error(`safeFetch: blocked protocol ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error(`safeFetch: blocked hostname ${host}`);
  }
  // If the host is already an IP literal, validate it directly (URL.hostname
  // keeps IPv6 in brackets — strip them before the range check).
  const hostIpLiteral = host.replace(/^\[|\]$/g, "");
  if (net.isIP(host) || net.isIP(hostIpLiteral)) {
    if (isBlockedIp(hostIpLiteral)) throw new Error(`safeFetch: blocked IP ${host}`);
    return u;
  }
  // Otherwise resolve and reject if any resolved address is internal.
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error(`safeFetch: DNS resolution failed for ${host}`);
  }
  if (records.length === 0) throw new Error(`safeFetch: no DNS records for ${host}`);
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new Error(`safeFetch: ${host} resolves to internal IP ${r.address}`);
  }
  return u;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Per-request timeout in ms; combined with any caller-supplied signal. */
  timeoutMs?: number;
  method?: string;
  body?: any;
}

/**
 * fetch() with SSRF guards. Always uses redirect: 'manual' internally and
 * re-validates every redirect target. Throws on a blocked destination.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await assertSafeUrl(current);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(validated.toString(), {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        redirect: "manual",
        signal: ctrl.signal,
      } as any);
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    }
    // 3xx with a Location -> validate and follow ourselves.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res; // odd redirect without Location — hand it back
      current = new URL(loc, validated).toString();
      continue;
    }
    return res;
  }
  throw new Error(`safeFetch: too many redirects (>${MAX_REDIRECTS})`);
}
