import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): ResumeRitualPrompt (RF-12)
//
// Contrato:
//   <ResumeRitualPrompt onResume={() => void} onDiscard={() => void} />
//
// Comportamento:
//   - Le localStorage 'warmup-ritual-draft'.
//   - Renderiza apenas se draft valido (ritualStartedAt > now-30min).
//   - Se invalido (>30min), descarta silenciosamente e retorna null.
//   - Se valido: oferece "Retomar" / "Descartar".
//
// Status: red phase.
// =============================================================================

import { ResumeRitualPrompt } from '@/components/warmup/ResumeRitualPrompt';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('ResumeRitualPrompt - sem draft', () => {
  it('NAO renderiza quando localStorage vazio', () => {
    const { container } = render(
      <ResumeRitualPrompt onResume={() => {}} onDiscard={() => {}} />,
    );
    expect(container.textContent || '').not.toMatch(/retomar warm-up/i);
  });
});

describe('ResumeRitualPrompt - draft valido (<30min)', () => {
  it('renderiza prompt "Retomar warm-up em andamento?"', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    render(<ResumeRitualPrompt onResume={() => {}} onDiscard={() => {}} />);
    expect(document.body.textContent).toMatch(/retomar warm-up/i);
  });

  it('chama onResume ao clicar em Retomar', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    const onResume = vi.fn();
    render(<ResumeRitualPrompt onResume={onResume} onDiscard={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /retomar/i }));
    expect(onResume).toHaveBeenCalled();
  });

  it('chama onDiscard ao clicar em Descartar', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    const onDiscard = vi.fn();
    render(<ResumeRitualPrompt onResume={() => {}} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
    expect(onDiscard).toHaveBeenCalled();
  });
});

describe('ResumeRitualPrompt - draft expirado', () => {
  it('NAO renderiza quando draft tem mais de 30min', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    const { container } = render(
      <ResumeRitualPrompt onResume={() => {}} onDiscard={() => {}} />,
    );
    expect(container.textContent || '').not.toMatch(/retomar warm-up/i);
  });

  it('descarta draft expirado silenciosamente do localStorage', () => {
    localStorage.setItem('warmup-ritual-draft', JSON.stringify({
      ritualStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      currentBlock: 3,
    }));

    render(<ResumeRitualPrompt onResume={() => {}} onDiscard={() => {}} />);
    // Draft deve ser limpo apos detectar expirado
    expect(localStorage.getItem('warmup-ritual-draft')).toBeNull();
  });
});
