// =============================================================================
// Fix — feedback visual instantaneo no chat do Coach.
// - mensagem do usuario aparece NA HORA (pendingUserMessage), antes de persistir.
// - indicador "pensando" antes do 1o token (isStreaming sem streamedText).
// - sai do empty-state assim que comeca a enviar (nao parece travado).
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wouterLoc = { current: '/coach-ai' };
vi.mock('wouter', () => ({
  useLocation: () => [wouterLoc.current, (to: string) => { wouterLoc.current = to; }],
  Link: (props: any) => React.createElement('a', { href: props.href, ...props }, props.children),
}));

// estado controlavel do hook
const chatState: any = {
  messages: [], streamedText: '', isStreaming: false, pendingUserMessage: null, streamError: null,
};
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    sessions: [], messages: chatState.messages, activeSessionId: null, setActiveSessionId: vi.fn(),
    isLoadingSessions: false, isLoadingMessages: false,
    isStreaming: chatState.isStreaming, streamedText: chatState.streamedText,
    pendingUserMessage: chatState.pendingUserMessage, streamError: chatState.streamError,
    sendMessage: vi.fn(), cancelStream: vi.fn(), startNewConversation: vi.fn(),
    archiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCoachPageContext', () => ({ useCoachPageContext: () => ({ route: '/coach-ai' }) }));
vi.mock('@/hooks/useTabFromUrl', () => ({ useTabFromUrl: () => ['chat', vi.fn()] as const }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({})), queryClient: undefined, getQueryFn: () => async () => ({}),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}
async function loadCoachAI() {
  const mod: any = await import('@/pages/CoachAI');
  return (mod.default ?? mod.CoachAI) as React.ComponentType<any>;
}

beforeEach(() => {
  chatState.messages = []; chatState.streamedText = ''; chatState.isStreaming = false;
  chatState.pendingUserMessage = null; chatState.streamError = null; wouterLoc.current = '/coach-ai';
});

describe('chat — feedback instantaneo', () => {
  it('pendingUserMessage -> bolha do usuario aparece na hora', async () => {
    chatState.pendingUserMessage = 'monta um relatorio completo';
    chatState.isStreaming = true;
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-pending-user-msg')).toBeTruthy());
    expect(screen.getByText(/monta um relatorio completo/)).toBeTruthy();
  });

  it('isStreaming sem token -> indicador "pensando"', async () => {
    chatState.pendingUserMessage = 'oi';
    chatState.isStreaming = true;
    chatState.streamedText = '';
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-thinking-indicator')).toBeTruthy());
  });

  it('com streamedText -> mostra texto + digitando (sem indicador pensando duplicado)', async () => {
    chatState.isStreaming = true;
    chatState.streamedText = 'Vou puxar os dados';
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByText(/Vou puxar os dados/)).toBeTruthy());
    expect(screen.queryByTestId('coach-thinking-indicator')).toBeNull();
  });

  it('streaming sai do empty-state (nao mostra Sparkles vazio)', async () => {
    chatState.isStreaming = true;
    chatState.pendingUserMessage = 'oi';
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-pending-user-msg')).toBeTruthy());
    expect(screen.queryByTestId('coach-quick-suggestions')).toBeNull();
  });
});
