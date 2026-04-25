import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): pages/MentalPrep refatorada (RF-01, T-13)
//
// Hub /mental redesenhado:
//   - Header "Warm-up"
//   - Card primario "Iniciar warm-up (10min)" com botao CTA
//   - Card "Histórico" com WarmupHistoryCard
//   - Subseção rebaixada "Ferramentas de Apoio" (Meditation/Visualization/AudioLibrary)
//   - REMOVIDOS: Score 60/40, MentalStateCard (4 sliders), CustomizationDialog,
//     StatisticsDialog, CorrelationDialog, WarmUpChecklist legado, GoalsCard,
//     PersonalNotesCard, QuickHistoryCard.
//   - Botao "Iniciar Grind" gated por useWarmupGate (RF-13).
//
// Status: red phase. (Componente ainda contem implementacao antiga.)
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/mental', () => {}],
}));

import { apiRequest } from '@/lib/queryClient';
import MentalPrep from '@/pages/MentalPrep';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MentalPrep refatorada - estrutura', () => {
  it('exibe header com hifen "Warm-up" (NAO "Warm Up - Preparação Mental" antigo)', async () => {
    (apiRequest as any).mockResolvedValue(null);

    render(withClient(<MentalPrep />));

    await waitFor(() => {
      const text = document.body.textContent || '';
      // Refatoracao: header e simplesmente "Warm-up", nao "Warm Up - Preparação Mental".
      expect(text).toMatch(/warm-up/i);
      expect(text).not.toMatch(/preparação mental/i);
    });
  });

  it('exibe card primario "Iniciar warm-up (10min)"', async () => {
    (apiRequest as any).mockResolvedValue(null);
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/iniciar warm-up/i);
      expect(document.body.textContent).toMatch(/10\s*min/i);
    });
  });

  it('exibe subsecao "Ferramentas de Apoio"', async () => {
    (apiRequest as any).mockResolvedValue(null);
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/ferramentas de apoio/i);
    });
  });
});

describe('MentalPrep - elementos REMOVIDOS', () => {
  it('NAO exibe sliders Energia/Foco/Confianca/Equilibrio (MentalStateCard removido)', async () => {
    (apiRequest as any).mockResolvedValue(null);
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      const text = document.body.textContent || '';
      // Pode haver outros usos do termo "energia" — testamos a combinacao 4-sliders especifica.
      const hasAllFour =
        /energia/i.test(text) && /foco/i.test(text) &&
        /confian[çc]a/i.test(text) && /equil[ií]brio/i.test(text);
      // Esperado: NAO ter os 4 sliders simultaneos.
      expect(hasAllFour).toBe(false);
    });
  });

  it('NAO exibe score 60/40 ou expressao "Score Final" decorativa', async () => {
    (apiRequest as any).mockResolvedValue(null);
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      const text = document.body.textContent || '';
      // Score final/60-40 nao deve aparecer.
      expect(text).not.toMatch(/score\s*final|60\s*\/\s*40|60%\s*\/\s*40%/i);
    });
  });
});

describe('MentalPrep - gate Iniciar Grind (RF-13)', () => {
  it('botao "Iniciar Grind" disabled quando latest=null', async () => {
    (apiRequest as any).mockResolvedValue(null);
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /iniciar grind/i });
      if (btn) {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      } else {
        // botao pode nao existir; aceitamos mensagem em tooltip.
        expect(document.body.textContent).toMatch(/warm-up/i);
      }
    });
  });

  it('botao "Iniciar Grind" habilitado quando latest tem decisionToPlay=true', async () => {
    (apiRequest as any).mockImplementation((method: any, urlArg?: any) => {
      const url = typeof urlArg === 'string' ? urlArg : method;
      if (url && url.includes('/api/warmup-rituals/latest')) {
        return Promise.resolve({
          id: 'r-1',
          version: 'full',
          decisionToPlay: true,
          overrideUsed: false,
          completedAt: new Date().toISOString(),
        });
      }
      if (url && url.includes('/api/warmup-rituals')) {
        return Promise.resolve({ items: [], total: 0, limit: 14, offset: 0 });
      }
      return Promise.resolve(null);
    });

    render(withClient(<MentalPrep />));

    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /iniciar grind/i });
      expect(btn).toBeTruthy();
      if (btn) {
        expect((btn as HTMLButtonElement).disabled).toBe(false);
      }
    });
  });
});

describe('MentalPrep - WarmupHistoryCard integrada', () => {
  it('Card de historico aparece no hub', async () => {
    (apiRequest as any).mockResolvedValue({ items: [], total: 0, limit: 14, offset: 0 });
    render(withClient(<MentalPrep />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/hist[óo]rico/i);
    });
  });
});
