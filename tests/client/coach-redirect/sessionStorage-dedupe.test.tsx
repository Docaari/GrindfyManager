// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-04 — coach.legacy_redirect.fired dedupe 1x/session
//
// ADR-207 §4: dedupe 1x per session via sessionStorage flag.
//
// Cobertura:
//   - Primeira render emite coach.legacy_redirect.fired.
//   - Segunda render na mesma sessao NAO re-emite (sessionStorage flag).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

const { emitCoachMock, setLocationMock, useLocationMock } = vi.hoisted(() => ({
  emitCoachMock: vi.fn(),
  setLocationMock: vi.fn(),
  useLocationMock: vi.fn(),
}));

vi.mock('@/lib/activity-telemetry', () => ({
  emitCoachEvent: emitCoachMock,
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

vi.mock('wouter', async () => {
  const actual: any = await vi.importActual('wouter');
  return {
    ...actual,
    useLocation: () => useLocationMock(),
    Redirect: ({ to }: { to: string }) => {
      setLocationMock(to);
      return null;
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  try { sessionStorage.clear(); } catch {}
  useLocationMock.mockReturnValue(['/coach', setLocationMock]);
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, pathname: '/coach', search: '', hash: '' },
  });
});

afterEach(() => cleanup());

describe('CoachLegacyRedirect — dedupe sessionStorage', () => {
  it('emite coach.legacy_redirect.fired apenas 1x por session', async () => {
    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;

    const { unmount } = render(<C />);
    unmount();
    render(<C />);

    const fired = emitCoachMock.mock.calls.filter(
      (c: any[]) => c[0] === 'coach.legacy_redirect.fired',
    );
    expect(fired.length).toBe(1);
  });

  it('apos sessionStorage.clear() emite novamente (nova sessao)', async () => {
    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;

    const { unmount } = render(<C />);
    unmount();
    sessionStorage.clear();
    render(<C />);

    const fired = emitCoachMock.mock.calls.filter(
      (c: any[]) => c[0] === 'coach.legacy_redirect.fired',
    );
    expect(fired.length).toBe(2);
  });
});
