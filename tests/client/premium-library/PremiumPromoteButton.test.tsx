import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
// Botao "Promover a Premium" no card de familia (RF-01) — gated por isCurator.
//
// Spec : Docs/specs/premium-library.md (RF-01 + Componentes de UI "Botao
//        'Adicionar a Premium' no card de familia ... renderizado SO para curador")
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md (Decisao 4)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/library/PremiumPromoteButton.tsx
//   props: { family: { site; familyKey; groupName?; buyInTier?; type?; metrics?; reasons? };
//            isCurator: boolean }
//   - isCurator=false -> NAO renderiza (null). Defense-in-depth UI (backend e a SSoT).
//   - isCurator=true  -> botao "Adicionar a Premium" (data-testid promote-<familyKey>).
//   - click -> POST /api/library/premium com { site, familyKey, metrics, reasons, ... }.
//
// Botao isolado (em vez do OverviewPanel inteiro) porque o OverviewPanel gerencia
// `result` via useState pos-upload, sem prop injetavel — testar a unidade gated e
// o caminho robusto (lesson #11: o botao e acao real, nao decorativa).
//
// Lessons: #2 (data-testid), #13 (apiRequest JSON), #14/#26/#38 (so await import).
//
// .test.tsx roda no projeto "client" (jsdom).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const BTN_PATH = '../../../client/src/components/library/PremiumPromoteButton';
async function loadButton() {
  const mod: any = await import(/* @vite-ignore */ BTN_PATH);
  return mod.PremiumPromoteButton ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const FAMILY = {
  site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular', groupName: 'Bounty Hunters $22',
  buyInTier: '$22', type: 'mtt', metrics: { roi: 18.4, volume: 320 },
  reasons: [{ kind: 'roi', label: 'ROI alto' }],
};

async function renderButton(props: any = {}) {
  const PremiumPromoteButton = await loadButton();
  return render(
    <QueryClientProvider client={makeClient()}>
      <PremiumPromoteButton family={FAMILY} isCurator {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && /\/api\/library\/premium(\?|$)/.test(url)) return { id: 'p_NEW' };
    return null;
  });
});

describe('<PremiumPromoteButton> — gating por isCurator', () => {
  it('NAO renderiza para usuario comum (isCurator=false)', async () => {
    await renderButton({ isCurator: false });
    // Damos um tick; o botao nunca aparece.
    await waitFor(() => {
      expect(screen.queryByTestId('promote-ggpoker|mtt|$22|regular')).not.toBeInTheDocument();
    });
  });

  it('renderiza o botao "Adicionar a Premium" para curador (isCurator=true)', async () => {
    await renderButton({ isCurator: true });
    await waitFor(() => {
      expect(screen.getByTestId('promote-ggpoker|mtt|$22|regular')).toBeInTheDocument();
    });
  });
});

describe('<PremiumPromoteButton> — acao promover', () => {
  it('click dispara POST /api/library/premium com site+familyKey+metrics+reasons', async () => {
    const { default: userEventDefault, ...rest } = await import('@testing-library/user-event');
    const userEvent = userEventDefault ?? (rest as any);
    const user = userEvent.setup();

    await renderButton({ isCurator: true });
    await waitFor(() => expect(screen.getByTestId('promote-ggpoker|mtt|$22|regular')).toBeInTheDocument());
    await user.click(screen.getByTestId('promote-ggpoker|mtt|$22|regular'));

    await waitFor(() => {
      const posted = apiRequestMock.mock.calls.some(
        ([method, url, body]) =>
          method === 'POST' &&
          /\/api\/library\/premium(\?|$)/.test(url) &&
          body?.site === 'ggpoker' &&
          body?.familyKey === 'ggpoker|mtt|$22|regular',
      );
      expect(posted).toBe(true);
    });
  });
});
