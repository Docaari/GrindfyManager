/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W2: Integration GrindSession + SpotScreenshotPaster
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-01 + RF-07)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 1)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas:
 *   #1  Hooks primeiro
 *   #2  data-testid estavel
 *   #4  Vitest 4 + jsdom + projects
 *   #11 Default minimo (paster nao monta sem sessao ativa)
 *   #12 TanStack Query cache para usedCount (sobrevive re-mount)
 *
 * Estrategia (lesson-tts-wiring 2026-04-27): GrindSession.tsx tem ~1150 linhas
 * com >20 deps acopladas. Em vez de renderizar a pagina inteira (caro + frágil),
 * focamos em CONTRATO de mount via mock global de SpotScreenshotPaster:
 *   - Quando query /api/grind-sessions retorna sessao ativa => paster monta com
 *     props corretas (sessionId, usedCount).
 *   - Quando query /api/starred-hands/pending retorna 7 items => usedCount=7.
 *   - Sem sessao ativa => paster NAO monta.
 *
 * Mock pattern: vi.mock para queryClient + useToast + sub-pages pesados;
 * SpotScreenshotPaster substituido por probe que registra props recebidas.
 *
 * NOTA: imports de modulos NAO existentes ainda → red phase (paster, hook
 * `useSpotScreenshotsUsed` e GrindSession integration).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Probe: SpotScreenshotPaster substituido por componente leve que captura props
// e rendera testid contratado para asserts.
// =============================================================================

const pasterProbeCalls: any[] = [];

vi.mock('@/components/grind-session-live/SpotScreenshotPaster', () => ({
  __esModule: true,
  default: (props: any) => {
    pasterProbeCalls.push(props);
    return (
      <div
        data-testid="spot-paster-probe"
        data-session-id={props.sessionId ?? ''}
        data-used-count={String(props.usedCount ?? 0)}
        data-max-count={String(props.maxCount ?? 10)}
        data-disabled={String(!!props.disabled)}
      />
    );
  },
}));

// =============================================================================
// Mocks queryClient + apiRequest
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

// useToast mock global
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

// usePermission allow-all
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

// useWarmupGate fail-open (canStartGrind:true)
vi.mock('@/hooks/useWarmupGate', () => ({
  useWarmupGate: () => ({ canStartGrind: true, reason: null, isLoading: false }),
}));

vi.mock('@/hooks/useWarmupTelemetry', () => ({
  useWarmupTelemetry: () => ({ track: vi.fn() }),
}));

// Stub leve para wouter (nao queremos navegacao real)
const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/grind', setLocationMock],
  // coach-page-reform-1 passou a usar useSearch (query params na URL).
  useSearch: () => '',
  useRoute: () => [false, {}],
  Link: ({ children }: any) => children,
  Redirect: () => null,
}));

// Sub-paginas pesadas viram no-op
vi.mock('@/components/grind-session/EditSessionDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/components/grind-session/DeleteSessionDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/components/grind-session/RegisterSessionDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/components/grind-session/SessionDetailsDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/components/grind-session/ConflictDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/components/grind-session/SessionHistoryList', () => ({
  __esModule: true,
  default: () => <div data-testid="session-history-list-stub" />,
}));
vi.mock('@/components/grind-session/DashboardMetricsCards', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-metrics-cards-stub" />,
}));
vi.mock('@/components/AccessDenied', () => ({
  __esModule: true,
  default: ({ featureName }: any) => (
    <div data-testid="access-denied-stub">{featureName}</div>
  ),
}));

// =============================================================================
// Componente integrado (NAO existe ainda - red phase)
// =============================================================================
// Em W2 a integracao do paster acontece em GrindSession.tsx (pagina). O test
// importa GrindSession e valida que paster monta com base em queries.
//
// Caso o implementer extraia em sub-componente intermediario (ex.
// GrindSessionActive.tsx), o teste pode mudar o import. Em red-phase
// importamos GrindSession.tsx (modulo ja existe, mas sem integracao paster).
// O test FALHA porque:
//   - paster nao eh montado na red phase
//   - mocks de query novos (`/api/starred-hands/pending`) ainda nao consumidos
import GrindSession from '../GrindSession';

