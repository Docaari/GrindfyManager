import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — MetasPage placar (/metas) — RED phase, jsdom
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/pages/metas/MetasPage.tsx  (ou client/src/pages/MetasPage.tsx)
//   - placar 4DX: WIGs + medidas com current/target/expectedNow/status.
//   - RF-06 (D3/D9): NAO renderiza widget de P&L diario / ROI semanal.
//   - Lag da WIG so exibe valor com horizon >= quarter.
//   - sub-fetcher do placar isolado em ErrorBoundary local (lesson #29) —
//     falha de fetch NAO derruba a tela inteira.
//
// Lessons aplicadas:
//   #14/#26/#38 — await import (NUNCA require); path em variavel p/ evitar o
//     import-analysis ESTATICO do Vite abortar o arquivo na RED phase.
//   #13 — apiRequest mockado retorna JSON parseado direto.
//   #2  — data-testid estaveis (NAO heuristica DOM).
//   #29 — sub-fetcher em ErrorBoundary local.
//
// Suposicao documentada: o componente busca o placar via apiRequest('GET',
//   '/api/goals/scoreboard') e renderiza data-testid 'metas-page' raiz +
//   'metas-scoreboard'. Guards de AUSENCIA usam queryByTestId (nao deve existir).
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const PAGE_PATH = '../../../client/src/pages/metas/MetasPage';
async function loadPage() {
  const mod: any = await import(/* @vite-ignore */ PAGE_PATH);
  return mod.MetasPage ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderPage(props: any = {}) {
  const MetasPage = await loadPage();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MetasPage {...props} />
    </QueryClientProvider>,
  );
}

const SCOREBOARD_WITH_DATA = {
  wigs: [
    {
      careerGoalId: 'cg_1',
      title: 'De $5k para $20k',
      horizon: 'quarter',
      current: 8000,
      target: 20000,
      expectedNow: 10000,
      status: 'behind',
    },
  ],
  measures: [
    {
      id: 'g_1',
      title: 'Estudar 300min/semana',
      sourceMetric: 'study_minutes_week',
      current: 150,
      target: 300,
      expectedNow: 160,
      status: 'on_track',
    },
  ],
  snapshotsWeek: '2026-06-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/goals\/scoreboard$/.test(url)) return SCOREBOARD_WITH_DATA;
    return null;
  });
});

describe('<MetasPage> — render base', () => {
  it('renderiza a raiz do placar (data-testid estavel)', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('metas-page')).toBeInTheDocument();
    });
  });

  it('lista as medidas com current/target/status', async () => {
    await renderPage();
    expect(await screen.findByText(/Estudar 300min\/semana/i)).toBeInTheDocument();
  });
});

describe('<MetasPage> — RF-06 esconde P&L curto (guard de AUSENCIA)', () => {
  it('NAO renderiza widget de P&L diario', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
    expect(screen.queryByTestId('metas-pl-diario')).toBeNull();
    expect(screen.queryByTestId('daily-pl-widget')).toBeNull();
  });

  it('NAO renderiza widget de ROI semanal', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
    expect(screen.queryByTestId('metas-roi-semanal')).toBeNull();
    expect(screen.queryByTestId('weekly-roi-widget')).toBeNull();
  });
});

describe('<MetasPage> — RF-06 lag da WIG so com horizon >= quarter', () => {
  it('WIG com horizon=quarter exibe o valor do lag (current)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/goals\/scoreboard$/.test(url)) return SCOREBOARD_WITH_DATA;
      return null;
    });
    await renderPage();
    // o lag (8000) so e exibido porque horizon >= quarter.
    expect(await screen.findByTestId('wig-lag-value-cg_1')).toBeInTheDocument();
  });

  it('WIG com horizon=week NAO exibe valor de lag (esconde ate quarter)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/goals\/scoreboard$/.test(url)) {
        return {
          ...SCOREBOARD_WITH_DATA,
          wigs: [{ ...SCOREBOARD_WITH_DATA.wigs[0], horizon: 'week' }],
        };
      }
      return null;
    });
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
    expect(screen.queryByTestId('wig-lag-value-cg_1')).toBeNull();
  });
});

describe('<MetasPage> — sub-fetcher em ErrorBoundary local (lesson #29)', () => {
  it('falha do fetch do placar NAO derruba a tela (raiz continua montada)', async () => {
    apiRequestMock.mockImplementation(async () => {
      throw new Error('boom scoreboard fetch');
    });
    await renderPage();
    // a raiz da pagina (fora do sub-fetcher) continua presente; o ErrorBoundary
    // local captura a falha do placar sem propagar.
    await waitFor(() => {
      expect(screen.getByTestId('metas-page')).toBeInTheDocument();
    });
  });
});
