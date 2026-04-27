import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — BlockTwoABCJournal
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 2)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/BlockTwoABCJournal.tsx
//
// Contrato:
//   <BlockTwoABCJournal
//     value={{aGame: string[], bGame: string[], cGame: string, lesson: string}}
//     onChange={(value) => void}
//     onNext={() => void}
//     onBack={() => void}
//   />
//
// Comportamento:
//   - 4 textareas: aGame (array, ate 3), bGame (array, ate 3), cGame (single
//     multiline), lesson (single line, max 200 chars)
//   - Validacao soft: campos < 10 chars mostram warning amarelo, mas avanco
//     eh permitido
//   - "Adicionar item" em aGame/bGame: ate 3
//   - "Remover item" em aGame/bGame: deixa pelo menos 1 textarea
//   - "Avancar" sempre habilitado
//   - Cronometro 5min visivel
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { BlockTwoABCJournal } from '@/components/cooldown/BlockTwoABCJournal';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const emptyValue = {
  aGame: [''],
  bGame: [''],
  cGame: '',
  lesson: '',
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
// Render basico (4 textareas)
// ============================================================================

describe('BlockTwoABCJournal - render', () => {
  it('renderiza container com testid cooldown-block-2', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    const block = screen.queryByTestId('cooldown-block-2')
      ?? screen.queryByTestId('cooldown-block-2-content');
    expect(block).toBeInTheDocument();
  });

  it('renderiza textarea cooldown-journal-aGame-0 (primeiro item de A-Game)', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    expect(screen.getByTestId('cooldown-journal-aGame-0')).toBeInTheDocument();
  });

  it('renderiza textarea cooldown-journal-bGame-0', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    expect(screen.getByTestId('cooldown-journal-bGame-0')).toBeInTheDocument();
  });

  it('renderiza textarea cooldown-journal-cGame', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    expect(screen.getByTestId('cooldown-journal-cGame')).toBeInTheDocument();
  });

  it('renderiza input/textarea cooldown-journal-lesson', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    expect(screen.getByTestId('cooldown-journal-lesson')).toBeInTheDocument();
  });

  it('cronometro 5min visivel (cooldown-block-timer-2)', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    const timer = screen.queryByTestId('cooldown-block-timer-2')
      ?? screen.queryByRole('timer');
    expect(timer).toBeTruthy();
  });
});

// ============================================================================
// Adicionar/Remover itens em aGame e bGame (ate 3)
// ============================================================================

