// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 — coach.nudge_received/dismissed/cta_clicked
//
// Cobertura:
//   - Receber/renderizar nudge emite `coach.nudge_received` 1x.
//   - Clicar dismiss (X) emite `coach.nudge_dismissed` com reason 'user_click_x'.
//   - Clicar CTA emite `coach.nudge_cta_clicked` com cta_label + target_url.
//
// Lessons: #14/#26/#38 (await import componente Coach).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const { emitCoachMock } = vi.hoisted(() => ({ emitCoachMock: vi.fn() }));

vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitCoachEvent: emitCoachMock,
  emitLibraryEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));
vi.mock('@/lib/audio-telemetry', () => ({
  emitAudioEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const sampleNudge = {
  id: 'nudge-aaa',
  category: 'B-DOWNSWING',
  title: 'Drawdown detectado',
  body: 'Recomendamos pausa de 24h.',
  ctaLabel: 'Ver detalhes',
  targetUrl: '/coach-ai?tab=insights',
};

describe('CoachAI / NudgeCard — RF-01 coach.nudge_*', () => {
  it('renderizar NudgeCard emite coach.nudge_received', async () => {
    const mod: any = await import('@/components/coach/NudgeCard');
    const NudgeCard = mod.NudgeCard ?? mod.default;
    expect(NudgeCard).toBeDefined();

    render(<NudgeCard nudge={sampleNudge} onDismiss={() => {}} />);

    const received = emitCoachMock.mock.calls.find((c: any[]) => c[0] === 'coach.nudge_received');
    expect(received).toBeDefined();
    expect(received![1]).toMatchObject({
      nudge_id: 'nudge-aaa',
      category: 'B-DOWNSWING',
    });
  });

  it('clicar X (dismiss) emite coach.nudge_dismissed com reason user_click_x', async () => {
    const user = userEvent.setup();
    const mod: any = await import('@/components/coach/NudgeCard');
    const NudgeCard = mod.NudgeCard ?? mod.default;

    render(<NudgeCard nudge={sampleNudge} onDismiss={() => {}} />);

    const dismiss = screen.getByTestId('nudge-dismiss');
    await user.click(dismiss);

    const dismissed = emitCoachMock.mock.calls.find((c: any[]) => c[0] === 'coach.nudge_dismissed');
    expect(dismissed).toBeDefined();
    expect(dismissed![1]).toMatchObject({
      nudge_id: 'nudge-aaa',
      reason: 'user_click_x',
    });
  });

  it('clicar CTA emite coach.nudge_cta_clicked com cta_label e target_url', async () => {
    const user = userEvent.setup();
    const mod: any = await import('@/components/coach/NudgeCard');
    const NudgeCard = mod.NudgeCard ?? mod.default;

    render(<NudgeCard nudge={sampleNudge} onDismiss={() => {}} />);

    const cta = screen.getByTestId('nudge-cta');
    await user.click(cta);

    const ctaEvent = emitCoachMock.mock.calls.find(
      (c: any[]) => c[0] === 'coach.nudge_cta_clicked',
    );
    expect(ctaEvent).toBeDefined();
    expect(ctaEvent![1]).toMatchObject({
      nudge_id: 'nudge-aaa',
      cta_label: 'Ver detalhes',
      target_url: '/coach-ai?tab=insights',
    });
  });
});
