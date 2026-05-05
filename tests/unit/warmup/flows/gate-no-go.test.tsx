import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): Fluxo B — Gate disparado, jogador aceita NAO jogar
//
// Fonte: Docs/architecture/sequence-warmup-flow.mermaid (Fluxo B)
//        Spec secao 10.2
//
// Cenario:
//   1. Bloco 1: score=4 → GoNoGoModal abre.
//   2. Usuario clica "Não vou jogar".
//   3. POST com version=aborted + decisionToPlay=false + overrideUsed=false.
//   4. onClose chamado.
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

describe('Fluxo B - Gate Soft disparado, jogador aceita nao jogar', () => {
  it('score=4 + "Nao vou jogar" -> POST aborted + decisionToPlay=false', async () => {
    (apiRequest as any).mockResolvedValue({
      id: 'r-1',
      version: 'aborted',
      decisionToPlay: false,
      overrideUsed: false,
      emotionalCheckScore: 4,
    });

    const onClose = vi.fn();
    render(withClient(<WarmUpRunner onClose={onClose} onComplete={() => {}} />));

    // Reform 2026-05-05: ordem nova - Setup Fisico eh bloco 1.
    // Avanca Setup primeiro (marca 3 + Proximo) para chegar em Respiracao+check.
    await waitFor(() => {
      expect(screen.queryByTestId('setup-item-0')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    await waitFor(() => {
      expect(screen.queryByTestId('emotional-check-slider')).toBeTruthy();
    });

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    // GoNoGoModal aparece — clica "Nao vou jogar"
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/n[aã]o jogar/i);
    });

    fireEvent.click(screen.getByRole('button', { name: /n[aã]o vou jogar/i }));

    // POST esperado: version=aborted + decisionToPlay=false
    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const postCall = calls.find((args: any[]) => {
        const s = JSON.stringify(args);
        return s.includes('/api/warmup-rituals') && s.includes('"version":"aborted"');
      });
      expect(postCall).toBeTruthy();
      const payloadStr = JSON.stringify(postCall || '');
      expect(payloadStr).toContain('"decisionToPlay":false');
    });

    expect(onClose).toHaveBeenCalled();
  });
});
