/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1A / RF-07 — OnboardingWizard.tsx (modos `full` 6 steps / `light` 3 steps)
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1a.md (RF-07)
 *   - Docs/architecture/decisions/153-onboarding-conversacional-wizard-guiado.md (§2, §3)
 *
 * data-testid esperados (estaveis — implementer cria; lesson #2):
 *   - onboarding-wizard                       — wrapper
 *   - onboarding-step-1 ... onboarding-step-6 — cada step (full); 1..3 (light)
 *   - onboarding-step-indicator               — barra de progresso (texto "passo X de N")
 *   - onboarding-next                         — botao avancar (PATCH do step)
 *   - onboarding-back                         — botao voltar
 *   - onboarding-complete                     — botao "Concluir" (POST /complete)
 *   - onboarding-field-perfilDeclarado        — chips do step 1
 *   - onboarding-field-tomPreferido           — chips de tom (step 6 full / step 1 light)
 *   - onboarding-field-focoDoMes              — input do foco
 *   - onboarding-field-redesPrincipais        — multi-select de redes
 *
 * Lessons: #14/#26 (await import em .tsx), #13 (apiRequest JSON parseado),
 *          #1 (hooks antes de qualquer early return), #2 (data-testid).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai/onboarding', vi.fn()] as const,
  useSearch: () => '',
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

const apiRequestMock = vi.fn(async (_method: string, _url: string, _body?: any) => ({
  structuredProfile: { schemaVersion: 1 },
  draft: { step: 1, mode: 'full', startedAt: '2026-05-12T00:00:00Z' },
  preferences: {},
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async () => ({}),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadWizard() {
  const mod: any = await import('@/components/coach/onboarding/OnboardingWizard');
  return (mod.default ?? mod.OnboardingWizard) as React.ComponentType<any>;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('OnboardingWizard — modo full (6 steps)', () => {
  it('renderiza o wizard e mostra o step 1', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-wizard')).toBeTruthy());
    expect(screen.getByTestId('onboarding-step-1')).toBeTruthy();
  });

  it('o indicador de progresso mostra "passo X de 6" no modo full', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-indicator')).toBeTruthy());
    expect(screen.getByTestId('onboarding-step-indicator').textContent || '').toMatch(/6/);
  });

  it('step 1 tem campos com data-testid (perfilDeclarado, stakesTipico, volumeTipicoMes, redesPrincipais)', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-1')).toBeTruthy());
    expect(screen.getByTestId('onboarding-field-perfilDeclarado')).toBeTruthy();
    expect(screen.getByTestId('onboarding-field-redesPrincipais')).toBeTruthy();
  });

  it('clicar "avancar" no step 1 chama PATCH /api/coach/onboarding e vai pro step 2', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-1')).toBeTruthy());
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(c => c[0] === 'PATCH' && String(c[1]).includes('/api/coach/onboarding'))).toBe(true);
    });
    await waitFor(() => expect(screen.queryByTestId('onboarding-step-2')).toBeTruthy());
  });

  it('o ultimo step (6) tem o botao "Concluir" que chama POST /api/coach/onboarding/complete', async () => {
    const Wizard = await loadWizard();
    // monta direto no step 6 via prop initialStep (o implementer expoe ou via draft)
    render(wrap(<Wizard mode="full" initialStep={6} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-6')).toBeTruthy());
    expect(screen.getByTestId('onboarding-field-tomPreferido')).toBeTruthy();
    await userEvent.click(screen.getByTestId('onboarding-complete'));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(c => c[0] === 'POST' && String(c[1]).includes('/api/coach/onboarding/complete'))).toBe(true);
    });
  });

  it('retoma do draft.step quando recebe draft', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" draft={{ step: 4, mode: 'full', startedAt: '2026-05-12T00:00:00Z' }} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-4')).toBeTruthy());
  });

  it('steps de meta/foco sao pulaveis — avancar sem preencher nao bloqueia', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="full" initialStep={4} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-4')).toBeTruthy());
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => expect(screen.queryByTestId('onboarding-step-5')).toBeTruthy());
  });
});

describe('OnboardingWizard — modo light (3 steps)', () => {
  it('renderiza 3 steps no modo light', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="light" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-1')).toBeTruthy());
    expect(screen.getByTestId('onboarding-step-indicator').textContent || '').toMatch(/3/);
  });

  it('step 1 do light tem o campo tomPreferido', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="light" />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-1')).toBeTruthy());
    expect(screen.getByTestId('onboarding-field-tomPreferido')).toBeTruthy();
  });

  it('o step 3 do light tem o botao Concluir (POST /complete)', async () => {
    const Wizard = await loadWizard();
    render(wrap(<Wizard mode="light" initialStep={3} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-step-3')).toBeTruthy());
    expect(screen.getByTestId('onboarding-complete')).toBeTruthy();
  });
});
