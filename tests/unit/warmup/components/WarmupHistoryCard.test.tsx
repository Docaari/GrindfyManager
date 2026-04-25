import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): WarmupHistoryCard (RF-18)
//
// Contrato:
//   <WarmupHistoryCard limit?={number} />  // default 14
//
// Comportamento:
//   - GET /api/warmup-rituals?limit=14
//   - Cada item: data/hora, score, badge de decisao, duracao
//   - Badge:
//     - verde "jogou" para version=full + decisionToPlay=true + overrideUsed=false
//     - amarela "override" para version=full + decisionToPlay=true + overrideUsed=true
//     - vermelha "nao jogou" para version=aborted + decisionToPlay=false
//     - cinza "abortou" para version=aborted + decisionToPlay=null
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
import { WarmupHistoryCard } from '@/components/warmup/WarmupHistoryCard';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WarmupHistoryCard - empty', () => {
  it('exibe estado vazio quando lista=[]', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/sem|nenhum|empty|vazio|comece/i);
    });
  });
});

describe('WarmupHistoryCard - lista', () => {
  it('renderiza um card por ritual', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:10:00Z',
          version: 'full',
          decisionToPlay: true,
          overrideUsed: false,
          emotionalCheckScore: 8,
          durationMinutes: 10,
        },
        {
          id: 'r-2',
          startedAt: '2026-04-24T18:00:00Z',
          completedAt: '2026-04-24T18:02:00Z',
          version: 'aborted',
          decisionToPlay: false,
          overrideUsed: false,
          emotionalCheckScore: 4,
          durationMinutes: 2,
        },
      ],
      total: 2, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const items = screen.queryAllByTestId('warmup-history-item');
      expect(items.length).toBe(2);
    });
  });

  it('exibe score emocional de cada ritual', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          version: 'full',
          decisionToPlay: true,
          overrideUsed: false,
          emotionalCheckScore: 8,
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:10:00Z',
          durationMinutes: 10,
        },
      ],
      total: 1, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/8/);
    });
  });
});

describe('WarmupHistoryCard - badges', () => {
  it('badge verde "jogou" para full + decisionToPlay=true + override=false', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          version: 'full',
          decisionToPlay: true,
          overrideUsed: false,
          emotionalCheckScore: 8,
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:10:00Z',
          durationMinutes: 10,
        },
      ],
      total: 1, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const badge = screen.getByTestId('warmup-history-badge-r-1');
      expect(badge.textContent).toMatch(/jogou/i);
    });
  });

  it('badge amarela "override" para full + override=true', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          version: 'full',
          decisionToPlay: true,
          overrideUsed: true,
          emotionalCheckScore: 4,
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:10:00Z',
          durationMinutes: 10,
        },
      ],
      total: 1, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const badge = screen.getByTestId('warmup-history-badge-r-1');
      expect(badge.textContent).toMatch(/override/i);
    });
  });

  it('badge vermelha "não jogou" para aborted + decisionToPlay=false', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          version: 'aborted',
          decisionToPlay: false,
          overrideUsed: false,
          emotionalCheckScore: 4,
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:02:00Z',
          durationMinutes: 2,
        },
      ],
      total: 1, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const badge = screen.getByTestId('warmup-history-badge-r-1');
      expect(badge.textContent).toMatch(/n[aã]o jogou/i);
    });
  });

  it('badge cinza "abortou" para aborted + decisionToPlay=null', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [
        {
          id: 'r-1',
          version: 'aborted',
          decisionToPlay: null,
          overrideUsed: false,
          emotionalCheckScore: null,
          startedAt: '2026-04-25T18:00:00Z',
          completedAt: '2026-04-25T18:01:00Z',
          durationMinutes: 1,
        },
      ],
      total: 1, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const badge = screen.getByTestId('warmup-history-badge-r-1');
      expect(badge.textContent).toMatch(/abort/i);
    });
  });
});

describe('WarmupHistoryCard - default limit=14', () => {
  it('chama API com limit=14 por default', async () => {
    (apiRequest as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    render(withClient(<WarmupHistoryCard />));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const matched = calls.some((args: any[]) =>
        JSON.stringify(args).includes('limit=14') ||
        JSON.stringify(args).includes('"limit":14'),
      );
      expect(matched).toBe(true);
    });
  });
});
