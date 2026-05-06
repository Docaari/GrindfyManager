import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (red phase) — "Pular Todos os Breaks Hoje" desliga toggle.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-05)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
//
// Implementer DEVE garantir que:
// 1) BreakFeedbackPopup.onSkipAll dispara o callback do parent.
// 2) Parent (GrindSessionLive) extrai a logica para fn pura testavel:
//
//    client/src/components/grind-session/break-skip-all-handler.ts
//    exporta:
//      handleSkipAllBreaksToday(deps): Promise<void>
//
//    deps:
//    {
//      apiRequest: (m, u, body?) => Promise<any>,
//      setSkipBreaksToday: (b: boolean) => void,
//      setShowBreakDialog: (b: boolean) => void,
//      wasAutoOpenedRef: { current: boolean },
//      setQueryData: (key: string | unknown[], updater: any) => void,
//      getQueryData: (key: string | unknown[]) => any,
//      toast: (opts: { title: string; description?: string; variant?: string }) => void,
//    }
//
// Comportamento esperado:
// - PATCH /api/user-settings { breakAutoOpenEnabled: false } eh disparado.
// - skipBreaksToday vira true.
// - showBreakDialog vira false.
// - wasAutoOpenedRef vira false.
// - setQueryData otimista para userAlertSettings.breakAutoOpenEnabled=false.
// - Toast sucesso "Auto-Break desativado..." dispara.
// - Em caso de PATCH falhar -> rollback do setQueryData + toast erro.
// =============================================================================

// Lesson #14: Vite faz analise estatica de await import('literal-path') e
// quebra red phase quando modulo ainda nao existe. Construimos string em runtime
// + /* @vite-ignore */.
const HANDLER_PATH = '../../../client/src/components/grind-session/break-skip-all-handler';
async function loadHandler(): Promise<{
  handleSkipAllBreaksToday: (deps: any) => Promise<void>;
}> {
  return await import(/* @vite-ignore */ HANDLER_PATH);
}

const POPUP_PATH = '../../../client/src/components/BreakFeedbackPopup';
async function loadPopup(): Promise<any> {
  return await import(/* @vite-ignore */ POPUP_PATH);
}

function buildDeps(overrides: Partial<any> = {}) {
  return {
    apiRequest: vi.fn().mockResolvedValue({ breakAutoOpenEnabled: false }),
    setSkipBreaksToday: vi.fn(),
    setShowBreakDialog: vi.fn(),
    wasAutoOpenedRef: { current: true },
    setQueryData: vi.fn(),
    getQueryData: vi.fn().mockReturnValue({ breakAutoOpenEnabled: true }),
    toast: vi.fn(),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Bloco 1: testes da fn pura handleSkipAllBreaksToday
// -----------------------------------------------------------------------------

describe('handleSkipAllBreaksToday - happy path', () => {
  it('dispara apiRequest PUT /api/user-settings com breakAutoOpenEnabled: false', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);

    const calls = deps.apiRequest.mock.calls;
    const match = calls.find(
      (c: any[]) =>
        c[0] === 'PUT' &&
        c[1] === '/api/user-settings' &&
        c[2] &&
        c[2].breakAutoOpenEnabled === false
    );
    expect(match).toBeTruthy();
  });

  it('seta skipBreaksToday=true', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);
    expect(deps.setSkipBreaksToday).toHaveBeenCalledWith(true);
  });

  it('fecha modal (setShowBreakDialog(false))', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('limpa wasAutoOpenedRef.current = false', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);
    expect(deps.wasAutoOpenedRef.current).toBe(false);
  });

  it('setQueryData otimista para breakAutoOpenEnabled: false (chamado antes do PATCH)', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);

    const calls = deps.setQueryData.mock.calls;
    const match = calls.find((c: any[]) => {
      const payload = c[1];
      if (typeof payload === 'function') {
        const result = payload({ breakAutoOpenEnabled: true });
        return result?.breakAutoOpenEnabled === false;
      }
      return payload && payload.breakAutoOpenEnabled === false;
    });
    expect(match).toBeTruthy();
  });

  it('toast sucesso menciona "Auto-Break desativado" ou similar', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps();
    await handleSkipAllBreaksToday(deps);
    expect(deps.toast).toHaveBeenCalled();
    const arg = deps.toast.mock.calls[0][0];
    const flat = JSON.stringify(arg).toLowerCase();
    expect(flat).toMatch(/auto-break|desativ/);
  });

  it('HIGH-1: hidrata cache pos-PUT via setQueryData (apos otimismo + sucesso)', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps({
      apiRequest: vi.fn().mockResolvedValue({
        breakAutoOpenEnabled: false,
        otherField: 'fromServer',
      }),
    });
    await handleSkipAllBreaksToday(deps);

    // Apos o PUT resolver, deve haver um setQueryData adicional que aplica
    // o payload do servidor (merge defensivo). Verificamos que o ultimo
    // setQueryData call resolve para um state contendo otherField.
    const calls = deps.setQueryData.mock.calls;
    const last = calls[calls.length - 1];
    const updater = last[1];
    let result: any;
    if (typeof updater === 'function') {
      result = updater({ breakAutoOpenEnabled: true, existingField: 'kept' });
    } else {
      result = updater;
    }
    expect(result?.breakAutoOpenEnabled).toBe(false);
    expect(result?.otherField).toBe('fromServer');
  });
});

