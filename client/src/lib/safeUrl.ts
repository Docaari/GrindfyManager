/**
 * Client-side URL allowlist for user-supplied / externally-sourced links.
 *
 * Anything that ends up in an <a href> whose value came from the DB (scraped
 * news items, user-entered study material URLs, ...) must pass through safeHref
 * so a javascript: / data: / vbscript: / file: scheme can't turn a link click
 * into script execution.
 *
 * Launch Fase 2 - Wave 5 (A03/A07 hardening).
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// ASCII control chars (NUL/TAB/LF/CR/...) - a classic way to smuggle a scheme
// past naive checks, e.g. "java\nscript:alert(1)".
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]');

export function isSafeUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (value === '') return false;
  if (CONTROL_CHARS.test(value)) return false;
  // In-app relative links ("/biblioteca/...") are fine; protocol-relative
  // ("//host") is treated as absolute below.
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(value, base);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/** Returns the trimmed URL when safe, otherwise undefined (so it drops out of an href). */
export function safeHref(raw: unknown): string | undefined {
  return isSafeUrl(raw) ? (raw as string).trim() : undefined;
}
