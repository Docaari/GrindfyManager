import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — BlockTimer
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 + RF-05)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/BlockTimer.tsx
//
// Contrato:
//   <BlockTimer
//     blockNumber={number}
//     durationSeconds={number}  // ex: 300 = 5min
//     onElapsed?={() => void}   // chamado quando chega a 0 (mas nao bloqueia)
//   />
//
// Comportamento:
//   - Countdown em tempo real (mock useInterval ou via fake timers)
//   - Apos zero: continua mostrando "0:00" e NAO bloqueia
//   - testid cooldown-block-timer-{n}
//   - aria-live="polite"
//   - Label "X min sugeridos" (nao bloqueante, RF-02)
// =============================================================================

import { BlockTimer } from '@/components/cooldown/BlockTimer';

describe('BlockTimer - render', () => {
  it('renderiza com testid cooldown-block-timer-1', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);
    expect(screen.getByTestId('cooldown-block-timer-1')).toBeInTheDocument();
  });

  it('renderiza com testid cooldown-block-timer-2', () => {
    render(<BlockTimer blockNumber={2} durationSeconds={300} />);
    expect(screen.getByTestId('cooldown-block-timer-2')).toBeInTheDocument();
  });

  it('mostra tempo inicial em formato M:SS (5:00 para 300s)', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);
    expect(document.body.textContent).toMatch(/5:00|5\s*min/i);
  });

  it('mostra tempo inicial 3:00 para 180s', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={180} />);
    expect(document.body.textContent).toMatch(/3:00|3\s*min/i);
  });
});

describe('BlockTimer - acessibilidade', () => {
  it('possui aria-live="polite"', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);

    const timer = screen.getByTestId('cooldown-block-timer-1');
    // aria-live pode estar no proprio elemento ou em filho direto
    const live = timer.getAttribute('aria-live')
      ?? timer.querySelector('[aria-live]')?.getAttribute('aria-live');
    expect(live).toBe('polite');
  });

  it('possui role="timer" OU aria-label legivel', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);

    const timer = screen.getByTestId('cooldown-block-timer-1');
    const role = timer.getAttribute('role')
      ?? timer.querySelector('[role="timer"]')?.getAttribute('role');
    const label = timer.getAttribute('aria-label')
      ?? timer.textContent
      ?? '';

    const ok = role === 'timer' || /min|tempo|timer|sugerido/i.test(label);
    expect(ok).toBe(true);
  });
});

describe('BlockTimer - countdown (com fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('apos 1s, mostra 4:59 quando duracao=300s', async () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    const txt = document.body.textContent ?? '';
    // aceita formato 4:59 OU 04:59
    expect(/4:5[89]|04:5[89]/.test(txt)).toBe(true);
  });

  it('apos chegar a 0:00, NAO bloqueia (continua mostrando 0:00)', async () => {
    render(<BlockTimer blockNumber={1} durationSeconds={2} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const txt = document.body.textContent ?? '';
    expect(/0:00|0\s*min|esgotado|completo/i.test(txt)).toBe(true);
  });

  it('chama onElapsed apos chegar a zero (callback informativo)', async () => {
    const onElapsed = vi.fn();
    render(
      <BlockTimer blockNumber={1} durationSeconds={1} onElapsed={onElapsed} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onElapsed).toHaveBeenCalled();
  });
});

describe('BlockTimer - label nao-bloqueante', () => {
  it('label inclui "sugeridos" ou similar (UX nao-bloqueante)', () => {
    render(<BlockTimer blockNumber={1} durationSeconds={300} />);

    const txt = document.body.textContent ?? '';
    // Aceita "sugeridos", "sugestao", "min", etc.
    expect(/sugerido|sugest|min/i.test(txt)).toBe(true);
  });
});
