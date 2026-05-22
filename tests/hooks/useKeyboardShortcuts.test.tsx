// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-03 - Keyboard shortcuts expansion + admin gate
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-03 + D3 + D4 + ADR-195
//
// Target: client/src/hooks/useKeyboardShortcuts.tsx (NOVO)
//
// Contract:
//   - Hook signature: useKeyboardShortcuts({ toggle, skipBack, skipForward,
//       setVolume, volume, toggleMute, seek, durationSeconds,
//       displayMode, setDisplayMode, close,
//       shortcutsHelpOpen, setShortcutsHelpOpen })
//   - Atalhos novos (MP3):
//       J / j -> skipBack(10)   (paridade YouTube)
//       L / l -> skipForward(10)
//       ArrowUp   -> setVolume(clamp(vol + 0.1))
//       ArrowDown -> setVolume(clamp(vol - 0.1))
//       0..9 -> seek(durationSeconds * digit/10) (ignora se durationSeconds<=0)
//       ?     -> toggle shortcutsHelpOpen
//   - Atalhos MP1 preservados:
//       Space, ArrowLeft (-15s), ArrowRight (+15s), M (mute), Esc
//   - Gates:
//       target = INPUT/TEXTAREA/SELECT/contentEditable -> ignore
//       window.location.pathname.startsWith('/admin/') -> ignore
//       displayMode = 'hidden' -> ignore (MP1)
//
// Hook test rodando em jsdom (vitest config: tests/hooks/**/*.test.ts).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Hook target NAO EXISTE — Implementer cria em client/src/hooks/useKeyboardShortcuts.tsx
async function loadHook() {
  const mod: any = await import('@/hooks/useKeyboardShortcuts');
  return mod.useKeyboardShortcuts;
}

interface MockApi {
  toggle: ReturnType<typeof vi.fn>;
  skipBack: ReturnType<typeof vi.fn>;
  skipForward: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  toggleMute: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  setDisplayMode: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  setShortcutsHelpOpen: ReturnType<typeof vi.fn>;
}

function makeApi(): MockApi {
  return {
    toggle: vi.fn(),
    skipBack: vi.fn(),
    skipForward: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    seek: vi.fn(),
    setDisplayMode: vi.fn(),
    close: vi.fn(),
    setShortcutsHelpOpen: vi.fn(),
  };
}

function buildOpts(api: MockApi, overrides: Partial<any> = {}) {
  return {
    ...api,
    volume: overrides.volume ?? 0.5,
    durationSeconds: overrides.durationSeconds ?? 600,
    displayMode: overrides.displayMode ?? 'bar',
    shortcutsHelpOpen: overrides.shortcutsHelpOpen ?? false,
    ...overrides,
  };
}

function fireKey(opts: { key: string; target?: EventTarget | null }) {
  const evt = new KeyboardEvent('keydown', {
    key: opts.key,
    bubbles: true,
    cancelable: true,
  });
  if (opts.target) {
    Object.defineProperty(evt, 'target', { value: opts.target, writable: false });
  }
  document.dispatchEvent(evt);
  return evt;
}

function setPathname(p: string) {
  try {
    window.history.pushState({}, '', p);
  } catch {
    // ignore
  }
}

