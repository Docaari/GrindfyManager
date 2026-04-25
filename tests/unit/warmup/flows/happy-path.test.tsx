import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): Fluxo A — Happy Path Warm-up Completo (score >= 6)
//
// Fonte: Docs/architecture/sequence-warmup-flow.mermaid (Fluxo A)
//        Spec secao 10.1
//
// Cenario:
//   1. Usuario abre WarmUpRunner.
//   2. Bloco 1: pula animacao, score=8 → avanca sem gate.
//   3. Blocos 2-5 completos.
//   4. Submit final → POST com version=full + decisionToPlay=true + overrideUsed=false.
//   5. onComplete chamado.
//
// Status: red phase.
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

describe('Fluxo A - Happy path warm-up completo', () => {
  it('completa os 5 blocos com score=8 e POST version=full', async () => {
    (apiRequest as any).mockImplementation((method: any, urlArg?: any) => {
      const url = typeof urlArg === 'string' ? urlArg : method;
      if (typeof url === 'string' && url.includes('/api/user-settings')) {
        return Promise.resolve({
          weeklyHeuristics: ['h1', 'h2', 'h3'],
          drillUrl: 'https://app.gtowizard.com/',
        });
      }
      // POST /api/warmup-rituals
      return Promise.resolve({
        id: 'r-1',
        version: 'full',
        decisionToPlay: true,
        overrideUsed: false,
        emotionalCheckScore: 8,
        completedAt: new Date().toISOString(),
        durationMinutes: 10,
        sessionIntention: { focus: 'a', tiltPlan: 'b', stopCriteria: 'c' },
      });
    });

    const onComplete = vi.fn();
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={onComplete} />));

    // Bloco 1: skip + score=8
    await waitFor(() => {
      expect(screen.queryByTestId('emotional-check-slider')).toBeTruthy();
    }, { timeout: 5000 });

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    // Bloco 2: avanca
    await waitFor(() => {
      expect(screen.queryByTestId('weekly-focus-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('weekly-focus-advance'));

    // Bloco 3: avanca
    await waitFor(() => {
      expect(screen.queryByTestId('pfc-drill-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    // Bloco 4: marca 4/6 e avanca
    await waitFor(() => {
      expect(screen.queryByTestId('setup-water')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('setup-water'));
    fireEvent.click(screen.getByTestId('setup-snacks'));
    fireEvent.click(screen.getByTestId('setup-headphones'));
    fireEvent.click(screen.getByTestId('setup-light'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    // Bloco 5: 3 textareas + concluir
    await waitFor(() => {
      expect(screen.queryByTestId('intention-focus')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'foco' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'plano' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: 'stop' } });

    fireEvent.click(
      screen.getByRole('button', { name: /concluir warm-up.*iniciar grind/i }),
    );

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
