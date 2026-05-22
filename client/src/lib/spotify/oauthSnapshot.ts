// Sprint Mini Player 3 / RF-06.1 — OAuth snapshot helpers.
// ADR-194: snapshot proativo em sessionStorage antes do window.open
// (popup blocked fallback). TTL 10min. ZERO secrets — apenas trackId
// (publico), scrollY, queueVersion, timestamp, pathname.
//
// @security
// Threat model: snapshot lives in sessionStorage and carries NO tokens,
// NO PII, NO refresh_token, NO access_token. Payload is bounded to
// publicly-known data: activeTrackId (already on screen), scrollY,
// queueVersion (monotonic counter), pathname (current route), timestamp.
// Spotify access/refresh tokens live SERVER-side, persisted via AES-256-GCM
// in `oauth_tokens` (see ADR-190) and exchanged via httpOnly cookies — never
// touched by client JS. An attacker with XSS on this origin can read the
// snapshot but cannot escalate to Spotify access; the worst-case is forging
// `scrollY`/`queueVersion`, which is cosmetic. Clock-skew mitigation
// (MP3.1 M6): snapshots with future `timestamp` are discarded to limit
// replay-style abuse via tampered system clocks.
//
// MP3 R1 fix wave 2 (HIGH-3 + HIGH-4):
//   - HIGH-3: `pathname` capturado de `window.location.pathname` no save
//     para o callback redirecionar de volta a rota original pos-OAuth.
//   - HIGH-4: `authUrl` REMOVIDO do payload do snapshot (campo morto sem
//     consumer; authUrl continua sendo parametro da funcao, usado pelo
//     caller para window.location.href fallback, mas NAO persiste).

const SS_KEY = "spotify_oauth_snapshot";
const LS_QUEUE_KEY = "audio.queue.v1";
const TTL_MS = 10 * 60 * 1000;
// MP3.1 M6: tolerate 1min of clock drift; discard snapshots whose
// timestamp is further in the future (tampered clock / cross-device sync).
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

interface Snapshot {
  activeTrackId: string | null;
  scrollY: number;
  queueVersion: number;
  timestamp: number;
  pathname: string;
}

function readQueueVersion(): number {
  try {
    const raw = localStorage.getItem(LS_QUEUE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const v = parsed?.version;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function readActiveTrackId(): string | null {
  try {
    const id = (window as any).__audioPlayerActiveTrackId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function readPathname(): string {
  try {
    if (typeof window !== "undefined" && window.location) {
      const p = window.location.pathname;
      return typeof p === "string" && p.length > 0 ? p : "/";
    }
  } catch {
    // ignore
  }
  return "/";
}

// HIGH-4: authUrl continua sendo PARAMETRO da funcao (caller usa para
// window.location.href fallback), mas NAO eh persistido no snapshot.
export function saveOAuthSnapshot(_authUrl: string): void {
  try {
    const snap: Snapshot = {
      activeTrackId: readActiveTrackId(),
      scrollY: typeof window !== "undefined" ? (window.scrollY ?? 0) : 0,
      queueVersion: readQueueVersion(),
      timestamp: Date.now(),
      pathname: readPathname(),
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(snap));
  } catch {
    // ignore — best-effort
  }
}

function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    // ignore
  }
}

export function restoreOAuthSnapshot():
  | { scrollY: number; activeTrackId: string | null; pathname?: string }
  | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: Snapshot | null = null;
  try {
    parsed = JSON.parse(raw) as Snapshot;
  } catch {
    // Corrupt JSON.
    clearSnapshot();
    return null;
  }

  // Validacao shape minima.
  if (!parsed || typeof parsed.timestamp !== "number") {
    clearSnapshot();
    return null;
  }

  // MP3.1 M6: clock-skew guard. Snapshots with timestamps further than
  // CLOCK_SKEW_TOLERANCE_MS in the future are discarded — covers tampered
  // system clocks and cross-device sessionStorage races.
  if (parsed.timestamp > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
    clearSnapshot();
    return null;
  }

  // TTL check.
  if (Date.now() - parsed.timestamp > TTL_MS) {
    clearSnapshot();
    return null;
  }

  // Single-use: limpa apos restore.
  clearSnapshot();

  return {
    scrollY: parsed.scrollY ?? 0,
    activeTrackId: parsed.activeTrackId ?? null,
    pathname: parsed.pathname,
  };
}
