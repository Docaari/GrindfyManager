import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
// Componente <PremiumCuratorPanel> (painel cross-user, so curador).
//
// Spec : Docs/specs/premium-library.md (RF-06/RF-07 + Componentes de UI)
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/library/PremiumCuratorPanel.tsx
//   - GET /api/library/premium/curator/highlights -> { items, total }.
//   - Cada item: atribuicao (username/email do dono) + botao "Importar para Premium".
//   - Botao "Importar" DESABILITADO quando item.alreadyInPremium === true.
//   - Click "Importar" -> POST /api/library/premium/import { sourceHighlightId }.
//
// Lessons aplicadas:
//   #2  — data-testid estavel (curator-panel, curator-item-<id>, curator-import-<id>).
//   #13 — apiRequest retorna JSON parseado (mock retorna objeto direto).
//   #14/#26/#38 — SO await import; estilo unico.
//   #29 — montamos QueryClientProvider (useQuery).
//
// .test.tsx roda no projeto "client" (jsdom).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const PANEL_PATH = '../../../client/src/components/library/PremiumCuratorPanel';
async function loadPanel() {
  const mod: any = await import(/* @vite-ignore */ PANEL_PATH);
  return mod.PremiumCuratorPanel ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderPanel(props: any = {}) {
  const PremiumCuratorPanel = await loadPanel();
  return render(
    <QueryClientProvider client={makeClient()}>
      <PremiumCuratorPanel {...props} />
    </QueryClientProvider>,
  );
}

const CURATOR_DATA = {
  items: [
    {
      id: 'hl_1', userId: 'USER-A', username: 'jogadorA', email: 'a@example.com',
      site: 'ggpoker', familyKey: 'A|mtt|$22|regular', groupName: 'Fam A',
      buyInTier: '$22', type: 'mtt', metrics: { roi: 10 }, reasons: [], source: 'overview',
      createdAt: '2026-06-01T00:00:00.000Z', alreadyInPremium: false,
    },
    {
      id: 'hl_2', userId: 'USER-B', username: null, email: 'b@example.com',
      site: 'pokerstars', familyKey: 'B|mtt|$11|turbo', groupName: 'Fam B',
      buyInTier: '$11', type: 'mtt', metrics: { roi: 5 }, reasons: [], source: 'library',
      createdAt: '2026-06-02T00:00:00.000Z', alreadyInPremium: true,
    },
  ],
  total: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/library\/premium\/curator\/highlights/.test(url)) return CURATOR_DATA;
    if (method === 'POST' && /\/api\/library\/premium\/import/.test(url)) return { id: 'p_NEW' };
    return null;
  });
});

// =============================================================================
// Render + lista cross-user com atribuicao
// =============================================================================

describe('<PremiumCuratorPanel> — lista cross-user', () => {
  it('renderiza o painel (data-testid estavel)', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-panel')).toBeInTheDocument());
  });

  it('lista um item por highlight de qualquer conta', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-item-hl_1')).toBeInTheDocument());
    expect(screen.getByTestId('curator-item-hl_2')).toBeInTheDocument();
  });

  it('mostra a atribuicao do dono (username quando presente; email sempre)', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-item-hl_1')).toBeInTheDocument());
    // username presente
    expect(screen.getByText(/jogadorA/)).toBeInTheDocument();
    // email do dono cujo username e null (fallback de atribuicao)
    expect(screen.getByText(/b@example\.com/)).toBeInTheDocument();
  });
});

// =============================================================================
// Botao "Importar" — desabilitado quando alreadyInPremium
// =============================================================================

describe('<PremiumCuratorPanel> — botao Importar gated por alreadyInPremium', () => {
  it('botao Importar HABILITADO quando alreadyInPremium=false', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-import-hl_1')).toBeInTheDocument());
    expect(screen.getByTestId('curator-import-hl_1')).not.toBeDisabled();
  });

  it('botao Importar DESABILITADO quando alreadyInPremium=true', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-import-hl_2')).toBeInTheDocument());
    expect(screen.getByTestId('curator-import-hl_2')).toBeDisabled();
  });
});

// =============================================================================
// Acao Importar -> POST /import com sourceHighlightId
// =============================================================================

describe('<PremiumCuratorPanel> — acao importar', () => {
  it('click em Importar dispara POST /api/library/premium/import com sourceHighlightId', async () => {
    const { default: userEventDefault, ...rest } = await import('@testing-library/user-event');
    const userEvent = userEventDefault ?? (rest as any);
    const user = userEvent.setup();

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-import-hl_1')).toBeInTheDocument());
    await user.click(screen.getByTestId('curator-import-hl_1'));

    await waitFor(() => {
      const posted = apiRequestMock.mock.calls.some(
        ([method, url, body]) =>
          method === 'POST' &&
          /\/api\/library\/premium\/import/.test(url) &&
          body?.sourceHighlightId === 'hl_1',
      );
      expect(posted).toBe(true);
    });
  });
});

// =============================================================================
// Estado vazio
// =============================================================================

describe('<PremiumCuratorPanel> — estado vazio', () => {
  it('mostra placeholder PT-BR quando nao ha highlights cross-user', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/library\/premium\/curator\/highlights/.test(url)) {
        return { items: [], total: 0 };
      }
      return null;
    });
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('curator-empty')).toBeInTheDocument());
  });
});
