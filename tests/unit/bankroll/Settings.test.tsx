import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): Settings.tsx - secao "Banca (Bankroll)"
//
// Fonte: docs/specs/bankroll-management.md (RF-06)
//        docs/architecture/flows/bankroll/feature-flow.md (Estados Settings)
//
// Os todos abaixo foram parcialmente convertidos em testes reais conforme
// implementacao do Implementer (RF-06). Os todos remanescentes cobrem casos
// UX nao criticos e ficam para iteracoes futuras.
// =============================================================================

// Mocks de hooks externos que a Settings nao deve tocar nos testes.
vi.mock('../../../client/src/contexts/SidebarContext', () => ({
  useSidebar: () => ({ autoCollapseForGrind: false, setAutoCollapseForGrind: vi.fn() }),
}));
vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('../../../client/src/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('../../../client/src/lib/queryClient');
  return {
    ...actual,
    apiRequest: vi.fn(),
    queryClient: { invalidateQueries: vi.fn() },
  };
});

import { apiRequest } from '../../../client/src/lib/queryClient';
import Settings from '../../../client/src/pages/Settings';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const BANKROLL_UNCONFIGURED = {
  configured: false,
  amount: null,
  rule: '1pct',
  maxBuyInUSD: null,
  snapshotCount: 0,
  lastUpdatedAt: null,
};

const BANKROLL_CONFIGURED = {
  configured: true,
  amount: 1000,
  rule: '1pct',
  rulePct: 1.0,
  tolerance: 1.5,
  maxBuyInUSD: 15,
  maxBuyInDisplay: { USD: 15, BRL: 78 }, // BRL/USD = 5.2
  snapshotCount: 3,
  lastUpdatedAt: '2026-04-24T18:00:00-03:00',
};

