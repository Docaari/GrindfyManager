// Sprint Mini Player 3.1 Wave B / TIER 3 #4 — resumeSession util.

import { describe, it, expect, beforeEach } from 'vitest';

function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/lib/audio-engine/resumeSession');
}

describe('resumeSession util (TIER 3 #4)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('write + read roundtrip ok', () => {
    const { writeResumeSnapshot, readResumeSnapshot } = loadModule();
    writeResumeSnapshot({
      trackId: 't1',
      currentSeconds: 120,
      isPlaying: true,
      timestamp: Date.now(),
    });
    const snap = readResumeSnapshot();
    expect(snap).not.toBeNull();
    expect(snap.trackId).toBe('t1');
    expect(snap.currentSeconds).toBe(120);
    expect(snap.isPlaying).toBe(true);
  });

  it('expira apos 7 dias (TTL_MS) -> readResumeSnapshot retorna null', () => {
    const { writeResumeSnapshot, readResumeSnapshot, _RESUME_TTL_MS } = loadModule();
    const old = Date.now() - _RESUME_TTL_MS - 1000;
    writeResumeSnapshot({
      trackId: 't1',
      currentSeconds: 60,
      isPlaying: false,
      timestamp: old,
    });
    const snap = readResumeSnapshot();
    expect(snap).toBeNull();
  });

  it('clearResumeSnapshot remove do storage', () => {
    const {
      writeResumeSnapshot,
      readResumeSnapshot,
      clearResumeSnapshot,
    } = loadModule();
    writeResumeSnapshot({
      trackId: 't1',
      currentSeconds: 30,
      isPlaying: false,
      timestamp: Date.now(),
    });
    expect(readResumeSnapshot()).not.toBeNull();
    clearResumeSnapshot();
    expect(readResumeSnapshot()).toBeNull();
  });

  it('readResumeSnapshot tolera JSON invalido -> null', () => {
    const { readResumeSnapshot, _RESUME_STORAGE_KEY } = loadModule();
    try {
      localStorage.setItem(_RESUME_STORAGE_KEY, '{not json');
    } catch {
      // ignore
    }
    expect(readResumeSnapshot()).toBeNull();
  });

  it('readResumeSnapshot rejeita shape invalido (no trackId)', () => {
    const { readResumeSnapshot, _RESUME_STORAGE_KEY } = loadModule();
    localStorage.setItem(
      _RESUME_STORAGE_KEY,
      JSON.stringify({ currentSeconds: 30, isPlaying: false, timestamp: Date.now() }),
    );
    expect(readResumeSnapshot()).toBeNull();
  });

  it('writeResumeSnapshot normaliza currentSeconds negativo -> 0', () => {
    const { writeResumeSnapshot, readResumeSnapshot } = loadModule();
    writeResumeSnapshot({
      trackId: 't1',
      currentSeconds: -50,
      isPlaying: false,
      timestamp: Date.now(),
    });
    const snap = readResumeSnapshot();
    expect(snap.currentSeconds).toBe(0);
  });
});
