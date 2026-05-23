// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-04 — query+hash preservados no redirect
//
// Cobertura:
//   - /coach?tab=foo#bar → /coach-ai?tab=foo#bar.
//   - /coach/relatorio/abc → /coach-ai/relatorio/abc (subpath preserved).
//   - /coach/relatorio/abc#sec → /coach-ai/relatorio/abc#sec.
//
// Notes:
//   - Wouter useLocation() retorna pathname-only. Query/hash devem ser lidos
//     de window.location (RF-04 implementer plumbing).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

const { setLocationMock, useLocationMock } = vi.hoisted(() => ({
  setLocationMock: vi.fn(),
  useLocationMock: vi.fn(),
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

vi.mock('@/lib/activity-telemetry', () => ({
  emitCoachEvent: vi.fn(),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

function setHref(pathname: string, search = '', hash = '') {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: {
      ...window.location,
      pathname,
      search,
      hash,
      href: `http://localhost${pathname}${search}${hash}`,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  try { sessionStorage.clear(); } catch {}
});

afterEach(() => cleanup());

describe('CoachLegacyRedirect — preserva query + hash + subpath', () => {
  it('/coach?tab=foo#bar → /coach-ai?tab=foo#bar', async () => {
    setHref('/coach', '?tab=foo', '#bar');
    useLocationMock.mockReturnValue(['/coach', setLocationMock]);

    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;

    render(<C />);

    expect(setLocationMock).toHaveBeenCalled();
    const target = setLocationMock.mock.calls[0][0];
    expect(target).toContain('/coach-ai');
    expect(target).toContain('tab=foo');
    expect(target).toContain('#bar');
  });

  it('/coach/relatorio/abc → /coach-ai/relatorio/abc', async () => {
    setHref('/coach/relatorio/abc');
    useLocationMock.mockReturnValue(['/coach/relatorio/abc', setLocationMock]);

    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;

    render(<C />);

    const target = setLocationMock.mock.calls[0][0];
    expect(target).toContain('/coach-ai/relatorio/abc');
  });

  it('/coach/relatorio/abc#sec → /coach-ai/relatorio/abc#sec', async () => {
    setHref('/coach/relatorio/abc', '', '#sec');
    useLocationMock.mockReturnValue(['/coach/relatorio/abc', setLocationMock]);

    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;

    render(<C />);

    const target = setLocationMock.mock.calls[0][0];
    expect(target).toContain('/coach-ai/relatorio/abc');
    expect(target).toContain('#sec');
  });
});
