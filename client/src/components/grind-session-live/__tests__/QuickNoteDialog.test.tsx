/**
 * Tests — QuickNoteDialog (Sprint Grind-Live Spot Notes RF-01)
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

import QuickNoteDialog from '../QuickNoteDialog';

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
  toastMock.mockReset();
});

describe('QuickNoteDialog', () => {
  it('nao renderiza quando spot=null', () => {
    render(<QuickNoteDialog spot={null} sessionId="sess-1" onClose={vi.fn()} />);
    expect(screen.queryByTestId('spot-note-dialog')).toBeNull();
  });

  it('renderiza dialog com input + thumbnail quando spot existe', () => {
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('spot-note-dialog')).not.toBeNull();
    expect(screen.getByTestId('spot-note-input')).not.toBeNull();
    expect(screen.getByTestId('spot-note-save')).not.toBeNull();
    expect(screen.getByTestId('spot-note-skip')).not.toBeNull();
  });

  it('Salvar com texto envia PATCH com notes', async () => {
    apiRequestMock.mockResolvedValueOnce({ id: 'spot-1', notes: 'vilao agro' });
    const onClose = vi.fn();
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={onClose}
      />,
    );

    const input = screen.getByTestId('spot-note-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'vilao agro' } });
    fireEvent.click(screen.getByTestId('spot-note-save'));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock).toHaveBeenCalledWith(
      'PATCH',
      '/api/starred-hands/spot-1/review',
      { notes: 'vilao agro' },
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidateQueriesMock).toHaveBeenCalled();
  });

  it('Pular fecha sem chamar PATCH', () => {
    const onClose = vi.fn();
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('spot-note-skip'));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Salvar com textarea vazia trata como Pular (sem PATCH)', () => {
    const onClose = vi.fn();
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('spot-note-save'));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('limita textarea a 500 chars', () => {
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByTestId('spot-note-input') as HTMLTextAreaElement;
    const longText = 'a'.repeat(600);
    fireEvent.change(input, { target: { value: longText } });
    expect(input.value.length).toBe(500);
  });

  it('erro de PATCH mantem dialog aberto + toast destructive', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('boom'));
    const onClose = vi.fn();
    render(
      <QuickNoteDialog
        spot={{ id: 'spot-1' }}
        sessionId="sess-1"
        onClose={onClose}
      />,
    );

    const input = screen.getByTestId('spot-note-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'nota teste' } });
    fireEvent.click(screen.getByTestId('spot-note-save'));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const lastCall = toastMock.mock.calls[toastMock.mock.calls.length - 1];
    expect(lastCall[0].variant).toBe('destructive');
    expect(onClose).not.toHaveBeenCalled();
  });
});
