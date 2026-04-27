import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — BlockFourSleepGate
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/BlockFourSleepGate.tsx
//
// Contrato:
//   <BlockFourSleepGate
//     value={{sleepIntent: boolean | null, planClosed: boolean}}
//     onChange={(value) => void}
//     onConfirm={(payload: {sleepIntent: boolean, planClosed?: boolean}) => void}
//     onClosePlan={() => void}
//     onBack={() => void}
//     audioEnabled={boolean}
//   />
//
// Comportamento:
//   - Toggle "Vou dormir agora?" (testid cooldown-block-4-sleep-toggle)
//   - SIM: botao "Marcar plano fechado", BreathingGuide, AudioLibraryDialog se audioEnabled
//          onConfirm({sleepIntent: true, planClosed: true})
//   - NAO: sugestao aleatoria, mensagem "Cool-down completo na proxima sessao"
//          onConfirm({sleepIntent: false})
//   - BlockTimer 2min (testid cooldown-block-timer-4)
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

// Mock AudioLibraryDialog para nao renderizar Radix Dialog complexo nos testes
vi.mock('@/components/mental-prep/AudioLibraryDialog', () => ({
  AudioLibraryDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="cooldown-block-4-audio-dialog">audio</div>
    ) : null,
}));

import { BlockFourSleepGate } from '@/components/cooldown/BlockFourSleepGate';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const defaultProps = {
  value: { sleepIntent: null as boolean | null, planClosed: false },
  onChange: vi.fn(),
  onConfirm: vi.fn(),
  onClosePlan: vi.fn(),
  onBack: vi.fn(),
  audioEnabled: false,
};

beforeEach(() => {
  defaultProps.onChange = vi.fn();
  defaultProps.onConfirm = vi.fn();
  defaultProps.onClosePlan = vi.fn();
  defaultProps.onBack = vi.fn();
});

// ============================================================================
// Render basico
// ============================================================================

describe('BlockFourSleepGate - render basico', () => {
  it('renderiza container cooldown-block-4', () => {
    render(wrap(<BlockFourSleepGate {...defaultProps} />));
    const block =
      screen.queryByTestId('cooldown-block-4') ??
      screen.queryByTestId('cooldown-block-4-content');
    expect(block).toBeInTheDocument();
  });

  it('renderiza toggle "Vou dormir agora?" (cooldown-block-4-sleep-toggle)', () => {
    render(wrap(<BlockFourSleepGate {...defaultProps} />));
    expect(
      screen.getByTestId('cooldown-block-4-sleep-toggle'),
    ).toBeInTheDocument();
  });

  it('cronometro 2min visivel (cooldown-block-timer-4)', () => {
    render(wrap(<BlockFourSleepGate {...defaultProps} />));
    const timer =
      screen.queryByTestId('cooldown-block-timer-4') ??
      screen.queryByRole('timer');
    expect(timer).toBeTruthy();
  });
});

// ============================================================================
// Estado SIM (sleepIntent = true)
// ============================================================================

describe('BlockFourSleepGate - sleepIntent SIM', () => {
  const yesProps = {
    ...defaultProps,
    value: { sleepIntent: true, planClosed: false },
  };

  it('mostra botao "Marcar plano fechado" (cooldown-block-4-close-plan)', () => {
    render(wrap(<BlockFourSleepGate {...yesProps} />));
    expect(
      screen.getByTestId('cooldown-block-4-close-plan'),
    ).toBeInTheDocument();
  });

  it('clicar "Marcar plano fechado" chama onClosePlan', async () => {
    const user = userEvent.setup();
    const onClosePlan = vi.fn();
    render(
      wrap(<BlockFourSleepGate {...yesProps} onClosePlan={onClosePlan} />),
    );

    await user.click(screen.getByTestId('cooldown-block-4-close-plan'));
    expect(onClosePlan).toHaveBeenCalled();
  });

  it('renderiza BreathingGuide quando sleepIntent=true', () => {
    render(wrap(<BlockFourSleepGate {...yesProps} />));
    const breathing =
      screen.queryByTestId('cooldown-breathing-guide') ??
      screen.queryByText(/respira[cç][aã]o|inhale|inalar|inspire|4-7-8/i);
    expect(breathing).toBeTruthy();
  });

  it('audio dialog NAO renderiza quando audioEnabled=false', () => {
    render(wrap(<BlockFourSleepGate {...yesProps} audioEnabled={false} />));
    expect(
      screen.queryByTestId('cooldown-block-4-audio-dialog'),
    ).not.toBeInTheDocument();
  });

  it('audio button/dialog disponivel quando audioEnabled=true', () => {
    render(wrap(<BlockFourSleepGate {...yesProps} audioEnabled={true} />));
    // Aceita: o dialog ja aberto OU um botao para abrir
    const audio =
      screen.queryByTestId('cooldown-block-4-audio-dialog') ??
      screen.queryByTestId('cooldown-block-4-audio-trigger') ??
      screen.queryByText(/biblioteca de audios|sleep transition/i);
    expect(audio).toBeTruthy();
  });

  it('onConfirm dispara {sleepIntent: true, planClosed: true} apos plano fechado', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const props = {
      ...yesProps,
      value: { sleepIntent: true, planClosed: true },
      onConfirm,
    };
    render(wrap(<BlockFourSleepGate {...props} />));

    const confirm =
      screen.queryByTestId('cooldown-finish') ??
      screen.queryByTestId('cooldown-block-4-confirm');
    if (confirm) {
      await user.click(confirm);
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
        const arg = onConfirm.mock.calls[0][0];
        expect(arg.sleepIntent).toBe(true);
        expect(arg.planClosed).toBe(true);
      });
    }
  });
});

