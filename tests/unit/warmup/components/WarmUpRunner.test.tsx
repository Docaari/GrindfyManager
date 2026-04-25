import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): WarmUpRunner (RF-02, T-11)
//
// Contrato:
//   <WarmUpRunner onClose={() => void} onComplete={(ritual) => void} />
//
// Comportamento:
//   - Fullscreen modal nao-dismissivel sem confirmacao (ESC abre AlertDialog).
//   - Header: timer geral 10:00 + indicador "1/5".
//   - Footer: Voltar / Pausar / Próximo / Abortar.
//   - State machine de 5 blocos.
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { WarmUpRunner } from '@/components/warmup/WarmUpRunner';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WarmUpRunner - render', () => {
  it('inicia no Bloco 1', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    // Bloco 1 = Check-in emocional
    expect(document.body.textContent).toMatch(/check-in emocional/i);
  });

  it('exibe indicador de bloco "1/5"', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    expect(document.body.textContent).toMatch(/1\s*\/\s*5/);
  });

  it('expoe footer com botao Abortar', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    expect(screen.getByRole('button', { name: /abortar/i })).toBeTruthy();
  });

  it('expoe footer com botao Pausar', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    expect(screen.getByRole('button', { name: /pausar|pause/i })).toBeTruthy();
  });
});

describe('WarmUpRunner - timer header', () => {
  it('timer header tem role="timer" + aria-live=polite (RNF-06)', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    const timer = screen.getByRole('timer');
    expect(timer).toBeTruthy();
    expect(timer.getAttribute('aria-live')).toBe('polite');
  });
});

describe('WarmUpRunner - abort com confirmacao', () => {
  it('clicar Abortar abre AlertDialog "Cancelar warm-up?"', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    fireEvent.click(screen.getByRole('button', { name: /abortar/i }));

    expect(document.body.textContent).toMatch(/cancelar warm-up/i);
  });

  it('confirmar abort -> POST com version=aborted', async () => {
    const { apiRequest } = await import('@/lib/queryClient');
    (apiRequest as any).mockResolvedValue({ id: 'r-1', version: 'aborted' });

    const onClose = vi.fn();
    render(withClient(<WarmUpRunner onClose={onClose} onComplete={() => {}} />));

    fireEvent.click(screen.getByRole('button', { name: /abortar/i }));

    // Confirmar
    const confirmBtns = screen.getAllByRole('button');
    const confirm = confirmBtns.find(b => /confirmar|sim|cancelar warm-up|abortar/i.test(b.textContent || ''));
    if (confirm) fireEvent.click(confirm);

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const aborted = calls.some((args: any[]) => JSON.stringify(args).includes('aborted'));
      expect(aborted).toBe(true);
    });
  });
});

describe('WarmUpRunner - mobile fullscreen (RNF-13)', () => {
  it('container ocupa fullscreen (h-screen ou 100vh)', () => {
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    const runner = screen.getByTestId('warmup-runner');
    const cls = runner.className;
    // heuristica: aparece classe de fullscreen
    expect(/h-screen|min-h-screen|fixed.*inset/i.test(cls)).toBe(true);
  });
});

describe('WarmUpRunner - prefers-reduced-motion', () => {
  it('respeita prefers-reduced-motion (RNF-09) — sem animacao no Bloco 1', () => {
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    });

    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));
    // sem animacao, mostra texto estatico de 4s
    expect(document.body.textContent).toMatch(/4s/);
  });
});