describe('useKeyboardShortcuts (RF-03)', () => {
  beforeEach(() => {
    setPathname('/grade-planner');
  });

  afterEach(() => {
    setPathname('/');
  });

  // ---------------------------------------------------------------------------
  // RF-03.1 — Novos atalhos
  // ---------------------------------------------------------------------------

  it('J -> skipBack(10) (paridade YouTube)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'J' });
    expect(api.skipBack).toHaveBeenCalledWith(10);
  });

  it('j (lowercase) -> skipBack(10)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'j' });
    expect(api.skipBack).toHaveBeenCalledWith(10);
  });

  it('L -> skipForward(10)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'L' });
    expect(api.skipForward).toHaveBeenCalledWith(10);
  });

  it('l (lowercase) -> skipForward(10)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'l' });
    expect(api.skipForward).toHaveBeenCalledWith(10);
  });

  it('ArrowUp -> setVolume(vol + 0.1) clamp 1.0', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { volume: 0.5 })));
    fireKey({ key: 'ArrowUp' });
    expect(api.setVolume).toHaveBeenCalledWith(expect.closeTo(0.6, 2));
  });

  it('ArrowUp em volume=1.0 -> clamp 1.0 (permanece)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { volume: 1.0 })));
    fireKey({ key: 'ArrowUp' });
    expect(api.setVolume).toHaveBeenCalledWith(1);
  });

  it('ArrowDown -> setVolume(vol - 0.1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { volume: 0.5 })));
    fireKey({ key: 'ArrowDown' });
    expect(api.setVolume).toHaveBeenCalledWith(expect.closeTo(0.4, 2));
  });

  it('ArrowDown em volume=0 -> clamp 0 (permanece)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { volume: 0 })));
    fireKey({ key: 'ArrowDown' });
    expect(api.setVolume).toHaveBeenCalledWith(0);
  });

  it('Press 5 com duration=600 -> seek(300)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { durationSeconds: 600 })));
    fireKey({ key: '5' });
    expect(api.seek).toHaveBeenCalledWith(300);
  });

  it('Press 0 -> seek(0)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { durationSeconds: 600 })));
    fireKey({ key: '0' });
    expect(api.seek).toHaveBeenCalledWith(0);
  });

  it('Press 9 com duration=100 -> seek(90)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { durationSeconds: 100 })));
    fireKey({ key: '9' });
    expect(api.seek).toHaveBeenCalledWith(90);
  });

  it('Press 5 com durationSeconds=0 -> seek NAO chamado', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { durationSeconds: 0 })));
    fireKey({ key: '5' });
    expect(api.seek).not.toHaveBeenCalled();
  });

  it('? -> toggle setShortcutsHelpOpen(prev => !prev)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { shortcutsHelpOpen: false })));
    fireKey({ key: '?' });
    expect(api.setShortcutsHelpOpen).toHaveBeenCalledTimes(1);
    // Toggle implementation: pode passar boolean OR updater. Aceita ambos.
    const arg = api.setShortcutsHelpOpen.mock.calls[0][0];
    if (typeof arg === 'function') {
      expect(arg(false)).toBe(true);
    } else {
      expect(arg).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // RF-03 — Shortcuts MP1 preservados (regressao)
  // ---------------------------------------------------------------------------

  it('Space -> toggle() (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: ' ' });
    expect(api.toggle).toHaveBeenCalledTimes(1);
  });

  it('ArrowLeft -> skipBack(15) (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'ArrowLeft' });
    expect(api.skipBack).toHaveBeenCalledWith(15);
  });

  it('ArrowRight -> skipForward(15) (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'ArrowRight' });
    expect(api.skipForward).toHaveBeenCalledWith(15);
  });

  it('M -> toggleMute() (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'M' });
    expect(api.toggleMute).toHaveBeenCalledTimes(1);
  });

  it('Esc com displayMode=bar -> close() (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { displayMode: 'bar' })));
    fireKey({ key: 'Escape' });
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('Esc com displayMode=expanded -> setDisplayMode("bar") (regressao MP1)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { displayMode: 'expanded' })));
    fireKey({ key: 'Escape' });
    expect(api.setDisplayMode).toHaveBeenCalledWith('bar');
    expect(api.close).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // RF-03.2 — Admin route gate
  // ---------------------------------------------------------------------------

  it('pathname=/admin/dashboard -> NENHUM shortcut dispara (D4)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    setPathname('/admin/dashboard');
    renderHook(() => useKb(buildOpts(api, { durationSeconds: 600 })));
    fireKey({ key: 'J' });
    fireKey({ key: 'L' });
    fireKey({ key: '5' });
    fireKey({ key: 'ArrowUp' });
    fireKey({ key: ' ' });
    expect(api.skipBack).not.toHaveBeenCalled();
    expect(api.skipForward).not.toHaveBeenCalled();
    expect(api.seek).not.toHaveBeenCalled();
    expect(api.setVolume).not.toHaveBeenCalled();
    expect(api.toggle).not.toHaveBeenCalled();
  });

  it('pathname=/biblioteca/curso/x/y -> shortcuts ATIVOS', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    setPathname('/biblioteca/curso/foo/bar');
    renderHook(() => useKb(buildOpts(api)));
    fireKey({ key: 'J' });
    expect(api.skipBack).toHaveBeenCalledWith(10);
  });

  // ---------------------------------------------------------------------------
  // RF-03 — Interactive target gate
  // ---------------------------------------------------------------------------

  it('target = <input> -> NENHUM shortcut dispara', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey({ key: 'J', target: input });
    fireKey({ key: ' ', target: input });
    fireKey({ key: '5', target: input });
    expect(api.skipBack).not.toHaveBeenCalled();
    expect(api.toggle).not.toHaveBeenCalled();
    expect(api.seek).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('target = <textarea> -> NENHUM shortcut dispara', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    fireKey({ key: 'J', target: ta });
    expect(api.skipBack).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('target = contentEditable -> NENHUM shortcut dispara', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api)));
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    fireKey({ key: 'J', target: div });
    expect(api.skipBack).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  // ---------------------------------------------------------------------------
  // RF-03 — displayMode=hidden gate (MP1)
  // ---------------------------------------------------------------------------

  it('displayMode=hidden -> NENHUM shortcut dispara', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    renderHook(() => useKb(buildOpts(api, { displayMode: 'hidden' })));
    fireKey({ key: ' ' });
    fireKey({ key: 'J' });
    fireKey({ key: '5' });
    expect(api.toggle).not.toHaveBeenCalled();
    expect(api.skipBack).not.toHaveBeenCalled();
    expect(api.seek).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  it('unmount -> remove keydown listener (sem leak)', async () => {
    const useKb = await loadHook();
    const api = makeApi();
    const { unmount } = renderHook(() => useKb(buildOpts(api)));
    unmount();
    fireKey({ key: 'J' });
    expect(api.skipBack).not.toHaveBeenCalled();
  });
});