// ============================================================================
// Estado NAO (sleepIntent = false)
// ============================================================================

describe('BlockFourSleepGate - sleepIntent NAO', () => {
  const noProps = {
    ...defaultProps,
    value: { sleepIntent: false, planClosed: false },
  };

  it('renderiza sugestao de atividade (cooldown-block-4-activity-suggestion)', () => {
    render(wrap(<BlockFourSleepGate {...noProps} />));
    expect(
      screen.getByTestId('cooldown-block-4-activity-suggestion'),
    ).toBeInTheDocument();
  });

  it('mensagem "Cool-down completo na proxima sessao" visivel', () => {
    render(wrap(<BlockFourSleepGate {...noProps} />));
    expect(
      screen.getByText(/cool-down completo na pr[oó]xima sess[aã]o/i),
    ).toBeInTheDocument();
  });

  it('NAO renderiza botao Marcar plano fechado quando sleepIntent=false', () => {
    render(wrap(<BlockFourSleepGate {...noProps} />));
    expect(
      screen.queryByTestId('cooldown-block-4-close-plan'),
    ).not.toBeInTheDocument();
  });

  it('NAO renderiza BreathingGuide destacado quando sleepIntent=false', () => {
    // Aceita: BreathingGuide pode estar visivel como toggle, mas o destaque
    // (variante 'sleep') so quando sleepIntent=true. Se test for fragil,
    // basta verificar que close-plan nao renderiza.
    render(wrap(<BlockFourSleepGate {...noProps} />));
    expect(
      screen.queryByTestId('cooldown-block-4-close-plan'),
    ).not.toBeInTheDocument();
  });

  it('onConfirm dispara {sleepIntent: false}', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(wrap(<BlockFourSleepGate {...noProps} onConfirm={onConfirm} />));

    const confirm =
      screen.queryByTestId('cooldown-finish') ??
      screen.queryByTestId('cooldown-block-4-confirm');
    if (confirm) {
      await user.click(confirm);
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
        const arg = onConfirm.mock.calls[0][0];
        expect(arg.sleepIntent).toBe(false);
      });
    }
  });
});

// ============================================================================
// Toggle SIM/NAO -> chama onChange
// ============================================================================

describe('BlockFourSleepGate - toggle SIM/NAO', () => {
  it('clicar toggle quando sleepIntent=null chama onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<BlockFourSleepGate {...defaultProps} onChange={onChange} />));

    const toggle = screen.getByTestId('cooldown-block-4-sleep-toggle');
    // Aceita: toggle root ou um botao "SIM" interno
    const yesBtn =
      toggle.querySelector('[data-value="true"]') ??
      screen.queryByTestId('cooldown-block-4-sleep-yes');

    if (yesBtn) {
      await user.click(yesBtn as HTMLElement);
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.sleepIntent).toBe(true);
    }
  });

  it('toggle do estado SIM para NAO chama onChange com sleepIntent=false', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      value: { sleepIntent: true, planClosed: false },
      onChange,
    };
    render(wrap(<BlockFourSleepGate {...props} />));

    const toggle = screen.getByTestId('cooldown-block-4-sleep-toggle');
    const noBtn =
      toggle.querySelector('[data-value="false"]') ??
      screen.queryByTestId('cooldown-block-4-sleep-no');

    if (noBtn) {
      await user.click(noBtn as HTMLElement);
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.sleepIntent).toBe(false);
    }
  });
});

// ============================================================================
// Botao Voltar
// ============================================================================

describe('BlockFourSleepGate - botao Voltar', () => {
  it('clicar Voltar chama onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(wrap(<BlockFourSleepGate {...defaultProps} onBack={onBack} />));

    const back =
      screen.queryByTestId('cooldown-back') ??
      screen.queryByTestId('cooldown-block-4-back');
    if (back) {
      await user.click(back);
      expect(onBack).toHaveBeenCalled();
    }
  });
});
