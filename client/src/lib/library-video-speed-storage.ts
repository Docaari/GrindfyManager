// =============================================================================
// library-video-speed-storage — Sprint UX-Biblioteca-1 / RF-03
//
// Persistencia global de velocidade de video em localStorage. Chave canonica
// `library-video-speed`. Range valido [0.5, 3.0]. Default 1.0.
//
// ADR-104 (decisao: localStorage global vs per-aula vs server-side).
// =============================================================================

export const LIBRARY_VIDEO_SPEED_STORAGE_KEY = "library-video-speed";
export const DEFAULT_VIDEO_SPEED = 1.0;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3.0;

export function readVideoSpeed(): number {
  if (typeof window === "undefined") return DEFAULT_VIDEO_SPEED;
  try {
    const raw = window.localStorage.getItem(LIBRARY_VIDEO_SPEED_STORAGE_KEY);
    if (raw === null || raw === "") return DEFAULT_VIDEO_SPEED;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_SPEED;
    if (parsed < MIN_SPEED || parsed > MAX_SPEED) return DEFAULT_VIDEO_SPEED;
    return parsed;
  } catch {
    return DEFAULT_VIDEO_SPEED;
  }
}

export function writeVideoSpeed(speed: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(speed)) return;
  if (speed < MIN_SPEED || speed > MAX_SPEED) return;
  try {
    window.localStorage.setItem(LIBRARY_VIDEO_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // localStorage indisponivel (private mode, quota cheia) — fallback silencioso.
  }
}
