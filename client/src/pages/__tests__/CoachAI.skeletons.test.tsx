import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-05 — Skeletons em vez de spinners
//
// Em CoachAI.tsx:
//  - Durante isLoadingSessions: renderiza <SessionListSkeleton> (3-4 rows)
//  - Durante isLoadingMessages (com activeSessionId): renderiza <MessageSkeleton>
//  - Apos load: skeletons desaparecem e conteudo real aparece
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-05)
// =============================================================================

// --- Mocks ---
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

import CoachAI from '../CoachAI';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function isSkeletonEl(el: Element): boolean {
  const cls = el.className || '';
  return /skeleton|animate-pulse/.test(String(cls));
}

describe('CoachAI — Skeletons (RF-05)', () => {
  it('durante isLoadingSessions: renderiza 3-4 skeletons com classe animate-pulse/skeleton', async () => {
    // Fetch never resolves → mantem isLoading=true
    fetchMock.mockImplementation(
      () =>
        new Promise(() => {
          /* pending */
        })
    );

    const { container } = render(wrap(<CoachAI />));

    await waitFor(() => {
      const skeletons = Array.from(container.querySelectorAll('*')).filter(isSkeletonEl);
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('durante isLoadingMessages (com activeSessionId): renderiza skeleton bubbles', async () => {
    // Primeiro retorna lista de sessoes com 1 ativa
    const sessionsList = [
      {
        id: 'sess-42',
        coachType: 'mental',
        title: 'Teste',
        status: 'active',
        messageCount: 3,
        tokenCount: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
        return {
          ok: true,
          status: 200,
          json: async () => sessionsList,
          text: async () => JSON.stringify(sessionsList),
        } as any;
      }
      if (String(url).includes('/messages')) {
        // Nunca resolve
        return await new Promise(() => {});
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
    });

    const { container } = render(wrap(<CoachAI />));

    // Espera lista aparecer e entao clicar em uma sessao
    await waitFor(() => {
      expect(screen.queryByText('Teste')).toBeTruthy();
    });

    // Simula click para carregar mensagens
    const user = (await import('@testing-library/user-event')).default.setup();
    await user.click(screen.getByText('Teste'));

    // Espera skeleton de bubbles
    await waitFor(() => {
      const skeletons = Array.from(container.querySelectorAll('*')).filter(isSkeletonEl);
      // Esperamos 3-4 skeleton bubbles na area de mensagens
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('apos load completo: skeletons desaparecem e conteudo real aparece', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'sess-done',
              coachType: 'mental',
              title: 'Conversa real',
              status: 'active',
              messageCount: 2,
              tokenCount: 50,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          text: async () => 'ok',
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
    });

    const { container } = render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.queryByText('Conversa real')).toBeTruthy();
    });

    // Apos load, nao esperamos skeletons grandes (podem existir bits menores mas nao a bateria inicial)
    const skeletons = Array.from(container.querySelectorAll('*')).filter(isSkeletonEl);
    // Permitimos skeleton zerar OU pelo menos nao ser mais o grupo inicial (ate 2)
    expect(skeletons.length).toBeLessThanOrEqual(2);
  });
});
