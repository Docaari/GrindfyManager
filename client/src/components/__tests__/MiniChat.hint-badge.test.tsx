/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-27 (B6 Coach FAB hint badge — opcional/stretch).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-27, §3 D1.5-10, §RNF-1.5-6
 * ADR  : Docs/architecture/decisions/106-home-daily-insight-rule-engine.md §2.5
 *
 * Status RED: prop `hintCount` ainda nao existe em MiniChat. Implementer
 * adiciona prop opcional + badge top-right do FAB existente.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock wouter
// ---------------------------------------------------------------------------
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

// ---------------------------------------------------------------------------
// Mock tracker
// ---------------------------------------------------------------------------
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

// ---------------------------------------------------------------------------
// Mock useCoachChat — evitar streaming real / fetch real
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    messages: [],
    isStreaming: false,
    streamedText: '',
    streamError: null,
    sendMessage: vi.fn(),
  }),
}));

beforeEach(() => {
  mockEmit.mockReset();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

// =============================================================================
// hintCount > 0 => badge visivel
// =============================================================================

describe('<MiniChat hintCount /> — badge visivel', () => {
  it('hintCount=1 renderiza badge "1" no FAB com data-testid="coach-fab-hint-badge"', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat hintCount={1} /> as any);
    const badge = screen.queryByTestId('coach-fab-hint-badge');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('1');
  });

  it('hintCount=0 NAO renderiza badge', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat hintCount={0} /> as any);
    expect(screen.queryByTestId('coach-fab-hint-badge')).not.toBeInTheDocument();
  });

  it('hintCount undefined (default) NAO renderiza badge', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat /> as any);
    expect(screen.queryByTestId('coach-fab-hint-badge')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Tracker — coach_fab_hint_shown / coach_fab_hint_clicked
// =============================================================================

describe('<MiniChat hintCount /> — tracker', () => {
  it('emit("coach_fab_hint_shown") 1x quando badge aparece', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat hintCount={1} /> as any);
    await waitFor(() => {
      expect(mockEmit.mock.calls.filter((c) => c[0] === 'coach_fab_hint_shown').length).toBe(1);
    });
  });

  it('NAO emit("coach_fab_hint_shown") quando hintCount=0', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat hintCount={0} /> as any);
    expect(mockEmit.mock.calls.filter((c) => c[0] === 'coach_fab_hint_shown').length).toBe(0);
  });

  it('emit("coach_fab_hint_clicked") quando user clica no FAB com badge ativo', async () => {
    const { default: MiniChat } = await import('../MiniChat');
    render(<MiniChat hintCount={1} /> as any);
    // Click no badge OU FAB que contem o badge — usar o badge directly p/ test focused
    const badge = screen.getByTestId('coach-fab-hint-badge');
    fireEvent.click(badge);
    await waitFor(() => {
      expect(mockEmit.mock.calls.filter((c) => c[0] === 'coach_fab_hint_clicked').length).toBe(1);
    });
  });
});