describe('handleSkipAllBreaksToday - error path', () => {
  it('apiRequest rejeita -> rollback (setQueryData chamado de volta com prev)', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps({
      apiRequest: vi.fn().mockRejectedValue(new Error('500 error')),
      getQueryData: vi.fn().mockReturnValue({ breakAutoOpenEnabled: true }),
    });
    await handleSkipAllBreaksToday(deps);

    const calls = deps.setQueryData.mock.calls;
    const rollback = calls.find((c: any[]) => {
      const payload = c[1];
      if (typeof payload === 'function') {
        const result = payload({ breakAutoOpenEnabled: false });
        return result?.breakAutoOpenEnabled === true;
      }
      return payload && payload.breakAutoOpenEnabled === true;
    });
    expect(rollback).toBeTruthy();
  });

  it('apiRequest rejeita -> toast erro disparado', async () => {
    const { handleSkipAllBreaksToday } = await loadHandler();
    const deps = buildDeps({
      apiRequest: vi.fn().mockRejectedValue(new Error('500 error')),
    });
    await handleSkipAllBreaksToday(deps);
    expect(deps.toast).toHaveBeenCalled();
    const allCalls = deps.toast.mock.calls;
    const errorToast = allCalls.find((c: any[]) => {
      const arg = c[0];
      const variant = arg?.variant ?? '';
      const flat = JSON.stringify(arg).toLowerCase();
      return variant === 'destructive' || flat.includes('erro') || flat.includes('falh');
    });
    expect(errorToast).toBeTruthy();
  });
});

// -----------------------------------------------------------------------------
// Bloco 2: integracao via BreakFeedbackPopup quando user clica botao
// -----------------------------------------------------------------------------

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BreakFeedbackPopup - onSkipAll prop callback', () => {
  it('clicar "Pular Todos os Breaks Hoje" dispara onSkipAll callback do parent', async () => {
    // Mock GET /api/break-feedbacks (chamada interna do popup) para retornar [].
    // Caso contrario, sessionBreaks vira undefined e BreakHistoryPopup quebra.
    const { apiRequest } = await import('../../../client/src/lib/queryClient');
    (apiRequest as any).mockImplementation(async (method: string) => {
      if (method === 'GET') return [];
      return { ok: true };
    });

    const onSkipAll = vi.fn();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    const { BreakFeedbackPopup } = await loadPopup();

    render(
      withClient(
        <BreakFeedbackPopup
          isOpen
          onClose={onClose}
          onSubmit={onSubmit}
          onSkip={onSkip}
          onSkipAll={onSkipAll}
          breakNumber={1}
          totalBreaks={8}
          sessionProgress={0}
          timeRemaining={360}
          isPending={false}
          sessionId="sess-1"
        />
      )
    );

    // Procura botao por texto. Spec menciona "Pular Todos os Breaks Hoje".
    const buttons = screen.queryAllByRole('button');
    const skipAllBtn = buttons.find((b) =>
      /pular.*todos.*break/i.test(b.textContent ?? '')
    );
    expect(skipAllBtn).toBeTruthy();
    if (skipAllBtn) {
      fireEvent.click(skipAllBtn);
    }

    await waitFor(() => {
      expect(onSkipAll).toHaveBeenCalled();
    });
  });
});
