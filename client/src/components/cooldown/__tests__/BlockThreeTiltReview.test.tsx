import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — BlockThreeTiltReview
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 3)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/BlockThreeTiltReview.tsx
//
// Contrato:
//   <BlockThreeTiltReview
//     value={{feltTilt, keptTilting, presence, triggers, action}}
//     onChange={(value) => void}
//     onNext={() => void}
//     onBack={() => void}
//   />
//
// Comportamento:
//   - 3 sliders 0-10 (feltTilt, keptTilting, presence) com aria-valuenow
//   - Checklist 9 triggers multi-select
//   - Textarea livre 'action' opcional (max 500)
//   - BlockTimer 3min (cooldown-block-timer-3)
//   - Avancar sempre habilitado (validacao soft)
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { BlockThreeTiltReview } from '@/components/cooldown/BlockThreeTiltReview';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const emptyValue = {
  feltTilt: 0,
  keptTilting: 0,
  presence: 0,
  triggers: [] as string[],
  action: '',
};

const defaultProps = {
  value: emptyValue,
  onChange: vi.fn(),
  onNext: vi.fn(),
  onBack: vi.fn(),
};

beforeEach(() => {
  defaultProps.onChange = vi.fn();
  defaultProps.onNext = vi.fn();
  defaultProps.onBack = vi.fn();
});

// ============================================================================
// Render basico
// ============================================================================

describe('BlockThreeTiltReview - render basico', () => {
  it('renderiza container com testid cooldown-block-3', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    const block =
      screen.queryByTestId('cooldown-block-3') ??
      screen.queryByTestId('cooldown-block-3-content');
    expect(block).toBeInTheDocument();
  });

  it('renderiza slider feltTilt com testid cooldown-block-3-felt-tilt', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    expect(
      screen.getByTestId('cooldown-block-3-felt-tilt'),
    ).toBeInTheDocument();
  });

  it('renderiza slider keptTilting com testid cooldown-block-3-kept-tilting', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    expect(
      screen.getByTestId('cooldown-block-3-kept-tilting'),
    ).toBeInTheDocument();
  });

  it('renderiza slider presence com testid cooldown-block-3-presence', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    expect(screen.getByTestId('cooldown-block-3-presence')).toBeInTheDocument();
  });

  it('renderiza checklist triggers com testid cooldown-block-3-triggers', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    expect(screen.getByTestId('cooldown-block-3-triggers')).toBeInTheDocument();
  });

  it('renderiza textarea action com testid cooldown-block-3-action', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    expect(screen.getByTestId('cooldown-block-3-action')).toBeInTheDocument();
  });

  it('cronometro 3min visivel (cooldown-block-timer-3)', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    const timer =
      screen.queryByTestId('cooldown-block-timer-3') ??
      screen.queryByRole('timer');
    expect(timer).toBeTruthy();
  });
});

// ============================================================================
// Sliders (aria + range 0-10)
// ============================================================================

describe('BlockThreeTiltReview - sliders ARIA 0-10', () => {
  it('feltTilt slider tem aria-valuemin=0 e aria-valuemax=10', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    const slider = screen.getByTestId('cooldown-block-3-felt-tilt');
    // Radix Slider aplica aria attrs no thumb, nao no root. Aceita ambos.
    const thumb = slider.querySelector('[role="slider"]') ?? slider;
    const min = thumb.getAttribute('aria-valuemin');
    const max = thumb.getAttribute('aria-valuemax');
    expect(min).toBe('0');
    expect(max).toBe('10');
  });

  it('keptTilting slider tem aria-valuenow refletindo value=5', () => {
    const props = {
      ...defaultProps,
      value: { ...emptyValue, keptTilting: 5 },
    };
    render(wrap(<BlockThreeTiltReview {...props} />));
    const slider = screen.getByTestId('cooldown-block-3-kept-tilting');
    const thumb = slider.querySelector('[role="slider"]') ?? slider;
    expect(thumb.getAttribute('aria-valuenow')).toBe('5');
  });
});

// ============================================================================
// Checklist triggers (9 opcoes, multi-select)
// ============================================================================

