/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1B / RF-12 — quick suggestions anti-blank-page no chat
 *   - ChatPanel (em client/src/pages/CoachAI.tsx) e MiniChat (client/src/components/MiniChat.tsx)
 *     renderizam 2-4 chips de sugestao quando messages.length === 0; clicar -> preenche
 *     o input (ou envia — recomendacao: preenche + foco).
 *   - GET /api/coach/suggestions?route=... (via useQuery) — endpoint falha -> fallback
 *     estatico client/src/lib/quickSuggestionsFallback.ts (subset por rota).
 *   - Quando ha mensagens -> chips somem.
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1b.md (RF-12 + "Cenarios de Teste Derivados")
 *   - Docs/architecture/decisions/158-quick-suggestions-anti-blank-page.md (§3.4, §5)
 *
 * data-testid esperados:
 *   - coach-quick-suggestions          — wrapper dos chips
 *   - coach-quick-suggestion-chip      — cada chip clicavel
 *
 * Lessons: #13 (apiRequest JSON), #14/#26 (await import .tsx), #29 (useQuery dentro
 *   de provider — wrap; MiniChat standalone com fetch best-effort + fallback), #2 (data-testid).
 *
 * Status esperado: FALHAM (chips + fallback nao existem).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));
// wouter location mutavel — o MiniChat esconde em HIDDEN_PATHS (`/coach-ai` inclusive),
// entao o teste do MiniChat aponta pra `/dashboard` (path visivel).
const wouterLoc = { current: '/coach-ai' as string };
vi.mock('wouter', () => ({
  useLocation: () => [wouterLoc.current, vi.fn()] as const,
  Link: ({ href, children, ...rest }: any) => <a href={href} data-href={href} {...rest}>{children}</a>,
  useRoute: () => [false, {}] as const,
}));

// useCoachChat — controla messages.length + captura sendMessage / input changes.
const chatState = { messages: [] as any[], streamedText: '' };
const sendMessageMock = vi.fn();
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    sessions: [], messages: chatState.messages, activeSessionId: null, setActiveSessionId: vi.fn(),
    isLoadingSessions: false, isLoadingMessages: false, isStreaming: false, streamedText: chatState.streamedText,
    streamError: null, sendMessage: sendMessageMock, cancelStream: vi.fn(), startNewConversation: vi.fn(),
    archiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCoachPageContext', () => ({
  useCoachPageContext: (route?: string) => ({ route: route ?? '/coach-ai', activeCoachType: null }),
}));
vi.mock('@/hooks/useTabFromUrl', () => ({
  useTabFromUrl: () => ['chat', vi.fn()] as const,
}));

// endpoint de suggestions — controlavel (sucesso ou falha).
const suggestionsState = { ok: true, route: '/dashboard', list: [
  { id: 's1', text: 'Por que estou perdendo essa semana?', sendOnClick: true },
  { id: 's2', text: 'Isso é variância ou erro?', sendOnClick: true },
  { id: 's3', text: 'Quais meus leaks principais agora?', sendOnClick: true },
] };
const apiRequestMock = vi.fn(async (_m: string, url: string) => {
  if (url.startsWith('/api/coach/suggestions')) {
    if (!suggestionsState.ok) throw new Error('endpoint down');
    return { suggestions: suggestionsState.list };
  }
  if (url.startsWith('/api/coach/audit')) return { items: [] };
  if (url.startsWith('/api/coach/preferences')) return { frozenCategories: {}, reportWeeklyEnabled: false, nudgeBGapcheck: true, nudgeBImport: true };
  return {};
});
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async () => ({}),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadCoachAI() {
  const mod: any = await import('@/pages/CoachAI');
  return (mod.default ?? mod.CoachAI) as React.ComponentType<any>;
}
async function loadMiniChat() {
  const mod: any = await import('@/components/MiniChat');
  return (mod.default ?? mod.MiniChat) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  chatState.messages = [];
  chatState.streamedText = '';
  suggestionsState.ok = true;
  wouterLoc.current = '/coach-ai';
});

