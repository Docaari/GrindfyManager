/**
 * useNewsReadState — RF-B4 (read-state localStorage para news items).
 *
 * Spec : Docs/specs/home-reform-3.md §RF-B4
 * ADR  : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.4
 *
 * Persiste itens "lidos" em localStorage com chave `news.read.{id}`. Click no
 * item marca como lido; render aplica opacity-60 + checkmark.
 *
 * Limpeza automatica no mount: remove entries > 90d OU se total > 200 (evita
 * bloat). SSR-safe: try/catch em torno de qualquer acesso a localStorage.
 *
 * Lessons aplicadas:
 *   #15 polyfill localStorage no setup.ts (jsdom default ja tem)
 */

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'news.read.';
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;
const MAX_ENTRIES = 200;

interface ReadStateEntry {
  readAt: number; // epoch ms
}

function safeGetAll(): Map<string, ReadStateEntry> {
  const out = new Map<string, ReadStateEntry>();
  try {
    if (typeof localStorage === 'undefined') return out;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      // Aceita "1" legado OR JSON {readAt}.
      if (raw === '1') {
        out.set(id, { readAt: Date.now() });
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.readAt === 'number') {
          out.set(id, { readAt: parsed.readAt });
        } else {
          out.set(id, { readAt: Date.now() });
        }
      } catch {
        out.set(id, { readAt: Date.now() });
      }
    }
  } catch {
    /* noop */
  }
  return out;
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

/**
 * Limpa entries antigas (> 90d) ou excedentes (> 200). Mantem as mais recentes.
 */
function cleanupReadState(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    const all = safeGetAll();
    // Remove > 90 dias.
    for (const [id, entry] of all.entries()) {
      if (now - entry.readAt > NINETY_DAYS_MS) {
        safeRemove(PREFIX + id);
        all.delete(id);
      }
    }
    // Se ainda > MAX, descarta os mais antigos.
    if (all.size > MAX_ENTRIES) {
      const sorted = Array.from(all.entries()).sort(
        (a, b) => a[1].readAt - b[1].readAt,
      );
      const excess = sorted.slice(0, all.size - MAX_ENTRIES);
      for (const [id] of excess) {
        safeRemove(PREFIX + id);
      }
    }
  } catch {
    /* noop */
  }
}

export interface UseNewsReadState {
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  unreadCount: (items: Array<{ id: string }>) => number;
}

export function useNewsReadState(): UseNewsReadState {
  // Re-render trigger ao marcar lido.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    cleanupReadState();
    // bump version para refletir possiveis cleanups.
    setVersion((v) => v + 1);
  }, []);

  const isRead = useCallback(
    (id: string): boolean => {
      // referenciar `version` mantem o callback dependente do trigger.
      void version;
      try {
        return localStorage.getItem(PREFIX + id) !== null;
      } catch {
        return false;
      }
    },
    [version],
  );

  const markRead = useCallback((id: string) => {
    const payload = JSON.stringify({ readAt: Date.now() });
    safeSet(PREFIX + id, payload);
    setVersion((v) => v + 1);
  }, []);

  const unreadCount = useCallback(
    (items: Array<{ id: string }>): number => {
      let n = 0;
      for (const it of items) {
        if (!isRead(it.id)) n += 1;
      }
      return n;
    },
    [isRead],
  );

  return { isRead, markRead, unreadCount };
}
