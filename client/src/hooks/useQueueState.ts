// Sprint Mini Player 3 / RF-05.1 — useQueueState hook.
// ADR-193. localStorage primario `audio.queue.v1`. Cross-tab via storage event.
// Cap 50 items. Fisher-Yates shuffle com seed opcional (test deterministic).

import { useCallback, useEffect, useRef, useState } from "react";

export type RepeatMode = "off" | "all" | "one";

export interface AudioTrackLike {
  source: "library" | "spotify";
  trackId: string;
  title: string;
  audioUrl?: string;
  coverUrl?: string | null;
  courseTitle?: string | null;
  durationSeconds?: number;
  spotifyUri?: string;
}

export interface QueueItem {
  id: string;
  track: AudioTrackLike;
  addedAt: number;
}

interface PersistShape {
  version: number;
  queue: QueueItem[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  shuffledOrder: string[] | null;
  updatedAt: number;
}

const KEY = "audio.queue.v1";
const MAX_ITEMS = 50;
const DEBOUNCE_MS = 250;

function nanoId(): string {
  return (
    "q-" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

function safeParsePersist(raw: string | null): PersistShape | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    if (!Array.isArray(p.queue)) return null;
    return {
      version: typeof p.version === "number" ? p.version : 1,
      queue: p.queue,
      repeatMode:
        p.repeatMode === "all" || p.repeatMode === "one" ? p.repeatMode : "off",
      shuffleEnabled: !!p.shuffleEnabled,
      shuffledOrder: Array.isArray(p.shuffledOrder) ? p.shuffledOrder : null,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function readInitial(): PersistShape {
  // MP3.1 M4: SSR-safe — guard `typeof window` antes de tocar localStorage.
  // Vite hidrata SSR snapshot? Hoje nao, mas garante contra futuros runners
  // (Vitest node env, prerender, etc).
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {
      version: 0,
      queue: [],
      repeatMode: "off",
      shuffleEnabled: false,
      shuffledOrder: null,
      updatedAt: Date.now(),
    };
  }
  try {
    const parsed = safeParsePersist(localStorage.getItem(KEY));
    if (parsed) return parsed;
  } catch {
    // ignore
  }
  return {
    version: 0,
    queue: [],
    repeatMode: "off",
    shuffleEnabled: false,
    shuffledOrder: null,
    updatedAt: Date.now(),
  };
}

// Linear congruential generator deterministic for tests (seeded).
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates(ids: string[], seed?: number): string[] {
  const arr = [...ids];
  const rng = typeof seed === "number" ? mulberry32(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Bump version + updatedAt em cada mutate (shared invariant — ADR-193).
function bump<T extends PersistShape>(prev: T, patch: Partial<T>): T {
  return {
    ...prev,
    ...patch,
    version: prev.version + 1,
    updatedAt: Date.now(),
  };
}

export function useQueueState() {
  const [state, setState] = useState<PersistShape>(() => readInitial());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist debounced.
  const persistDebounced = useCallback((next: PersistShape) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    }, DEBOUNCE_MS);
  }, []);

  const setStatePersist = useCallback(
    (updater: (prev: PersistShape) => PersistShape) => {
      setState((prev) => {
        const next = updater(prev);
        persistDebounced(next);
        return next;
      });
    },
    [persistDebounced],
  );

  // Cross-tab listener.
  useEffect(() => {
    // MP3.1 M4: SSR-safe — useEffect so roda no client, mas garante guard.
    if (typeof window === "undefined") return;
    function onStorage(ev: StorageEvent) {
      if (ev.key !== KEY) return;
      const parsed = safeParsePersist(ev.newValue ?? null);
      if (!parsed) return;
      setState((prev) => {
        // Only update if newer.
        if (parsed.version > prev.version) return parsed;
        return prev;
      });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addToQueue = useCallback(
    (track: AudioTrackLike): boolean => {
      let accepted = true;
      setStatePersist((prev) => {
        if (prev.queue.length >= MAX_ITEMS) {
          accepted = false;
          return prev;
        }
        const item: QueueItem = {
          id: nanoId(),
          track,
          addedAt: Date.now(),
        };
        return bump(prev, { queue: [...prev.queue, item] });
      });
      return accepted;
    },
    [setStatePersist],
  );

  const removeFromQueue = useCallback(
    (id: string) => {
      setStatePersist((prev) =>
        bump(prev, {
          queue: prev.queue.filter((q) => q.id !== id),
          shuffledOrder: prev.shuffledOrder
            ? prev.shuffledOrder.filter((x) => x !== id)
            : null,
        }),
      );
    },
    [setStatePersist],
  );

  const reorderQueue = useCallback(
    (fromIdx: number, toIdx: number) => {
      setStatePersist((prev) => {
        if (
          !Number.isInteger(fromIdx) ||
          !Number.isInteger(toIdx) ||
          fromIdx < 0 ||
          toIdx < 0 ||
          fromIdx >= prev.queue.length ||
          toIdx >= prev.queue.length
        ) {
          return prev;
        }
        const next = [...prev.queue];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return bump(prev, { queue: next });
      });
    },
    [setStatePersist],
  );

  const clearQueue = useCallback(() => {
    setStatePersist((prev) => bump(prev, { queue: [], shuffledOrder: null }));
  }, [setStatePersist]);

  const skipToQueueItem = useCallback(
    (id: string) => {
      setStatePersist((prev) => {
        const idx = prev.queue.findIndex((q) => q.id === id);
        if (idx < 0) return prev;
        return bump(prev, { queue: prev.queue.slice(idx) });
      });
    },
    [setStatePersist],
  );

  const setRepeatMode = useCallback(
    (mode: RepeatMode) => {
      setStatePersist((prev) => bump(prev, { repeatMode: mode }));
    },
    [setStatePersist],
  );

  const toggleShuffle = useCallback(
    (seed?: number) => {
      setStatePersist((prev) => {
        if (prev.shuffleEnabled) {
          return bump(prev, { shuffleEnabled: false, shuffledOrder: null });
        }
        const ids = prev.queue.map((q) => q.id);
        return bump(prev, {
          shuffleEnabled: true,
          shuffledOrder: fisherYates(ids, seed),
        });
      });
    },
    [setStatePersist],
  );

  return {
    queue: state.queue,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    shuffledOrder: state.shuffledOrder,
    version: state.version,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    skipToQueueItem,
    setRepeatMode,
    toggleShuffle,
  };
}

export default useQueueState;