describe('ChatPanel — quick suggestions', () => {
  it('messages.length === 0 -> renderiza 2-4 chips clicaveis', async () => {
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-quick-suggestions')).toBeTruthy());
    const chips = screen.getAllByTestId('coach-quick-suggestion-chip');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(chips.length).toBeLessThanOrEqual(4);
  });

  it('clicar num chip -> preenche o input (ou envia — sendMessage chamado); de qualquer forma a pergunta vira acionada', async () => {
    const CoachAI = await loadCoachAI();
    const { container } = render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-quick-suggestions')).toBeTruthy());
    await userEvent.click(screen.getAllByTestId('coach-quick-suggestion-chip')[0]);
    // ou sendMessage foi chamado, ou o textarea/input do chat ficou preenchido.
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    const filled = !!textarea && /perdendo/i.test(textarea.value || '');
    expect(sendMessageMock.mock.calls.length > 0 || filled).toBe(true);
  });

  it('quando ha mensagens -> os chips somem', async () => {
    chatState.messages = [{ id: 'm1', role: 'user', content: 'oi' }];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    // espera o render completar — chips nao devem aparecer.
    await waitFor(() => expect(screen.queryByTestId('coach-ai-tabpanel-chat') ?? screen.queryByText(/Grindfy AI/)).toBeTruthy());
    expect(screen.queryByTestId('coach-quick-suggestions')).toBeNull();
  });

  it('endpoint /api/coach/suggestions falha -> usa o fallback estatico por rota (chips ainda aparecem; sem erro fatal)', async () => {
    suggestionsState.ok = false;
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    // ainda renderiza chips (do fallback estatico).
    await waitFor(() => expect(screen.getByTestId('coach-quick-suggestions')).toBeTruthy());
    expect(screen.getAllByTestId('coach-quick-suggestion-chip').length).toBeGreaterThanOrEqual(2);
  });
});

describe('MiniChat — quick suggestions', () => {
  // Reescrito (reviewer MEDIUM): o teste original montava o MiniChat em `/coach-ai`,
  // que e HIDDEN_PATH do MiniChat (a pagina /coach-ai JA eh o chat full), e nao
  // abria o painel — impossivel. Agora monta em `/dashboard` (path visivel) e abre
  // o painel via o FAB antes de procurar os chips.
  it('painel aberto em path visivel + messages vazias -> renderiza chips (fallback estatico se endpoint falha)', async () => {
    suggestionsState.ok = false;
    wouterLoc.current = '/dashboard';
    const MiniChat = await loadMiniChat();
    render(wrap(<MiniChat />));
    // abre o painel.
    await userEvent.click(await screen.findByTestId('mini-chat-fab'));
    await waitFor(() => expect(screen.getByTestId('coach-quick-suggestions')).toBeTruthy());
    expect(screen.getAllByTestId('coach-quick-suggestion-chip').length).toBeGreaterThanOrEqual(2);
  });
});

describe('quickSuggestionsFallback — modulo do frontend', () => {
  it('client/src/lib/quickSuggestionsFallback exporta um mapa rota->sugestoes (subset estavel)', async () => {
    // path em variavel (ver nota em nudge-card.test.tsx) — red phase.
    const p = '@/lib/quickSuggestionsFallback';
    const mod: any = await import(/* @vite-ignore */ p);
    // aceitamos export default (objeto) ou named (getFallbackSuggestions/QUICK_SUGGESTIONS_FALLBACK).
    const fallback = mod.default ?? mod.QUICK_SUGGESTIONS_FALLBACK ?? mod.getFallbackSuggestions;
    expect(fallback).toBeTruthy();
    // se for funcao: getFallbackSuggestions('/dashboard') -> array nao-vazio.
    if (typeof fallback === 'function') {
      const out = fallback('/dashboard');
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBeGreaterThanOrEqual(2);
    } else {
      // se for objeto: tem pelo menos /dashboard e /coach-ai.
      expect(fallback['/dashboard'] ?? fallback['/coach-ai']).toBeTruthy();
    }
  });
});
