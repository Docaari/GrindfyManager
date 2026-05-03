// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-05 Parte B
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-05 Parte B
// ADR:  Docs/architecture/decisions/105-auto-navigation-countdown-pattern.md
//
// Componente target: client/src/components/biblioteca/NextLessonCTA.tsx (NAO EXISTE)
//
// Comportamentos:
//   - Render com countdown 5s visivel
//   - Auto-focus no botao "Ir agora"
//   - Tick countdown decrescente (vi.useFakeTimers + advanceTimersByTime)
//   - Auto-nav apos 5s -> chama onGo
//   - Click "Ir agora" -> chama onGo imediato
//   - Click "Cancelar" -> para countdown, mantem CTA visivel
//   - Esc keypress -> equivale a "Cancelar"
//   - aria-live="polite" no countdown text
//   - cleanup interval em unmount (sem warnings)
//
// Lessons aplicadas:
//   #2  data-testid estavel (next-lesson-cta-*)
//   #14 await import() em vez de require() em .tsx
//   #15 polyfill localStorage ja em setup (nao usado aqui mas referencia)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Componente target — RED phase, ainda nao existe.
// @ts-expect-error - componente nao existe
import { NextLessonCTA } from '../NextLessonCTA';

const baseNextLesson = {
  id: 'l-a2',
  displayLabel: 'A2',
  title: 'Vies da confirmacao',
  courseSlug: 'antes-das-cartas',
  lessonSlug: 'a2-vies-confirmacao',
};

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// =============================================================================
// Render basico
// =============================================================================
describe('<NextLessonCTA> — render basico (RF-05B)', () => {
  it('deve renderizar root container com data-testid next-lesson-cta', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('next-lesson-cta')).toBeInTheDocument();
  });

  it('deve mostrar titulo da proxima aula', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Vies da confirmacao/i)).toBeInTheDocument();
  });

  it('deve mostrar displayLabel da proxima aula', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // displayLabel "A2" aparece no DOM.
    expect(screen.getByTestId('next-lesson-cta').textContent).toMatch(/A2/);
  });

  it('deve renderizar botao "Ir agora" (data-testid go)', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('next-lesson-cta-go')).toBeInTheDocument();
  });

  it('deve renderizar botao "Cancelar" (data-testid cancel)', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('next-lesson-cta-cancel')).toBeInTheDocument();
  });

  it('deve renderizar countdown inicial em 5s', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const countdown = screen.getByTestId('next-lesson-cta-countdown');
    expect(countdown.textContent).toMatch(/5/);
  });

  it('deve aceitar autoStartSeconds custom (override)', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
        autoStartSeconds={10}
      />,
    );
    const countdown = screen.getByTestId('next-lesson-cta-countdown');
    expect(countdown.textContent).toMatch(/10/);
  });
});

// =============================================================================
// Acessibilidade — RF-05B + ADR-105 §2.5
// =============================================================================
describe('<NextLessonCTA> — acessibilidade', () => {
  it('deve ter auto-focus no botao "Ir agora" ao montar', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const goBtn = screen.getByTestId('next-lesson-cta-go');
    expect(document.activeElement).toBe(goBtn);
  });

  it('countdown deve ter aria-live="polite"', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const countdown = screen.getByTestId('next-lesson-cta-countdown');
    expect(countdown.getAttribute('aria-live')).toBe('polite');
  });

  it('deve ter role="region" + aria-label="Proxima aula" no container', () => {
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const root = screen.getByTestId('next-lesson-cta');
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-label') ?? '').toMatch(/Proxima aula/i);
  });
});

// =============================================================================
// Countdown tick — RF-05B
// =============================================================================
describe('<NextLessonCTA> — countdown tick', () => {
  it('deve decrementar countdown de 5 para 4 apos 1s', () => {
    vi.useFakeTimers();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const countdown = screen.getByTestId('next-lesson-cta-countdown');
    expect(countdown.textContent).toMatch(/5/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(countdown.textContent).toMatch(/4/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(countdown.textContent).toMatch(/3/);
  });

  it('deve chamar onGo automaticamente apos 5s (countdown chega a 0)', () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={vi.fn()}
      />,
    );
    expect(onGo).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('deve respeitar autoStartSeconds=3 (chama onGo em 3s)', () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={vi.fn()}
        autoStartSeconds={3}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onGo).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Click "Ir agora" — RF-05B
// =============================================================================
describe('<NextLessonCTA> — click "Ir agora"', () => {
  it('deve chamar onGo imediatamente quando user clica antes de countdown terminar', async () => {
    const onGo = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('next-lesson-cta-go'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Click "Cancelar" sticky — RF-05B + ADR-105 §2.3
// =============================================================================
describe('<NextLessonCTA> — cancelamento sticky', () => {
  it('click Cancelar deve chamar onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('next-lesson-cta-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('click Cancelar deve PARAR o countdown (nao chama onGo apos 5s+)', () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    const onCancel = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={onCancel}
      />,
    );
    // Avanca 2s e cancela.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      screen.getByTestId('next-lesson-cta-cancel').click();
    });
    // Avanca mais 10s — onGo NAO deve ser chamado.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onGo).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('apos cancelar, CTA deve permanecer visivel (sticky)', () => {
    vi.useFakeTimers();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      screen.getByTestId('next-lesson-cta-cancel').click();
    });
    // CTA continua no DOM.
    expect(screen.queryByTestId('next-lesson-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('next-lesson-cta-go')).toBeInTheDocument();
  });

  it('apos cancelar, click em "Ir agora" ainda chama onGo manualmente', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      screen.getByTestId('next-lesson-cta-cancel').click();
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('next-lesson-cta-go'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Esc keybinding — RF-05B + ADR-105 §2.5
// =============================================================================
describe('<NextLessonCTA> — Esc key', () => {
  it('Esc keypress deve chamar onCancel (equivalente ao botao)', () => {
    const onCancel = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(ev);
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc deve parar o countdown (onGo nao chamado depois de 5s+)', () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    const onCancel = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={onCancel}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(ev);
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onGo).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('outras keys (Enter/Tab) NAO devem chamar onCancel', () => {
    const onCancel = vi.fn();
    render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      document.dispatchEvent(ev);
    });
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(ev);
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cleanup unmount — ADR-105 §6
// =============================================================================
describe('<NextLessonCTA> — cleanup em unmount', () => {
  it('unmount durante countdown nao deve chamar onGo apos desmontar', () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    const { unmount } = render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={onGo}
        onCancel={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onGo).not.toHaveBeenCalled();
  });

  it('unmount deve limpar listener Esc (nao chama onCancel apos desmontar)', () => {
    const onCancel = vi.fn();
    const { unmount } = render(
      <NextLessonCTA
        nextLesson={baseNextLesson}
        onGo={vi.fn()}
        onCancel={onCancel}
      />,
    );
    unmount();
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(ev);
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
