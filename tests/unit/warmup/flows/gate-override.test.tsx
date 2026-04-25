import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): Fluxo C — Gate com Override (confirmacao dupla)
//
// Fonte: Docs/architecture/sequence-warmup-flow.mermaid (Fluxo C)
//        Spec secao 10.3
//        ADR-027 (override registra overrideUsed=true)
//
// Cenario:
//   1. Bloco 1: score=4 → GoNoGoModal abre.
//   2. Usuario clica "Ainda quero jogar" → OverrideConfirmDialog abre.
//   3. Confirma → overrideUsed=true, ritual prossegue.
//   4. Completa Blocos 2-5.
//   5. POST: version=full + decisionToPlay=true + overrideUsed=true + score=4.
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

    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await waitFor(() => {
      expect(screen.queryByTestId('emotional-check-slider')).toBeTruthy();
    });

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    // Modal aparece
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /ainda quero jogar/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /ainda quero jogar/i }));

    // OverrideConfirm aparece - confirma
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/tem certeza/i);
    });

    fireEvent.click(
      screen.getByRole('button', { name: /sim,?\s*registrar override/i }),
    );

    // Avanca os blocos restantes ate o final
    await waitFor(() => {
      expect(screen.queryByTestId('weekly-focus-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('weekly-focus-advance'));

    await waitFor(() => {
      expect(screen.queryByTestId('pfc-drill-advance')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    await waitFor(() => {
      expect(screen.queryByTestId('setup-water')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('setup-water'));
    fireEvent.click(screen.getByTestId('setup-snacks'));
    fireEvent.click(screen.getByTestId('setup-headphones'));
    fireEvent.click(screen.getByTestId('setup-light'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    await waitFor(() => {
      expect(screen.queryByTestId('intention-focus')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'foco' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'plano' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: 'stop' } });

    fireEvent.click(
      screen.getByRole('button', { name: /concluir warm-up.*iniciar grind/i }),
    );

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
