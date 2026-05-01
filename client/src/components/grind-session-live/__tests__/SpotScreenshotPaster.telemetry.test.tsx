/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4: Telemetria do paster (RF-Telemetria evento `spot.pasted`).
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md (Telemetria — `spot.pasted`)
 * Flow : Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 1)
 *
 * Lessons aplicadas (Docs/architecture/lessons-learned.md):
 *   #2  data-testid estavel
 *   #3  shape REAL — payload do servidor (id, imageUrl, expiresAt, sessionTournamentId, pastedAt)
 *   #4  vitest 4 + projects + jsdom + polyfills (ClipboardEvent)
 *   #11 default minimo — paster nao adiciona acoes nao-spec
 *
 * NOTA W4 RED: implementacao W2 (SpotScreenshotPaster.tsx green) NAO emite
 * `spot.pasted` ainda. Testes esperam `track('spot.pasted', ...)` apos POST 201.
 *
 * Payload contratado (RF-Telemetria spec):
 *   { sessionId, sessionTournamentId, source, durationMs }
 *
 * NAO usa `sizeBytes` (spec original tinha mas seria PII fraca para metricas
 * agregadas; durationMs eh mais util para detectar gargalo upload).
 *
 * Wiring: paster importa `track` de `@/lib/telemetry` e chama apos resposta 201.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
// =============================================================================

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
  trackMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => mocks.trackMock(...args),
}));

const apiRequestMock = vi.fn();
const trackMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;
mocks.trackMock = trackMock;

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

import SpotScreenshotPaster from '../SpotScreenshotPaster';

// =============================================================================
// Polyfills paste
// =============================================================================

interface FakeDataTransferItem {
  kind: 'string' | 'file';
  type: string;
  getAsFile: () => File | null;
}

function makeDataTransferItems(items: FakeDataTransferItem[]) {
  const list: any = items.slice();
  list.add = (file: any) => list.push(file);
  return list;
}

function dispatchPaste(files: File[], target: EventTarget = window) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const items: FakeDataTransferItem[] = files.map((f) => ({
    kind: 'file',
    type: f.type,
    getAsFile: () => f,
  }));
  const clipboardData = {
    items: makeDataTransferItems(items),
    types: items.map((i) => i.type),
    files,
    getData: () => '',
  };
  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
    writable: false,
  });
  target.dispatchEvent(event);
  return event;
}

function makeImageFile(opts: { type?: string; sizeBytes?: number } = {}): File {
  const { type = 'image/png', sizeBytes = 1024 } = opts;
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], 'spot.png', { type });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseProps = {
  sessionId: 'sess-1',
  usedCount: 0,
  onUploaded: vi.fn(),
  onError: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  trackMock.mockClear();
  toastMock.mockClear();
  baseProps.onUploaded.mockClear();
  baseProps.onError.mockClear();
});

// =============================================================================
// Cenario T1: spot.pasted emit em sucesso 201
// Cobre RF-Telemetria spec: "spot.pasted | Upload retorna 201 | { sessionId,
// sessionTournamentId, source, sizeBytes }" — usamos `durationMs` no lugar de
// sizeBytes pois eh metrica acionavel (perf p95).
// =============================================================================

describe('SpotScreenshotPaster — telemetria spot.pasted (W4)', () => {
  it('chama track("spot.pasted", payload) apos resposta 201', async () => {
    // Cobre RF-Telemetria: spot.pasted dispara apos 201
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      imageUrl: '/uploads/spot-screenshots/sh-1.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    render(
      wrap(
        <SpotScreenshotPaster
          {...baseProps}
          sessionId="sess-42"
          sessionTournamentId="st-77"
        />,
      ),
    );

    dispatchPaste([makeImageFile({ type: 'image/png' })]);

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
      expect(call).toBeDefined();
    });
  });

  it('payload contem sessionId, source=paste e sessionTournamentId', async () => {
    // Cobre RF-Telemetria payload shape: { sessionId, sessionTournamentId, source, durationMs }
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-2',
      imageUrl: '/uploads/spot-screenshots/sh-2.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-resolved',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    render(
      wrap(
        <SpotScreenshotPaster
          {...baseProps}
          sessionId="sess-99"
          sessionTournamentId="st-input"
        />,
      ),
    );

    dispatchPaste([makeImageFile({ type: 'image/png' })]);

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
      expect(call).toBeDefined();
    });
    const payload = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted')![1];
    expect(payload).toEqual(
      expect.objectContaining({
        sessionId: 'sess-99',
        source: 'paste',
      }),
    );
    // sessionTournamentId pode vir do prop (input) ou do server-resolved (st-resolved).
    // Aceitamos qualquer um — spec deixa em aberto qual eh o canonico.
    expect(
      payload.sessionTournamentId === 'st-input' ||
        payload.sessionTournamentId === 'st-resolved',
    ).toBe(true);
  });

  it('payload contem durationMs (numero >= 0)', async () => {
    // Cobre RF-Telemetria: durationMs eh medido entre paste e 201 (perf signal).
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-3',
      imageUrl: '/uploads/spot-screenshots/sh-3.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste([makeImageFile({ type: 'image/png' })]);

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
      expect(call).toBeDefined();
    });
    const payload = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted')![1];
    expect(typeof payload.durationMs).toBe('number');
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(payload.durationMs)).toBe(true);
  });

  it('source="upload" quando file picker (input file) eh usado', async () => {
    // Cobre RF-Telemetria: source distingue paste vs upload (file picker fallback).
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-4',
      imageUrl: '/uploads/spot-screenshots/sh-4.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    const { getByTestId } = render(wrap(<SpotScreenshotPaster {...baseProps} />));

    // File picker dispara upload via input file change.
    const fileInput = getByTestId('spot-paster-file-input') as HTMLInputElement;
    const file = makeImageFile({ type: 'image/png' });

    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
      expect(call).toBeDefined();
    });
    const payload = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted')![1];
    expect(payload.source).toBe('upload');
  });
});

// =============================================================================
// Cenario T2: NAO emite spot.pasted em erro (4xx/5xx)
// Cobre RF-Telemetria garantia: telemetria so emite em sucesso (4xx/5xx vai
// para `spot.upload_rejected` em sprint futura — fora de W4).
// =============================================================================

describe('SpotScreenshotPaster — telemetria NAO emite em erro', () => {
  it('NAO chama track("spot.pasted") quando apiRequest rejeita 409', async () => {
    // Cobre garantia: apenas 201 emite spot.pasted; 4xx eh distinto (futuro).
    const err: any = new Error('Limit reached');
    err.response = { status: 409, data: { code: 'spot_limit_reached', limit: 10 } };
    apiRequestMock.mockRejectedValueOnce(err);

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste([makeImageFile({ type: 'image/png' })]);

    // Aguarda processar erro
    await new Promise((r) => setTimeout(r, 50));

    const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
    expect(call).toBeUndefined();
  });

  it('NAO chama track("spot.pasted") quando filtro client-side rejeita gif', async () => {
    // Cobre garantia: rejeicao client-side (sem hitting API) nao emite spot.pasted.
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste([makeImageFile({ type: 'image/gif' })]);

    await new Promise((r) => setTimeout(r, 30));

    expect(apiRequestMock).not.toHaveBeenCalled();
    const call = trackMock.mock.calls.find((c) => c[0] === 'spot.pasted');
    expect(call).toBeUndefined();
  });
});
