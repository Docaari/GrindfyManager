import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-04 — AlertDialog no delete de sessao
//
// CoachAI.tsx: click em trash em uma sessao abre AlertDialog (shadcn) com
//  copy pt-BR, botoes "Cancelar" e "Apagar conversa".
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-04)
// =============================================================================

// --- Mocks ---
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
  // Default: retorna lista de sessoes com 1 entrada
  const defaultSessions = [
    {
      id: 'sess-1',
      coachType: 'mental',
      title: 'Conversa teste',
      status: 'active',
      messageCount: 3,
      tokenCount: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  fetchMock.mockImplementation(async (url: string, opts?: any) => {
    const method = opts?.method || 'GET';
    if (String(url).includes('/api/coach/sessions') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => defaultSessions,
        text: async () => JSON.stringify(defaultSessions),
      } as any;
    }
    if (String(url).includes('/api/coach/sessions/') && method === 'DELETE') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => '{}',
      } as any;
    }
    // Default empty
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '{}',
    } as any;
  });
});

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

// Mock wouter useLocation
vi.mock('wouter', () => ({
  useLocation: () => ['/coach', vi.fn()],
}));

import CoachAI from '../CoachAI';
import { getQueryFn } from '@/lib/queryClient';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: 'returnNull' }) }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — delete session AlertDialog (RF-04)', () => {
  it('click em trash abre AlertDialog e NAO deleta imediatamente', async () => {
    const user = userEvent.setup();
    render(wrap(<CoachAI />));

    // Esperar lista de sessoes renderizar
    await waitFor(() => {
      expect(screen.queryByText('Conversa teste')).toBeTruthy();
    });

    // Localizar botao de delete (title="Excluir" ou aria-label correspondente)
    const row = screen.getByText('Conversa teste').closest('div')!;
    // O botao trash esta dentro do row (group-hover hidden)
    const trashBtn =
      row.querySelector('button[title="Excluir"]') ||
      row.querySelector('[aria-label*="Excluir"]') ||
      row.querySelector('[aria-label*="Apagar"]');
    expect(trashBtn).toBeTruthy();

    await user.click(trashBtn as HTMLElement);

    // Dialog abriu — procuramos copy pt-BR
    await waitFor(() => {
      const title =
        screen.queryByText(/Apagar esta conversa\?|Apagar conversa\?/i) ||
        screen.queryByText(/Essa acao nao pode ser desfeita/i);
      expect(title).toBeTruthy();
    });

    // Nenhum DELETE enviado
    const deleteCalls = fetchMock.mock.calls.filter(
      ([, o]: any) => String(o?.method).toUpperCase() === 'DELETE'
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('click em "Cancelar" fecha dialog sem deletar', async () => {
    const user = userEvent.setup();
    render(wrap(<CoachAI />));

    await waitFor(() => expect(screen.queryByText('Conversa teste')).toBeTruthy());

    const row = screen.getByText('Conversa teste').closest('div')!;
    const trashBtn =
      row.querySelector('button[title="Excluir"]') ||
      row.querySelector('[aria-label*="Excluir"]') ||
      row.querySelector('[aria-label*="Apagar"]');
    await user.click(trashBtn as HTMLElement);

    await waitFor(() => {
      expect(
        screen.queryByText(/Essa acao nao pode ser desfeita|Apagar esta conversa\?/i)
      ).toBeTruthy();
    });

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    await user.click(cancelBtn);

    // Dialog fechou
    await waitFor(() => {
      expect(
        screen.queryByText(/Essa acao nao pode ser desfeita/i)
      ).toBeFalsy();
    });

    // DELETE NAO chamado
    const deleteCalls = fetchMock.mock.calls.filter(
      ([, o]: any) => String(o?.method).toUpperCase() === 'DELETE'
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('click em "Apagar conversa" chama DELETE /api/coach/sessions/:id', async () => {
    const user = userEvent.setup();
    render(wrap(<CoachAI />));

    await waitFor(() => expect(screen.queryByText('Conversa teste')).toBeTruthy());

    const row = screen.getByText('Conversa teste').closest('div')!;
    const trashBtn =
      row.querySelector('button[title="Excluir"]') ||
      row.querySelector('[aria-label*="Excluir"]') ||
      row.querySelector('[aria-label*="Apagar"]');
    await user.click(trashBtn as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByText(/Apagar conversa|Apagar esta conversa\?/i)).toBeTruthy();
    });

    // O botao de confirmacao — spec define literal "Apagar conversa"
    const confirmBtn = screen.getByRole('button', { name: /apagar conversa/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        ([url, o]: any) =>
          String(o?.method).toUpperCase() === 'DELETE' &&
          String(url).includes('/api/coach/sessions/sess-1')
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Escape fecha dialog sem deletar', async () => {
    const user = userEvent.setup();
    render(wrap(<CoachAI />));

    await waitFor(() => expect(screen.queryByText('Conversa teste')).toBeTruthy());

    const row = screen.getByText('Conversa teste').closest('div')!;
    const trashBtn =
      row.querySelector('button[title="Excluir"]') ||
      row.querySelector('[aria-label*="Excluir"]') ||
      row.querySelector('[aria-label*="Apagar"]');
    await user.click(trashBtn as HTMLElement);

    await waitFor(() => {
      expect(
        screen.queryByText(/Essa acao nao pode ser desfeita|Apagar esta conversa\?/i)
      ).toBeTruthy();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByText(/Essa acao nao pode ser desfeita/i)
      ).toBeFalsy();
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      ([, o]: any) => String(o?.method).toUpperCase() === 'DELETE'
    );
    expect(deleteCalls.length).toBe(0);
  });
});
