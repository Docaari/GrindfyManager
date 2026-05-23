// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-04 — `/coach` → `/coach-ai` redirect
//
// Spec: Docs/specs/sprint-mp-validation.md RF-04
// ADR-148: hub `/coach-ai` consolidado. ADR-207 §5: `coach.legacy_redirect.fired`.
//
// Cobertura:
//   - Render do componente CoachLegacyRedirect chama setLocation('/coach-ai').
//
// Lessons:
//   #28: vi.mock por path EXATO — mockar `wouter` no path canonico.
//   #14/#26: await import.
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
      // Simula Redirect component: chama setLocation imediatamente.
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

beforeEach(() => {
  vi.clearAllMocks();
  useLocationMock.mockReturnValue(['/coach', setLocationMock]);
  try { sessionStorage.clear(); } catch {}
  try { localStorage.removeItem('coach_legacy_warning_shown'); } catch {}
});

afterEach(() => cleanup());

describe('CoachLegacyRedirect — RF-04', () => {
  it('render → setLocation("/coach-ai")', async () => {
    const mod: any = await import('@/pages/coach/CoachLegacyRedirect');
    const C = mod.CoachLegacyRedirect ?? mod.default;
    expect(C).toBeDefined();

    render(<C />);
    expect(setLocationMock).toHaveBeenCalled();
    const target = setLocationMock.mock.calls[0][0];
    expect(target).toMatch(/^\/coach-ai/);
  });
});
