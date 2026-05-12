/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint AI-0B / RF-04 — useCoachChat inclui `pageContext` no body do POST
 * /api/coach/chat SOMENTE quando fornecido; omite a chave quando undefined.
 *
 * Spec: Docs/specs/sprint-ai-0b.md §RF-04; ADR-149 §2.2 + §5 (item 9).
 *
 * Contrato esperado (decisao do system-architect — uma das duas formas; o teste
 * cobre as duas):
 *   (a) useCoachChat(coachType, options?: { pageContext?: any }) — pageContext
 *       via options no hook; OU
 *   (b) sendMessage(message, opts?: { pageContext?: any }) — pageContext no send.
 * O teste tenta (a) primeiro; se o hook ignorar, tenta (b).
 *
 * Lessons: #13 (apiRequest retorna JSON — mas useCoachChat usa fetch direto no
 *          chat; mockamos global.fetch e inspecionamos o body), #14/#26 (await
 *          import em .tsx), #30 (renderHook -> jsdom: este arquivo eh .tsx,
 *          roda no projeto client).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return { ...actual, getCsrfToken: () => 'csrf-token' };
});

const fetchMock = vi.fn();

function streamResponse() {
  // ReadableStream com 1 evento SSE "done".
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"done","sessionId":"sess-1","messageId":"m1"}\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body, json: async () => ({}) } as any;
}

async function loadHook() {
  const mod: any = await import('@/hooks/useCoachChat');
  return mod.useCoachChat as (coachType: string, options?: any) => any;
}

function wrapHook(useHook: () => any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(useHook, {
    wrapper: ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

function lastChatBody(): any {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/coach/chat'));
  if (!call) return null;
  try { return JSON.parse(call[1].body); } catch { return null; }
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/coach/chat')) return streamResponse();
    if (u.includes('/api/coach/sessions') && !u.includes('/messages')) {
      return { ok: true, status: 200, json: async () => [] } as any;
    }
    return { ok: true, status: 200, json: async () => ({}) } as any;
  });
  global.fetch = fetchMock as any;
});

describe('useCoachChat — pageContext no body do POST (RF-04)', () => {
  it('com pageContext fornecido -> body do POST /api/coach/chat inclui pageContext', async () => {
    const useCoachChat = await loadHook();
    // activeTab 'movements' = key real do WalletActivityPanel (reviewer MEDIUM).
    const pageContext = { route: 'bankroll', walletsCount: 3, activeTab: 'movements' };

    const { result } = wrapHook(() => useCoachChat('mental', { pageContext }));
    await act(async () => {
      // tenta forma (a): hook ja recebeu pageContext via options.
      await result.current.sendMessage('oi');
    });

    let body = lastChatBody();
    // Fallback: forma (b) — sendMessage(message, { pageContext }).
    if (!body || body.pageContext === undefined) {
      fetchMock.mockClear();
      await act(async () => {
        await result.current.sendMessage('oi', { pageContext });
      });
      body = lastChatBody();
    }
    expect(body).toBeTruthy();
    expect(body.pageContext).toEqual(pageContext);
    expect(body.coachType).toBe('mental');
  });

  it('sem pageContext -> body do POST NAO tem a chave pageContext', async () => {
    const useCoachChat = await loadHook();
    const { result } = wrapHook(() => useCoachChat('mental'));
    await act(async () => {
      await result.current.sendMessage('oi');
    });
    const body = lastChatBody();
    expect(body).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(body, 'pageContext')).toBe(false);
  });
});
