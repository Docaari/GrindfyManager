import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Fluxo C — Gate com Override (confirmacao dupla) — Reform 2026-05-05
//
// Nova ordem: Setup -> Respiracao+check -> Heuristicas -> Intencao -> PFC.
//
// Cenario:
//   1. Setup Fisico: marca 3 + Proximo
//   2. Respiracao: score=4 -> GoNoGoModal
//   3. "Ainda quero jogar" -> OverrideConfirmDialog
//   4. Confirma -> overrideUsed=true, prossegue
//   5. Heuristicas, Intencao (vazio = opcional), PFC
//   6. POST: version=full + decisionToPlay=true + overrideUsed=true + score=4
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { apiRequest } from '@/lib/queryClient';
import { WarmUpRunner } from '@/components/warmup/WarmUpRunner';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('Fluxo C - Gate com Override (confirmacao dupla)', () => {
  it('score=4 + override confirmado -> ritual prossegue com overrideUsed=true', async () => {
    (apiRequest as any).mockImplementation((method: any, urlArg?: any) => {
      const url = typeof urlArg === 'string' ? urlArg : method;
      if (typeof url === 'string' && url.includes('/api/user-settings')) {
        return Promise.resolve({
          weeklyHeuristics: ['h1', 'h2', 'h3'],
          drillUrl: 'https://app.gtowizard.com/',
        });
      }
      return Promise.resolve({
        id: 'r-1',
        version: 'full',
        decisionToPlay: true,
        overrideUsed: true,
        emotionalCheckScore: 4,
      });
    });

    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} mode="6m" />));

    // Bloco 1: Setup Fisico
    await waitFor(() => {
      expect(screen.queryByTestId('setup-item-0')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    // Bloco 2: Respiracao + check - score=4
    await waitFor(() => {
      expect(screen.queryByTestId('emotional-check-slider')).toBeTruthy();
    });
    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    // GoNoGo modal
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /ainda quero jogar/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /ainda quero jogar/i }));

    // OverrideConfirm
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/tem certeza/i);
    });
    fireEvent.click(
      screen.getByRole('button', { name: /sim,?\s*registrar override/i }),
    );

    // Bloco 3: Heuristicas
    await waitFor(() => {
      expect(screen.queryByTestId('weekly-focus-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('weekly-focus-advance'));

    // Bloco 4: Intencao (opcional - vazio)
    await waitFor(() => {
      expect(screen.queryByTestId('intention-submit')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('intention-submit'));

    // Bloco 5: PFC
    await waitFor(() => {
      expect(screen.queryByTestId('pfc-drill-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    // POST: full + override=true + decisionToPlay=true + score<6
    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const postCall = calls.find((args: any[]) => {
        const s = JSON.stringify(args);
        return s.includes('/api/warmup-rituals') &&
               s.includes('"version":"full"') &&
               s.includes('"overrideUsed":true');
      });
      expect(postCall).toBeTruthy();
      const payloadStr = JSON.stringify(postCall || '');
      expect(payloadStr).toContain('"decisionToPlay":true');
      expect(payloadStr).toContain('"emotionalCheckScore":4');
    });
  });
});
