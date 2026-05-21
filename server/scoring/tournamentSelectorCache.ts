// =============================================================================
// tournamentSelectorCache — Sprint TS-3 (ADR-180 §2.3)
//
// Cache compartilhado entre o widget (/api/tournament-selector) e a Coach tool
// (get_tournament_suggestions). Chave canonica:
//   { userId, date, sources, bankrollMode }
// TTL 30min. Map in-memory.
//
// Sem isso, widget e tool recomputam quando deveriam hit-cache cross-surface.
// =============================================================================

const TTL_MS = 30 * 60 * 1000;

export interface CacheKey {
  userId: string;
  date: string;
  sources: string;
  bankrollMode: string;
  // Sprint TS-3 fix HIGH-2: fingerprint opcional p/ back-compat com widget
  // que diferencia entries por lookbackDays + minScore + minSample. Tool nao
  // passa (fica vazio). Key canonica de ADR-180 §2.3 preservada — fingerprint
  // entra como sufixo opcional, nao quebra shape.
  fingerprint?: string;
}

interface Entry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, Entry<any>>();

function serializeKey(k: CacheKey): string {
  const fp = k.fingerprint ? `::${k.fingerprint}` : "";
  return `${k.userId}::${k.date}::${k.sources}::${k.bankrollMode}${fp}`;
}

export function getTournamentSelectorCache<T = any>(k: CacheKey): T | undefined {
  const key = serializeKey(k);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setTournamentSelectorCache<T = any>(k: CacheKey, data: T): void {
  const key = serializeKey(k);
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

export function _resetTournamentSelectorCacheForTests(): void {
  cache.clear();
}
