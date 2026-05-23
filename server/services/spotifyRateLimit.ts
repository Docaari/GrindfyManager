// Sprint SPOTIFY-DEEP / RF-03 + ADR-208 §2 — Token bucket per-user.
//
// Capacity 180, refill 3 tokens/s linear (= 180 tokens / 60s, paridade Spotify
// Web API). In-memory Map<userId, {tokens, lastRefillMs}>. Lazy refill on consume.
// Reset por restart (in-memory aceito pre-launch; Redis defer per ADR §A3).

interface TokenBucketState {
  tokens: number;
  lastRefillMs: number;
}

export interface TokenBucketOpts {
  capacity?: number;
  refillPerSec?: number;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export interface TokenBucket {
  consume(userId: string): ConsumeResult;
  _resetForTests(): void;
}

export function createTokenBucket(opts: TokenBucketOpts = {}): TokenBucket {
  const capacity = opts.capacity ?? 180;
  const refillPerSec = opts.refillPerSec ?? 3;
  const buckets: Map<string, TokenBucketState> = new Map();

  function refill(state: TokenBucketState, nowMs: number): void {
    const elapsedMs = nowMs - state.lastRefillMs;
    if (elapsedMs <= 0) return;
    const refillAmount = (elapsedMs / 1000) * refillPerSec;
    state.tokens = Math.min(capacity, state.tokens + refillAmount);
    state.lastRefillMs = nowMs;
  }

  return {
    consume(userId: string): ConsumeResult {
      const now = Date.now();
      let state = buckets.get(userId);
      if (!state) {
        state = { tokens: capacity, lastRefillMs: now };
        buckets.set(userId, state);
      } else {
        refill(state, now);
      }
      if (state.tokens >= 1) {
        state.tokens -= 1;
        return {
          allowed: true,
          remaining: Math.floor(state.tokens),
        };
      }
      // Sem token disponivel. Calcula quando o proximo refill produz 1 inteiro.
      const tokensNeeded = 1 - state.tokens;
      const retryAfterMs = Math.ceil((tokensNeeded / refillPerSec) * 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, retryAfterMs),
      };
    },
    _resetForTests(): void {
      buckets.clear();
    },
  };
}

// Singleton padrao para o pipeline de catalogo.
export const defaultSpotifyTokenBucket = createTokenBucket();
