import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — MetasNova form (/metas/nova) — RED phase, jsdom
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/pages/metas/MetasNovaPage.tsx (ou client/src/pages/MetasNovaPage.tsx)
//   - form de criacao de WIG (D1) e medida de direcao (D2).
//   - submit dispara POST /api/goals via apiRequest (JSON parseado direto, #13).
//   - data-testid estaveis (lesson #2): metas-nova-form, toggle WIG/medida,
//     campos, botao submit.
//
// Lessons aplicadas:
//   #14/#26/#38 — await import (path em variavel evita import-analysis estatico).
//   #13 — apiRequest retorna JSON parseado direto.
//   #2  — data-testid estaveis (NAO heuristica DOM como findByText percorrendo).
//
// Suposicao documentada (ADR ambiguo sobre os testids exatos do form):
//   - raiz 'metas-nova-form'; toggle de tipo 'metas-kind-wig' / 'metas-kind-measure';
//     botao de submit 'metas-nova-submit'. Se o implementer usar outros nomes,
//     NAO modifica o teste — documenta o impedimento (regra TDD da casa).
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const PAGE_PATH = '../../../client/src/pages/metas/MetasNovaPage';
async function loadPage() {
  const mod: any = await import(/* @vite-ignore */ PAGE_PATH);
  return mod.MetasNovaPage ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderPage(props: any = {}) {
  const MetasNovaPage = await loadPage();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MetasNovaPage {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && /\/api\/goals$/.test(url)) {
      return { id: 'created_1', status: 'draft' }; // JSON parseado direto (#13)
    }
    return null;
  });
});

describe('<MetasNovaPage> — render base', () => {
  it('renderiza o form de criacao (data-testid estavel)', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('metas-nova-form')).toBeInTheDocument();
    });
  });

  it('oferece os modos WIG e medida (toggle estavel)', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-nova-form')).toBeInTheDocument());
    expect(screen.getByTestId('metas-kind-wig')).toBeInTheDocument();
    expect(screen.getByTestId('metas-kind-measure')).toBeInTheDocument();
  });
});

describe('<MetasNovaPage> — submit dispara POST /api/goals (#13)', () => {
  it('o botao de submit existe (data-testid estavel)', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-nova-form')).toBeInTheDocument());
    expect(screen.getByTestId('metas-nova-submit')).toBeInTheDocument();
  });

  it('submeter o form chama apiRequest POST /api/goals', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-nova-form')).toBeInTheDocument());
    const submit = screen.getByTestId('metas-nova-submit');
    fireEvent.click(submit);
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'POST' && /\/api\/goals$/.test(url),
      );
      expect(called).toBe(true);
    });
  });
});
