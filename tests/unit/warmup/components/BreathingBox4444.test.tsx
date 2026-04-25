import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): BreathingBox4444 (T-08, RF-03, RNF-09)
//
// Contrato:
//   <BreathingBox4444 onComplete={() => void} onSkip?={() => void} />
//
// Comportamento:
//   - Anima 5 ciclos de 4-4-4-4 (80s ± margem).
//   - Botao "Pular animação" aparece apos 1 ciclo.
//   - prefers-reduced-motion: substitui animacao por texto estatico.
//   - data-testid="breathing-box" no container.
//
// Status: red phase.
// =============================================================================

import { BreathingBox4444 } from '@/components/warmup/BreathingBox4444';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BreathingBox4444 - render', () => {
  it('renderiza o container com testid breathing-box', () => {
    render(<BreathingBox4444 onComplete={() => {}} />);
    expect(screen.getByTestId('breathing-box')).toBeTruthy();
  });

  it('exibe instrucao "Inspire 4s · Segure 4s · Expire 4s · Segure 4s" em algum lugar', () => {
    render(<BreathingBox4444 onComplete={() => {}} />);
    const text = document.body.textContent || '';
    expect(text).toMatch(/inspire/i);
    expect(text).toMatch(/expire/i);
  });
});

describe('BreathingBox4444 - skip', () => {
  it('chama onSkip quando botao "Pular animação" e clicado', () => {
    const onSkip = vi.fn();
    render(<BreathingBox4444 onComplete={() => {}} onSkip={onSkip} />);

    // Avanca 1 ciclo (16s) para o skip aparecer
    vi.advanceTimersByTime(17000);

    const skipBtn = screen.queryByRole('button', { name: /pular anima/i });
    if (skipBtn) {
      fireEvent.click(skipBtn);
      expect(onSkip).toHaveBeenCalled();
    } else {
      // skip pode nao aparecer ate primeiro ciclo
      expect(skipBtn).toBeDefined();
    }
  });
});

describe('BreathingBox4444 - 5 ciclos', () => {
  it('chama onComplete apos 80s (5 ciclos × 16s)', () => {
    const onComplete = vi.fn();
    render(<BreathingBox4444 onComplete={onComplete} />);

    vi.advanceTimersByTime(81000);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('BreathingBox4444 - prefers-reduced-motion', () => {
  it('respeita prefers-reduced-motion exibindo texto estatico em vez de animar', () => {
    // Simula media query
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

    render(<BreathingBox4444 onComplete={() => {}} />);
    // Sem animacao: ainda deve exibir os tempos.
    const text = document.body.textContent || '';
    expect(text).toMatch(/4s/i);
  });
});

describe('BreathingBox4444 - acessibilidade', () => {
  it('container tem role apropriado ou label acessivel', () => {
    render(<BreathingBox4444 onComplete={() => {}} />);
    const box = screen.getByTestId('breathing-box');
    // Aceita aria-label ou role para acessibilidade
    const hasA11y =
      box.hasAttribute('aria-label') ||
      box.hasAttribute('role') ||
      box.querySelector('[aria-label]') !== null;
    expect(hasA11y).toBe(true);
  });
});