// =============================================================================
// Helpers
// =============================================================================

function setupApiRequestMock(opts: {
  activeSessions?: any[];
  pendingSpots?: any[];
}) {
  const { activeSessions = [], pendingSpots = [] } = opts;
  apiRequestMock.mockImplementation((method: string, url: string) => {
    if (method === 'GET' && url === '/api/grind-sessions') {
      return Promise.resolve(activeSessions);
    }
    if (method === 'GET' && url === '/api/grind-sessions/history') {
      return Promise.resolve([]);
    }
    if (method === 'GET' && url.startsWith('/api/planned-tournaments')) {
      return Promise.resolve([]);
    }
    if (method === 'GET' && url === '/api/preparation-logs/latest') {
      return Promise.resolve(null);
    }
    // RF-04 query nova - usedCount inicial
    if (method === 'GET' && url.startsWith('/api/starred-hands/pending')) {
      return Promise.resolve({
        items: pendingSpots,
        total: pendingSpots.length,
        limit: 50,
        offset: 0,
      });
    }
    return Promise.resolve([]);
  });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  pasterProbeCalls.length = 0;
  setLocationMock.mockClear();
});

// =============================================================================
// Cenario B1: Paster NAO monta sem sessao ativa
// Cobre RF-07 AC: "Paster so esta presente quando sessao ativa"
// =============================================================================

describe('GrindSession + SpotScreenshotPaster — sem sessao ativa', () => {
  it('NAO renderiza spot-paster-probe quando activeSessions vazio', async () => {
    setupApiRequestMock({ activeSessions: [], pendingSpots: [] });

    render(wrap(<GrindSession />));

    // Garante que o componente renderizou e queries dispararam
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/grind-sessions');
    });

    // Mesmo apos resolver, paster NAO deve montar
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('spot-paster-probe')).toBeNull();
    expect(pasterProbeCalls.length).toBe(0);
  });
});

// =============================================================================
// Cenario B2: Paster MONTA quando sessao ativa
// Cobre RF-07 AC: "Paster so monta quando sessao ativa"
// =============================================================================

describe('GrindSession + SpotScreenshotPaster — com sessao ativa', () => {
  it('renderiza spot-paster-probe quando activeSessions tem session status=active', async () => {
    const session = {
      id: 'sess-active-1',
      status: 'active',
      date: new Date().toISOString(),
      preparationPercentage: 80,
    };

    setupApiRequestMock({
      activeSessions: [session],
      pendingSpots: [],
    });

    render(wrap(<GrindSession />));

    await waitFor(() => {
      expect(screen.getByTestId('spot-paster-probe')).toBeInTheDocument();
    });

    expect(pasterProbeCalls.length).toBeGreaterThan(0);
    const props = pasterProbeCalls.at(-1);
    expect(props.sessionId).toBe('sess-active-1');
  });
});

// =============================================================================
// Cenario B3: usedCount vem de query /api/starred-hands/pending
// Cobre RF-07 AC: "Counter usa query para popular usedCount"
// =============================================================================

