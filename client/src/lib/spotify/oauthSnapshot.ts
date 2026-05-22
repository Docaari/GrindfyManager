// Sprint Mini Player 3 / RF-06.1 — OAuth snapshot helpers.
// ADR-194: snapshot proativo em sessionStorage antes do window.open
// (popup blocked fallback). TTL 10min. ZERO secrets — apenas trackId
// (publico), scrollY, queueVersion, timestamp, pathname.
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