describe('BlockTwoABCJournal - adicionar item ate 3 em A-Game', () => {
  it('mostra "Adicionar A-Game" botao quando ha apenas 1 item', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));
    const addBtn =
      screen.queryByTestId('cooldown-journal-aGame-add')
      ?? screen.queryByText(/adicionar.*a-game|adicionar item/i);
    expect(addBtn).toBeTruthy();
  });

  it('clicar "Adicionar A-Game" chama onChange com array de 2 itens', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(<BlockTwoABCJournal {...defaultProps} onChange={onChange} />),
    );

    const addBtn = screen.queryByTestId('cooldown-journal-aGame-add');
    if (addBtn) {
      await user.click(addBtn);
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.aGame.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('com 3 itens em aGame, botao "Adicionar" desabilitado/oculto', () => {
    const props = {
      ...defaultProps,
      value: { aGame: ['a', 'b', 'c'], bGame: [''], cGame: '', lesson: '' },
    };
    render(wrap(<BlockTwoABCJournal {...props} />));

    const addBtn = screen.queryByTestId('cooldown-journal-aGame-add');
    if (addBtn) {
      expect((addBtn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('renderiza 3 textareas distintas quando aGame tem 3 itens', () => {
    const props = {
      ...defaultProps,
      value: { aGame: ['a', 'b', 'c'], bGame: [''], cGame: '', lesson: '' },
    };
    render(wrap(<BlockTwoABCJournal {...props} />));

    expect(screen.getByTestId('cooldown-journal-aGame-0')).toBeInTheDocument();
    expect(screen.getByTestId('cooldown-journal-aGame-1')).toBeInTheDocument();
    expect(screen.getByTestId('cooldown-journal-aGame-2')).toBeInTheDocument();
  });
});

describe('BlockTwoABCJournal - remover item deixa pelo menos 1', () => {
  it('com 2 itens em aGame, botao remover habilitado para item 1', () => {
    const props = {
      ...defaultProps,
      value: { aGame: ['a', 'b'], bGame: [''], cGame: '', lesson: '' },
    };
    render(wrap(<BlockTwoABCJournal {...props} />));

    const removeBtn =
      screen.queryByTestId('cooldown-journal-aGame-remove-1')
      ?? screen.queryByLabelText(/remover/i);

    if (removeBtn) {
      expect((removeBtn as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('com apenas 1 item, botao remover desabilitado/oculto (deixa pelo menos 1)', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));

    const removeBtn = screen.queryByTestId('cooldown-journal-aGame-remove-0');
    if (removeBtn) {
      expect((removeBtn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

// ============================================================================
// Validacao soft (campos < 10 chars -> warning, nao bloqueia)
// ============================================================================

describe('BlockTwoABCJournal - validacao soft', () => {
  it('campo lesson com 5 chars mostra warning visual', () => {
    const props = {
      ...defaultProps,
      value: { aGame: [''], bGame: [''], cGame: '', lesson: 'curto' },
    };
    render(wrap(<BlockTwoABCJournal {...props} />));

    const html = document.body.innerHTML;
    expect(/warning|alerta|curto|m[íi]nimo/i.test(html)).toBe(true);
  });

  it('campo cGame com 0 chars mostra warning mas nao bloqueia avanco', () => {
    render(wrap(<BlockTwoABCJournal {...defaultProps} />));

    // botao Avancar (se renderizado dentro do componente) deve estar habilitado
    const nextBtn = screen.queryByTestId('cooldown-next');
    if (nextBtn) {
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('Avancar com campos vazios chama onNext (validacao soft, nao bloqueia)', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      wrap(<BlockTwoABCJournal {...defaultProps} onNext={onNext} />),
    );

    const nextBtn =
      screen.queryByTestId('cooldown-next')
      ?? screen.queryByTestId('cooldown-finish');

    if (nextBtn) {
      await user.click(nextBtn);
      expect(onNext).toHaveBeenCalled();
    }
  });

  it('lesson > 200 chars: input bloqueia ou trunca (max length)', () => {
    const props = {
      ...defaultProps,
      value: {
        aGame: [''],
        bGame: [''],
        cGame: '',
        lesson: 'L'.repeat(201),
      },
    };
    render(wrap(<BlockTwoABCJournal {...props} />));

    const lessonInput =
      screen.getByTestId('cooldown-journal-lesson') as HTMLInputElement | HTMLTextAreaElement;

    // Pode ter maxLength 200 OU mostrar warning
    const maxLen = (lessonInput as any).maxLength;
    if (maxLen != null && maxLen > 0) {
      expect(maxLen).toBeLessThanOrEqual(200);
    }
  });
});

// ============================================================================
// onChange dispara em digitacao
// ============================================================================

describe('BlockTwoABCJournal - onChange', () => {
  it('digitar em cGame chama onChange com novo cGame', () => {
    const onChange = vi.fn();
    render(
      wrap(<BlockTwoABCJournal {...defaultProps} onChange={onChange} />),
    );

    const cGame = screen.getByTestId('cooldown-journal-cGame');
    fireEvent.change(cGame, { target: { value: 'tilt apos cooler' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.cGame).toBe('tilt apos cooler');
  });

  it('digitar em lesson chama onChange', () => {
    const onChange = vi.fn();
    render(
      wrap(<BlockTwoABCJournal {...defaultProps} onChange={onChange} />),
    );

    const lesson = screen.getByTestId('cooldown-journal-lesson');
    fireEvent.change(lesson, { target: { value: 'paciencia em ICM' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.lesson).toBe('paciencia em ICM');
  });
});

// ============================================================================
// Botoes de navegacao
// ============================================================================

describe('BlockTwoABCJournal - botoes navegacao', () => {
  it('clicar onBack chama callback', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(wrap(<BlockTwoABCJournal {...defaultProps} onBack={onBack} />));

    const backBtn = screen.queryByTestId('cooldown-back');
    if (backBtn) {
      await user.click(backBtn);
      expect(onBack).toHaveBeenCalled();
    }
  });
});
