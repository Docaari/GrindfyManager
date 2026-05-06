import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// MEDIUM-2: BreakFeedbackPopup chama onTextareaFocusChange em focus/blur do
// textarea de notas. Permite ao parent (GrindSessionLive) propagar isInTextarea
// para o runAutoCloseTick e respeitar a interacao real do user.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-03)
// ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn().mockImplementation(async (method: string) => {
    if (method === 'GET') return [];
    return { ok: true };
  }),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const POPUP_PATH = '../../../client/src/components/BreakFeedbackPopup';
async function loadPopup(): Promise<any> {
  return await import(/* @vite-ignore */ POPUP_PATH);
}

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BreakFeedbackPopup - MEDIUM-2: onTextareaFocusChange', () => {
  it('foco no textarea -> dispara onTextareaFocusChange(true); blur -> false', async () => {
    const onTextareaFocusChange = vi.fn();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    const onSkipAll = vi.fn();
    const { BreakFeedbackPopup } = await loadPopup();

    render(
      withClient(
        <BreakFeedbackPopup
          isOpen
          onClose={onClose}
          onSubmit={onSubmit}
          onSkip={onSkip}
          onSkipAll={onSkipAll}
          breakNumber={1}
          totalBreaks={8}
          sessionProgress={0}
          timeRemaining={360}
          isPending={false}
          sessionId="sess-1"
          onTextareaFocusChange={onTextareaFocusChange}
        />
      )
    );

    // O textarea so renderiza no modo "Feedback Completo" (default eh Quick).
    // Clica no toggle para alternar.
    const buttons = screen.queryAllByRole('button');
    const fullBtn = buttons.find((b) => /feedback completo/i.test(b.textContent ?? ''));
    expect(fullBtn).toBeTruthy();
    fireEvent.click(fullBtn!);

    let textarea: HTMLTextAreaElement | null = null;
    await waitFor(() => {
      textarea = screen.queryByPlaceholderText(/como voce esta/i) as HTMLTextAreaElement | null;
      expect(textarea).toBeTruthy();
    });

    fireEvent.focus(textarea!);
    expect(onTextareaFocusChange).toHaveBeenCalledWith(true);

    fireEvent.blur(textarea!);
    expect(onTextareaFocusChange).toHaveBeenCalledWith(false);
  });
});
