// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-03 — UI AdminAudioMetrics
//
// Cobertura:
//   - 4 KPI cards (DAU, WAU, avg listening, fallback rate).
//   - Table top 20 lessons completion.
//   - Loading state + error state cobertos.
//
// Lessons: #14/#26/#38 (await import).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return { ...actual, useQuery: useQueryMock };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const fakeMetrics = {
  range: '7d',
  generatedAt: '2026-05-22T10:00:00Z',
  kpis: {
    mpDau: 42,
    mpWau: 128,
    avgListeningTimePerSessionSec: 1825,
    queueDepthMedian: 3,
    queueDepthP95: 12,
    spotifyToInternalFallbackRate: 0.12,
    totalPlays: 1547,
    totalLessonCompletions: 89,
  },
  topLessonsCompletion: [
    { lessonId: 'l1', courseSlug: 'warmup', lessonSlug: 'intro', completionPct: 0.78, plays: 156 },
  ],
  topLessonsPlays: [
    { lessonId: 'l2', courseSlug: 'mtt', lessonSlug: 'ante', plays: 234 },
  ],
};

describe('AdminAudioMetrics UI — RF-03', () => {
  it('renderiza 4 KPI cards', async () => {
    useQueryMock.mockReturnValue({ data: fakeMetrics, isLoading: false, error: null });

    const { default: Page } = await import('@/pages/admin/AudioMetrics');
    render(<Page />);

    expect(screen.getByTestId('admin-audio-kpi-dau')).toBeInTheDocument();
    expect(screen.getByTestId('admin-audio-kpi-wau')).toBeInTheDocument();
    expect(screen.getByTestId('admin-audio-kpi-avg-listening')).toBeInTheDocument();
    expect(screen.getByTestId('admin-audio-kpi-fallback-rate')).toBeInTheDocument();
  });

  it('renderiza table top 20 lessons completion', async () => {
    useQueryMock.mockReturnValue({ data: fakeMetrics, isLoading: false, error: null });

    const { default: Page } = await import('@/pages/admin/AudioMetrics');
    render(<Page />);

    expect(screen.getByTestId('admin-audio-table-completion')).toBeInTheDocument();
  });

  it('mostra loading state', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: null });

    const { default: Page } = await import('@/pages/admin/AudioMetrics');
    render(<Page />);

    expect(screen.getByTestId('admin-audio-loading')).toBeInTheDocument();
  });

  it('mostra error state', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') });

    const { default: Page } = await import('@/pages/admin/AudioMetrics');
    render(<Page />);

    expect(screen.getByTestId('admin-audio-error')).toBeInTheDocument();
  });
});
