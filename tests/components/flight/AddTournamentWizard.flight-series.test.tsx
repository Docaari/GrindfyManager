import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-17: Wizard manual de torneio refatorado
//
// Spec : Docs/specs/sprint-flight-1.md (RF-17)
//
// Mudancas vs versao atual:
//  - REMOVE inputs de flag legados (isFlight, flightDay, flightParentId,
//    flightAdvanced).
//  - ADICIONA toggle "Faz parte de uma serie multi-flight?".
//  - Se SIM, dropdown "Linkar a serie existente" / "Criar nova serie inline".
//  - "Criar nova" -> mini-form de serie (name, totalDay1s, day2DateTime, stackMode).
//  - Submit: usa endpoint POST /api/tournament-series + linka tournament via
//    seriesId no payload de createTournament.
//
// Regressao: wizard SEM marcar opcao serie continua funcionando para single
// tournament (zero impacto para users que nao usam flights).
//
// IMPORTANTE: lessons-learned #11 — spec eh fonte de verdade. Toggle simples
// + dropdown. Sem flag estatico.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
// Componente esperado em
//   client/src/components/grade-planner/AddTournamentWizard.tsx OU
//   client/src/components/tournaments/AddTournamentDialog.tsx
// Implementer escolhe — teste tolera ambos.
async function importWizard() {
  const candidates = [
    () => import('../../../client/src/components/grade-planner/AddTournamentWizard'),
    () => import('../../../client/src/components/tournaments/AddTournamentDialog'),
    () => import('../../../client/src/components/grade-planner/AddTournamentDialog'),
  ];
  for (const load of candidates) {
    try {
      const mod = await load();
      const Cmp = (mod as any).AddTournamentWizard
        ?? (mod as any).AddTournamentDialog
        ?? (mod as any).default;
      if (Cmp) return Cmp;
    } catch { /* try next */ }
  }
  throw new Error(
    'Wizard nao encontrado — esperado AddTournamentWizard | AddTournamentDialog',
  );
}

function withClient(ui: React.ReactNode, queryFn?: any) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: queryFn ?? (async () => []) },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// REMOCAO de campos legados
// ---------------------------------------------------------------------------

describe('AddTournamentWizard — flags ADR-031 REMOVIDOS (RF-17)', () => {
  it('NAO mostra input "isFlight" toggle legado', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    // Inputs legados nao devem aparecer
    expect(screen.queryByTestId('isFlight-toggle')).toBeNull();
    expect(screen.queryByTestId('add-tournament-isflight')).toBeNull();
  });

  it('NAO mostra input "flightDay"', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    expect(screen.queryByTestId('flightDay-input')).toBeNull();
    expect(screen.queryByTestId('add-tournament-flight-day')).toBeNull();
  });

  it('NAO mostra input "flightParentId"', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    expect(screen.queryByTestId('flightParentId-input')).toBeNull();
    expect(screen.queryByTestId('add-tournament-flight-parent')).toBeNull();
  });

  it('NAO mostra input "flightAdvanced"', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    expect(screen.queryByTestId('flightAdvanced-input')).toBeNull();
    expect(screen.queryByTestId('add-tournament-flight-advanced')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NOVO: toggle "Faz parte de serie?"
// ---------------------------------------------------------------------------

describe('AddTournamentWizard — toggle serie (RF-17)', () => {
  it('mostra toggle "Faz parte de uma serie multi-flight?"', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    expect(screen.getByTestId('add-tournament-series-toggle')).toBeTruthy();
  });

  it('toggle SIM mostra dropdown "Linkar existente / Criar nova"', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    fireEvent.click(screen.getByTestId('add-tournament-series-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('add-tournament-series-mode-link')).toBeTruthy();
      expect(screen.getByTestId('add-tournament-series-mode-create')).toBeTruthy();
    });
  });

  it('"Criar nova" mostra mini-form (name, totalDay1s, day2DateTime, stackMode)', async () => {
    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    fireEvent.click(screen.getByTestId('add-tournament-series-toggle'));
    await waitFor(() => screen.getByTestId('add-tournament-series-mode-create'));
    fireEvent.click(screen.getByTestId('add-tournament-series-mode-create'));

    await waitFor(() => {
      expect(screen.getByTestId('add-tournament-new-series-name')).toBeTruthy();
      expect(screen.getByTestId('add-tournament-new-series-total-day1s')).toBeTruthy();
      expect(screen.getByTestId('add-tournament-new-series-day2-datetime')).toBeTruthy();
      expect(screen.getByTestId('add-tournament-new-series-stackmode-single')).toBeTruthy();
      expect(screen.getByTestId('add-tournament-new-series-stackmode-combined')).toBeTruthy();
      // best NAO deve existir (ADR-091)
      expect(screen.queryByTestId('add-tournament-new-series-stackmode-best')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Submit usa /api/tournament-series + payload com seriesId
// ---------------------------------------------------------------------------

describe('AddTournamentWizard — submit usa API tournament-series (RF-17)', () => {
  it('"Criar nova serie" submit chama POST /api/tournament-series + create tournament com seriesId', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (method === 'POST' && url === '/api/tournament-series') {
        return Promise.resolve({ id: 'srs-new' });
      }
      // POST /api/planned-tournaments OR /api/tournaments
      return Promise.resolve({ id: 't-created', seriesId: 'srs-new' });
    });

    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    fireEvent.click(screen.getByTestId('add-tournament-series-toggle'));
    await waitFor(() => screen.getByTestId('add-tournament-series-mode-create'));
    fireEvent.click(screen.getByTestId('add-tournament-series-mode-create'));

    // (preenchimento minimal — implementer pode adicionar required fields,
    //  teste foca em validar que apiRequest foi chamado pra serie)
    await waitFor(() => screen.getByTestId('add-tournament-new-series-name'));

    fireEvent.click(screen.getByTestId('add-tournament-submit'));

    await waitFor(() => {
      const seriesCall = (apiRequest as any).mock.calls.find(
        (c: any[]) => c[1] === '/api/tournament-series',
      );
      expect(seriesCall).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Regressao: wizard sem opcao serie continua funcionando (single tournament)
// ---------------------------------------------------------------------------

describe('AddTournamentWizard — regressao single (RF-17)', () => {
  it('sem ativar toggle serie, submit cria tournament normal sem seriesId', async () => {
    (apiRequest as any).mockResolvedValue({ id: 't-single', seriesId: null });

    const Wizard = await importWizard();
    render(withClient(<Wizard open onOpenChange={() => {}} />));
    // NAO clica no toggle de serie
    fireEvent.click(screen.getByTestId('add-tournament-submit'));

    await waitFor(() => {
      // Nenhuma chamada a /api/tournament-series
      const seriesCall = (apiRequest as any).mock.calls.find(
        (c: any[]) => c[1] === '/api/tournament-series',
      );
      expect(seriesCall).toBeFalsy();
    });
  });
});
