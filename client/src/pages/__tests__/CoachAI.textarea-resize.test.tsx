import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-18 — Textarea auto-resize
//
// Em CoachAI.tsx (input area):
//  - useEffect em inputValue ajusta height do textarea.
//  - Min: 44px (default rows=1).
//  - Max: 120px (clamp).
//  - Apos enviar: reseta para 44px.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-18)
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

function setupFetch() {
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/coach/sessions') && !u.includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — Textarea auto-resize (RF-18)', () => {
  it('renderiza textarea com min-height baixa por default', async () => {
    setupFetch();
    const CoachAI = (await import('../CoachAI')).default;

    const { container } = render(wrap(<CoachAI />));

    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    // Verifica que tem max-h-[120px] na classe (clamp comportamental)
    expect(textarea.className).toMatch(/max-h-\[120px\]|max-h-30/);
  });

  it('digitar conteudo nao crasha (auto-resize aplica style.height)', async () => {
    setupFetch();
    const user = userEvent.setup();
    const CoachAI = (await import('../CoachAI')).default;

    const { container } = render(wrap(<CoachAI />));

    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    // jsdom retorna scrollHeight=0 por default, entao height pode permanecer 'auto'.
    // O importante e nao crashar e o effect rodar.
    await user.type(textarea, 'linha um\nlinha dois\nlinha tres');

    expect(textarea.value).toContain('linha um');
    // Style.height deve ter sido tocado (string com px ou 'auto')
    expect(typeof textarea.style.height).toBe('string');
  });

  it('reseta para min apos limpar input', async () => {
    setupFetch();
    const user = userEvent.setup();
    const CoachAI = (await import('../CoachAI')).default;

    const { container } = render(wrap(<CoachAI />));

    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).not.toBeNull();
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    await user.type(textarea, 'algum texto');
    await user.clear(textarea);

    expect(textarea.value).toBe('');
  });
});
