// Sprint Mini Player 3.1 Wave B / TIER 3 #4 — Cross-reload resume snapshot.
// Persist + load { trackId, currentSeconds, isPlaying, timestamp } so that
// after F5 the MiniPlayer can restore where the user paused.
//
// Storage: localStorage `audio.lastSession.v1`. TTL 7d. NEVER throws.
// NOT auto-play: restore only positions; user clicks play to resume.

const STORAGE_KEY = "audio.lastSession.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResumeSnapshot {
  trackId: string;
  currentSeconds: number;
  isPlaying: boolean;
  timestamp: number;
}

export function writeResumeSnapshot(snap: ResumeSnapshot): void {
  try {
    if (!snap || !snap.trackId) return;
    const safe: ResumeSnapshot = {
      trackId: String(snap.trackId),
      currentSeconds: Number.isFinite(snap.currentSeconds)
        ? Math.max(0, snap.currentSeconds)
        : 0,
      isPlaying: !!snap.isPlaying,
      timestamp:
        Number.isFinite(snap.timestamp) && snap.timestamp > 0
          ? snap.timestamp
          : Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // ignore — best-effort
  }
}

export function readResumeSnapshot(): ResumeSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const trackId = parsed.trackId;
    const currentSeconds = parsed.currentSeconds;
    const isPlaying = parsed.isPlaying;
    const timestamp = parsed.timestamp;
    if (typeof trackId !== "string" || !trackId) return null;
    if (typeof currentSeconds !== "number" || !Number.isFinite(currentSeconds))
      return null;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp))
      return null;
    if (Date.now() - timestamp > TTL_MS) {
      // Expired — clear + return null.
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return {
      trackId,
      currentSeconds: Math.max(0, currentSeconds),
      isPlaying: !!isPlaying,
      timestamp,
    };
  } catch {
    return null;
  }
}

export function clearResumeSnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const _RESUME_STORAGE_KEY = STORAGE_KEY;
export const _RESUME_TTL_MS = TTL_MS;
