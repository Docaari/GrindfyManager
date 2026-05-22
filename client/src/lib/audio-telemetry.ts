// Sprint Mini Player 2 (RF-04.2 / ADR-191) — client-side audio telemetry emitter.
//
// Reusa POST /api/user-activity (single) e POST /api/user-activity/batch (sendBeacon).
// Offline: enfileira em localStorage backlog (cap 100 FIFO).
// NEVER throws.

const BACKLOG_KEY = "mini_player:audio_telemetry_backlog";
const BACKLOG_CAP = 100;
const SINGLE_ENDPOINT = "/api/user-activity";
const BATCH_ENDPOINT = "/api/user-activity/batch";
const PAGE = "mini_player";

const PII_KEYS = new Set([
  "email",
  "emailAddress",
  "userEmail",
  "displayName",
  "display_name",
  "name",
  "fullName",
]);

export interface EmitOptions {
  feature?: string;
  duration?: number;
  useBeacon?: boolean;
}

function stripPII(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripPII);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k)) continue;
    out[k] = stripPII(v);
  }
  return out;
}

function readBacklog(): any[] {
  try {
    const raw = localStorage.getItem(BACKLOG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeBacklog(arr: any[]): void {
  try {
    localStorage.setItem(BACKLOG_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function buildEntry(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
) {
  const cleanedPayload = stripPII(payload ?? {});
  return {
    action,
    feature: options?.feature ?? null,
    duration: options?.duration ?? null,
    page: PAGE,
    metadata: {
      ...cleanedPayload,
      v: 1,
      clientTimestamp: Date.now(),
    },
  };
}

function isOnline(): boolean {
  try {
    if (typeof navigator === "undefined") return true;
    if (typeof navigator.onLine === "boolean") return navigator.onLine;
    return true;
  } catch {
    return true;
  }
}

export async function emitAudioEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  try {
    const entry = buildEntry(action, payload, options);

    if (!isOnline()) {
      // backlog FIFO cap 100
      const backlog = readBacklog();
      backlog.push(entry);
      while (backlog.length > BACKLOG_CAP) backlog.shift();
      writeBacklog(backlog);
      return;
    }

    if (options?.useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const body = JSON.stringify({ events: [entry] });
        navigator.sendBeacon(BATCH_ENDPOINT, body);
        return;
      } catch {
        // fall through to fetch
      }
    }

    try {
      const p = fetch(SINGLE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        keepalive: true,
        // MEDIUM-6: enviar cookies para o servidor identificar o user
        // (endpoint /api/user-activity requer auth via cookie httpOnly).
        credentials: "include",
      });
      if (p && typeof (p as any).catch === "function") {
        (p as any).catch(() => {
          // swallow
        });
      }
    } catch {
      // ignore
    }
  } catch {
    // never throw
  }
}

export async function flushBacklog(): Promise<void> {
  try {
    if (!isOnline()) return;
    const backlog = readBacklog();
    if (backlog.length === 0) return;
    // Chunk em batches de 10.
    const chunks: any[][] = [];
    for (let i = 0; i < backlog.length; i += 10) {
      chunks.push(backlog.slice(i, i + 10));
    }
    for (const chunk of chunks) {
      const body = JSON.stringify({ events: chunk });
      let sent = false;
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          sent = !!navigator.sendBeacon(BATCH_ENDPOINT, body);
        }
      } catch {
        // ignore
      }
      if (!sent) {
        try {
          const p = fetch(BATCH_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
            // MEDIUM-6: cookies HttpOnly necessarios pra auth.
            credentials: "include",
          });
          if (p && typeof (p as any).catch === "function") {
            (p as any).catch(() => undefined);
          }
        } catch {
          // ignore
        }
      }
    }
    writeBacklog([]);
  } catch {
    // never throw
  }
}

export function _resetForTests(): void {
  try {
    localStorage.removeItem(BACKLOG_KEY);
  } catch {
    // ignore
  }
}
