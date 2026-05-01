// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — HudOcrUpload (RF-08 frontend)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-08 endpoint POST ocr-extract)
// ADR  : 065 (OCR via Claude Vision)
//
// Componente NAO existe ainda — Implementer criara em
// `client/src/components/studies/stats/HudOcrUpload.tsx`.
//
// Comportamentos:
//   - Drag-drop area data-testid="ocr-upload-dropzone"
//   - File input fallback
//   - Preview thumbnail antes de upload
//   - Cancel pre-upload limpa estado
//   - Submit POST multipart/form-data
//   - Loading state durante OCR
//   - Error toast se 503/429/422
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: toastMock,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockReset();
});

// Componente NAO existe ainda — red phase
import HudOcrUpload from '@/components/studies/stats/HudOcrUpload';

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const baseProps = {
  layoutId: 'lyt-1',
  onExtracted: vi.fn(),
};

describe('<HudOcrUpload /> — render', () => {
  it('renderiza dropzone com data-testid ocr-upload-dropzone', () => {
    render(withQuery(<HudOcrUpload {...baseProps} />));
    expect(screen.getByTestId('ocr-upload-dropzone')).toBeInTheDocument();
  });

  it('renderiza file input fallback type=file', () => {
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('type')).toBe('file');
  });
});

describe('<HudOcrUpload /> — pre-upload preview', () => {
  it('selecionar arquivo mostra preview thumbnail', () => {
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array(100)], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    expect(screen.queryByTestId('ocr-upload-preview')).not.toBeNull();
  });

  it('cancel pre-upload limpa preview', () => {
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array(100)], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId('ocr-upload-cancel'));
    expect(screen.queryByTestId('ocr-upload-preview')).toBeNull();
  });
});

describe('<HudOcrUpload /> — submit', () => {
  it('submit dispara apiRequest POST /api/stats-analyzer/ocr-extract', async () => {
    apiRequestMock.mockResolvedValue({ stats: [], unmatched: [], imageKey: 'k', cached: false });
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array(100)], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId('ocr-upload-submit'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const [method, url] = apiRequestMock.mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toMatch(/stats-analyzer\/ocr-extract/);
  });

  it('loading state visivel durante request', async () => {
    let resolver: any;
    apiRequestMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array(100)], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId('ocr-upload-submit'));
    await waitFor(() => {
      expect(screen.queryByTestId('ocr-upload-loading')).not.toBeNull();
    });
    resolver({ stats: [], unmatched: [], imageKey: 'k', cached: false });
  });

  it('error toast em 503 (OCR indisponivel)', async () => {
    apiRequestMock.mockRejectedValue({ status: 503, message: 'OCR indisponivel' });
    render(withQuery(<HudOcrUpload {...baseProps} />));
    const input = screen.getByTestId('ocr-upload-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array(100)], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByTestId('ocr-upload-submit'));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });
});
