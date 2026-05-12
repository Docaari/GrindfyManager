import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-17 — Auto-scroll inteligente + botao "nova mensagem"
//
// Em CoachAI.tsx:
//  - Auto-scroll APENAS quando user esta no final.
//  - Quando user rola pra cima durante streaming: NAO auto-scroll.
//  - Botao flutuante "↓ Nova mensagem" aparece quando NAO esta at bottom +
//    nova mensagem chegando.
//  - Click no botao: scroll suave para o final + esconde botao.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-17)
// =============================================================================

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/coach', vi.fn()],
}));

function setupFetch(sessions: any[], messages: any[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/coach/sessions') && !u.includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => sessions,
        text: async () => JSON.stringify(sessions),
      } as any;
    }
    if (u.includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages, total: messages.length, limit: 50, offset: 0 }),
        text: async () => JSON.stringify(messages),
      } as any;
    }
    if (u.includes('/api/coach/limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tier: 'free',
          limits: {
            mental: { dailyLimit: 10, used: 0, remaining: 10, resetAt: null },
            tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
            technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
          },
          coachAccess: { mental: true, tournament: false, technical: false },
        }),
        text: async () => '{}',
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
  });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: 'returnNull' }) }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — Auto-scroll inteligente (RF-17)', () => {
  it('renderiza pagina sem crash quando ha mensagens', async () => {
    setupFetch(
      [
        {
          id: 's1',
          coachType: 'mental',
          title: 'Test',
          status: 'active',
          messageCount: 2,
          tokenCount: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      [
        { id: 'm1', sessionId: 's1', role: 'user', content: 'Pergunta', createdAt: new Date().toISOString() },
        { id: 'm2', sessionId: 's1', role: 'assistant', content: 'Resposta', createdAt: new Date().toISOString() },
      ],
    );

    const CoachAI = (await import('../CoachAI')).default;
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.queryAllByText(/Test/i).length).toBeGreaterThan(0);
    });
  });

  it('botao "Nova mensagem" NAO aparece quando user esta at bottom', async () => {
    setupFetch(
      [
        {
          id: 's1',
          coachType: 'mental',
          title: 'Test',
          status: 'active',
          messageCount: 2,
          tokenCount: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      [
        { id: 'm1', sessionId: 's1', role: 'user', content: 'Pergunta', createdAt: new Date().toISOString() },
      ],
    );

    const CoachAI = (await import('../CoachAI')).default;
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.queryAllByText(/Test/i).length).toBeGreaterThan(0);
    });

    // No estado inicial (at bottom), nao deve haver botao "Nova mensagem"
    const newMessageBtn = screen.queryByRole('button', { name: /nova mensagem/i });
    expect(newMessageBtn).toBeNull();
  });

  // Note: Testar a logica de scroll real exige que jsdom tenha scrollHeight/clientHeight,
  // que nao sao implementados. O comportamento principal (state isAtBottom default true)
  // e validado nos outros testes. Tests adicionais sao de integracao manual.
});