function mockApiEndpoints(state: any) {
  (apiRequest as any).mockImplementation((methodOrUrl: any, url?: any) => {
    // Two call shapes: apiRequest(url) from useBankroll OR apiRequest(method, url, body)
    const isTwoArg = typeof url === 'string';
    const path = isTwoArg ? url : methodOrUrl;
    if (path === '/api/bankroll') {
      return Promise.resolve(state);
    }
    if (path === '/api/settings/exchange-rates') {
      return Promise.resolve({ CNY: 0.14, EUR: 0.92 });
    }
    if (path === '/api/user-settings') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Settings.tsx - secao Banca (Bankroll) - RF-06', () => {
  describe('render basico', () => {
    it('secao "Banca (Bankroll)" aparece na pagina', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);

      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-settings-section')).toBeTruthy();
      });
    });

    it('input numerico "Sua banca atual (USD)" presente (data-testid="bankroll-amount-input")', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-amount-input')).toBeTruthy();
      });
    });

    it('select "Regra de gestao" presente (data-testid="bankroll-rule-select")', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-rule-select')).toBeTruthy();
      });
    });

    it('display "Buy-in maximo recomendado" presente', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-max-buyin-display')).toBeTruthy();
      });
    });

    it('letra miuda "tolerancia de 50% para shots pontuais" visivel (Q8)', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        const fineprint = screen.getByTestId('bankroll-tolerance-fineprint');
        expect(fineprint.textContent).toMatch(/tolerancia|shot/i);
      });
    });
  });

  describe('estado inicial (nao configurado)', () => {
    it('CTA em destaque "Configure sua banca" aparece', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-setup-cta')).toBeTruthy();
      });
    });

    it('botao "Salvar banca" desabilitado enquanto amount vazio', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        const btn = screen.getByTestId('bankroll-save-button') as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
      });
    });
  });

  describe('digitando amount + select', () => {
    it('mudar amount atualiza "Buy-in maximo" em tempo real (sem API)', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      const input = await waitFor(() => screen.getByTestId('bankroll-amount-input')) as HTMLInputElement;

      fireEvent.change(input, { target: { value: '1000' } });

      await waitFor(() => {
        const display = screen.getByTestId('bankroll-max-buyin-display');
        // 1000 * 1% * 1.5 = 15.00
        expect(display.textContent).toMatch(/\$15\.00/);
      });
    });

    it('mudar amount para 2000 recalcula display (sem API)', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      const input = await waitFor(() => screen.getByTestId('bankroll-amount-input')) as HTMLInputElement;

      fireEvent.change(input, { target: { value: '2000' } });

      await waitFor(() => {
        const display = screen.getByTestId('bankroll-max-buyin-display');
        // 2000 * 1% * 1.5 = 30.00
        expect(display.textContent).toMatch(/\$30\.00/);
      });
    });
  });

  describe('salvar primeira configuracao', () => {
    it('click em Salvar chama apiRequest com PUT /api/bankroll reason="initial"', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      const input = await waitFor(() => screen.getByTestId('bankroll-amount-input')) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '1000' } });

      const saveBtn = await waitFor(() => {
        const b = screen.getByTestId('bankroll-save-button') as HTMLButtonElement;
        if (b.disabled) throw new Error('still disabled');
        return b;
      });

      fireEvent.click(saveBtn);

      await waitFor(() => {
        // Deve ter sido chamado com (method, url, body)
        const calls = (apiRequest as any).mock.calls;
        const putCall = calls.find((c: any[]) => c[0] === 'PUT' && c[1] === '/api/bankroll');
        expect(putCall).toBeDefined();
        expect(putCall[2]).toMatchObject({ amount: 1000, rule: '1pct', reason: 'initial' });
      });
    });

    it('NAO abre dialog de reason na primeira configuracao', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      const input = await waitFor(() => screen.getByTestId('bankroll-amount-input')) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '1000' } });

      const saveBtn = await waitFor(() => {
        const b = screen.getByTestId('bankroll-save-button') as HTMLButtonElement;
        if (b.disabled) throw new Error('still disabled');
        return b;
      });

      fireEvent.click(saveBtn);

      // Nao deve aparecer o dialog de reason
      await waitFor(() => {
        const putCall = (apiRequest as any).mock.calls.find((c: any[]) => c[0] === 'PUT');
        expect(putCall).toBeDefined();
      });
      expect(screen.queryByTestId('bankroll-reason-dialog')).toBeNull();
    });
  });

  describe('botao registrar movimento', () => {
    it('botao "Registrar aporte/saque" aparece quando banca configurada', async () => {
      mockApiEndpoints(BANKROLL_CONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-open-movement-dialog')).toBeTruthy();
      });
    });

    it('botao NAO aparece quando banca NAO configurada', async () => {
      mockApiEndpoints(BANKROLL_UNCONFIGURED);
      render(withClient(<Settings />));

      // Espera a CTA primeiro (garantir que renderizou)
      await waitFor(() => {
        expect(screen.getByTestId('bankroll-setup-cta')).toBeTruthy();
      });
      expect(screen.queryByTestId('bankroll-open-movement-dialog')).toBeNull();
    });
  });

  describe('link para historico', () => {
    it('link "Ver historico completo" aparece quando banca configurada', async () => {
      mockApiEndpoints(BANKROLL_CONFIGURED);
      render(withClient(<Settings />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-history-link')).toBeTruthy();
      });
    });
  });

  // Casos UX remanescentes (baixo valor ou dependem de micro-interactions do
  // Radix Select com jsdom) — deixados como todo para o proximo sprint.
  describe('ressalvas remanescentes (it.todo)', () => {
    it.todo('select "custom" abre input numerico adicional e valida range 0.1-20');
    it.todo('custom com valor "0.05" mostra erro "Entre 0.1 e 20"');
    it.todo('custom com valor "3.55" mostra erro (2 casas decimais - Q2)');
    it.todo('mudar rule (sem mudar amount) em usuario configurado -> salva direto, SEM dialog');
    it.todo('mudar amount em usuario configurado -> abre dialog pedindo reason + note');
    it.todo('dialog com reason=deposit + note="PIX" -> PUT /api/bankroll com reason/note');
    it.todo('toast sucesso apos salvar');
    it.todo('refetch automatico apos registrar movimento');
  });
});
