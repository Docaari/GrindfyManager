/**
 * Sprint Estudos-Flow-Review (H1) — upload de prints (jogada + solucao GTO) por
 * entry de stat_analysis no SessaoDetailPage.
 *
 * Lessons: #14/#38 await import; #2 data-testid estaveis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/analise/s1', vi.fn()],
}));

const detail = {
  id: 's1',
  mode: 'stat_analysis',
  themeId: null,
  statId: 'vpip',
  durationMinutes: 20,
  registeredAt: '2026-06-02T12:00:00.000Z',
  notes: null,
  statAnalysisEntries: [
    { id: 'e1', filters: 'BTN vs BB', errorText: '', learnedText: '', playImageUrl: null, solutionImageUrl: null },
  ],
};

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return { ...actual, apiRequest: (...args: any[]) => mockApiRequest(...args) };
});

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.endsWith('/detail')) return detail;
    if (method === 'GET' && url === '/api/study-themes') return [];
    if (method === 'POST' && url.includes('/image')) return { slot: 'play', imageUrl: '/x.png' };
    return {};
  });
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function load() {
  return (await import('../SessaoDetailPage')).default;
}

describe('SessaoDetailPage — upload de prints (H1)', () => {
  it('renderiza controles de upload (jogada + solucao) por entry', async () => {
    const SessaoDetailPage = await load();
    renderWithQuery(<SessaoDetailPage sessionId="s1" />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-upload-play-e1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-detail-upload-solution-e1')).toBeInTheDocument();
  });

  it('selecionar arquivo dispara POST com FormData (slot=play)', async () => {
    const SessaoDetailPage = await load();
    const { container } = renderWithQuery(<SessaoDetailPage sessionId="s1" />);
    const label = await screen.findByTestId('session-detail-upload-play-e1');
    const input = label.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const post = mockApiRequest.mock.calls.find(
        (c: any) => c[0] === 'POST' && /\/entries\/e1\/image$/.test(c[1]),
      );
      expect(post).toBeTruthy();
      const fd = post![2];
      expect(fd instanceof FormData).toBe(true);
      expect(fd.get('slot')).toBe('play');
    });
    void container;
  });

  it('bloqueia arquivo > 5MB (mostra erro, nao chama POST)', async () => {
    const SessaoDetailPage = await load();
    renderWithQuery(<SessaoDetailPage sessionId="s1" />);
    const label = await screen.findByTestId('session-detail-upload-solution-e1');
    const input = label.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-upload-error')).toBeInTheDocument();
    });
    const post = mockApiRequest.mock.calls.find((c: any) => c[0] === 'POST' && c[1].includes('/image'));
    expect(post).toBeUndefined();
  });
});
