import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// EST-5 / ADR-226 — WeeklyReviewPanel (RED phase, jsdom)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/coach/weekly-review/WeeklyReviewPanel.tsx
//   (UI da maquina de estados do ritual; no estado `planning` monta
//    <PlanningWizard weekStartDate=...>; ErrorBoundary local — lesson #29).
//
// Convencoes (lessons-learned):
//   - await import(...) p/ componentes React, NUNCA require() (lessons #14/#26/#38).
//     NAO misturar await import + require no mesmo arquivo (#38).
//   - vi.mock por PATH EXATO de @/lib/queryClient -> apiRequest retorna JSON
//     parseado direto (lesson #13).
//   - PlanningWizard é mockado por path (este teste cobre o PAINEL, nao o wizard;
//     prova apenas que o painel o monta no estado planning — lesson #19/CTA-rota).
//   - data-testid estavel (lesson #2): weekly-review-panel, estados, CTAs.
//
// DEC-3: a UI obtem a weekStartDate corrente do SERVER (POST .../start no mount),
//   e le o estado via GET .../:weekStartDate. Nao duplica nextMondayUtc no client.
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

// Stub do PlanningWizard — captura a prop weekStartDate p/ provar a montagem (RF-08).
vi.mock('@/components/coach/planning/PlanningWizard', () => ({
  PlanningWizard: ({ weekStartDate }: any) =>
    React.createElement('div', { 'data-testid': 'planning-wizard-mounted', 'data-week': weekStartDate }, 'wizard'),
  default: ({ weekStartDate }: any) =>
    React.createElement('div', { 'data-testid': 'planning-wizard-mounted', 'data-week': weekStartDate }, 'wizard'),
}));

const REVIEW_AWAITING = {
  id: 'wr_1',
  userId: 'USER-0001',
  weekStartDate: '2026-06-08',
  status: 'awaiting_upload',
  recapContent: { schemaVersion: 1, markdown: 'Recap da semana. Importe em /upload', hasData: true },
  analysisContent: null,
};

// Path em variavel: evita o import-analysis ESTATICO do Vite (que aborta o arquivo
// com "Failed to resolve import" quando o modulo ainda nao existe — RED phase).
const PANEL_PATH = '../../../client/src/components/coach/weekly-review/WeeklyReviewPanel';
async function loadPanel() {
  const mod: any = await import(/* @vite-ignore */ PANEL_PATH);
  return mod.WeeklyReviewPanel ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderPanel(props: any = {}) {
  const WeeklyReviewPanel = await loadPanel();
  return render(
    <QueryClientProvider client={makeClient()}>
      <WeeklyReviewPanel {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    // DEC-3: mount chama POST /start (idempotente) p/ obter a review corrente.
    if (method === 'POST' && /\/api\/coach\/weekly-review\/start$/.test(url)) {
      return { review: REVIEW_AWAITING };
    }
    if (method === 'GET' && /\/api\/coach\/weekly-review\/2026-06-08$/.test(url)) {
      return { review: REVIEW_AWAITING };
    }
    if (/\/confirm-upload$/.test(url)) {
      return { review: { ...REVIEW_AWAITING, status: 'planning' }, uploadDetected: false, source: 'explicit' };
    }
    return null;
  });
});

describe('<WeeklyReviewPanel> — render base', () => {
  it('renderiza o painel da revisao semanal', async () => {
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-panel')).toBeInTheDocument();
    });
  });

  it('mostra o recap + CTA de confirmar upload no estado awaiting_upload', async () => {
    await renderPanel();
    expect(await screen.findByTestId('weekly-review-confirm-upload')).toBeInTheDocument();
  });
});

describe('<WeeklyReviewPanel> — CTA confirm-upload dispara mutation (RF-05)', () => {
  it('clicar "confirmar upload" dispara POST .../confirm-upload', async () => {
    await renderPanel();
    const btn = await screen.findByTestId('weekly-review-confirm-upload');
    fireEvent.click(btn);
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) =>
          method === 'POST' && /\/api\/coach\/weekly-review\/2026-06-08\/confirm-upload$/.test(url),
      );
      expect(called).toBe(true);
    });
  });
});

describe('<WeeklyReviewPanel> — estado planning monta o PlanningWizard (RF-08)', () => {
  it('quando review.status=planning, <PlanningWizard weekStartDate> é montado e visivel', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && /\/start$/.test(url)) {
        return { review: { ...REVIEW_AWAITING, status: 'planning' } };
      }
      if (method === 'GET' && /\/weekly-review\/2026-06-08$/.test(url)) {
        return { review: { ...REVIEW_AWAITING, status: 'planning' } };
      }
      return null;
    });
    await renderPanel();
    const wizard = await screen.findByTestId('planning-wizard-mounted');
    expect(wizard).toBeInTheDocument();
    // a chave de semana vem do server (DEC-3), nunca recalculada divergente no client.
    expect(wizard.getAttribute('data-week')).toBe('2026-06-08');
  });

  it('estado deep_analysis_done mostra CTA "montar plano da semana" (sem rota orfa — lesson #19)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && /\/start$/.test(url)) {
        return { review: { ...REVIEW_AWAITING, status: 'deep_analysis_done', analysisContent: { schemaVersion: 1, markdown: 'analise' } } };
      }
      if (method === 'GET' && /\/weekly-review\/2026-06-08$/.test(url)) {
        return { review: { ...REVIEW_AWAITING, status: 'deep_analysis_done', analysisContent: { schemaVersion: 1, markdown: 'analise' } } };
      }
      return null;
    });
    await renderPanel();
    expect(await screen.findByTestId('weekly-review-build-plan')).toBeInTheDocument();
  });
});

describe('<WeeklyReviewPanel> — empty state quando nao ha review (RF-08)', () => {
  it('sem review (start retorna null/404) mostra empty state sem crash', async () => {
    apiRequestMock.mockImplementation(async () => null);
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-empty')).toBeInTheDocument();
    });
  });
});

describe('<WeeklyReviewPanel> — query falha cai em ErrorBoundary/empty (lesson #29)', () => {
  it('renderiza standalone sem QueryClientProvider sem derrubar a arvore', async () => {
    const WeeklyReviewPanel = await loadPanel();
    // Sem QueryClientProvider: o fetcher interno (useQuery) deve ser isolado por
    // ErrorBoundary local, sem lancar "No QueryClient set" pra cima.
    expect(() => render(<WeeklyReviewPanel />)).not.toThrow();
  });

  it('apiRequest rejeita -> painel mostra fallback (empty/erro) sem crashar', async () => {
    apiRequestMock.mockRejectedValue(new Error('network down'));
    await renderPanel();
    // nao deve lancar; mostra algum fallback estavel.
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-panel')).toBeInTheDocument();
    });
  });
});
