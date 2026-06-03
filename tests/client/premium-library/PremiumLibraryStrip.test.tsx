import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
// Componente <PremiumLibraryStrip> (faixa global no topo de Torneios).
//
// Spec : Docs/specs/premium-library.md (RF-02/RF-03 + Componentes de UI)
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md (Decisao 4)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/library/PremiumLibraryStrip.tsx
//   props: { sites: string[]; isCurator: boolean }
//   - GET /api/library/premium (+ filtro por sites) -> grid de cards.
//   - TODOS veem os cards (faixa global). Botao remover (X) SO para curador.
//   - Lista vazia / sem match de site -> NAO renderiza (null), igual SavedHighlightsStrip.
//
// Lessons aplicadas:
//   #2  — data-testid estavel (premium-strip, premium-card-<id>, premium-remove-<id>).
//   #13 — apiRequest retorna JSON parseado (mock retorna o objeto direto).
//   #14/#26/#38 — SO await import neste arquivo (nunca require); estilo unico.
//   #29 — montamos QueryClientProvider (componente usa useQuery).
//
// .test.tsx roda no projeto "client" (jsdom).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const STRIP_PATH = '../../../client/src/components/library/PremiumLibraryStrip';
async function loadStrip() {
  const mod: any = await import(/* @vite-ignore */ STRIP_PATH);
  return mod.PremiumLibraryStrip ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderStrip(props: any = {}) {
  const PremiumLibraryStrip = await loadStrip();
  return render(
    <QueryClientProvider client={makeClient()}>
      <PremiumLibraryStrip sites={[]} isCurator={false} {...props} />
    </QueryClientProvider>,
  );
}

const PREMIUM = [
  {
    id: 'p_1', site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular', groupName: 'Bounty Hunters $22',
    buyInTier: '$22', type: 'mtt', metrics: { roi: 18.4, volume: 320 },
    reasons: [{ kind: 'roi', label: 'ROI alto' }], source: 'library',
  },
  {
    id: 'p_2', site: 'pokerstars', familyKey: 'pokerstars|mtt|$11|turbo', groupName: 'Hot $11 Turbo',
    buyInTier: '$11', type: 'mtt', metrics: { roi: 9.1, volume: 110 },
    reasons: [], source: 'import',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/library\/premium(\?|$)/.test(url)) return PREMIUM;
    return null;
  });
});

// =============================================================================
// Render + cards para TODOS
// =============================================================================

describe('<PremiumLibraryStrip> — faixa global (todos veem)', () => {
  it('renderiza a faixa (data-testid estavel)', async () => {
    await renderStrip();
    await waitFor(() => expect(screen.getByTestId('premium-strip')).toBeInTheDocument());
  });

  it('lista um card por familia premium', async () => {
    await renderStrip();
    await waitFor(() => expect(screen.getByTestId('premium-card-p_1')).toBeInTheDocument());
    expect(screen.getByTestId('premium-card-p_2')).toBeInTheDocument();
    expect(screen.getByText('Bounty Hunters $22')).toBeInTheDocument();
  });

  it('carrega via GET /api/library/premium', async () => {
    await renderStrip();
    await waitFor(() => {
      const called = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'GET' && /\/api\/library\/premium/.test(url),
      );
      expect(called).toBe(true);
    });
  });
});

// =============================================================================
// Botao remover SO para curador (defense-in-depth UI)
// =============================================================================

describe('<PremiumLibraryStrip> — botao remover gated por isCurator', () => {
  it('NAO mostra botao remover para usuario comum (isCurator=false)', async () => {
    await renderStrip({ isCurator: false });
    await waitFor(() => expect(screen.getByTestId('premium-card-p_1')).toBeInTheDocument());
    expect(screen.queryByTestId('premium-remove-p_1')).not.toBeInTheDocument();
  });

  it('mostra botao remover para curador (isCurator=true)', async () => {
    await renderStrip({ isCurator: true });
    await waitFor(() => expect(screen.getByTestId('premium-card-p_1')).toBeInTheDocument());
    expect(screen.getByTestId('premium-remove-p_1')).toBeInTheDocument();
  });
});

// =============================================================================
// Filtro por site
// =============================================================================

describe('<PremiumLibraryStrip> — filtro por site', () => {
  it('filtra os cards pelos sites selecionados', async () => {
    await renderStrip({ sites: ['ggpoker'] });
    await waitFor(() => expect(screen.getByTestId('premium-card-p_1')).toBeInTheDocument());
    // p_2 (pokerstars) nao deve aparecer quando filtrado por ggpoker.
    expect(screen.queryByTestId('premium-card-p_2')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Estado vazio -> nao renderiza (paridade SavedHighlightsStrip -> null)
// =============================================================================

describe('<PremiumLibraryStrip> — lista vazia', () => {
  it('NAO renderiza a faixa quando a premium esta vazia', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/library\/premium/.test(url)) return [];
      return null;
    });
    await renderStrip();
    // Damos um tick para o useQuery resolver; a faixa nao deve aparecer.
    await waitFor(() => {
      expect(screen.queryByTestId('premium-strip')).not.toBeInTheDocument();
    });
  });

  it('NAO renderiza quando o filtro de site nao casa com nenhum item', async () => {
    await renderStrip({ sites: ['site-inexistente'] });
    await waitFor(() => {
      expect(screen.queryByTestId('premium-strip')).not.toBeInTheDocument();
    });
  });
});
