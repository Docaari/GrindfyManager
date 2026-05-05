import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Fluxo A — Happy Path Warm-up Completo (Reform 2026-05-05)
//
// Nova ordem dos blocos:
//   1. Setup Fisico (sem timer global; clicar Proximo = inicia timer)
//   2. Respiracao + check-in emocional (BreathingBox + slider 0-10 + gate)
//   3. Foco da semana (heuristicas)
//   4. Intencao (OPCIONAL)
//   5. Drills GTO/Estudo (PFC)
//
// Cenario:
//   1. Setup: marca 3 itens + Proximo
//   2. Respiracao: score=8 -> avanca (sem gate, score >= 6)
//   3. Heuristicas: avanca
//   4. Intencao: vazio (opcional) -> Proximo
//   5. PFC: avanca -> POST version=full + decisionToPlay=true + overrideUsed=false
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

describe('Fluxo A - Happy path warm-up completo (reform)', () => {
  it('completa os 5 blocos com score=8 e POST version=full', async () => {
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
        overrideUsed: false,
        emotionalCheckScore: 8,
        completedAt: new Date().toISOString(),
        durationMinutes: 6,
      });
    });

    const onComplete = vi.fn();
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={onComplete} mode="6m" />));

    // Bloco 1: Setup Fisico - marca 3 itens + Proximo
    await waitFor(() => {
      expect(screen.queryByTestId('setup-item-0')).toBeTruthy();
    }, { timeout: 5000 });
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    // Bloco 2: Respiracao + check emocional - score=8
    await waitFor(() => {
      expect(screen.queryByTestId('emotional-check-slider')).toBeTruthy();
    });
    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    // Bloco 3: Heuristicas - avanca
    await waitFor(() => {
      expect(screen.queryByTestId('weekly-focus-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('weekly-focus-advance'));

    // Bloco 4: Intencao - vazio (opcional) -> Proximo
    await waitFor(() => {
      expect(screen.queryByTestId('intention-submit')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('intention-submit'));

    // Bloco 5: PFC - avanca
    await waitFor(() => {
      expect(screen.queryByTestId('pfc-drill-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    // POST esperado
    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const postCall = calls.find((args: any[]) => {
        const s = JSON.stringify(args);
        return s.includes('/api/warmup-rituals') && s.includes('"version":"full"');
      });
      expect(postCall).toBeTruthy();
      const payload = postCall && (postCall[2] || postCall[1]);
      const payloadStr = JSON.stringify(payload || '');
      expect(payloadStr).toContain('"decisionToPlay":true');
      expect(payloadStr).toContain('"overrideUsed":false');
    });

    expect(onComplete).toHaveBeenCalled();
  });
});
