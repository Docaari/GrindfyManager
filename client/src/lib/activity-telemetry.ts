// =============================================================================
// Sprint MP-VALIDATION / RF-01 + ADR-207 — activity telemetry (4 dominios)
//
// Generaliza `audio-telemetry.ts` (ADR-191) para 4 dominios: audio/lesson/coach/
// library. Eventos seguem dot-namespace canonico (CANONICAL_EVENT_NAMES).
//
// Features:
//   - PII strip client-side (ADR-207 §3).
//   - Throttle per (action + dedupeKey) — default 30s; audio.seek 1s.
//   - Batch via sendBeacon (opt-in `useBeacon`).
//   - Offline backlog FIFO cap 100 localStorage.
//   - Best-effort: NUNCA throws (lesson #9: log antes do swallow).
// =============================================================================

const BACKLOG_KEY = "activity_telemetry_backlog";
const BACKLOG_CAP = 100;
const SINGLE_ENDPOINT = "/api/user-activity";
const BATCH_ENDPOINT = "/api/user-activity/batch";

const DEFAULT_THROTTLE_MS = 30_000;
const AUDIO_SEEK_THROTTLE_MS = 1_000;

const PII_KEYS = new Set([
  "email",
  "emailaddress",
  "useremail",
  "displayname",
  "display_name",
  "name",
  "fullname",
  "full_name",
  "phone",
  "phonenumber",
  "phone_number",
  "cpf",
  "ssn",
  "payment_card",
  "paymentcard",
  "credit_card",
  "creditcard",
  "address",
  "street_address",
]);

const PAGE_BY_NAMESPACE: Record<string, string> = {
  audio: "mini_player",
  lesson: "lesson_viewer",
  coach: "coach_hub",
  library: "biblioteca",
};

export interface EmitOptions {
  feature?: string | null;
  duration?: number | null;
  useBeacon?: boolean;
  page?: string;
  // Override do throttle (millis). Quando `null` desliga o throttle.
  throttleMs?: number | null;
  // Override do dedupeKey (default: namespace-specific — ver buildDedupeKey).
  dedupeKey?: string;
}

// =============================================================================
// State interno (throttle Map + offline backlog)
// =============================================================================

const lastEmitAt = new Map<string, number>();

function isDevEnv(): boolean {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
  } catch {
    // ignore
  }
  // import.meta access via Function indirect (evita ReferenceError em CJS scope
  // quando este modulo eh transpilado p/ CommonJS via ts.transpileModule no
  // setup de tests — lesson #14/#26 derivada).
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const meta: any = new Function("try { return import.meta } catch { return null }")();
    return !!(meta && meta.env && meta.env.DEV);
  } catch {
    return false;
  }
}

function stripPII(obj: any, warn = true): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => stripPII(v, warn));
  const out: any = {};
  let leaked = false;
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      leaked = true;
      continue;
    }
    out[k] = stripPII(v, warn);
  }
  if (leaked && warn) {
    try {
      // eslint-disable-next-line no-console
      console.warn(
        "[activity-telemetry] PII key removida do metadata (ADR-207 §3)",
      );
    } catch {
      // ignore
    }
  }
  return out;
}

function buildDedupeKey(action: string, payload: Record<string, unknown>): string {
  // Heuristica por namespace:
  //   audio.seek -> track_id (1s)
  //   audio.*    -> action (default — coalescencia ampla)
  //   lesson.*   -> lesson_id (per-session dedupe ja garantido via threshold)
  //   coach.*    -> nudge_id (quando presente) OR action
  //   library.*  -> lesson_id + format
  const ns = action.split(".")[0];
  if (action === "audio.seek") return `${action}:${(payload?.track_id as string) ?? ""}`;
  if (ns === "lesson") return `${action}:${(payload?.lesson_id as string) ?? ""}`;
  if (ns === "coach") {
    const nudgeId = (payload?.nudge_id as string) ?? "";
    return `${action}:${nudgeId}`;
  }
  if (ns === "library") {
    return `${action}:${(payload?.lesson_id as string) ?? ""}:${(payload?.format as string) ?? ""}`;
  }
  return action;
}

function resolveThrottleMs(action: string, options?: EmitOptions): number {
  if (options?.throttleMs === null) return 0;
  if (typeof options?.throttleMs === "number") return options.throttleMs;
  if (action === "audio.seek") return AUDIO_SEEK_THROTTLE_MS;
  return DEFAULT_THROTTLE_MS;
}

function readBacklog(): any[] {
  try {
    if (typeof localStorage === "undefined") return [];
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
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BACKLOG_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
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

function buildEntry(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
) {
  const cleanedPayload = stripPII(payload ?? {});
  const ns = action.split(".")[0];
  const page = options?.page ?? PAGE_BY_NAMESPACE[ns] ?? "unknown";
  return {
    action,
    feature: options?.feature ?? null,
    duration: options?.duration ?? null,
    page,
    metadata: {
      ...cleanedPayload,
      v: 1,
      clientTimestamp: Date.now(),
    },
  };
}

async function postEntry(entry: any, useBeacon = false): Promise<void> {
  if (!isOnline()) {
    const backlog = readBacklog();
    backlog.push(entry);
    while (backlog.length > BACKLOG_CAP) backlog.shift();
    writeBacklog(backlog);
    return;
  }
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
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
}

// =============================================================================
// API publica — emit* + flush + reset
// =============================================================================

async function emit(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  try {
    // Throttle.
    const throttleMs = resolveThrottleMs(action, options);
    if (throttleMs > 0) {
      const key = options?.dedupeKey ?? buildDedupeKey(action, payload ?? {});
      const now = Date.now();
      const last = lastEmitAt.get(key) ?? 0;
      if (now - last < throttleMs) {
        return; // suprimido por throttle
      }
      lastEmitAt.set(key, now);
    }
    const entry = buildEntry(action, payload, options);
    await postEntry(entry, !!options?.useBeacon);
  } catch (err) {
    // never throw
    if (isDevEnv()) {
      try {
        // eslint-disable-next-line no-console
        console.warn("[activity-telemetry] emit failed (swallow)", err);
      } catch {
        // ignore
      }
    }
  }
}

export function emitAudioEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  return emit(action, payload, options);
}

export function emitLessonEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  return emit(action, payload, options);
}

export function emitCoachEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  return emit(action, payload, options);
}

export function emitLibraryEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: EmitOptions,
): Promise<void> {
  return emit(action, payload, options);
}

export async function flushBacklog(): Promise<void> {
  try {
    if (!isOnline()) return;
    const backlog = readBacklog();
    if (backlog.length === 0) return;
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
  lastEmitAt.clear();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(BACKLOG_KEY);
    }
  } catch {
    // ignore
  }
}