describe('GrindSession + SpotScreenshotPaster — usedCount via query', () => {
  it('passa usedCount=3 quando /pending retorna 3 items para a sessao ativa', async () => {
    const session = {
      id: 'sess-active-2',
      status: 'active',
      date: new Date().toISOString(),
      preparationPercentage: 80,
    };

    const items = [
      { id: 'sh-1', sessionId: 'sess-active-2', source: 'paste', status: 'pending' },
      { id: 'sh-2', sessionId: 'sess-active-2', source: 'paste', status: 'pending' },
      { id: 'sh-3', sessionId: 'sess-active-2', source: 'upload', status: 'pending' },
    ];

    setupApiRequestMock({
      activeSessions: [session],
      pendingSpots: items,
    });

    render(wrap(<GrindSession />));

    await waitFor(() => {
      expect(screen.getByTestId('spot-paster-probe')).toBeInTheDocument();
    });

    // Aguarda query secundaria de pending resolver
    await waitFor(() => {
      const lastProps = pasterProbeCalls.at(-1);
      expect(Number(lastProps?.usedCount ?? -1)).toBe(3);
    });

    // Confirma que GrindSession chamou /pending com sessionId=current
    const pendingCall = apiRequestMock.mock.calls.find(
      (c) =>
        c[0] === 'GET' &&
        typeof c[1] === 'string' &&
        c[1].startsWith('/api/starred-hands/pending') &&
        c[1].includes('sessionId=sess-active-2'),
    );
    expect(pendingCall).toBeDefined();
  });

  it('passa usedCount=0 quando /pending retorna lista vazia', async () => {
    const session = {
      id: 'sess-active-3',
      status: 'active',
      date: new Date().toISOString(),
      preparationPercentage: 80,
    };

    setupApiRequestMock({
      activeSessions: [session],
      pendingSpots: [],
    });

    render(wrap(<GrindSession />));

    await waitFor(() => {
      expect(screen.getByTestId('spot-paster-probe')).toBeInTheDocument();
    });

    await waitFor(() => {
      const lastProps = pasterProbeCalls.at(-1);
      expect(Number(lastProps?.usedCount ?? -1)).toBe(0);
    });
  });
});

// =============================================================================
// Cenario B4: Paste com sucesso refetch query e counter incrementa
// Cobre RF-01 AC + RF-07 AC: "Paste com sucesso: fluxo completo, query refetch,
// counter incrementa". Aqui validamos o contrato de invalidate via prop callback
// `onUploaded` ou via TanStack invalidateQueries.
// =============================================================================

describe('GrindSession + SpotScreenshotPaster — refetch apos onUploaded', () => {
  it('apos onUploaded, sistema invalida query /api/starred-hands/pending', async () => {
    const session = {
      id: 'sess-active-4',
      status: 'active',
      date: new Date().toISOString(),
      preparationPercentage: 80,
    };

    let callCount = 0;
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url === '/api/grind-sessions') {
        return Promise.resolve([session]);
      }
      if (method === 'GET' && url === '/api/grind-sessions/history') {
        return Promise.resolve([]);
      }
      if (method === 'GET' && url.startsWith('/api/planned-tournaments')) {
        return Promise.resolve([]);
      }
      if (method === 'GET' && url === '/api/preparation-logs/latest') {
        return Promise.resolve(null);
      }
      if (method === 'GET' && url.startsWith('/api/starred-hands/pending')) {
        callCount += 1;
        // Simula incremento apos onUploaded callback dispara refetch
        if (callCount === 1) {
          return Promise.resolve({ items: [], total: 0, limit: 50, offset: 0 });
        }
        return Promise.resolve({
          items: [
            {
              id: 'sh-new',
              sessionId: 'sess-active-4',
              source: 'paste',
              status: 'pending',
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        });
      }
      return Promise.resolve([]);
    });

    render(wrap(<GrindSession />));

    await waitFor(() => {
      expect(screen.getByTestId('spot-paster-probe')).toBeInTheDocument();
    });

    // Inicial usedCount=0
    await waitFor(() => {
      const lastProps = pasterProbeCalls.at(-1);
      expect(Number(lastProps?.usedCount ?? -1)).toBe(0);
    });

    // Aciona o callback onUploaded simulando upload bem-sucedido
    const lastProps = pasterProbeCalls.at(-1);
    expect(typeof lastProps?.onUploaded).toBe('function');

    lastProps.onUploaded({
      id: 'sh-new',
      imageUrl: '/uploads/spot-screenshots/sh-new.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
    });

    // Apos callback, esperamos refetch + usedCount=1
    await waitFor(
      () => {
        const recent = pasterProbeCalls.at(-1);
        expect(Number(recent?.usedCount ?? -1)).toBe(1);
      },
      { timeout: 2000 },
    );

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
