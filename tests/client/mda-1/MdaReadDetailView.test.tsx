import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-07 (Detalhe)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-07, §"Regras de Negocio Detalhe")
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-4 soft delete)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/studies/MdaReadDetailView.tsx
//   - renderiza prints + campos + temas tagueados (chips) + acoes editar/excluir.
//   - excluir -> soft delete (DELETE /api/mda-reads/:id) com confirmacao (AlertDialog).
//   - imagem privada via <img src="/api/mda-reads/:id/images/:imageId">.
//
// Lessons: #13 (apiRequest JSON), #2 (data-testid estavel), #14/#38 (await import),
//   #1 (hooks antes de early return — responsabilidade impl).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/mda/read_1', navigateMock],
  Link: ({ children }: any) => children,
}));

const DETAIL_PATH = '../../../client/src/components/studies/MdaReadDetailView';
async function loadDetail() {
  const mod: any = await import(/* @vite-ignore */ DETAIL_PATH);
  return mod.MdaReadDetailView ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderDetail(props: any = {}) {
  const MdaReadDetailView = await loadDetail();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MdaReadDetailView readId="read_1" {...props} />
    </QueryClientProvider>,
  );
}

const READ = {
  id: 'read_1', title: 'Pop overfolda turn', statId: 'vpip',
  spotContext: 'BTN abre, BB defende',
  filters: 'SRP, flop 2-tone',
  tendencyText: 'A populacao da fold demais no turn — sobre-bluff barrel.',
  themeIds: ['t1', 't2'],
  images: [
    { id: 'img_1', url: '/api/mda-reads/read_1/images/img_1', caption: 'turn fold%' },
    { id: 'img_2', url: '/api/mda-reads/read_1/images/img_2', caption: 'river' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/mda-reads\/read_1$/.test(url)) return READ;
    if (method === 'DELETE' && /\/api\/mda-reads\/read_1$/.test(url)) return { ok: true };
    return null;
  });
});

// =============================================================================
// Render: campos + prints + chips de tema
// =============================================================================

describe('<MdaReadDetailView> — render', () => {
  it('renderiza o detalhe (data-testid estavel)', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
  });

  it('mostra o titulo + tendencia do MDA', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
    expect(screen.getByText('Pop overfolda turn')).toBeInTheDocument();
  });

  it('renderiza todos os prints (img privada via /api/mda-reads/:id/images/:imageId)', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
    expect(screen.getByTestId('mda-read-image-img_1')).toBeInTheDocument();
    expect(screen.getByTestId('mda-read-image-img_2')).toBeInTheDocument();
  });

  it('renderiza chips dos temas tagueados', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
    expect(screen.getByTestId('mda-detail-theme-chip-t1')).toBeInTheDocument();
    expect(screen.getByTestId('mda-detail-theme-chip-t2')).toBeInTheDocument();
  });
});

// =============================================================================
// Excluir -> soft delete com confirmacao
// =============================================================================

describe('<MdaReadDetailView> — excluir (soft delete)', () => {
  it('possui acao de excluir (data-testid estavel)', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
    expect(screen.getByTestId('mda-read-delete-btn')).toBeInTheDocument();
  });

  it('confirmar a exclusao dispara DELETE /api/mda-reads/:id', async () => {
    await renderDetail();
    await waitFor(() => expect(screen.getByTestId('mda-read-detail')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mda-read-delete-btn'));
    // Confirmacao (AlertDialog) -> botao confirmar.
    await waitFor(() => expect(screen.getByTestId('mda-read-delete-confirm')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mda-read-delete-confirm'));
    await waitFor(() => {
      const deleted = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'DELETE' && /\/api\/mda-reads\/read_1$/.test(url),
      );
      expect(deleted).toBe(true);
    });
  });
});
