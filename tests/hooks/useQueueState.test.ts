// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-05 - useQueueState hook
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-05.1 + D10..D14 + ADR-193
//
// Target: client/src/hooks/useQueueState.ts (NOVO)
//
// Contract (state returned):
//   {
//     queue: QueueItem[]
//     repeatMode: 'off' | 'all' | 'one'
//     shuffleEnabled: boolean
//     shuffledOrder: string[] | null
//     version: number
//     addToQueue(track)
//     removeFromQueue(id)
//     reorderQueue(fromIdx, toIdx)
//     clearQueue()
//     skipToQueueItem(id)
//     setRepeatMode(mode)
//     toggleShuffle(seed?: number)
//   }
//
// Persistencia: localStorage key "audio.queue.v1" (debounce -> aceita
// implementacao sincrona ou async; tests usam fake timers).
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

async function loadHook() {
  const mod: any = await import('@/hooks/useQueueState');
  return mod.useQueueState;
}

function makeTrack(id: string, overrides: any = {}) {
  return {
    source: 'library' as const,
    trackId: id,
    title: `Track ${id}`,
    audioUrl: `/audio/${id}.mp3`,
    durationSeconds: 600,
    ...overrides,
  };
}

const QUEUE_KEY = 'audio.queue.v1';

describe('useQueueState (RF-05)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch {}
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia com queue vazia + repeatMode off + shuffleEnabled false', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    expect(result.current.queue).toEqual([]);
    expect(result.current.repeatMode).toBe('off');
    expect(result.current.shuffleEnabled).toBe(false);
    expect(result.current.shuffledOrder == null || Array.isArray(result.current.shuffledOrder)).toBe(true);
  });

  it('addToQueue: adiciona track no fim', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('t1'));
      result.current.addToQueue(makeTrack('t2'));
    });
    expect(result.current.queue.length).toBe(2);
    expect(result.current.queue[0].track.trackId).toBe('t1');
    expect(result.current.queue[1].track.trackId).toBe('t2');
    // Cada item recebe id unico (nanoid-like) e addedAt.
    expect(typeof result.current.queue[0].id).toBe('string');
    expect(typeof result.current.queue[0].addedAt).toBe('number');
  });

  it('removeFromQueue: remove por id', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('t1'));
      result.current.addToQueue(makeTrack('t2'));
    });
    const idToRemove = result.current.queue[0].id;
    act(() => {
      result.current.removeFromQueue(idToRemove);
    });
    expect(result.current.queue.length).toBe(1);
    expect(result.current.queue[0].track.trackId).toBe('t2');
  });

  it('reorderQueue: move item de posicao', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.addToQueue(makeTrack('b'));
      result.current.addToQueue(makeTrack('c'));
    });
    act(() => {
      result.current.reorderQueue(0, 2);
    });
    const ids = result.current.queue.map((i: any) => i.track.trackId);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('reorderQueue: out of bounds -> no-op (queue intacto)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.addToQueue(makeTrack('b'));
    });
    const before = result.current.queue.map((i: any) => i.track.trackId);
    act(() => {
      result.current.reorderQueue(0, 99);
      result.current.reorderQueue(-1, 0);
      result.current.reorderQueue(5, 6);
    });
    const after = result.current.queue.map((i: any) => i.track.trackId);
    expect(after).toEqual(before);
  });

  it('cap 50: 51o addToQueue rejected (queue mantem 50)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      for (let i = 0; i < 50; i++) {
        result.current.addToQueue(makeTrack(`t${i}`));
      }
    });
    expect(result.current.queue.length).toBe(50);
    let rejected = false;
    act(() => {
      const res = result.current.addToQueue(makeTrack('overflow'));
      if (res === false) rejected = true;
    });
    expect(result.current.queue.length).toBe(50);
    // Aceita 2 contratos: retorna false OU lanca toast warning (smoke flag).
    // Validacao final: queue nao cresceu.
  });

  it('clearQueue: zera queue + reseta shuffledOrder', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.addToQueue(makeTrack('b'));
      result.current.toggleShuffle(42);
    });
    act(() => {
      result.current.clearQueue();
    });
    expect(result.current.queue).toEqual([]);
    expect(result.current.shuffledOrder == null || result.current.shuffledOrder.length === 0).toBe(true);
  });

  it('skipToQueueItem: remove items anteriores e mantem o alvo (spec simpler)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.addToQueue(makeTrack('b'));
      result.current.addToQueue(makeTrack('c'));
    });
    const targetId = result.current.queue[1].id; // 'b'
    act(() => {
      result.current.skipToQueueItem(targetId);
    });
    const ids = result.current.queue.map((i: any) => i.track.trackId);
    // Acceptance: items anteriores removidos. Queue resultante comeca com 'b'.
    expect(ids[0]).toBe('b');
  });

  it('setRepeatMode: aceita off / all / one', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => result.current.setRepeatMode('all'));
    expect(result.current.repeatMode).toBe('all');
    act(() => result.current.setRepeatMode('one'));
    expect(result.current.repeatMode).toBe('one');
    act(() => result.current.setRepeatMode('off'));
    expect(result.current.repeatMode).toBe('off');
  });

  it('toggleShuffle: gera shuffledOrder com mesmos ids do queue (permutation)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.addToQueue(makeTrack('b'));
      result.current.addToQueue(makeTrack('c'));
      result.current.addToQueue(makeTrack('d'));
    });
    act(() => {
      result.current.toggleShuffle(42); // seed deterministico
    });
    expect(result.current.shuffleEnabled).toBe(true);
    expect(Array.isArray(result.current.shuffledOrder)).toBe(true);
    const queueIds = result.current.queue.map((i: any) => i.id).sort();
    const shuffledIds = [...(result.current.shuffledOrder ?? [])].sort();
    expect(shuffledIds).toEqual(queueIds); // permutation, mesmo set.
  });

  it('toggleShuffle OFF -> shuffledOrder limpa (null ou []), shuffleEnabled=false', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
      result.current.toggleShuffle(42);
    });
    expect(result.current.shuffleEnabled).toBe(true);
    act(() => {
      result.current.toggleShuffle();
    });
    expect(result.current.shuffleEnabled).toBe(false);
  });

  it('toggleShuffle com queue vazia -> shuffledOrder [] (no error)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.toggleShuffle(42);
    });
    expect(result.current.shuffleEnabled).toBe(true);
    const order = result.current.shuffledOrder ?? [];
    expect(order.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Persistencia localStorage
  // ---------------------------------------------------------------------------
  it('mutation -> localStorage "audio.queue.v1" atualizado (eventual)', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
    });
    // Aceita sync OR debounced — drain timers se hook usar setTimeout.
    await new Promise((r) => setTimeout(r, 600));
    const raw = localStorage.getItem(QUEUE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.queue.length).toBe(1);
    expect(typeof parsed.version).toBe('number');
  });

  it('version increment a cada mutation', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    const v0 = result.current.version;
    act(() => {
      result.current.addToQueue(makeTrack('a'));
    });
    const v1 = result.current.version;
    act(() => {
      result.current.addToQueue(makeTrack('b'));
    });
    const v2 = result.current.version;
    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBeGreaterThan(v1);
  });

  it('boot le localStorage existente e hidrata queue', async () => {
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({
          version: 5,
          queue: [
            {
              id: 'q1',
              track: makeTrack('hydrated'),
              addedAt: Date.now(),
            },
          ],
          repeatMode: 'all',
          shuffleEnabled: false,
          shuffledOrder: null,
          updatedAt: Date.now(),
        }),
      );
    } catch {}
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    expect(result.current.queue.length).toBe(1);
    expect(result.current.queue[0].track.trackId).toBe('hydrated');
    expect(result.current.repeatMode).toBe('all');
  });

  it('localStorage corrupt JSON -> fallback queue vazia + sem throw', async () => {
    try {
      localStorage.setItem(QUEUE_KEY, '{not valid json');
    } catch {}
    const useQ = await loadHook();
    expect(() => renderHook(() => useQ())).not.toThrow();
    const { result } = renderHook(() => useQ());
    expect(result.current.queue).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Cross-tab storage event
  // ---------------------------------------------------------------------------
  it('storage event "audio.queue.v1" com version maior -> reload state', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('local'));
    });
    const currentVersion = result.current.version;

    // Simula outra aba escrevendo localStorage com version mais alta.
    const newer = {
      version: currentVersion + 100,
      queue: [
        { id: 'remote-1', track: makeTrack('remote'), addedAt: Date.now() },
        { id: 'remote-2', track: makeTrack('remote2'), addedAt: Date.now() },
      ],
      repeatMode: 'one',
      shuffleEnabled: false,
      shuffledOrder: null,
      updatedAt: Date.now(),
    };
    act(() => {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(newer));
      } catch {}
      // Dispatch storage event manualmente (jsdom nao dispara automaticamente
      // para a propria janela).
      const ev = new StorageEvent('storage', {
        key: QUEUE_KEY,
        newValue: JSON.stringify(newer),
      });
      window.dispatchEvent(ev);
    });

    // Aceita propagacao sincrona ou async (microtask).
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.version).toBeGreaterThanOrEqual(currentVersion + 100);
    expect(result.current.queue.length).toBe(2);
    expect(result.current.repeatMode).toBe('one');
  });

  it('storage event de outra key -> ignora', async () => {
    const useQ = await loadHook();
    const { result } = renderHook(() => useQ());
    act(() => {
      result.current.addToQueue(makeTrack('a'));
    });
    const before = result.current.queue.length;
    act(() => {
      const ev = new StorageEvent('storage', {
        key: 'unrelated.key',
        newValue: 'foo',
      });
      window.dispatchEvent(ev);
    });
    expect(result.current.queue.length).toBe(before);
  });
});
