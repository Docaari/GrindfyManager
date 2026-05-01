import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — useSpotUpload(sessionId)
//
// Spec: Docs/specs/spot-screenshots.md (RF-05 dialog + mutation, error handling)
// Sequence: Docs/architecture/diagrams/spot-screenshots-sequences.mermaid (Fluxo 1)
//
// Hook NAO existe ainda — Implementer cria em:
//   client/src/hooks/useSpotUpload.ts
// (ou client/src/components/grind-session-live/useSpotUpload.ts)
//
// Contrato:
//   const { mutate, isPending, error } = useSpotUpload(sessionId);
//   mutate({
//     tournamentId: string,
//     type: string,
//     spot: string,
//     notes?: string,
//     imageBuffer?: ArrayBuffer | Buffer,
//     mimeType?: string,
//     capturedDuring?: 'grind-live' | 'cooldown',
//   })
//
// Comportamento:
//   - Envia multipart/form-data quando imageBuffer presente; JSON puro caso
//     contrario.
//   - Sucesso: invalida ['starred-hands', sessionId] no QueryClient.
//   - 413 -> toast "Imagem grande demais (max 5MB)"
//   - 400 -> toast generico
//   - 409 com code "star_limit_reached" OU "session_spot_limit_reached" ->
//     toast "Limite atingido"
//   - 409 com code "session_completed" -> toast "Sessao concluida"
//   - Loading state exposto (isPending true durante request).
// =============================================================================

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// apiRequest abstrai fetch + CSRF + refresh — pattern usado em todo o frontend.
// Mocamos para validar payloads sem rodar fetch real.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return {
    ...actual,
    apiRequest: (...args: any[]) => apiRequestMock(...args),
  };
});

// @ts-expect-error - hook ainda nao implementado (red phase)
import { useSpotUpload } from '@/hooks/useSpotUpload';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  toastMock.mockClear();
  apiRequestMock.mockReset();
});

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// =============================================================================
// Loading state
// =============================================================================

describe('useSpotUpload - loading state', () => {
  it('isPending true enquanto mutation em curso, false apos resolver', async () => {
    let resolveFn: (v: any) => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () => new Promise((r) => { resolveFn = r; }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.mutate({
        tournamentId: 'st_1',
        type: 'tilt',
        spot: 'river',
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    act(() => {
      resolveFn({ id: 'sh_1' });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

// =============================================================================
// Multipart com imagem
// =============================================================================

describe('useSpotUpload - multipart com imagem', () => {
  it('envia multipart/form-data com file + metadata quando imageBuffer presente', async () => {
    apiRequestMock.mockResolvedValue({ id: 'sh_NEW', imageKey: 'k' });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      await result.current.mutate({
        tournamentId: 'st_1',
        type: 'tilt',
        spot: 'river',
        notes: 'grim',
        imageBuffer: PNG_BYTES,
        mimeType: 'image/png',
        capturedDuring: 'grind-live',
      });
    });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const args = apiRequestMock.mock.calls[0];
    // O hook pode chamar apiRequest('POST', '/api/starred-hands', body) ou
    // similar — validamos que o payload contem multipart-relevante.
    const flat = JSON.stringify(args);
    expect(flat).toMatch(/starred-hands/);
    // O body deve ser FormData OU objeto com flag multipart — ambos aceitaveis.
    const body = args.find(
      (a: any) =>
        (typeof FormData !== 'undefined' && a instanceof FormData) ||
        (a && typeof a === 'object' && (a.imageBuffer || a.file)),
    );
    expect(body).toBeTruthy();
  });

  it('envia JSON puro (sem file) quando imageBuffer ausente — back-compat', async () => {
    apiRequestMock.mockResolvedValue({ id: 'sh_NEW' });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      await result.current.mutate({
        tournamentId: 'st_1',
        type: 'tilt',
        spot: 'river',
      });
    });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const args = apiRequestMock.mock.calls[0];
    const flat = JSON.stringify(args);
    expect(flat).not.toMatch(/multipart|FormData/);
    expect(flat).toMatch(/tilt/);
    expect(flat).toMatch(/river/);
  });
});

// =============================================================================
// Sucesso: invalida cache
// =============================================================================

describe('useSpotUpload - sucesso invalida query', () => {
  it('apos sucesso, ["starred-hands", sessionId] eh marcada como stale/invalidated', async () => {
    apiRequestMock.mockResolvedValue({ id: 'sh_NEW' });

    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      await result.current.mutate({
        tournamentId: 'st_1',
        type: 'tilt',
        spot: 'river',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    // queryKey deve incluir 'starred-hands' e 'ses_1'
    const calls = invalidateSpy.mock.calls;
    const flat = JSON.stringify(calls);
    expect(flat).toMatch(/starred-hands/);
    expect(flat).toMatch(/ses_1/);
  });
});

// =============================================================================
// Errors -> toasts especificos
// =============================================================================

describe('useSpotUpload - erro 413 (imagem grande)', () => {
  it('toast "Imagem grande demais" quando servidor retorna 413', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('Payload Too Large'), { status: 413 }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      try {
        await result.current.mutate({
          tournamentId: 'st_1',
          type: 'tilt',
          spot: 'river',
          imageBuffer: PNG_BYTES,
          mimeType: 'image/png',
        });
      } catch {
        /* mutation propaga error; o hook ainda deve disparar toast */
      }
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(toastArg)).toMatch(/grande|5\s?MB|tamanho/i);
  });
});

describe('useSpotUpload - erro 400 generico', () => {
  it('toast generico quando servidor retorna 400', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), {
        status: 400,
        body: { message: 'Body invalido' },
      }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      try {
        await result.current.mutate({
          tournamentId: 'st_1',
          type: 'tilt',
          spot: 'river',
        });
      } catch {
        /* swallow */
      }
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });
});

describe('useSpotUpload - erro 409 cap atingido', () => {
  it('toast "Limite atingido" quando 409 com code star_limit_reached', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('Limit'), {
        status: 409,
        body: { code: 'star_limit_reached', message: 'Maximo 3' },
      }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      try {
        await result.current.mutate({
          tournamentId: 'st_1',
          type: 'tilt',
          spot: 'river',
        });
      } catch {
        /* swallow */
      }
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(toastArg)).toMatch(/limite|cap|3 spots|atingido/i);
  });

  it('toast "Limite atingido" quando 409 com code session_spot_limit_reached', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('Limit'), {
        status: 409,
        body: {
          code: 'session_spot_limit_reached',
          message: 'Cap de 10',
        },
      }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      try {
        await result.current.mutate({
          tournamentId: 'st_1',
          type: 'tilt',
          spot: 'river',
        });
      } catch {
        /* swallow */
      }
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(toastArg)).toMatch(/limite|10|cap|atingido/i);
  });
});

describe('useSpotUpload - erro 409 sessao completed', () => {
  it('toast "Sessao concluida" quando 409 com code session_completed', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('Conflict'), {
        status: 409,
        body: { code: 'session_completed', message: 'Sessao ja concluida' },
      }),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSpotUpload('ses_1'), { wrapper });

    await act(async () => {
      try {
        await result.current.mutate({
          tournamentId: 'st_1',
          type: 'tilt',
          spot: 'river',
        });
      } catch {
        /* swallow */
      }
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(toastArg)).toMatch(/concluida|conclu|completed/i);
  });
});
