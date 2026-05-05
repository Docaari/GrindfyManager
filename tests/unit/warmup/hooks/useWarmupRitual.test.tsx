import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): hooks/useWarmupRitual (T-11)
//
// Contrato (state machine do ritual):
//   const {
//     status,                  // 'idle' | 'running' | 'paused' | 'completed' | 'aborted'
//     currentBlock,            // 1..5
//     emotionalCheckScore,     // number | null
//     overrideUsed,            // boolean
//     blocksData,              // dados parciais por bloco
//     submitEmotionalCheck,    // (score: number) => void
//     confirmOverride,         // () => void (apos modal de override)
//     advanceBlock,            // (blockData: any) => void
//     pause / resume,
//     abort,                   // () => Promise<void>
//     completeRitual,          // (intention) => Promise<void>
//   } = useWarmupRitual();
//
// Persistencia: localStorage 'warmup-ritual-draft' a cada transicao + clear ao final.
// POST /api/warmup-rituals em completeRitual e abort.
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { apiRequest } from '@/lib/queryClient';
import { useWarmupRitual } from '@/hooks/useWarmupRitual';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  withClient(children) as any;

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

describe('useWarmupRitual - estado inicial', () => {
  it('status=idle inicialmente', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });
    expect(result.current.status).toBe('idle');
  });

  it('start() muda status para running e currentBlock=1', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });

    expect(result.current.status).toBe('running');
    expect(result.current.currentBlock).toBe(1);
  });
});

describe('useWarmupRitual - Bloco 1 (check emocional)', () => {
  it('submitEmotionalCheck(8) seta score e nao abre gate', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.submitEmotionalCheck(8);
    });

    expect(result.current.emotionalCheckScore).toBe(8);
    expect(result.current.gateOpen).toBe(false);
  });

  it('submitEmotionalCheck(4) abre gate (score < 6)', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.submitEmotionalCheck(4);
    });

    expect(result.current.emotionalCheckScore).toBe(4);
    expect(result.current.gateOpen).toBe(true);
  });

  it('submitEmotionalCheck(6) NAO abre gate (limite inclusivo)', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.submitEmotionalCheck(6);
    });

    expect(result.current.gateOpen).toBe(false);
  });

  it('confirmOverride seta overrideUsed=true e fecha gate, avanca bloco', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.submitEmotionalCheck(4);
    });
    act(() => {
      result.current.confirmOverride();
    });

    expect(result.current.overrideUsed).toBe(true);
    expect(result.current.gateOpen).toBe(false);
    expect(result.current.currentBlock).toBe(2);
    // Reform 2026-05-05 (BLOCKER-1 fix): confirmOverride deve persistir
    // snapshot do bloco onde o gate disparou, com score + overrideUsed=true.
    // Sem isso, audit historico perde o registro do override.
    expect(result.current.blocksData[1]).toMatchObject({
      blockId: 1,
      emotionalCheckScore: 4,
      overrideUsed: true,
    });
  });
});

describe('useWarmupRitual - navegacao entre blocos', () => {
  it('advanceBlock incrementa currentBlock', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.submitEmotionalCheck(8);
    });
    act(() => {
      result.current.advanceBlock({ blockId: 1, durationSeconds: 120 });
    });

    expect(result.current.currentBlock).toBe(2);
  });

  it('persiste draft em localStorage a cada advanceBlock (RF-12)', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    act(() => { result.current.submitEmotionalCheck(8); });
    act(() => { result.current.advanceBlock({ blockId: 1 }); });

    const draft = localStorage.getItem('warmup-ritual-draft');
    expect(draft).toBeTruthy();
    if (draft) {
      const parsed = JSON.parse(draft);
      expect(parsed.currentBlock).toBe(2);
    }
  });
});

describe('useWarmupRitual - completeRitual', () => {
  it('POST /api/warmup-rituals com version=full', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'full' });

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    act(() => { result.current.submitEmotionalCheck(8); });
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-loop-func
      act(() => {
        result.current.advanceBlock({ blockId: result.current.currentBlock });
      });
    }

    await act(async () => {
      await result.current.completeRitual({
        focus: 'a', tiltPlan: 'b', stopCriteria: 'c',
      });
    });

    const calls = (apiRequest as any).mock.calls;
    const postCall = calls.find((args: any[]) =>
      JSON.stringify(args).includes('/api/warmup-rituals'),
    );
    expect(postCall).toBeTruthy();
    expect(JSON.stringify(postCall)).toContain('"version":"full"');
  });

  it('apos sucesso: status=completed e localStorage limpo', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'full' });

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    act(() => { result.current.submitEmotionalCheck(8); });
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.advanceBlock({ blockId: result.current.currentBlock });
      });
    }

    await act(async () => {
      await result.current.completeRitual({
        focus: 'a', tiltPlan: 'b', stopCriteria: 'c',
      });
    });

    expect(result.current.status).toBe('completed');
    expect(localStorage.getItem('warmup-ritual-draft')).toBeNull();
  });
});

describe('useWarmupRitual - abort', () => {
  it('abort POST /api/warmup-rituals com version=aborted', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'aborted' });

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });

    await act(async () => {
      await result.current.abort('user_cancel');
    });

    const calls = (apiRequest as any).mock.calls;
    const postCall = calls.find((args: any[]) =>
      JSON.stringify(args).includes('/api/warmup-rituals'),
    );
    expect(postCall).toBeTruthy();
    expect(JSON.stringify(postCall)).toContain('"version":"aborted"');
  });

  it('abort apos gate no-go envia decisionToPlay=false', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'aborted' });

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    act(() => { result.current.submitEmotionalCheck(4); });

    await act(async () => {
      await result.current.abort('gate_no_go');
    });

    const calls = (apiRequest as any).mock.calls;
    const postCall = calls.find((args: any[]) =>
      JSON.stringify(args).includes('/api/warmup-rituals'),
    );
    expect(JSON.stringify(postCall)).toContain('"decisionToPlay":false');
  });

  it('apos abort: status=aborted, localStorage limpo', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'aborted' });

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    await act(async () => { await result.current.abort('user_cancel'); });

    expect(result.current.status).toBe('aborted');
    expect(localStorage.getItem('warmup-ritual-draft')).toBeNull();
  });
});

describe('useWarmupRitual - pause/resume + restore', () => {
  it('pause/resume preserva currentBlock e dados parciais', () => {
    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => { result.current.start(); });
    act(() => { result.current.submitEmotionalCheck(8); });
    act(() => { result.current.advanceBlock({ blockId: 1 }); });

    act(() => { result.current.pause(); });
    expect(result.current.status).toBe('paused');

    act(() => { result.current.resume(); });
    expect(result.current.status).toBe('running');
    expect(result.current.currentBlock).toBe(2);
  });

  it('restore lê draft de localStorage e retoma estado (RF-12)', () => {
    // Coloca draft valido em localStorage
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      currentBlock: 3,
      emotionalCheckScore: 8,
      overrideUsed: false,
      blocksData: {},
    }));

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.restoreDraft();
    });

    expect(result.current.currentBlock).toBe(3);
    expect(result.current.emotionalCheckScore).toBe(8);
  });

  it('restore com draft expirado (>30min) descarta silenciosamente', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    const { result } = renderHook(() => useWarmupRitual(), { wrapper });

    act(() => {
      result.current.restoreDraft();
    });

    // Estado nao foi restaurado.
    expect(result.current.status).toBe('idle');
    expect(localStorage.getItem('warmup-ritual-draft')).toBeNull();
  });
});
