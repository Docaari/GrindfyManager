import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-05 (Secao no tema)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-05)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/studies/MdaReadsSection.tsx
//   - GET /api/mda-reads/by-theme?themeId= -> cards (thumbnail + titulo +
//     tendencia truncada + stat badge).
//   - Click no card -> navega /estudos/mda/:id.
//   - CTA "Registrar MDA" -> /estudos/mda/registrar?themeId=<themeId>.
//   - Estado vazio: mensagem PT-BR + CTA (sem acoes default decorativas, #11).
//
// Lessons: #13 (apiRequest JSON parseado), #2 (data-testid estavel), #14/#38
//   (await import; SO await import neste arquivo).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/temas/t1', navigateMock],
  Link: ({ children }: any) => children,
}));

const SECTION_PATH = '../../../client/src/components/studies/MdaReadsSection';
async function loadSection() {
  const mod: any = await import(/* @vite-ignore */ SECTION_PATH);
  return mod.MdaReadsSection ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderSection(props: any = {}) {
  const MdaReadsSection = await loadSection();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MdaReadsSection themeId="t1" {...props} />
    </QueryClientProvider>,
  );
}

const READS = [
  {
    id: 'read_1', title: 'Pop overfolda turn', statId: 'vpip',
    tendencyText: 'A populacao da fold demais no turn — sobre-bluff barrel.',
    images: [{ id: 'img_1', url: '/api/mda-reads/read_1/images/img_1', caption: 'c' }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/mda-reads\/by-theme/.test(url)) {
      return READS;
    }
    return null;
  });
});

// =============================================================================
// Render com reads
// =============================================================================

describe('<MdaReadsSection> — lista MDAs do tema', () => {
  it('renderiza a secao (data-testid estavel)', async () => {
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('mda-reads-section')).toBeInTheDocument());
  });

  it('lista um card por MDA do tema (titulo + tendencia)', async () => {
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('mda-read-card-read_1')).toBeInTheDocument());
    expect(screen.getByText('Pop overfolda turn')).toBeInTheDocument();
  });

  it('carrega via by-theme do themeId', async () => {
    await renderSection();
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'GET' && /\/api\/mda-reads\/by-theme\?themeId=t1/.test(url),
      );
      expect(called).toBe(true);
    });
  });
});

// =============================================================================
// Navegacao: card -> detalhe; CTA -> registrar
// =============================================================================

describe('<MdaReadsSection> — navegacao', () => {
  it('click no card navega para /estudos/mda/:id', async () => {
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('mda-read-card-read_1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mda-read-card-read_1'));
    await waitFor(() => {
      const navigated = navigateMock.mock.calls.some(
        ([to]) => typeof to === 'string' && /\/estudos\/mda\/read_1/.test(to),
      );
      expect(navigated).toBe(true);
    });
  });

  it('CTA "Registrar MDA" leva a /estudos/mda/registrar?themeId=t1', async () => {
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('mda-reads-section')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mda-reads-register-cta'));
    await waitFor(() => {
      const navigated = navigateMock.mock.calls.some(
        ([to]) => typeof to === 'string' && /\/estudos\/mda\/registrar\?themeId=t1/.test(to),
      );
      expect(navigated).toBe(true);
    });
  });
});

// =============================================================================
// Estado vazio
// =============================================================================

describe('<MdaReadsSection> — estado vazio', () => {
  it('mostra placeholder PT-BR + CTA quando nao ha MDAs', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/mda-reads\/by-theme/.test(url)) return [];
      return null;
    });
    await renderSection();
    await waitFor(() => expect(screen.getByTestId('mda-reads-empty')).toBeInTheDocument());
    // CTA continua presente no estado vazio.
    expect(screen.getByTestId('mda-reads-register-cta')).toBeInTheDocument();
  });
});