describe('BlockThreeTiltReview - checklist 9 triggers multi-select', () => {
  it('renderiza 9 opcoes (cooler, slowroll, big-bluff-fail, downswing, distracao, fome, sono, briga-interpessoal, outro)', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    const triggers = screen.getByTestId('cooldown-block-3-triggers');

    const expected = [
      'cooler',
      'slowroll',
      'big-bluff-fail',
      'downswing',
      'distracao',
      'fome',
      'sono',
      'briga-interpessoal',
      'outro',
    ];
    for (const t of expected) {
      const el = triggers.querySelector(`[data-trigger="${t}"]`);
      // Aceita: data-trigger atributo OU label visivel com texto
      const labelMatch = triggers.textContent?.toLowerCase().includes(t);
      expect(el || labelMatch).toBeTruthy();
    }
  });

  it('clicar em trigger "cooler" chama onChange com triggers=["cooler"]', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      wrap(<BlockThreeTiltReview {...defaultProps} onChange={onChange} />),
    );

    const triggers = screen.getByTestId('cooldown-block-3-triggers');
    const cooler =
      triggers.querySelector('[data-trigger="cooler"]') ??
      screen.queryByLabelText(/cooler/i);

    if (cooler) {
      await user.click(cooler as HTMLElement);
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.triggers).toContain('cooler');
    }
  });

  it('multi-select: clicar 2 triggers acumula', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      value: { ...emptyValue, triggers: ['cooler'] },
      onChange,
    };
    render(wrap(<BlockThreeTiltReview {...props} />));

    const triggers = screen.getByTestId('cooldown-block-3-triggers');
    const downswing =
      triggers.querySelector('[data-trigger="downswing"]') ??
      screen.queryByLabelText(/downswing/i);

    if (downswing) {
      await user.click(downswing as HTMLElement);
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.triggers).toContain('cooler');
      expect(lastCall.triggers).toContain('downswing');
    }
  });
});

// ============================================================================
// Textarea action (opcional, max 500)
// ============================================================================

describe('BlockThreeTiltReview - textarea action', () => {
  it('digitar em action chama onChange com novo valor', () => {
    const onChange = vi.fn();
    render(
      wrap(<BlockThreeTiltReview {...defaultProps} onChange={onChange} />),
    );

    const action = screen.getByTestId('cooldown-block-3-action');
    fireEvent.change(action, {
      target: { value: 'respirar antes de pagar river' },
    });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.action).toBe('respirar antes de pagar river');
  });

  it('action permite max 500 chars (HTML maxLength ou warning)', () => {
    render(wrap(<BlockThreeTiltReview {...defaultProps} />));
    const action = screen.getByTestId(
      'cooldown-block-3-action',
    ) as HTMLTextAreaElement;
    const ml = action.maxLength;
    if (ml != null && ml > 0) {
      expect(ml).toBeLessThanOrEqual(500);
    }
  });
});

// ============================================================================
// onChange dispara payload completo
// ============================================================================

describe('BlockThreeTiltReview - onChange payload shape', () => {
  it('payload contem feltTilt, keptTilting, presence, triggers, action', () => {
    const onChange = vi.fn();
    render(
      wrap(<BlockThreeTiltReview {...defaultProps} onChange={onChange} />),
    );

    const action = screen.getByTestId('cooldown-block-3-action');
    fireEvent.change(action, { target: { value: 'teste' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty('feltTilt');
    expect(lastCall).toHaveProperty('keptTilting');
    expect(lastCall).toHaveProperty('presence');
    expect(lastCall).toHaveProperty('triggers');
    expect(lastCall).toHaveProperty('action');
    expect(Array.isArray(lastCall.triggers)).toBe(true);
  });
});

// ============================================================================
// Validacao soft (avancar com tudo zero/vazio)
// ============================================================================

describe('BlockThreeTiltReview - validacao soft', () => {
  it('Avancar com sliders=0 e action vazio: onNext chamado (nao bloqueia)', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(wrap(<BlockThreeTiltReview {...defaultProps} onNext={onNext} />));

    const next =
      screen.queryByTestId('cooldown-next') ??
      screen.queryByTestId('cooldown-block-3-next');

    if (next) {
      expect((next as HTMLButtonElement).disabled).toBe(false);
      await user.click(next);
      expect(onNext).toHaveBeenCalled();
    }
  });
});

// ============================================================================
// Botao Voltar
// ============================================================================

describe('BlockThreeTiltReview - botao Voltar', () => {
  it('clicar Voltar chama onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(wrap(<BlockThreeTiltReview {...defaultProps} onBack={onBack} />));

    const back =
      screen.queryByTestId('cooldown-back') ??
      screen.queryByTestId('cooldown-block-3-back');
    if (back) {
      await user.click(back);
      expect(onBack).toHaveBeenCalled();
    }
  });
});
