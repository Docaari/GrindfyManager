/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-11: OnboardingWizard primeira vez
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #11 sem auto-finish (default minimo)
 *   #12 estado persistente: re-mount NAO reseta progresso (usar TanStack Query / localStorage)
 *
 * D8: pula automatico se: themes>=1 || snapshots>=1 || spots>=1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/dashboard', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

// @ts-expect-error - red phase
import { OnboardingWizard } from '../OnboardingWizard';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  localStorage.clear();
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/study-themes')) return [];
    if (url.includes('/api/starred-hands')) return [];
    if (url.includes('/api/study-snapshots')) return [];
    return null;
  });
  global.fetch = vi.fn(async (url: any) => {
    const data = await apiRequestMock(String(url));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-11 OnboardingWizard', () => {
  it('renderiza 4 cards sequenciais (indicador 4 dots)', async () => {
    render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await waitFor(() => {
      const dots = screen.getAllByTestId(/^onboarding-dot-/);
      expect(dots.length).toBe(4);
    });
  });

  it('Card 1 e exibido inicialmente', async () => {
    render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-1')).toBeInTheDocument();
    });
  });

  it('botao "Proximo" avanca para Card 2', async () => {
    render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await userEvent.click(await screen.findByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-2')).toBeInTheDocument();
    });
  });

  it('botao "Pular tudo" seta localStorage flag', async () => {
    const onOpenChange = vi.fn();
    render(withClient(<OnboardingWizard open onOpenChange={onOpenChange} />));
    await userEvent.click(await screen.findByTestId('onboarding-skip'));
    expect(localStorage.getItem('grindfy:studies:onboarding_completed')).toBe('true');
  });

  it('D8: pula automatico se ja tem 1+ tema (queries nao vazias)', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/study-themes')) return [{ id: 'thm_1', name: 'X' }];
      return [];
    });
    const onOpenChange = vi.fn();
    render(withClient(<OnboardingWizard open onOpenChange={onOpenChange} />));
    await waitFor(() => {
      // Wizard pula -> nao mostra card 1
      expect(screen.queryByTestId('onboarding-card-1')).not.toBeInTheDocument();
    });
  });

  it('Card 4 com botao "Concluir" seta flag e fecha (lesson #11: sem auto-finish)', async () => {
    const onOpenChange = vi.fn();
    render(withClient(<OnboardingWizard open onOpenChange={onOpenChange} />));
    // Avancar 3 vezes
    for (let i = 0; i < 3; i++) {
      await userEvent.click(await screen.findByTestId('onboarding-next'));
    }
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-4')).toBeInTheDocument();
    });
    await userEvent.click(await screen.findByTestId('onboarding-finish'));
    expect(localStorage.getItem('grindfy:studies:onboarding_completed')).toBe('true');
  });

  it('lesson #12: re-mount preserva step atual via cache', async () => {
    const { rerender } = render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await userEvent.click(await screen.findByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-2')).toBeInTheDocument();
    });
    // Re-mount
    rerender(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    // Componente persistente preserva step (via state externalizado, ex: TanStack ou localStorage)
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-2')).toBeInTheDocument();
    });
  });

  it('Card 3 botao "Pular" navega NAO para upload (D8: respeita default), apenas avanca', async () => {
    render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await userEvent.click(await screen.findByTestId('onboarding-next')); // -> 2
    await userEvent.click(await screen.findByTestId('onboarding-next')); // -> 3
    const skipBtn = await screen.findByTestId('onboarding-card-3-skip');
    await userEvent.click(skipBtn);
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-4')).toBeInTheDocument();
    });
  });

  it('botao "Anterior" retrocede 1 step (mas nao alem do Card 1)', async () => {
    render(withClient(<OnboardingWizard open onOpenChange={() => {}} />));
    await userEvent.click(await screen.findByTestId('onboarding-next')); // -> 2
    await userEvent.click(await screen.findByTestId('onboarding-prev'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-card-1')).toBeInTheDocument();
    });
  });
});
