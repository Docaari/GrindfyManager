// Sprint Mini Player 2 (ADR-190) — pending OAuth sessions in-memory store.
// TTL 10min, single-instance MVP. Move to Redis em multi-instance pos-MVP.

export interface OauthSessionPayload {
  userId: string;
  codeVerifier: string;
  state: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 min
const sessions = new Map<string, OauthSessionPayload>();

export function putOauthSession(
  sessionId: string,
  payload: OauthSessionPayload,
): void {
  sessions.set(sessionId, payload);
}

export function getOauthSession(
  sessionId: string,
): OauthSessionPayload | null {
  const row = sessions.get(sessionId);
  if (!row) return null;
  if (Date.now() - row.createdAt > TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return row;
}

export function deleteOauthSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function _resetForTests(): void {
  sessions.clear();
}
