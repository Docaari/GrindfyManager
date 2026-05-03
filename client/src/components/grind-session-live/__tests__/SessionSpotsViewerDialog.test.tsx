/**
 * Tests — SessionSpotsViewerDialog (Sprint Grind-Live Spot Notes RF-02)
 *
 * Spec: Docs/specs/sprint-grind-live-spot-notes.md
 *
 * Lessons:
 *   #2  data-testid estavel
 *   #11 default minimo
 *   #13 apiRequest retorna JSON parseado (mock retorna objeto)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...args: any[]) => invalidateQueriesMock(...args),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

import SessionSpotsViewerDialog from '../SessionSpotsViewerDialog';

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
  toastMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockPendingOnce(payload: any) {
  apiRequestMock.mockImplementationOnce(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/starred-hands/pending')) {
      return payload;
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

describe('SessionSpotsViewerDialog', () => {
  it('nao faz request quando open=false', () => {
    renderWithClient(
      <SessionSpotsViewerDialog open={false} sessionId="s1" onClose={vi.fn()} />,
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('mostra empty state quando lista vazia', async () => {
    mockPendingOnce({ items: [], total: 0 });
    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-empty')).not.toBeNull(),
    );
  });

  it('renderiza grid com thumbnails dos prints', async () => {
    mockPendingOnce({
      items: [
        { id: 'spot-a', notes: 'agro vilao' },
        { id: 'spot-b', notes: null },
      ],
      total: 2,
    });
    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-thumb-spot-a')).not.toBeNull(),
    );
    expect(screen.queryByTestId('spot-viewer-thumb-spot-b')).not.toBeNull();
  });

  it('click thumbnail abre detalhe com nota pre-preenchida', async () => {
    mockPendingOnce({
      items: [{ id: 'spot-a', notes: 'leitura quente' }],
      total: 1,
    });
    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-thumb-spot-a')).not.toBeNull(),
    );
    fireEvent.click(screen.getByTestId('spot-viewer-thumb-spot-a'));

    const textarea = screen.getByTestId(
      'spot-viewer-edit-textarea',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('leitura quente');
  });

  it('Salvar nota envia PATCH com notes', async () => {
    mockPendingOnce({
      items: [{ id: 'spot-a', notes: '' }],
      total: 1,
    });
    apiRequestMock.mockResolvedValueOnce({ id: 'spot-a', notes: 'nova nota' });

    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-thumb-spot-a')).not.toBeNull(),
    );
    fireEvent.click(screen.getByTestId('spot-viewer-thumb-spot-a'));

    const textarea = screen.getByTestId(
      'spot-viewer-edit-textarea',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'nova nota' } });
    fireEvent.click(screen.getByTestId('spot-viewer-edit-save'));

    await waitFor(() =>
      expect(
        apiRequestMock.mock.calls.some(
          (c) =>
            c[0] === 'PATCH' && c[1] === '/api/starred-hands/spot-a/review',
        ),
      ).toBe(true),
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      'PATCH',
      '/api/starred-hands/spot-a/review',
      { notes: 'nova nota' },
    );
  });

  it('Excluir requer 2 cliques e chama DELETE', async () => {
    mockPendingOnce({
      items: [{ id: 'spot-a', notes: 'nota' }],
      total: 1,
    });
    apiRequestMock.mockResolvedValueOnce(undefined);

    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-thumb-spot-a')).not.toBeNull(),
    );
    fireEvent.click(screen.getByTestId('spot-viewer-thumb-spot-a'));

    fireEvent.click(screen.getByTestId('spot-viewer-delete'));
    expect(
      apiRequestMock.mock.calls.some((c) => c[0] === 'DELETE'),
    ).toBe(false);
    expect(screen.queryByTestId('spot-viewer-confirm-delete')).not.toBeNull();

    fireEvent.click(screen.getByTestId('spot-viewer-confirm-delete'));
    await waitFor(() =>
      expect(
        apiRequestMock.mock.calls.some(
          (c) =>
            c[0] === 'DELETE' &&
            c[1] === '/api/starred-hands/spot-a/discard',
        ),
      ).toBe(true),
    );
  });

  it('erro de DELETE mantem o card + toast destructive', async () => {
    mockPendingOnce({
      items: [{ id: 'spot-a', notes: 'nota' }],
      total: 1,
    });
    apiRequestMock.mockRejectedValueOnce(new Error('boom'));

    renderWithClient(
      <SessionSpotsViewerDialog open={true} sessionId="s1" onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('spot-viewer-thumb-spot-a')).not.toBeNull(),
    );
    fireEvent.click(screen.getByTestId('spot-viewer-thumb-spot-a'));
    fireEvent.click(screen.getByTestId('spot-viewer-delete'));
    fireEvent.click(screen.getByTestId('spot-viewer-confirm-delete'));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const lastCall = toastMock.mock.calls[toastMock.mock.calls.length - 1];
    expect(lastCall[0].variant).toBe('destructive');
  });
});
