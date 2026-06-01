import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// EST-6 / ADR-224 — PlanningWizard (RED phase, jsdom)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/coach/planning/PlanningWizard.tsx
//   (wizard embutido no chat do /coach-ai — diagrama planning-wizard-component-tree)
//
// Convencoes (lessons-learned):
//   - await import(...) p/ componentes React, NUNCA require() (lessons #14/#26/#38).
//   - vi.mock por PATH EXATO de @/lib/queryClient -> apiRequest retorna JSON
//     parseado direto (lesson #13).
//   - data-testid estavel (lesson #2): planning-step-{grind|study|lessons|themes},
//     planning-step-confirm-{step}, planning-step-skip-{step}, planning-summary.
//   - CTA de aula resolve p/ rota Wouter /biblioteca/curso/:courseSlug/:lessonSlug/play
//     (lesson #19 — guard). Stub do Link captura o href.
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

// Stub do Link do Wouter — captura href p/ guard de rota (lesson #19).
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, 'data-testid': rest['data-testid'] ?? 'wouter-link', ...rest }, children),
  useLocation: () => ['/coach-ai', vi.fn()],
}));

const SESSION_PENDING = {
  id: 'wps_1',
  userId: 'USER-0001',
  weekStartDate: '2026-06-08',
  status: 'in_progress',
  source: 'coach_manual',
  steps: {
    grind: { status: 'pending' },
    study: { status: 'pending' },
    lessons: { status: 'pending' },
    themes: { status: 'pending' },
  },
};

// Path em variavel: evita o import-analysis ESTATICO do Vite (que aborta o
// arquivo inteiro com "Failed to resolve import" quando o modulo ainda nao
// existe — RED phase). Com o specifier dinamico, a resolucao acontece em
// runtime e cada teste falha individualmente ate o implementer criar o modulo.
const WIZARD_PATH = '../../../client/src/components/coach/planning/PlanningWizard';
async function loadWizard() {
  const mod: any = await import(/* @vite-ignore */ WIZARD_PATH);
  return mod.PlanningWizard ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderWizard(props: any = {}) {
  const PlanningWizard = await loadWizard();
  return render(
    <QueryClientProvider client={makeClient()}>
      <PlanningWizard weekStartDate="2026-06-08" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/coach\/planning\/2026-06-08$/.test(url)) {
      return SESSION_PENDING;
    }
    if (method === 'POST' && /\/start$/.test(url)) return { session: SESSION_PENDING };
    if (/\/propose$/.test(url)) return { preview: { proposed: [] }, step: 'grind', status: 'proposed' };
    if (/\/confirm$/.test(url)) return { session: SESSION_PENDING, stepResult: {} };
    if (/\/skip$/.test(url)) return { session: SESSION_PENDING };
    return null;
  });
});

describe('<PlanningWizard> — render dos 4 step cards', () => {
  it('renderiza os 4 cards de passo (grind/study/lessons/themes)', async () => {
    await renderWizard();
    await waitFor(() => {
      expect(screen.getByTestId('planning-step-grind')).toBeInTheDocument();
    });
    expect(screen.getByTestId('planning-step-study')).toBeInTheDocument();
    expect(screen.getByTestId('planning-step-lessons')).toBeInTheDocument();
    expect(screen.getByTestId('planning-step-themes')).toBeInTheDocument();
  });
});

describe('<PlanningWizard> — CTAs de confirm/skip disparam mutation', () => {
  it('clicar confirm do passo grind dispara POST .../step/grind/confirm', async () => {
    await renderWizard();
    const confirmBtn = await screen.findByTestId('planning-step-confirm-grind');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) =>
          method === 'POST' && /\/api\/coach\/planning\/2026-06-08\/step\/grind\/confirm$/.test(url),
      );
      expect(called).toBe(true);
    });
  });

  it('clicar skip do passo study dispara POST .../step/study/skip', async () => {
    await renderWizard();
    const skipBtn = await screen.findByTestId('planning-step-skip-study');
    fireEvent.click(skipBtn);
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) =>
          method === 'POST' && /\/api\/coach\/planning\/2026-06-08\/step\/study\/skip$/.test(url),
      );
      expect(called).toBe(true);
    });
  });
});

describe('<PlanningWizard> — CTA de aula resolve para rota Wouter existente (lesson #19)', () => {
  it('o link de aula aponta para /biblioteca/curso/:courseSlug/:lessonSlug/play', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/coach\/planning\/2026-06-08$/.test(url)) {
        return {
          ...SESSION_PENDING,
          steps: {
            ...SESSION_PENDING.steps,
            lessons: {
              status: 'confirmed',
              lessons: [
                { id: 'l_1', courseSlug: 'antes-das-cartas', lessonSlug: 'aula-1', title: 'Aula 1' },
              ],
            },
          },
        };
      }
      return null;
    });
    await renderWizard();
    const link = await screen.findByTestId('planning-lesson-cta-l_1');
    // Rota Wouter registrada em App.tsx:160 — /biblioteca/curso/:courseSlug/:lessonSlug/play
    expect(link.getAttribute('href')).toMatch(
      /^\/biblioteca\/curso\/antes-das-cartas\/aula-1(\/play)?(\?.*)?$/,
    );
  });
});

describe('<PlanningWizard> — resumo ao concluir (status=completed)', () => {
  it('exibe planning-summary quando a sessao esta completed', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/coach\/planning\/2026-06-08$/.test(url)) {
        return {
          ...SESSION_PENDING,
          status: 'completed',
          steps: {
            grind: { status: 'confirmed', createdIds: ['pt_1'] },
            study: { status: 'confirmed', sessionIds: ['ss_1'] },
            lessons: { status: 'confirmed', lessonIds: ['l_1'] },
            themes: { status: 'skipped' },
          },
        };
      }
      return null;
    });
    await renderWizard();
    await waitFor(() => {
      expect(screen.getByTestId('planning-summary')).toBeInTheDocument();
    });
  });
});

describe('<PlanningWizard> — useQuery sem provider cai em ErrorBoundary (lesson #29)', () => {
  it('renderiza standalone sem QueryClientProvider sem derrubar a arvore (fallback silencioso)', async () => {
    const PlanningWizard = await loadWizard();
    // Sem QueryClientProvider: o fetcher interno (useQuery) deve ser isolado por
    // ErrorBoundary local, sem lancar "No QueryClient set" pra cima.
    expect(() =>
      render(<PlanningWizard weekStartDate="2026-06-08" />),
    ).not.toThrow();
  });
});
