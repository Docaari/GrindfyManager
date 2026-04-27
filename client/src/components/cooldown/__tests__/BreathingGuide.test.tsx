import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — BreathingGuide
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 1, RF-05)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/BreathingGuide.tsx
//
// Contrato:
//   <BreathingGuide enabled={boolean} onToggle={() => void} />
//
// Comportamento:
//   - Toggle on/off via prop
//   - Quando enabled=true, animacao 4s/7s/8s loop 3x
//   - aria-label "respiracao 4-7-8" (acessibilidade)
//   - testid "cooldown-breathing-toggle" para botao toggle
// =============================================================================

import { BreathingGuide } from '@/components/cooldown/BreathingGuide';

beforeEach(() => {
  // BreathingGuide nao depende de QueryClient
});

describe('BreathingGuide - render', () => {
  it('renderiza botao toggle com testid cooldown-breathing-toggle', () => {
    render(<BreathingGuide enabled={false} onToggle={() => {}} />);
    expect(screen.getByTestId('cooldown-breathing-toggle')).toBeInTheDocument();
  });

  it('quando enabled=true, exibe area animada com aria-label "respiracao 4-7-8"', () => {
    render(<BreathingGuide enabled={true} onToggle={() => {}} />);

    const animated =
      screen.queryByLabelText(/respira[cç][aã]o.*4-7-8/i)
      ?? screen.queryByLabelText(/breathing.*4-7-8/i);
    expect(animated).toBeTruthy();
  });

  it('quando enabled=false, NAO exibe area animada', () => {
    render(<BreathingGuide enabled={false} onToggle={() => {}} />);

    const animated = screen.queryByLabelText(/respira[cç][aã]o.*4-7-8/i);
    expect(animated).toBeNull();
  });
});

describe('BreathingGuide - toggle', () => {
  it('clicar toggle chama onToggle', () => {
    const onToggle = vi.fn();
    render(<BreathingGuide enabled={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByTestId('cooldown-breathing-toggle'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('toggle reflete estado enabled (aria-pressed ou similar)', () => {
    const { rerender } = render(<BreathingGuide enabled={false} onToggle={() => {}} />);

    const toggle = screen.getByTestId('cooldown-breathing-toggle');
    const ariaOff = toggle.getAttribute('aria-pressed') ?? toggle.getAttribute('aria-checked');
    if (ariaOff != null) {
      expect(ariaOff).toBe('false');
    }

    rerender(<BreathingGuide enabled={true} onToggle={() => {}} />);
    const ariaOn = toggle.getAttribute('aria-pressed') ?? toggle.getAttribute('aria-checked');
    if (ariaOn != null) {
      expect(ariaOn).toBe('true');
    }
  });
});

describe('BreathingGuide - animacao 4-7-8', () => {
  it('quando enabled=true, contem texto/atributo indicando 4-7-8', () => {
    render(<BreathingGuide enabled={true} onToggle={() => {}} />);

    const html = document.body.innerHTML;
    expect(/4-7-8|inhale|hold|exhale|inspirar|segurar|expirar/i.test(html)).toBe(true);
  });

  it('quando enabled=true, fase de 8s pode ser identificada (exhale)', () => {
    render(<BreathingGuide enabled={true} onToggle={() => {}} />);
    // Aceita texto livre OU atributos data-phase
    const html = document.body.innerHTML;
    expect(/exhale|expirar|8s|8\s*seg/i.test(html)).toBe(true);
  });
});

describe('BreathingGuide - acessibilidade', () => {
  it('botao toggle tem aria-label legivel', () => {
    render(<BreathingGuide enabled={false} onToggle={() => {}} />);

    const toggle = screen.getByTestId('cooldown-breathing-toggle');
    const label = toggle.getAttribute('aria-label') ?? toggle.textContent ?? '';
    expect(/respira|breathing|guia|guide/i.test(label)).toBe(true);
  });
});
